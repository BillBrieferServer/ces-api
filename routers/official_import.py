from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from io import BytesIO
from datetime import date
import csv

from openpyxl import load_workbook
from database import get_db

router = APIRouter(prefix="/officials/import", tags=["official-import"])

MAX_PREVIEW_ROWS = 1000
MAX_FILE_BYTES = 5_000_000

FIELD_CHOICES = [
    "jurisdiction_name", "name", "title", "role_type",
    "email", "phone", "fax",
    "mailing_address", "physical_address",
    "source",
]

GUESS_PATTERNS = {
    "jurisdiction_name": ["jurisdiction", "entity", "city", "county", "district", "agency"],
    "name": ["name", "official", "person", "full name"],
    "title": ["title", "position", "role", "office"],
    "email": ["email", "e-mail", "mail"],
    "phone": ["phone", "telephone", "tel"],
    "fax": ["fax"],
    "mailing_address": ["mailing", "mail address", "po box"],
    "physical_address": ["physical", "street", "address"],
    "source": ["source"],
    "role_type": ["role type", "elected", "staff"],
}

DIFF_FIELDS = ["name", "email", "phone", "fax", "mailing_address", "physical_address"]


def _parse_upload(filename: str, content: bytes):
    name = (filename or "").lower()
    if name.endswith(".xlsx"):
        wb = load_workbook(BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        it = ws.iter_rows(values_only=True)
        first = next(it, None) or []
        headers = [str(h).strip() if h is not None else "" for h in first]
        data = []
        for row in it:
            padded = list(row) + [None] * (len(headers) - len(row))
            data.append([("" if v is None else str(v)).strip() for v in padded[:len(headers)]])
            if len(data) >= MAX_PREVIEW_ROWS:
                break
        return headers, data
    if name.endswith(".csv") or name.endswith(".txt"):
        txt = content.decode("utf-8-sig", errors="replace")
        reader = csv.reader(txt.splitlines())
        headers = [h.strip() for h in next(reader, [])]
        data = []
        for row in reader:
            padded = list(row) + [""] * (len(headers) - len(row))
            data.append([c.strip() for c in padded[:len(headers)]])
            if len(data) >= MAX_PREVIEW_ROWS:
                break
        return headers, data
    from .import_vision import extract_via_vision, _detect_media_type
    if _detect_media_type(filename):
        return extract_via_vision(filename, content, "official")
    raise HTTPException(400, "Unsupported file type. Use .csv, .xlsx, .pdf, .jpg, or .png")


def _guess_mapping(headers):
    mapping = {}
    used = set()
    for field, pats in GUESS_PATTERNS.items():
        best = None
        for h in headers:
            if h in used or not h:
                continue
            hl = h.lower().strip()
            if any(p == hl for p in pats):
                best = h
                break
        if not best:
            for h in headers:
                if h in used or not h:
                    continue
                hl = h.lower().strip()
                if any(p in hl for p in pats):
                    best = h
                    break
        if best:
            mapping[field] = best
            used.add(best)
    return mapping


@router.post("/preview")
async def preview(file: UploadFile = File(...)):
    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(413, "File too large (max 5MB)")
    headers, rows = _parse_upload(file.filename, content)
    return {
        "columns": headers,
        "rows": rows,
        "suggested_mapping": _guess_mapping(headers),
        "field_choices": FIELD_CHOICES,
        "truncated": len(rows) >= MAX_PREVIEW_ROWS,
    }


class DiffRequest(BaseModel):
    columns: list[str]
    rows: list[list[str]]
    mapping: dict[str, str]


def _norm(s):
    return (s or "").strip().lower()


async def _resolve_jurisdiction(db: AsyncSession, jname: str):
    """Return (jurisdiction_id, confidence, candidates). confidence: exact|fuzzy|none."""
    if not jname:
        return None, "none", []
    n = _norm(jname)
    r = await db.execute(text(
        "SELECT jurisdiction_id, name, type FROM common.jurisdictions "
        "WHERE lower(trim(name)) = :n LIMIT 1"
    ), {"n": n})
    row = r.mappings().first()
    if row:
        return row["jurisdiction_id"], "exact", []

    pattern = "%" + n.replace("%", "") + "%"
    r = await db.execute(text(
        "SELECT jurisdiction_id, name, type FROM common.jurisdictions "
        "WHERE lower(name) ILIKE :p ORDER BY length(name) LIMIT 5"
    ), {"p": pattern})
    cands = [dict(x) for x in r.mappings().all()]
    if len(cands) == 1:
        return cands[0]["jurisdiction_id"], "fuzzy", cands
    return None, "none", cands


@router.post("/diff")
async def diff(payload: DiffRequest, db: AsyncSession = Depends(get_db)):
    cols = payload.columns
    mapping = payload.mapping or {}
    col_index = {h: i for i, h in enumerate(cols)}

    required = ["jurisdiction_name", "name", "title"]
    for f in required:
        if f not in mapping or mapping[f] not in col_index:
            raise HTTPException(400, f"Mapping required: {f}")

    def cell(row, field):
        col = mapping.get(field)
        if not col or col not in col_index:
            return None
        i = col_index[col]
        if i >= len(row):
            return None
        v = (row[i] or "").strip()
        return v or None

    # Cache jurisdiction lookups per spreadsheet name
    juris_cache = {}
    results = []

    for idx, row in enumerate(payload.rows):
        jname = cell(row, "jurisdiction_name")
        name = cell(row, "name")
        title = cell(row, "title")
        incoming = {f: cell(row, f) for f in FIELD_CHOICES}

        if not name or not title:
            results.append({
                "row_index": idx,
                "status": "ERROR",
                "error": "Missing name or title",
                "incoming": incoming,
            })
            continue

        cache_key = _norm(jname)
        if cache_key in juris_cache:
            jid, conf, cands = juris_cache[cache_key]
        else:
            jid, conf, cands = await _resolve_jurisdiction(db, jname)
            juris_cache[cache_key] = (jid, conf, cands)

        if not jid:
            results.append({
                "row_index": idx,
                "status": "UNMATCHED",
                "incoming": incoming,
                "jurisdiction_candidates": cands,
            })
            continue

        existing = await db.execute(text(
            "SELECT official_id, name, title, email, phone, fax, "
            "       mailing_address, physical_address, role_type, source "
            "FROM public.officials "
            "WHERE jurisdiction_id = :jid AND lower(trim(title)) = :t AND ended_date IS NULL "
            "ORDER BY official_id DESC LIMIT 1"
        ), {"jid": jid, "t": _norm(title)})
        ex = existing.mappings().first()
        ex = dict(ex) if ex else None

        if not ex:
            results.append({
                "row_index": idx,
                "status": "NEW",
                "jurisdiction_id": jid,
                "jurisdiction_confidence": conf,
                "incoming": incoming,
            })
            continue

        changed = []
        for f in DIFF_FIELDS:
            old = (ex.get(f) or "").strip() or None
            new = incoming.get(f)
            if new and new != old:
                changed.append({"field": f, "old": old, "new": new})

        if not changed:
            results.append({
                "row_index": idx,
                "status": "SAME",
                "jurisdiction_id": jid,
                "existing": ex,
                "incoming": incoming,
            })
        else:
            results.append({
                "row_index": idx,
                "status": "CHANGED",
                "jurisdiction_id": jid,
                "existing": ex,
                "incoming": incoming,
                "changed_fields": changed,
            })

    summary = {}
    for r in results:
        summary[r["status"]] = summary.get(r["status"], 0) + 1

    return {"rows": results, "summary": summary}


class CommitDecision(BaseModel):
    row_index: int
    action: str  # "insert" | "replace" | "skip"
    jurisdiction_id: Optional[int] = None
    existing_official_id: Optional[int] = None


class CommitRequest(BaseModel):
    columns: list[str]
    rows: list[list[str]]
    mapping: dict[str, str]
    decisions: list[CommitDecision]
    source: Optional[str] = None


@router.post("/commit")
async def commit(payload: CommitRequest, db: AsyncSession = Depends(get_db)):
    cols = payload.columns
    mapping = payload.mapping or {}
    col_index = {h: i for i, h in enumerate(cols)}

    def cell(row, field):
        c = mapping.get(field)
        if not c or c not in col_index:
            return None
        i = col_index[c]
        if i >= len(row):
            return None
        v = (row[i] or "").strip()
        return v or None

    inserted = 0
    replaced = 0
    skipped = 0
    errors = []
    today = date.today()

    for d in payload.decisions:
        if d.action == "skip":
            skipped += 1
            continue
        if d.row_index < 0 or d.row_index >= len(payload.rows):
            errors.append({"row_index": d.row_index, "error": "row out of range"})
            continue
        row = payload.rows[d.row_index]
        name = cell(row, "name")
        title = cell(row, "title")
        jid = d.jurisdiction_id
        if not name or not title or not jid:
            errors.append({"row_index": d.row_index, "error": "missing name/title/jurisdiction"})
            continue

        if d.action == "replace":
            if not d.existing_official_id:
                errors.append({"row_index": d.row_index, "error": "replace needs existing_official_id"})
                continue
            await db.execute(text(
                "UPDATE public.officials SET ended_date = :t WHERE official_id = :oid"
            ), {"t": today, "oid": d.existing_official_id})

        role = cell(row, "role_type") or "elected"
        if role not in ("elected", "staff"):
            role = "elected"

        await db.execute(text(
            "INSERT INTO public.officials "
            "(jurisdiction_id, name, title, email, phone, fax, "
            " mailing_address, physical_address, source, source_date, role_type) "
            "VALUES (:jid, :name, :title, :email, :phone, :fax, "
            "        :mail, :phys, :src, :sd, :role)"
        ), {
            "jid": jid, "name": name, "title": title,
            "email": cell(row, "email"),
            "phone": cell(row, "phone"),
            "fax": cell(row, "fax"),
            "mail": cell(row, "mailing_address"),
            "phys": cell(row, "physical_address"),
            "src": cell(row, "source") or payload.source,
            "sd": today,
            "role": role,
        })

        if d.action == "replace":
            replaced += 1
        else:
            inserted += 1

    await db.commit()
    return {"inserted": inserted, "replaced": replaced, "skipped": skipped, "errors": errors}
