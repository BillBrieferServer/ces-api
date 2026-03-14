from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import date, timedelta

from database import get_db
from models import MorningBrief, InteractionListItem, PipelineCount

router = APIRouter(tags=["brief"])


@router.get("/brief")
async def morning_brief(db: AsyncSession = Depends(get_db)):
    today = date.today()

    # Schedule: overdue items (before today, not completed)
    result = await db.execute(text("""
        SELECT si.id, si.title, si.item_date, si.item_time, si.item_type,
               si.source_event_id, si.entity_id, si.entity_name, si.notes, si.completed,
               si.assigned_to, e.location as event_location
        FROM public.schedule_items si
        LEFT JOIN events e ON e.id = si.source_event_id
        WHERE si.item_date < :today AND si.completed = false
        ORDER BY si.item_date, si.item_time
    """), {"today": today})
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
               si.assigned_to, e.location as event_location
        FROM public.schedule_items si
        LEFT JOIN events e ON e.id = si.source_event_id
        WHERE si.item_date = :today AND si.completed = false
        ORDER BY si.item_time, si.title
    """), {"today": today})
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
               si.assigned_to, e.location as event_location
        FROM public.schedule_items si
        LEFT JOIN events e ON e.id = si.source_event_id
        WHERE si.item_date > :today AND si.item_date <= :week AND si.completed = false
        ORDER BY si.item_date, si.item_time
    """), {"today": today, "week": today + timedelta(days=7)})
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

    # Pending follow-ups (follow_up_date <= today, not completed)
    result = await db.execute(text("""
        SELECT i.interaction_id, i.jurisdiction_id,
               j.name as jurisdiction_name,
               i.official_id, o.name as official_name,
               i.interaction_date, i.type, i.summary,
               i.follow_up_date, i.follow_up_note, i.completed
        FROM ces.interactions i
        LEFT JOIN common.jurisdictions j ON j.jurisdiction_id = i.jurisdiction_id
        LEFT JOIN public.officials o ON o.official_id = i.official_id
        WHERE i.follow_up_date <= :today AND i.completed = false
        ORDER BY i.follow_up_date
    """), {"today": today})
    pending = [InteractionListItem(**dict(r)) for r in result.mappings().all()]

    # Upcoming board meeting targets (next 30 days)
    result = await db.execute(text("""
        SELECT os.jurisdiction_id, j.name as jurisdiction_name,
               os.next_action_date, os.next_action_type, os.status, os.assigned_rm, os.notes
        FROM ces.outreach_status os
        JOIN common.jurisdictions j ON j.jurisdiction_id = os.jurisdiction_id
        WHERE os.next_action_date BETWEEN :today AND :end
        ORDER BY os.next_action_date
    """), {"today": today, "end": today + timedelta(days=30)})
    actions = [dict(r) for r in result.mappings().all()]

    # Pipeline summary
    result = await db.execute(text("""
        SELECT status, count(*) as count
        FROM ces.outreach_status
        GROUP BY status ORDER BY count DESC
    """))
    pipeline = [PipelineCount(**dict(r)) for r in result.mappings().all()]

    # Recent interactions (last 7 days)
    result = await db.execute(text("""
        SELECT i.interaction_id, i.jurisdiction_id,
               j.name as jurisdiction_name,
               i.official_id, o.name as official_name,
               i.interaction_date, i.type, i.summary,
               i.follow_up_date, i.follow_up_note, i.completed
        FROM ces.interactions i
        LEFT JOIN common.jurisdictions j ON j.jurisdiction_id = i.jurisdiction_id
        LEFT JOIN public.officials o ON o.official_id = i.official_id
        WHERE i.interaction_date >= :since
        ORDER BY i.interaction_date DESC
    """), {"since": today - timedelta(days=7)})
    recent = [InteractionListItem(**dict(r)) for r in result.mappings().all()]

    return {
        "today": str(today),
        "schedule_overdue": schedule_overdue,
        "schedule_today": schedule_today,
        "schedule_upcoming": schedule_upcoming,
        "upcoming_events": upcoming_events,
        "pending_followups": [p.dict() for p in pending],
        "upcoming_actions": actions,
        "pipeline_summary": [p.dict() for p in pipeline],
        "recent_interactions": [r.dict() for r in recent],
    }
