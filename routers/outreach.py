from fastapi import APIRouter, Depends, HTTPException, Request
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

ACTION_LABELS = {
    "visit": "Visit", "call": "Call", "present": "Present",
    "follow_up": "Follow-up", "send_info": "Send info",
}

STATUS_LABELS = {
    "not_contacted": "Not Contacted", "emailed": "Emailed", "contacted": "Contacted",
    "pitched": "Pitched", "presentation_scheduled": "Presentation Scheduled", "presentation_given": "Presentation Given",
    "board_approved": "Board Approved", "active_member": "Active Member",
    "declined": "Declined", "inactive": "Inactive",
}


def _get_user_name(request: Request):
    try:
        from auth import get_session_by_token_hash
        from auth.auth_security import hash_token
        token = request.cookies.get("bb_session")
        if not token:
            return None
        session = get_session_by_token_hash(hash_token(token))
        if not session:
            return None
        name = session.get("name", "")
        return name.split()[0] if name else None
    except Exception:
        return None


@router.put("/{jurisdiction_id}", response_model=OutreachDetail)
async def update_outreach(
    jurisdiction_id: int,
    update: OutreachUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Get current state before update
    result = await db.execute(
        text("SELECT * FROM ces.outreach_status WHERE jurisdiction_id = :jid"),
        {"jid": jurisdiction_id},
    )
    old_row = result.mappings().first()
    if not old_row:
        raise HTTPException(status_code=404, detail="Outreach record not found")
    old = dict(old_row)

    # Build dynamic SET clause from provided fields
    fields = update.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Auto-set first_contact_date when status moves past not_contacted
    if "status" in fields and fields["status"] != "not_contacted":
        if old.get("first_contact_date") is None:
            fields["first_contact_date"] = "CURRENT_DATE_MARKER"

    set_parts = []
    params = {"jid": jurisdiction_id}
    for key, val in fields.items():
        if val == "CURRENT_DATE_MARKER":
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

    # Auto-log changes to interactions as history
    user = _get_user_name(request)
    changes = []
    for key, new_val in fields.items():
        if key == "first_contact_date" and new_val == "CURRENT_DATE_MARKER":
            continue
        old_val = old.get(key)
        # Normalize for comparison
        old_str = str(old_val) if old_val is not None else None
        new_str = str(new_val) if new_val is not None else None
        if old_str != new_str:
            if key == "status":
                old_label = STATUS_LABELS.get(old_val, old_val) if old_val else "none"
                new_label = STATUS_LABELS.get(new_val, new_val) if new_val else "none"
                changes.append(f"Status: {old_label} → {new_label}")
            elif key == "priority":
                changes.append(f"Priority: {old_val or 'none'} → {new_val or 'none'}")
            elif key == "next_action_date":
                action_type = fields.get("next_action_type") or old.get("next_action_type") or ""
                label = ACTION_LABELS.get(action_type, action_type)
                if new_val:
                    changes.append(f"Scheduled {label} for {new_val}")
                else:
                    changes.append(f"Cleared next action")
            elif key == "next_action_type" and "next_action_date" not in fields:
                label = ACTION_LABELS.get(new_val, new_val) if new_val else "none"
                changes.append(f"Action type → {label}")
            elif key == "assigned_rm":
                changes.append(f"Assigned to {new_val}" if new_val else "Unassigned")
            elif key == "notes":
                if new_val and new_val != old_val:
                    changes.append(f"Notes updated")

    if changes:
        summary = "; ".join(changes)
        if user:
            summary = f"[{user}] {summary}"
        await db.execute(text("""
            INSERT INTO ces.interactions (jurisdiction_id, interaction_date, type, summary)
            VALUES (:jid, now(), 'outreach_update', :summary)
        """), {"jid": jurisdiction_id, "summary": summary})

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
