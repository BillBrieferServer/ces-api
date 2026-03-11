from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional

from database import get_db
from models import OfficialListItem, OfficialDetail, InteractionSummary

router = APIRouter(prefix="/officials", tags=["officials"])


@router.get("", response_model=list[OfficialListItem])
async def list_officials(
    name: Optional[str] = None,
    jurisdiction_id: Optional[int] = None,
    title: Optional[str] = None,
    jurisdiction: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    where = []
    params = {}

    if name:
        where.append("o.name ILIKE :name")
        params["name"] = f"%{name}%"
    if jurisdiction_id:
        where.append("o.jurisdiction_id = :jurisdiction_id")
        params["jurisdiction_id"] = jurisdiction_id
    if title:
        where.append("o.title ILIKE :title")
        params["title"] = f"%{title}%"
    if jurisdiction:
        where.append("j.name ILIKE :jurisdiction")
        params["jurisdiction"] = f"%{jurisdiction}%"

    where_clause = ("WHERE " + " AND ".join(where)) if where else ""

    result = await db.execute(text(f"""
        SELECT o.official_id, o.name, o.title, o.phone, o.email,
               j.name as jurisdiction_name, j.type as jurisdiction_type
        FROM public.officials o
        LEFT JOIN common.jurisdictions j ON j.jurisdiction_id = o.jurisdiction_id
        {where_clause}
        ORDER BY o.name
        LIMIT 200
    """), params)

    return [OfficialListItem(**dict(r)) for r in result.mappings().all()]


@router.get("/{official_id}", response_model=OfficialDetail)
async def get_official(official_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT o.official_id, o.name, o.title, o.phone, o.email,
               o.fax, o.mailing_address, o.physical_address,
               o.source, o.source_year,
               j.name as jurisdiction_name, j.type as jurisdiction_type
        FROM public.officials o
        LEFT JOIN common.jurisdictions j ON j.jurisdiction_id = o.jurisdiction_id
        WHERE o.official_id = :oid
    """), {"oid": official_id})
    row = result.mappings().first()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Official not found")

    data = dict(row)

    # Interactions involving this official
    result = await db.execute(text("""
        SELECT i.interaction_id, i.interaction_date, i.type, i.summary,
               NULL as official_name, i.follow_up_date, i.completed
        FROM ces.interactions i
        WHERE i.official_id = :oid
        ORDER BY i.interaction_date DESC
    """), {"oid": official_id})
    data["interactions"] = [InteractionSummary(**dict(r)) for r in result.mappings().all()]

    return OfficialDetail(**data)
