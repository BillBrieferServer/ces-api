"""CES Idaho Reports - API Router"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import date, timedelta

from database import get_db

router = APIRouter(tags=["reports"])


@router.get("/reports")
async def get_reports(db: AsyncSession = Depends(get_db)):
    today = date.today()

    # Pipeline by status
    result = await db.execute(text("""
        SELECT COALESCE(status, 'not_contacted') as status, COUNT(*) as count
        FROM ces.outreach_status GROUP BY status ORDER BY count DESC
    """))
    pipeline = [dict(r) for r in result.mappings().all()]

    # Pipeline by priority
    result = await db.execute(text("""
        SELECT COALESCE(priority, 'none') as priority, COUNT(*) as count
        FROM ces.outreach_status GROUP BY priority ORDER BY count DESC
    """))
    priorities = [dict(r) for r in result.mappings().all()]

    # Schedule items by assignee
    result = await db.execute(text("""
        SELECT COALESCE(assigned_to, 'Unassigned') as assignee,
               COUNT(*) FILTER (WHERE completed = false) as pending,
               COUNT(*) FILTER (WHERE completed = true) as completed,
               COUNT(*) as total
        FROM schedule_items GROUP BY assigned_to ORDER BY total DESC
    """))
    by_assignee = [dict(r) for r in result.mappings().all()]

    # Schedule items by type
    result = await db.execute(text("""
        SELECT item_type,
               COUNT(*) FILTER (WHERE completed = false) as pending,
               COUNT(*) FILTER (WHERE completed = true) as completed,
               COUNT(*) as total
        FROM schedule_items GROUP BY item_type ORDER BY total DESC
    """))
    by_type = [dict(r) for r in result.mappings().all()]

    # Schedule completion stats
    result = await db.execute(text("""
        SELECT COUNT(*) as total,
               COUNT(*) FILTER (WHERE completed = true) as completed,
               COUNT(*) FILTER (WHERE completed = false) as pending,
               COUNT(*) FILTER (WHERE completed = false AND item_date < :today) as overdue
        FROM schedule_items
    """), {"today": today})
    sched_stats = dict(result.mappings().first())

    # Events by source
    result = await db.execute(text("""
        SELECT cs.org_abbrev as source, cs.color, COUNT(e.id) as event_count,
               COUNT(e.id) FILTER (WHERE e.event_date >= :today) as upcoming
        FROM calendar_sources cs
        LEFT JOIN events e ON e.source_id = cs.id
        WHERE cs.active = true
        GROUP BY cs.org_abbrev, cs.color ORDER BY event_count DESC
    """), {"today": today})
    events_by_source = [dict(r) for r in result.mappings().all()]

    # Events by month
    result = await db.execute(text("""
        SELECT TO_CHAR(event_date, 'YYYY-MM') as month,
               TO_CHAR(event_date, 'Mon YYYY') as label,
               COUNT(*) as count
        FROM events GROUP BY month, label ORDER BY month
    """))
    events_by_month = [dict(r) for r in result.mappings().all()]

    # Outreach by county (top 20 with priority set)
    result = await db.execute(text("""
        SELECT c.county_name as county, COUNT(*) as total,
               COUNT(*) FILTER (WHERE os.priority = 'hot') as hot,
               COUNT(*) FILTER (WHERE os.priority = 'warm') as warm,
               COUNT(*) FILTER (WHERE os.priority = 'cold') as cold
        FROM ces.outreach_status os
        JOIN common.jurisdictions j ON j.jurisdiction_id = os.jurisdiction_id
        JOIN common.counties c ON c.county_id = j.county_id
        GROUP BY c.county_name ORDER BY total DESC LIMIT 20
    """))
    by_county = [dict(r) for r in result.mappings().all()]

    # Interactions by type (last 30 days)
    result = await db.execute(text("""
        SELECT COALESCE(type, 'other') as type, COUNT(*) as count
        FROM ces.interactions
        WHERE interaction_date >= :since
        GROUP BY type ORDER BY count DESC
    """), {"since": today - timedelta(days=30)})
    interactions_by_type = [dict(r) for r in result.mappings().all()]

    # Total entity count
    result = await db.execute(text("SELECT COUNT(*) FROM common.jurisdictions"))
    total_entities = result.scalar()

    return {
        "pipeline": pipeline,
        "priorities": priorities,
        "by_assignee": by_assignee,
        "by_type": by_type,
        "schedule_stats": sched_stats,
        "events_by_source": events_by_source,
        "events_by_month": events_by_month,
        "by_county": by_county,
        "interactions_by_type": interactions_by_type,
        "total_entities": total_entities,
    }
