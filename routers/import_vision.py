import base64
import json
import os
import re
from typing import Optional

from anthropic import Anthropic
from fastapi import HTTPException

VISION_MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 4096

VENDOR_PROMPT = """Extract business/vendor contact info from the attached image or document.

Return ONLY a JSON object in this exact shape (no prose, no markdown fences):
{
  "columns": ["Company", "Contact Name", "Title", "Phone", "Cell Phone", "Email", "Website", "Address"],
  "rows": [
    ["Acme Corp", "Jane Doe", "VP Sales", "208-555-1212", "208-555-9999", "jane@acme.com", "https://acme.com", "123 Main St, Boise ID"]
  ]
}

Rules:
- One row per distinct person. If the document lists multiple contacts at the same company, produce one row per contact (Company repeated).
- Use empty string "" for missing fields. Never invent data.
- For business card images there will typically be exactly one row.
- For rosters/directories there may be many.
- Clean whitespace, don't include label prefixes (e.g. return "jane@acme.com" not "Email: jane@acme.com")."""

OFFICIAL_PROMPT = """Extract elected official / public staff contact info from the attached image or document.

Return ONLY a JSON object in this exact shape (no prose, no markdown fences):
{
  "columns": ["Jurisdiction", "Name", "Title", "Email", "Phone", "Fax", "Mailing Address", "Physical Address", "Role Type"],
  "rows": [
    ["City of Boise", "Jane Doe", "Mayor", "mayor@cityofboise.org", "208-555-1212", "", "PO Box 500, Boise ID 83701", "150 N Capitol Blvd, Boise ID", "elected"]
  ]
}

Rules:
- One row per person.
- Jurisdiction: include the full entity name exactly as it appears (City of X, Ada County, X School District, etc.).
- Role Type: "elected" for mayors/council/commissioners/trustees, "staff" for clerks/chiefs/superintendents/treasurers/directors. If unclear, use "elected".
- Use empty string "" for missing fields. Never invent data.
- Clean whitespace, strip label prefixes."""


def _strip_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\n", "", s)
        s = re.sub(r"\n```\s*$", "", s)
    return s.strip()


def _parse_vision_json(text: str) -> dict:
    try:
        return json.loads(_strip_fence(text))
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            return json.loads(m.group(0))
        raise HTTPException(502, "Vision extraction did not return valid JSON")


def _detect_media_type(filename: str) -> Optional[str]:
    ext = (filename or "").lower().rsplit(".", 1)[-1]
    return {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png", "gif": "image/gif", "webp": "image/webp",
        "pdf": "application/pdf",
    }.get(ext)


def extract_via_vision(filename: str, content: bytes, target: str):
    """target: 'vendor' | 'official'. Returns (columns, rows)."""
    media_type = _detect_media_type(filename)
    if not media_type:
        raise HTTPException(400, "Unsupported file type for vision extraction")

    if not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(500, "ANTHROPIC_API_KEY not configured")

    prompt = VENDOR_PROMPT if target == "vendor" else OFFICIAL_PROMPT
    data_b64 = base64.standard_b64encode(content).decode("ascii")

    if media_type == "application/pdf":
        content_block = {
            "type": "document",
            "source": {"type": "base64", "media_type": "application/pdf", "data": data_b64},
        }
    else:
        content_block = {
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": data_b64},
        }

    client = Anthropic()
    msg = client.messages.create(
        model=VISION_MODEL,
        max_tokens=MAX_TOKENS,
        messages=[{
            "role": "user",
            "content": [content_block, {"type": "text", "text": prompt}],
        }],
    )
    text = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")
    parsed = _parse_vision_json(text)
    cols = parsed.get("columns") or []
    rows = parsed.get("rows") or []
    cleaned = []
    for r in rows:
        if not isinstance(r, list):
            continue
        padded = list(r) + [""] * (len(cols) - len(r))
        cleaned.append([("" if v is None else str(v)).strip() for v in padded[:len(cols)]])
    return cols, cleaned
