from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional

from database import get_db
from models import OfficialListItem, OfficialDetail, InteractionSummary, OfficialCreate, OfficialUpdateRequest, OfficialResponse

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
    where.append("o.ended_date IS NULL")
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
        ORDER BY split_part(o.name, ' ', array_length(string_to_array(o.name, ' '), 1))
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


@router.post("", response_model=OfficialResponse, status_code=201)
async def create_official(data: OfficialCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        INSERT INTO public.officials (jurisdiction_id, name, title, phone, email,
                                      mailing_address, physical_address, role_type, source, source_date)
        VALUES (:jurisdiction_id, :name, :title, :phone, :email,
                :mailing_address, :physical_address, :role_type, 'CES Field Update', CURRENT_DATE)
        RETURNING official_id, jurisdiction_id, name, title, phone, email,
                  mailing_address, physical_address, source, source_date
    """), {
        "jurisdiction_id": data.jurisdiction_id,
        "name": data.name,
        "title": data.title,
        "phone": data.phone,
        "email": data.email,
        "mailing_address": data.mailing_address,
        "physical_address": data.physical_address,
        "role_type": data.role_type or "elected",
    })
    await db.commit()
    row = result.mappings().first()
    return OfficialResponse(**dict(row))


@router.put("/{official_id}", response_model=OfficialResponse)
async def update_official(official_id: int, data: OfficialUpdateRequest, db: AsyncSession = Depends(get_db)):
    # Build SET clause from provided fields only
    updates = {}
    fields = data.model_dump(exclude_unset=True)
    if not fields:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="No fields to update")

    set_parts = []
    for field_name, value in fields.items():
        set_parts.append(f"{field_name} = :{field_name}")
        updates[field_name] = value

    # Always set source fields
    set_parts.append("source = 'CES Field Update'")
    set_parts.append("source_date = CURRENT_DATE")
    updates["oid"] = official_id

    sql = f"""
        UPDATE public.officials
        SET {", ".join(set_parts)}
        WHERE official_id = :oid
        RETURNING official_id, jurisdiction_id, name, title, phone, email,
                  mailing_address, physical_address, source, source_date
    """
    result = await db.execute(text(sql), updates)
    await db.commit()
    row = result.mappings().first()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Official not found")
    return OfficialResponse(**dict(row))


@router.delete("/{official_id}", status_code=204)
async def delete_official(official_id: int, db: AsyncSession = Depends(get_db)):
    # Verify official exists
    result = await db.execute(text(
        "SELECT official_id FROM public.officials WHERE official_id = :oid"
    ), {"oid": official_id})
    if not result.first():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Official not found")

    # Null out any interaction references
    await db.execute(text(
        "UPDATE ces.interactions SET official_id = NULL WHERE official_id = :oid"
    ), {"oid": official_id})

    # Delete the official
    await db.execute(text(
        "DELETE FROM public.officials WHERE official_id = :oid"
    ), {"oid": official_id})
    await db.commit()
