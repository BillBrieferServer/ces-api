from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import date, datetime, timedelta
from typing import Optional

from database import get_db
from models import InteractionListItem

from zoneinfo import ZoneInfo

_MT = ZoneInfo('America/Boise')


router = APIRouter(tags=["brief"])


def _get_user_name(request: Request) -> Optional[str]:
    """Get logged-in user first name for brief filtering."""
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


@router.get("/brief")
async def morning_brief(request: Request, db: AsyncSession = Depends(get_db)):
    today = datetime.now(_MT).date()
    user_first = _get_user_name(request)

    # Schedule: overdue items (before today, not completed)
    result = await db.execute(text("""
        SELECT si.id, si.title, si.item_date, si.item_time, si.item_type,
               si.source_event_id, si.entity_id, si.entity_name, si.notes, si.completed,
               si.assigned_to, COALESCE(si.location, e.location) as location,
               si.official_id, o.name as official_name,
               si.vendor_id, v.vendor_name as vendor_name
        FROM public.schedule_items si
        LEFT JOIN events e ON e.id = si.source_event_id
        LEFT JOIN public.officials o ON o.official_id = si.official_id
        LEFT JOIN ces.vendors v ON v.vendor_id = si.vendor_id
        WHERE si.item_date < :today AND si.completed = false
          AND (si.assigned_to IS NULL OR si.assigned_to = 'Both'
               OR (CAST(:user_first AS TEXT) IS NULL OR si.assigned_to = :user_first))
        ORDER BY si.item_date, si.item_time
    """), {"today": today, "user_first": user_first})
    schedule_overdue = [
        {**dict(r), "item_date": str(r["item_date"]),
         "item_time": str(r["item_time"]) if r["item_time"] else None,
         "overdue": True}
        for r in result.mappings().all()
    ]

    # Schedule: today items (not completed)
    result = await db.execute(text("""
        SELECT si.id, si.title, si.item_date, si.item_time, si.item_type,
               si.source_event_id, si.entity_id, si.entity_name, si.notes, si.completed,
               si.assigned_to, COALESCE(si.location, e.location) as location,
               si.official_id, o.name as official_name,
               si.vendor_id, v.vendor_name as vendor_name
        FROM public.schedule_items si
        LEFT JOIN events e ON e.id = si.source_event_id
        LEFT JOIN public.officials o ON o.official_id = si.official_id
        LEFT JOIN ces.vendors v ON v.vendor_id = si.vendor_id
        WHERE si.item_date = :today AND si.completed = false
          AND (si.assigned_to IS NULL OR si.assigned_to = 'Both'
               OR (CAST(:user_first AS TEXT) IS NULL OR si.assigned_to = :user_first))
        ORDER BY si.item_time, si.title
    """), {"today": today, "user_first": user_first})
    schedule_today = [
        {**dict(r), "item_date": str(r["item_date"]),
         "item_time": str(r["item_time"]) if r["item_time"] else None,
         "overdue": False}
        for r in result.mappings().all()
    ]


    # Schedule: upcoming items (next 7 days, excluding today)
    result = await db.execute(text("""
        SELECT si.id, si.title, si.item_date, si.item_time, si.item_type,
               si.source_event_id, si.entity_id, si.entity_name, si.notes, si.completed,
               si.assigned_to, COALESCE(si.location, e.location) as location,
               si.official_id, o.name as official_name,
               si.vendor_id, v.vendor_name as vendor_name
        FROM public.schedule_items si
        LEFT JOIN events e ON e.id = si.source_event_id
        LEFT JOIN public.officials o ON o.official_id = si.official_id
        LEFT JOIN ces.vendors v ON v.vendor_id = si.vendor_id
        WHERE si.item_date > :today AND si.item_date <= :horizon AND si.completed = false
          AND (si.assigned_to IS NULL OR si.assigned_to = 'Both'
               OR (CAST(:user_first AS TEXT) IS NULL OR si.assigned_to = :user_first))
        ORDER BY si.item_date, si.item_time
    """), {"today": today, "horizon": today + timedelta(days=8), "user_first": user_first})
    schedule_upcoming = [
        {**dict(r), "item_date": str(r["item_date"]),
         "item_time": str(r["item_time"]) if r["item_time"] else None,
         "overdue": False}
        for r in result.mappings().all()
    ]

    # Upcoming calendar events (next 7 days)
    result = await db.execute(text("""
        SELECT e.id, e.title, e.event_date, e.location,
               cs.org_abbrev, cs.color,
               CASE WHEN si.id IS NOT NULL THEN true ELSE false END as scheduled
        FROM events e
        JOIN calendar_sources cs ON cs.id = e.source_id
        LEFT JOIN schedule_items si ON si.source_event_id = e.id
        WHERE e.event_date BETWEEN :today AND :week AND cs.active = true
        ORDER BY e.event_date
    """), {"today": today, "week": today + timedelta(days=7)})
    upcoming_events = [
        {"id": r["id"], "title": r["title"], "event_date": str(r["event_date"]),
         "location": r["location"], "org": r["org_abbrev"], "color": r["color"],
         "scheduled": r["scheduled"]}
        for r in result.mappings().all()
    ]


    # Action Items: outreach next actions (30 days) + vendor next actions (30 days)
    result = await db.execute(text("""
        SELECT os.jurisdiction_id, j.name as entity_name,
               os.next_action_date, os.next_action_type, os.status, os.assigned_rm, os.priority, os.notes,
               'entity' as source
        FROM ces.outreach_status os
        JOIN common.jurisdictions j ON j.jurisdiction_id = os.jurisdiction_id
        WHERE os.next_action_date IS NOT NULL
          AND os.next_action_date <= :horizon
          AND (os.assigned_rm IS NULL OR os.assigned_rm = 'Both'
               OR (CAST(:user_first AS TEXT) IS NULL OR os.assigned_rm = :user_first))
        ORDER BY os.next_action_date
    """), {"horizon": today + timedelta(days=30), "user_first": user_first})
    entity_actions = [
        {**dict(r), "next_action_date": str(r["next_action_date"]),
         "overdue": r["next_action_date"] < today}
        for r in result.mappings().all()
    ]

    result = await db.execute(text("""
        SELECT v.vendor_id, v.vendor_name as entity_name,
               v.next_action_date, v.next_action_type, v.pipeline_status as status,
               v.notes, v.contact_name,
               'vendor' as source
        FROM ces.vendors v
        WHERE v.next_action_date IS NOT NULL
          AND v.next_action_date <= :horizon
        ORDER BY v.next_action_date
    """), {"horizon": today + timedelta(days=30)})
    vendor_actions = [
        {**dict(r), "next_action_date": str(r["next_action_date"]),
         "overdue": r["next_action_date"] < today}
        for r in result.mappings().all()
    ]

    action_items = entity_actions + vendor_actions
    action_items.sort(key=lambda x: (not x["overdue"], x["next_action_date"]))

    return {
        "today": str(today),
        "schedule_overdue": schedule_overdue,
        "schedule_today": schedule_today,
        "schedule_upcoming": schedule_upcoming,
        "upcoming_events": upcoming_events,
        "action_items": action_items,
    }
