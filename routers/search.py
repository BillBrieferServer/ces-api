from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_db

router = APIRouter(tags=["search"])

STOPWORDS = {"of", "the", "in", "at", "for", "and", "or", "a", "an", "to", "is"}


@router.get("/search")
async def universal_search(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    # Split into meaningful words
    words = [w for w in q.strip().split() if w.lower() not in STOPWORDS and len(w) > 0]
    if not words:
        words = [q.strip()]

    # Build per-word parameters
    params = {}
    for i, w in enumerate(words):
        params[f"w{i}"] = f"%{w}%"

    # --- Jurisdictions: every word must appear in name OR county_name ---
    j_conditions = " AND ".join(
        f"(j.name ILIKE :w{i} OR c.county_name ILIKE :w{i})"
        for i in range(len(words))
    )
    result = await db.execute(text(f"""
        SELECT j.jurisdiction_id, j.name, j.type,
               c.county_name, jp.population,
               os.status
        FROM common.jurisdictions j
        LEFT JOIN common.counties c ON c.county_id = j.county_id
        LEFT JOIN ces.jurisdiction_profile jp ON jp.jurisdiction_id = j.jurisdiction_id
        LEFT JOIN ces.outreach_status os ON os.jurisdiction_id = j.jurisdiction_id
        WHERE {j_conditions}
        ORDER BY jp.population DESC NULLS LAST
        LIMIT 25
    """), params)
    jurisdictions = [dict(r) for r in result.mappings().all()]

    # --- Officials: every word must appear across name/title/email/jurisdiction/county ---
    o_conditions = " AND ".join(
        f"(o.name ILIKE :w{i} OR o.title ILIKE :w{i} OR o.email ILIKE :w{i} "
        f"OR j.name ILIKE :w{i} OR c.county_name ILIKE :w{i})"
        for i in range(len(words))
    )
    result = await db.execute(text(f"""
        SELECT o.official_id, o.name, o.title, o.phone, o.email,
               j.jurisdiction_id, j.name as jurisdiction_name,
               j.type as jurisdiction_type, c.county_name
        FROM public.officials o
        LEFT JOIN common.jurisdictions j ON j.jurisdiction_id = o.jurisdiction_id
        LEFT JOIN common.counties c ON c.county_id = j.county_id
        WHERE {o_conditions}
        ORDER BY j.name, o.name
        LIMIT 25
    """), params)
    officials = [dict(r) for r in result.mappings().all()]

    # --- Vendors: every word must appear in vendor_name or contact_name ---
    v_conditions = " AND ".join(
        f"(v.vendor_name ILIKE :w{i} OR v.contact_name ILIKE :w{i})"
        for i in range(len(words))
    )
    result = await db.execute(text(f"""
        SELECT v.vendor_id, v.vendor_name, v.contact_name, v.phone, v.email, v.bluebook_status
        FROM ces.vendors v
        WHERE {v_conditions}
        ORDER BY v.vendor_name
        LIMIT 25
    """), params)
    vendors = [dict(r) for r in result.mappings().all()]

    return {
        "query": q,
        "jurisdictions": jurisdictions,
        "officials": officials,
        "vendors": vendors,
    }
