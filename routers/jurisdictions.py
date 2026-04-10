from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional

from database import get_db
from models import JurisdictionListItem, JurisdictionDetail, ProfileDetail, ProfileUpdate, OutreachDetail, OfficialSummary, HistoryEntry, VendorSummary

router = APIRouter(prefix="/jurisdictions", tags=["jurisdictions"])


@router.get("", response_model=list[JurisdictionListItem])
async def list_jurisdictions(
    type: Optional[str] = None,
    county_id: Optional[int] = None,
    aic_district: Optional[int] = None,
    min_population: Optional[int] = None,
    status: Optional[str] = None,
    sort_by: Optional[str] = Query("name", pattern="^(name|population|status)$"),
    db: AsyncSession = Depends(get_db),
):
    where = []
    params = {}

    if type:
        where.append("j.type = :type")
        params["type"] = type
    if county_id:
        where.append("j.county_id = :county_id")
        params["county_id"] = county_id
    if aic_district:
        where.append("jp.aic_district = :aic_district")
        params["aic_district"] = aic_district
    if min_population:
        where.append("jp.population >= :min_population")
        params["min_population"] = min_population
    if status:
        where.append("os.status = :status")
        params["status"] = status

    where_clause = ("WHERE " + " AND ".join(where)) if where else ""

    sort_map = {
        "name": "j.name",
        "population": "jp.population DESC NULLS LAST",
        "status": "os.status",
    }
    order = sort_map.get(sort_by, "j.name")

    sql = f"""
        SELECT j.jurisdiction_id, j.name, j.type,
               c.county_name as county_name,
               jp.population, jp.employee_count, jp.aic_district,
               os.status, os.assigned_rm, j.grades
        FROM common.jurisdictions j
        LEFT JOIN common.counties c ON c.county_id = j.county_id
        LEFT JOIN ces.jurisdiction_profile jp ON jp.jurisdiction_id = j.jurisdiction_id
        LEFT JOIN ces.outreach_status os ON os.jurisdiction_id = j.jurisdiction_id
        {where_clause}
        ORDER BY {order}
        LIMIT 1500
    """

    result = await db.execute(text(sql), params)
    rows = result.mappings().all()
    return [JurisdictionListItem(**dict(r)) for r in rows]


@router.get("/{jurisdiction_id}", response_model=JurisdictionDetail)
async def get_jurisdiction(jurisdiction_id: int, db: AsyncSession = Depends(get_db)):
    # Base info
    result = await db.execute(text("""
        SELECT j.jurisdiction_id, j.name, j.type, j.website_url, j.grades,
               c.county_name as county_name
        FROM common.jurisdictions j
        LEFT JOIN common.counties c ON c.county_id = j.county_id
        WHERE j.jurisdiction_id = :jid
    """), {"jid": jurisdiction_id})
    row = result.mappings().first()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Jurisdiction not found")

    data = dict(row)

    # Profile
    result = await db.execute(text("""
        SELECT population, employee_count, aic_district, council_meeting_schedule,
               office_phone, office_fax, office_hours, mailing_address, physical_address
        FROM ces.jurisdiction_profile WHERE jurisdiction_id = :jid
    """), {"jid": jurisdiction_id})
    profile_row = result.mappings().first()
    data["profile"] = ProfileDetail(**dict(profile_row)) if profile_row else None

    # Outreach
    result = await db.execute(text("""
        SELECT status, assigned_rm, priority, first_contact_date,
               next_action_date, next_action_type, board_approval_date, ces_member_since
        FROM ces.outreach_status WHERE jurisdiction_id = :jid
    """), {"jid": jurisdiction_id})
    outreach_row = result.mappings().first()
    data["outreach"] = OutreachDetail(**dict(outreach_row)) if outreach_row else None

    # Officials (elected)
    result = await db.execute(text("""
        SELECT official_id, name, title, phone, email
        FROM public.officials WHERE jurisdiction_id = :jid AND role_type = 'elected' ORDER BY title, name
    """), {"jid": jurisdiction_id})
    data["officials"] = [OfficialSummary(**dict(r)) for r in result.mappings().all()]

    # Key Staff
    result = await db.execute(text("""
        SELECT official_id, name, title, phone, email
        FROM public.officials WHERE jurisdiction_id = :jid AND role_type = 'staff' ORDER BY title, name
    """), {"jid": jurisdiction_id})
    data["staff"] = [OfficialSummary(**dict(r)) for r in result.mappings().all()]

    # History (auto-logged from outreach changes)
    result = await db.execute(text("""
        SELECT interaction_id, interaction_date, type, summary
        FROM ces.interactions
        WHERE jurisdiction_id = :jid
        ORDER BY interaction_date DESC
        LIMIT 50
    """), {"jid": jurisdiction_id})
    data["history"] = [HistoryEntry(**dict(r)) for r in result.mappings().all()]

    # Vendors
    result = await db.execute(text("""
        SELECT v.vendor_id, v.vendor_name, vj.relationship_type, vj.annual_spend
        FROM ces.vendor_jurisdictions vj
        JOIN ces.vendors v ON v.vendor_id = vj.vendor_id
        WHERE vj.jurisdiction_id = :jid
    """), {"jid": jurisdiction_id})
    data["vendors"] = [VendorSummary(**dict(r)) for r in result.mappings().all()]

    return JurisdictionDetail(**data)


