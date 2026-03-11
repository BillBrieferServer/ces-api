from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_db
from models import OutreachUpdate, OutreachDetail

router = APIRouter(prefix="/outreach", tags=["outreach"])


@router.put("/{jurisdiction_id}", response_model=OutreachDetail)
async def update_outreach(
    jurisdiction_id: int,
    update: OutreachUpdate,
    db: AsyncSession = Depends(get_db),
):
    # Check exists
    result = await db.execute(
        text("SELECT 1 FROM ces.outreach_status WHERE jurisdiction_id = :jid"),
        {"jid": jurisdiction_id},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Outreach record not found")

    # Build dynamic SET clause from provided fields
    fields = update.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Auto-set first_contact_date when status moves past not_contacted
    if "status" in fields and fields["status"] != "not_contacted":
        check = await db.execute(
            text("SELECT first_contact_date FROM ces.outreach_status WHERE jurisdiction_id = :jid"),
            {"jid": jurisdiction_id},
        )
        row = check.first()
        if row and row[0] is None:
            fields["first_contact_date"] = text("CURRENT_DATE")

    set_parts = []
    params = {"jid": jurisdiction_id}
    for key, val in fields.items():
        if isinstance(val, text.__class__):
            set_parts.append(f"{key} = CURRENT_DATE")
        else:
            set_parts.append(f"{key} = :{key}")
            params[key] = val

    set_parts.append("updated_date = now()")

    sql = f"UPDATE ces.outreach_status SET {', '.join(set_parts)} WHERE jurisdiction_id = :jid"
    await db.execute(text(sql), params)
    await db.commit()

    # Return updated record
    result = await db.execute(text("""
        SELECT status, assigned_rm, priority_tier, first_contact_date,
               board_meeting_target, board_approval_date, ces_member_since, notes
        FROM ces.outreach_status WHERE jurisdiction_id = :jid
    """), {"jid": jurisdiction_id})
    row = result.mappings().first()
    return OutreachDetail(**dict(row))
