from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_db

router = APIRouter(tags=["search"])


@router.get("/search")
async def universal_search(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    term = f"%{q}%"
    params = {"q": term}

    # Jurisdictions: match name, or county name
    result = await db.execute(text("""
        SELECT j.jurisdiction_id, j.name, j.type,
               c.county_name, jp.population,
               os.status
        FROM common.jurisdictions j
        LEFT JOIN common.counties c ON c.county_id = j.county_id
        LEFT JOIN ces.jurisdiction_profile jp ON jp.jurisdiction_id = j.jurisdiction_id
        LEFT JOIN ces.outreach_status os ON os.jurisdiction_id = j.jurisdiction_id
        WHERE j.name ILIKE :q OR c.county_name ILIKE :q
        ORDER BY jp.population DESC NULLS LAST
        LIMIT 25
    """), params)
    jurisdictions = [dict(r) for r in result.mappings().all()]

    # Officials: match name, title, or email
    result = await db.execute(text("""
        SELECT o.official_id, o.name, o.title, o.phone, o.email,
               j.jurisdiction_id, j.name as jurisdiction_name,
               j.type as jurisdiction_type, c.county_name
        FROM public.officials o
        LEFT JOIN common.jurisdictions j ON j.jurisdiction_id = o.jurisdiction_id
        LEFT JOIN common.counties c ON c.county_id = j.county_id
        WHERE o.name ILIKE :q OR o.title ILIKE :q OR o.email ILIKE :q
        ORDER BY j.name, o.name
        LIMIT 25
    """), params)
    officials = [dict(r) for r in result.mappings().all()]

    # Vendors: match vendor_name
    result = await db.execute(text("""
        SELECT vendor_id, vendor_name, contact_name, phone, email, bluebook_status
        FROM ces.vendors
        WHERE vendor_name ILIKE :q OR contact_name ILIKE :q
        ORDER BY vendor_name
        LIMIT 25
    """), params)
    vendors = [dict(r) for r in result.mappings().all()]

    return {
        "query": q,
        "jurisdictions": jurisdictions,
        "officials": officials,
        "vendors": vendors,
    }