@router.put("/{jurisdiction_id}/profile")
async def update_profile(jurisdiction_id: int, body: ProfileUpdate, db: AsyncSession = Depends(get_db)):
    # Check jurisdiction exists
    result = await db.execute(text("SELECT jurisdiction_id FROM common.jurisdictions WHERE jurisdiction_id = :jid"), {"jid": jurisdiction_id})
    if not result.first():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Jurisdiction not found")

    # Update entity_name on jurisdictions table if provided
    if body.entity_name is not None:
        await db.execute(text("UPDATE common.jurisdictions SET name = :name WHERE jurisdiction_id = :jid"),
                         {"name": body.entity_name.strip(), "jid": jurisdiction_id})

    # Update website_url on jurisdictions table if provided
    if body.website_url is not None:
        await db.execute(text("UPDATE common.jurisdictions SET website_url = :url WHERE jurisdiction_id = :jid"),
                         {"url": body.website_url or None, "jid": jurisdiction_id})

    # Upsert profile
    profile_fields = {
        "population": body.population,
        "employee_count": body.employee_count,
        "aic_district": body.aic_district,
        "council_meeting_schedule": body.council_meeting_schedule,
        "office_phone": body.office_phone,
        "office_fax": body.office_fax,
        "office_hours": body.office_hours,
        "mailing_address": body.mailing_address,
        "physical_address": body.physical_address,
    }

    await db.execute(text("""
        INSERT INTO ces.jurisdiction_profile (jurisdiction_id, population, employee_count, aic_district,
            council_meeting_schedule, office_phone, office_fax, office_hours, mailing_address, physical_address, updated_date)
        VALUES (:jid, :population, :employee_count, :aic_district,
            :council_meeting_schedule, :office_phone, :office_fax, :office_hours, :mailing_address, :physical_address, now())
        ON CONFLICT (jurisdiction_id) DO UPDATE SET
            population = EXCLUDED.population,
            employee_count = EXCLUDED.employee_count,
            aic_district = EXCLUDED.aic_district,
            council_meeting_schedule = EXCLUDED.council_meeting_schedule,
            office_phone = EXCLUDED.office_phone,
            office_fax = EXCLUDED.office_fax,
            office_hours = EXCLUDED.office_hours,
            mailing_address = EXCLUDED.mailing_address,
            physical_address = EXCLUDED.physical_address,
            updated_date = now()
    """), {"jid": jurisdiction_id, **profile_fields})

    await db.commit()
    return {"ok": True}
