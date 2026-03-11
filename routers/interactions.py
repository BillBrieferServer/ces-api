from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional

from database import get_db
from models import InteractionCreate, InteractionListItem

router = APIRouter(prefix="/interactions", tags=["interactions"])


@router.post("", response_model=InteractionListItem, status_code=201)
async def create_interaction(
    interaction: InteractionCreate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(text("""
        INSERT INTO ces.interactions
            (jurisdiction_id, official_id, interaction_date, type, summary,
             follow_up_date, follow_up_note)
        VALUES (:jurisdiction_id, :official_id, :interaction_date, :type, :summary,
                :follow_up_date, :follow_up_note)
        RETURNING interaction_id
    """), interaction.model_dump())
    await db.commit()
    iid = result.scalar()

    # Return the created record
    result = await db.execute(text("""
        SELECT i.interaction_id, i.jurisdiction_id,
               j.name as jurisdiction_name,
               i.official_id, o.name as official_name,
               i.interaction_date, i.type, i.summary,
               i.follow_up_date, i.follow_up_note, i.completed
        FROM ces.interactions i
        LEFT JOIN common.jurisdictions j ON j.jurisdiction_id = i.jurisdiction_id
        LEFT JOIN public.officials o ON o.official_id = i.official_id
        WHERE i.interaction_id = :iid
    """), {"iid": iid})
    return InteractionListItem(**dict(result.mappings().first()))


@router.get("", response_model=list[InteractionListItem])
async def list_interactions(
    jurisdiction_id: Optional[int] = None,
    type: Optional[str] = None,
    pending_followup: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
):
    where = []
    params = {}

    if jurisdiction_id:
        where.append("i.jurisdiction_id = :jurisdiction_id")
        params["jurisdiction_id"] = jurisdiction_id
    if type:
        where.append("i.type = :type")
        params["type"] = type
    if pending_followup:
        where.append("i.follow_up_date IS NOT NULL AND i.completed = false")

    where_clause = ("WHERE " + " AND ".join(where)) if where else ""

    result = await db.execute(text(f"""
        SELECT i.interaction_id, i.jurisdiction_id,
               j.name as jurisdiction_name,
               i.official_id, o.name as official_name,
               i.interaction_date, i.type, i.summary,
               i.follow_up_date, i.follow_up_note, i.completed
        FROM ces.interactions i
        LEFT JOIN common.jurisdictions j ON j.jurisdiction_id = i.jurisdiction_id
        LEFT JOIN public.officials o ON o.official_id = i.official_id
        {where_clause}
        ORDER BY i.interaction_date DESC
        LIMIT 200
    """), params)

    return [InteractionListItem(**dict(r)) for r in result.mappings().all()]


@router.put("/{interaction_id}/complete")
async def complete_interaction(interaction_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("UPDATE ces.interactions SET completed = true WHERE interaction_id = :iid RETURNING interaction_id"),
        {"iid": interaction_id},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Interaction not found")
    await db.commit()
    return {"status": "completed", "interaction_id": interaction_id}
