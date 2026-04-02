"""CES Idaho Reports - API Router"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import date, datetime, timedelta
from typing import Optional

from database import get_db

from zoneinfo import ZoneInfo

_MT = ZoneInfo('America/Boise')


router = APIRouter(tags=["reports"])


@router.get("/reports/filters")
async def get_report_filters(db: AsyncSession = Depends(get_db)):
    """Return available filter options for reports."""
    result = await db.execute(text(
        "SELECT DISTINCT type FROM common.jurisdictions WHERE type IS NOT NULL ORDER BY type"
    ))
    entity_types = [r[0] for r in result.fetchall()]

    result = await db.execute(text(
        "SELECT DISTINCT county_name FROM common.counties ORDER BY county_name"
    ))
    counties = [r[0] for r in result.fetchall()]

    return {
        "entity_types": entity_types,
        "counties": counties,
        "assignees": ["Steve", "Drew", "Both"],
        "report_types": [
            {"id": "schedule", "label": "Schedule Summary"},
            {"id": "pipeline", "label": "Pipeline Status"},
            {"id": "events", "label": "Events Calendar"},
            {"id": "entities", "label": "Entities by County"},
            {"id": "activity", "label": "Activity Log"},
        ],
        "periods": [
            {"id": "7", "label": "Last 7 days"},
            {"id": "30", "label": "Last 30 days"},
            {"id": "90", "label": "Last 90 days"},
            {"id": "365", "label": "This year"},
            {"id": "all", "label": "All time"},
        ],
    }


@router.get("/reports/run")
async def run_report(
    report: str = Query(...),
    assignee: Optional[str] = Query(None),
    period: str = Query("all"),
    entity_type: Optional[str] = Query(None),
    county: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    today = datetime.now(_MT).date()
    since = None
    if period != "all":
        since = today - timedelta(days=int(period))

    if report == "schedule":
        return await _report_schedule(db, today, since, assignee)
    elif report == "pipeline":
        return await _report_pipeline(db, entity_type, county)
    elif report == "events":
        return await _report_events(db, today, since)
    elif report == "entities":
        return await _report_entities(db, entity_type, county)
    elif report == "activity":
        return await _report_activity(db, today, since, assignee)
    return {"error": "Unknown report type"}


async def _report_schedule(db, today, since, assignee):
    where_parts = []
    params = {"today": today}
    if since:
        where_parts.append("si.item_date >= :since")
        params["since"] = since
    if assignee:
        where_parts.append("si.assigned_to = :assignee")
        params["assignee"] = assignee
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    # Stats
    result = await db.execute(text(f"""
        SELECT COUNT(*) as total,
               COUNT(*) FILTER (WHERE si.completed = true) as completed,
               COUNT(*) FILTER (WHERE si.completed = false) as pending,
               COUNT(*) FILTER (WHERE si.completed = false AND si.item_date < :today) as overdue
        FROM schedule_items si {where}
    """), params)
    stats = dict(result.mappings().first())

    # By assignee
    result = await db.execute(text(f"""
        SELECT COALESCE(si.assigned_to, 'Unassigned') as assignee,
               COUNT(*) FILTER (WHERE si.completed = false) as pending,
               COUNT(*) FILTER (WHERE si.completed = true) as completed,
               COUNT(*) as total
        FROM schedule_items si {where}
        GROUP BY si.assigned_to ORDER BY total DESC
    """), params)
    by_assignee = [dict(r) for r in result.mappings().all()]

    # By type
    result = await db.execute(text(f"""
        SELECT si.item_type,
               COUNT(*) FILTER (WHERE si.completed = false) as pending,
               COUNT(*) FILTER (WHERE si.completed = true) as completed,
               COUNT(*) as total
        FROM schedule_items si {where}
        GROUP BY si.item_type ORDER BY total DESC
    """), params)
    by_type = [dict(r) for r in result.mappings().all()]

    # Item list
    result = await db.execute(text(f"""
        SELECT si.id, si.title, si.item_date, si.item_time, si.item_type,
               si.assigned_to, si.completed, si.notes, e.location as event_location
        FROM schedule_items si
        LEFT JOIN events e ON e.id = si.source_event_id
        {where}
        ORDER BY si.item_date DESC, si.item_time
        LIMIT 100
    """), params)
    items = [{**dict(r), "item_date": str(r["item_date"]),
              "item_time": str(r["item_time"]) if r["item_time"] else None}
             for r in result.mappings().all()]

    return {"type": "schedule", "stats": stats, "by_assignee": by_assignee,
            "by_type": by_type, "items": items}


async def _report_pipeline(db, entity_type, county):
    where_parts = []
    params = {}
    if entity_type:
        where_parts.append("j.type = :etype")
        params["etype"] = entity_type
    if county:
        where_parts.append("c.county_name = :county")
        params["county"] = county
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    # By status
    result = await db.execute(text(f"""
        SELECT COALESCE(os.status, 'not_contacted') as status, COUNT(*) as count
        FROM ces.outreach_status os
        JOIN common.jurisdictions j ON j.jurisdiction_id = os.jurisdiction_id
        LEFT JOIN common.counties c ON c.county_id = j.county_id
        {where}
        GROUP BY os.status ORDER BY count DESC
    """), params)
    by_status = [dict(r) for r in result.mappings().all()]

    # By priority
    result = await db.execute(text(f"""
        SELECT COALESCE(os.priority, 'none') as priority, COUNT(*) as count
        FROM ces.outreach_status os
        JOIN common.jurisdictions j ON j.jurisdiction_id = os.jurisdiction_id
        LEFT JOIN common.counties c ON c.county_id = j.county_id
        {where}
        GROUP BY os.priority ORDER BY count DESC
    """), params)
    by_priority = [dict(r) for r in result.mappings().all()]

    # By entity type
    result = await db.execute(text(f"""
        SELECT j.type as entity_type, COUNT(*) as count,
               COUNT(*) FILTER (WHERE os.priority IN ('hot','warm')) as prioritized
        FROM ces.outreach_status os
        JOIN common.jurisdictions j ON j.jurisdiction_id = os.jurisdiction_id
        LEFT JOIN common.counties c ON c.county_id = j.county_id
        {where}
        GROUP BY j.type ORDER BY count DESC
    """), params)
    by_entity_type = [dict(r) for r in result.mappings().all()]

    return {"type": "pipeline", "by_status": by_status, "by_priority": by_priority,
            "by_entity_type": by_entity_type}


async def _report_events(db, today, since):
    params = {"today": today}
    time_filter = ""
    if since:
        time_filter = "AND e.event_date >= :since"
        params["since"] = since

    # By source
    result = await db.execute(text(f"""
        SELECT cs.org_abbrev as source, cs.color, COUNT(e.id) as event_count,
               COUNT(e.id) FILTER (WHERE e.event_date >= :today) as upcoming
        FROM calendar_sources cs
        LEFT JOIN events e ON e.source_id = cs.id {time_filter}
        WHERE cs.active = true
        GROUP BY cs.org_abbrev, cs.color ORDER BY event_count DESC
    """), params)
    by_source = [dict(r) for r in result.mappings().all()]

    # By month
    result = await db.execute(text(f"""
        SELECT TO_CHAR(e.event_date, 'YYYY-MM') as month,
               TO_CHAR(e.event_date, 'Mon YYYY') as label,
               COUNT(*) as count
        FROM events e
        JOIN calendar_sources cs ON cs.id = e.source_id
        WHERE cs.active = true {time_filter}
        GROUP BY month, label ORDER BY month
    """), params)
    by_month = [dict(r) for r in result.mappings().all()]

    # Event list
    result = await db.execute(text(f"""
        SELECT e.title, e.event_date, e.location, cs.org_abbrev, cs.color,
               CASE WHEN si.id IS NOT NULL THEN true ELSE false END as scheduled
        FROM events e
        JOIN calendar_sources cs ON cs.id = e.source_id
        LEFT JOIN schedule_items si ON si.source_event_id = e.id
        WHERE cs.active = true {time_filter}
        ORDER BY e.event_date
    """), params)
    items = [{**dict(r), "event_date": str(r["event_date"])} for r in result.mappings().all()]

    return {"type": "events", "by_source": by_source, "by_month": by_month, "items": items}


async def _report_entities(db, entity_type, county):
    where_parts = []
    params = {}
    if entity_type:
        where_parts.append("j.type = :etype")
        params["etype"] = entity_type
    if county:
        where_parts.append("c.county_name = :county")
        params["county"] = county
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    # By county
    result = await db.execute(text(f"""
        SELECT c.county_name as county, COUNT(*) as total,
               COUNT(*) FILTER (WHERE os.priority = 'hot') as hot,
               COUNT(*) FILTER (WHERE os.priority = 'warm') as warm,
               COUNT(*) FILTER (WHERE os.priority = 'cold') as cold,
               COUNT(*) FILTER (WHERE os.status != 'not_contacted') as contacted
        FROM ces.outreach_status os
        JOIN common.jurisdictions j ON j.jurisdiction_id = os.jurisdiction_id
        JOIN common.counties c ON c.county_id = j.county_id
        {where}
        GROUP BY c.county_name ORDER BY total DESC
    """), params)
    by_county = [dict(r) for r in result.mappings().all()]

    # By entity type
    result = await db.execute(text(f"""
        SELECT j.type as entity_type, COUNT(*) as total,
               COUNT(*) FILTER (WHERE os.priority IN ('hot','warm')) as prioritized,
               COUNT(*) FILTER (WHERE os.status != 'not_contacted') as contacted
        FROM ces.outreach_status os
        JOIN common.jurisdictions j ON j.jurisdiction_id = os.jurisdiction_id
        LEFT JOIN common.counties c ON c.county_id = j.county_id
        {where}
        GROUP BY j.type ORDER BY total DESC
    """), params)
    by_entity_type = [dict(r) for r in result.mappings().all()]

    # Total
    result = await db.execute(text(f"""
        SELECT COUNT(*) FROM ces.outreach_status os
        JOIN common.jurisdictions j ON j.jurisdiction_id = os.jurisdiction_id
        LEFT JOIN common.counties c ON c.county_id = j.county_id
        {where}
    """), params)
    total = result.scalar()

    return {"type": "entities", "by_county": by_county, "by_entity_type": by_entity_type, "total": total}


async def _report_activity(db, today, since, assignee):
    params = {"today": today}
    where_parts = []
    if since:
        where_parts.append("i.interaction_date >= :since")
        params["since"] = since
    if assignee:
        where_parts.append("os.assigned_rm = :assignee")
        params["assignee"] = assignee
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    # By type
    result = await db.execute(text(f"""
        SELECT COALESCE(i.type, 'other') as type, COUNT(*) as count
        FROM ces.interactions i
        LEFT JOIN ces.outreach_status os ON os.jurisdiction_id = i.jurisdiction_id
        {where}
        GROUP BY i.type ORDER BY count DESC
    """), params)
    by_type = [dict(r) for r in result.mappings().all()]

    # Recent items
    result = await db.execute(text(f"""
        SELECT i.interaction_id, i.interaction_date, i.type, i.summary,
               j.name as jurisdiction_name
        FROM ces.interactions i
        LEFT JOIN common.jurisdictions j ON j.jurisdiction_id = i.jurisdiction_id
        LEFT JOIN ces.outreach_status os ON os.jurisdiction_id = i.jurisdiction_id
        {where}
        ORDER BY i.interaction_date DESC LIMIT 50
    """), params)
    items = [{**dict(r), "interaction_date": str(r["interaction_date"]) if r["interaction_date"] else None}
             for r in result.mappings().all()]

    # Schedule completion stats (use schedule data as activity proxy)
    sched_where = []
    sched_params = {"today": today}
    if since:
        sched_where.append("si.item_date >= :since")
        sched_params["since"] = since
    if assignee:
        sched_where.append("si.assigned_to = :assignee")
        sched_params["assignee"] = assignee
    sw = ("WHERE " + " AND ".join(sched_where)) if sched_where else ""

    result = await db.execute(text(f"""
        SELECT COUNT(*) as total,
               COUNT(*) FILTER (WHERE si.completed = true) as completed
        FROM schedule_items si {sw}
    """), sched_params)
    sched = dict(result.mappings().first())

    return {"type": "activity", "by_type": by_type, "items": items,
            "schedule_completed": sched["completed"], "schedule_total": sched["total"]}
