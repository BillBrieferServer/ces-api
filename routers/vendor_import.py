from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from io import BytesIO
import csv

from openpyxl import load_workbook
from database import get_db

router = APIRouter(prefix="/vendors/import", tags=["vendor-import"])

MAX_PREVIEW_ROWS = 500
MAX_FILE_BYTES = 5_000_000

FIELD_CHOICES = [
    "vendor_name", "contact_name", "contact_title",
    "phone", "cell_phone", "email",
    "website", "address",
    "source", "bluebook_status", "ces_contract_category",
]

GUESS_PATTERNS = {
    "vendor_name": ["vendor", "company", "business", "organization", "org name", "firm"],
    "contact_name": ["contact", "full name", "person", "name"],
    "contact_title": ["title", "position", "role", "job title"],
    "phone": ["work phone", "office phone", "phone", "telephone", "tel"],
    "cell_phone": ["cell", "mobile"],
    "email": ["email", "e-mail", "mail"],
    "website": ["website", "web", "url", "site"],
    "address": ["address", "street", "location"],
    "source": ["source"],
    "bluebook_status": ["bluebook"],
    "ces_contract_category": ["category", "contract"],
}


def _parse_upload(filename: str, content: bytes):
    name = (filename or "").lower()
    if name.endswith(".xlsx"):
        wb = load_workbook(BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        first = next(rows_iter, None) or []
        headers = [str(h).strip() if h is not None else "" for h in first]
        data = []
        for row in rows_iter:
            padded = list(row) + [None] * (len(headers) - len(row))
            data.append([("" if v is None else str(v)).strip() for v in padded[:len(headers)]])
            if len(data) >= MAX_PREVIEW_ROWS:
                break
        return headers, data
    if name.endswith(".csv") or name.endswith(".txt"):
        text_content = content.decode("utf-8-sig", errors="replace")
        reader = csv.reader(text_content.splitlines())
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
        return extract_via_vision(filename, content, "vendor")
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
            for p in pats:
                if p == hl:
                    best = h
                    break
            if best:
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
async def import_preview(file: UploadFile = File(...)):
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


import re as _re

_NAME_SUFFIX_PATTERN = _re.compile(
    r"\b(inc|llc|l\.l\.c|ltd|corp|corporation|company|co|bank|group|services|service|associates|partners|plc)\b\.?",
    _re.IGNORECASE,
)


def _normalize_name(s: str) -> str:
    s = (s or "").lower().strip()
    s = _re.sub(r"^the\s+", "", s)
    s = _NAME_SUFFIX_PATTERN.sub("", s)
    s = _re.sub(r"[^a-z0-9]+", "", s)
    return s


class DiffRequest(BaseModel):
    columns: list[str]
    rows: list[list[str]]
    mapping: dict[str, str]


SIM_THRESHOLD = 0.45


@router.post("/diff")
async def vendor_diff(payload: DiffRequest, db: AsyncSession = Depends(get_db)):
    mapping = payload.mapping or {}
    cols = payload.columns
    col_index = {h: i for i, h in enumerate(cols)}
    if "vendor_name" not in mapping or mapping["vendor_name"] not in col_index:
        raise HTTPException(400, "vendor_name mapping is required")

    def cell(row, field):
        c = mapping.get(field)
        if not c or c not in col_index:
            return None
        i = col_index[c]
        if i >= len(row):
            return None
        v = (row[i] or "").strip()
        return v or None

    results = []
    cache: dict = {}

    for idx, row in enumerate(payload.rows):
        vname = cell(row, "vendor_name")
        incoming = {f: cell(row, f) for f in [
            "vendor_name", "contact_name", "contact_title", "phone", "cell_phone",
            "email", "website", "address", "source",
            "bluebook_status", "ces_contract_category",
        ]}

        if not vname:
            results.append({"row_index": idx, "status": "ERROR", "error": "missing vendor_name", "incoming": incoming})
            continue

        norm = _normalize_name(vname)
        cache_key = norm or vname.lower().strip()

        if cache_key in cache:
            exact, cands = cache[cache_key]
        else:
            r = await db.execute(text(
                "SELECT vendor_id, vendor_name FROM ces.vendors "
                "WHERE lower(trim(vendor_name)) = lower(trim(:n)) LIMIT 1"
            ), {"n": vname})
            exact_row = r.mappings().first()
            exact = dict(exact_row) if exact_row else None

            cands = []
            if not exact:
                sr = await db.execute(text(
                    "SELECT vendor_id, vendor_name, similarity(lower(vendor_name), :q) AS sim "
                    "FROM ces.vendors "
                    "WHERE similarity(lower(vendor_name), :q) > :thr "
                    "ORDER BY sim DESC LIMIT 5"
                ), {"q": vname.lower(), "thr": SIM_THRESHOLD})
                cands = [dict(x) for x in sr.mappings().all()]

                if norm:
                    sr2 = await db.execute(text(
                        "SELECT vendor_id, vendor_name FROM ces.vendors"
                    ))
                    all_rows = [dict(x) for x in sr2.mappings().all()]
                    seen_ids = {c["vendor_id"] for c in cands}
                    norm_matches = [
                        v for v in all_rows
                        if v["vendor_id"] not in seen_ids and _normalize_name(v["vendor_name"]) == norm
                    ]
                    for nm in norm_matches[:5]:
                        cands.insert(0, {"vendor_id": nm["vendor_id"], "vendor_name": nm["vendor_name"], "sim": 1.0, "normalized": True})

            cache[cache_key] = (exact, cands)

        if exact:
            results.append({
                "row_index": idx, "status": "EXACT",
                "existing_vendor_id": exact["vendor_id"],
                "existing_vendor_name": exact["vendor_name"],
                "incoming": incoming,
            })
        elif cands:
            results.append({
                "row_index": idx, "status": "POSSIBLE",
                "incoming": incoming,
                "candidates": cands,
            })
        else:
            results.append({"row_index": idx, "status": "NEW", "incoming": incoming})

    summary = {}
    for r in results:
        summary[r["status"]] = summary.get(r["status"], 0) + 1
    return {"rows": results, "summary": summary}


class CommitDecision(BaseModel):
    row_index: int
    action: str
    existing_vendor_id: Optional[int] = None


class CommitRequest(BaseModel):
    columns: list[str]
    rows: list[list[str]]
    mapping: dict[str, str]
    decisions: list[CommitDecision]
    source: Optional[str] = None


@router.post("/commit")
async def vendor_commit(payload: CommitRequest, db: AsyncSession = Depends(get_db)):
    mapping = payload.mapping or {}
    cols = payload.columns
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
    merged = 0
    skipped = 0
    errors = []

    for d in payload.decisions:
        if d.action == "skip":
            skipped += 1
            continue
        if d.row_index < 0 or d.row_index >= len(payload.rows):
            errors.append({"row_index": d.row_index, "error": "row out of range"})
            continue
        row = payload.rows[d.row_index]
        vname = cell(row, "vendor_name")
        if not vname:
            errors.append({"row_index": d.row_index, "error": "missing vendor_name"})
            continue

        contact_payload = {
            "cn": cell(row, "contact_name"),
            "ct": cell(row, "contact_title"),
            "ph": cell(row, "phone"),
            "cp": cell(row, "cell_phone"),
            "em": cell(row, "email"),
        }
        has_contact = any(contact_payload.values())

        if d.action == "merge":
            if not d.existing_vendor_id:
                errors.append({"row_index": d.row_index, "error": "merge needs existing_vendor_id"})
                continue
            if has_contact:
                await db.execute(text(
                    "INSERT INTO ces.vendor_contacts "
                    "(vendor_id, contact_name, contact_title, phone, cell_phone, email, is_primary) "
                    "VALUES (:vid, :cn, :ct, :ph, :cp, :em, false)"
                ), {"vid": d.existing_vendor_id, **contact_payload})
            merged += 1
            continue

        ins = await db.execute(text(
            "INSERT INTO ces.vendors "
            "(vendor_name, website, address, bluebook_status, ces_contract_category, source, "
            " contact_name, contact_title, phone, cell_phone, email) "
            "VALUES (:vn, :web, :addr, :bb, :cat, :src, :cn, :ct, :ph, :cp, :em) "
            "RETURNING vendor_id"
        ), {
            "vn": vname,
            "web": cell(row, "website"),
            "addr": cell(row, "address"),
            "bb": cell(row, "bluebook_status") or "not_listed",
            "cat": cell(row, "ces_contract_category"),
            "src": cell(row, "source") or payload.source,
            **contact_payload,
        })
        new_id = ins.mappings().first()["vendor_id"]
        if has_contact:
            await db.execute(text(
                "INSERT INTO ces.vendor_contacts "
                "(vendor_id, contact_name, contact_title, phone, cell_phone, email, is_primary) "
                "VALUES (:vid, :cn, :ct, :ph, :cp, :em, true)"
            ), {"vid": new_id, **contact_payload})
        inserted += 1

    await db.commit()
    return {"inserted": inserted, "merged": merged, "skipped": skipped, "errors": errors}
