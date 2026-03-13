from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_db
from models import OutreachUpdate, OutreachDetail

router = APIRouter(prefix="/outreach", tags=["outreach"])

ACTION_TYPE_MAP = {
    "Visit": "entity_visit",
    "Call": "follow_up",
    "Present": "presentation",
    "Follow-up": "follow_up",
    "Send info": "follow_up",
}


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

    set_clause = ", ".join(set_parts)
    sql = f"UPDATE ces.outreach_status SET {set_clause} WHERE jurisdiction_id = :jid"
    await db.execute(text(sql), params)

    # Schedule items wiring for next_action_date changes
    if "next_action_date" in fields or "next_action_type" in fields:
        await _sync_schedule_item(db, jurisdiction_id, fields)

    await db.commit()

    # Return updated record
    result = await db.execute(text(
        "SELECT status, assigned_rm, priority, first_contact_date,"
        " next_action_date, next_action_type, board_approval_date,"
        " ces_member_since, notes"
        " FROM ces.outreach_status WHERE jurisdiction_id = :jid"
    ), {"jid": jurisdiction_id})
    row = result.mappings().first()
    return OutreachDetail(**dict(row))


async def _sync_schedule_item(db: AsyncSession, jurisdiction_id: int, fields: dict):
    """Auto-create/update/delete schedule_items when next_action_date changes."""

    # Get current entity outreach state (after the UPDATE above)
    result = await db.execute(
        text(
            "SELECT os.next_action_date, os.next_action_type, j.name"
            " FROM ces.outreach_status os"
            " JOIN common.jurisdictions j ON j.jurisdiction_id = os.jurisdiction_id"
            " WHERE os.jurisdiction_id = :jid"
        ),
        {"jid": jurisdiction_id},
    )
    row = result.mappings().first()
    new_date = row["next_action_date"]
    new_type = row["next_action_type"]
    entity_name = row["name"]

    # Find existing incomplete entity-sourced schedule item
    existing = await db.execute(
        text(
            "SELECT id FROM schedule_items"
            " WHERE entity_id = :eid AND completed = false AND source_event_id IS NULL"
        ),
        {"eid": jurisdiction_id},
    )
    existing_row = existing.first()

    if new_date:
        item_type = ACTION_TYPE_MAP.get(new_type, "custom")
        label = new_type if new_type else "Action"
        title = label + " \u2014 " + entity_name

        if existing_row:
            await db.execute(
                text(
                    "UPDATE schedule_items"
                    " SET title = :title, item_date = :item_date, item_type = :item_type, updated_at = now()"
                    " WHERE id = :sid"
                ),
                {"title": title, "item_date": new_date, "item_type": item_type, "sid": existing_row[0]},
            )
        else:
            await db.execute(
                text(
                    "INSERT INTO schedule_items (title, item_date, item_type, entity_id, entity_name)"
                    " VALUES (:title, :item_date, :item_type, :entity_id, :entity_name)"
                ),
                {
                    "title": title,
                    "item_date": new_date,
                    "item_type": item_type,
                    "entity_id": jurisdiction_id,
                    "entity_name": entity_name,
                },
            )
    else:
        if existing_row:
            await db.execute(
                text("DELETE FROM schedule_items WHERE id = :sid"),
                {"sid": existing_row[0]},
            )
