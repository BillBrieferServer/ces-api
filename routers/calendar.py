"""CES Idaho Events Calendar - API Router"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Body, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import date, datetime, time, timedelta
from typing import Optional, List, Literal
from pydantic import BaseModel

from database import get_db

from zoneinfo import ZoneInfo

_MT = ZoneInfo('America/Boise')


logger = logging.getLogger(__name__)


class EventCreate(BaseModel):
    source_id: int
    title: str
    event_date: str  # ISO date
    end_date: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    ext_id: Optional[str] = None

router = APIRouter(tags=["calendar"])


@router.get("/calendar/events")
async def get_events(
    start: Optional[str] = None,
    end: Optional[str] = None,
    source: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    today = datetime.now(_MT).date()
    start_date = date.fromisoformat(start) if start else today
    end_date = date.fromisoformat(end) if end else today + timedelta(days=365)

    query = """
        SELECT e.id, e.title, e.event_date, e.end_date, e.location,
               e.description, e.url, e.ext_id,
               cs.org_abbrev, cs.org_name, cs.color,
               CASE WHEN si.id IS NOT NULL THEN true ELSE false END as scheduled
        FROM events e
        JOIN calendar_sources cs ON cs.id = e.source_id
        LEFT JOIN schedule_items si ON si.source_event_id = e.id
        WHERE e.event_date <= :end_date
          AND COALESCE(e.end_date, e.event_date) >= :start_date
          AND cs.active = true
    """
    params = {"start_date": start_date, "end_date": end_date}
    if source:
        query += " AND cs.org_abbrev = :source"
        params["source"] = source
    query += " ORDER BY e.event_date, e.title"

    result = await db.execute(text(query), params)
    rows = result.mappings().all()
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "event_date": str(r["event_date"]),
            "end_date": str(r["end_date"]) if r["end_date"] else None,
            "location": r["location"],
            "description": r["description"],
            "url": r["url"],
            "org": r["org_abbrev"],
            "org_name": r["org_name"],
            "color": r["color"],
            "scheduled": r["scheduled"],
        }
        for r in rows
    ]


@router.get("/calendar/sources")
async def get_sources(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT cs.id, cs.org_name, cs.org_abbrev, cs.url, cs.parser_type,
               cs.color, cs.active, cs.last_scraped,
               COUNT(e.id) as event_count
        FROM calendar_sources cs
        LEFT JOIN events e ON e.source_id = cs.id
        GROUP BY cs.id
        ORDER BY cs.org_name
    """))
    rows = result.mappings().all()
    return [
        {
            "id": r["id"],
            "org_name": r["org_name"],
            "org_abbrev": r["org_abbrev"],
            "url": r["url"],
            "parser_type": r["parser_type"],
            "color": r["color"],
            "active": r["active"],
            "last_scraped": str(r["last_scraped"]) if r["last_scraped"] else None,
            "event_count": r["event_count"],
        }
        for r in rows
    ]


@router.post("/calendar/sources")
async def add_source(
    request: Request,
    org_name: str = Query(...),
    org_abbrev: str = Query(...),
    url: str = Query(...),
    color: str = Query("#2563EB"),
    parser_type: str = Query("claude_ai"),
    db: AsyncSession = Depends(get_db),
):
    # Admin only
    from main import require_admin_api
    denied = require_admin_api(request)
    if denied:
        return denied

    result = await db.execute(
        text("""
            INSERT INTO calendar_sources (org_name, org_abbrev, url, parser_type, color)
            VALUES (:org_name, :org_abbrev, :url, :parser_type, :color)
            RETURNING id
        """),
        {"org_name": org_name, "org_abbrev": org_abbrev, "url": url,
         "parser_type": parser_type, "color": color},
    )
    await db.commit()
    row = result.mappings().first()
    return {"id": row["id"], "org_name": org_name, "org_abbrev": org_abbrev}


@router.post("/calendar/events")
async def add_events(request: Request, events: List[EventCreate] = Body(...), db: AsyncSession = Depends(get_db)):
    # Admin only
    from main import require_admin_api
    denied = require_admin_api(request)
    if denied:
        return denied

    added = 0
    errors = 0
    for evt in events:
        try:
            ext_id = evt.ext_id or evt.url or (evt.title + "-" + evt.event_date)
            await db.execute(
                text("""
                    INSERT INTO events (source_id, title, event_date, end_date, location, description, url, ext_id)
                    VALUES (:source_id, :title, :event_date, :end_date, :location, :description, :url, :ext_id)
                    ON CONFLICT (source_id, ext_id) DO NOTHING
                """),
                {
                    "source_id": evt.source_id,
                    "title": evt.title,
                    "event_date": evt.event_date,
                    "end_date": evt.end_date,
                    "location": evt.location,
                    "description": evt.description,
                    "url": evt.url,
                    "ext_id": ext_id,
                },
            )
            added += 1
        except Exception as e:
            errors += 1
            logger.error(f"Failed to insert event: {e}")
    await db.commit()
    return {"added": added, "errors": errors}


@router.get("/calendar/schedule")
async def get_schedule(
    start: Optional[str] = None,
    end: Optional[str] = None,
    item_type: Optional[str] = None,
    include_completed: bool = False,
    include_overdue: bool = True,
    db: AsyncSession = Depends(get_db),
):
    today = datetime.now(_MT).date()
    start_date = date.fromisoformat(start) if start else today
    end_date = date.fromisoformat(end) if end else today + timedelta(days=10)

    conditions = []
    params = {"start_date": start_date, "end_date": end_date, "today": today}

    # Date range: include overdue items (before start_date) if requested
    if include_overdue:
        conditions.append("(si.item_date <= :end_date)")
    else:
        conditions.append("(si.item_date BETWEEN :start_date AND :end_date)")

    if not include_completed:
        conditions.append("si.completed = false")

    if item_type:
        conditions.append("si.item_type = :item_type")
        params["item_type"] = item_type

    where = " AND ".join(conditions)

    result = await db.execute(
        text(
            "SELECT si.id, si.title, si.item_date, si.item_time, si.end_date, si.item_type,"
            " si.source_event_id, si.entity_id, si.entity_name, si.notes, si.completed,"
            " cs.org_abbrev, cs.color as org_color, COALESCE(si.location, e.location) as item_location, si.assigned_to,"
            " si.official_id, o.name as official_name,"
            " si.vendor_id, v.vendor_name"
            " FROM schedule_items si"
            " LEFT JOIN events e ON e.id = si.source_event_id"
            " LEFT JOIN calendar_sources cs ON cs.id = e.source_id"
            " LEFT JOIN public.officials o ON o.official_id = si.official_id"
            " LEFT JOIN ces.vendors v ON v.vendor_id = si.vendor_id"
            " WHERE " + where +
            " ORDER BY"
            " CASE WHEN si.item_date < :today THEN 0 ELSE 1 END,"
            " si.item_date, si.item_time"
        ),
        params,
    )
    rows = result.mappings().all()
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "item_date": str(r["item_date"]),
            "item_time": str(r["item_time"]) if r["item_time"] else None,
            "end_date": str(r["end_date"]) if r["end_date"] else None,
            "item_type": r["item_type"],
            "source_event_id": r["source_event_id"],
            "entity_id": r["entity_id"],
            "entity_name": r["entity_name"],
            "notes": r["notes"],
            "completed": r["completed"],
            "overdue": r["item_date"] < today and not r["completed"],
            "org_abbrev": r["org_abbrev"],
            "org_color": r["org_color"],
            "location": r["item_location"],
            "assigned_to": r["assigned_to"],
            "official_id": r["official_id"],
            "official_name": r["official_name"],
            "vendor_id": r["vendor_id"],
            "vendor_name": r["vendor_name"],
        }
        for r in rows
    ]



@router.patch("/calendar/events/{event_id}")
async def update_event(
    event_id: int,
    title: Optional[str] = None,
    event_date: Optional[str] = None,
    end_date: Optional[str] = None,
    location: Optional[str] = None,
    description: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Update a calendar event."""
    result = await db.execute(
        text("SELECT id FROM events WHERE id = :id"),
        {"id": event_id},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Event not found")

    set_parts = []
    params = {"id": event_id}

    if title is not None:
        set_parts.append("title = :title")
        params["title"] = title
    if event_date is not None:
        set_parts.append("event_date = :event_date")
        params["event_date"] = date.fromisoformat(event_date)
    if end_date is not None:
        set_parts.append("end_date = :end_date")
        params["end_date"] = date.fromisoformat(end_date) if end_date else None
    if location is not None:
        set_parts.append("location = :location")
        params["location"] = location if location else None
    if description is not None:
        set_parts.append("description = :description")
        params["description"] = description if description else None

    if not set_parts:
        return {"ok": True}

    sql = "UPDATE events SET " + ", ".join(set_parts) + " WHERE id = :id"
    await db.execute(text(sql), params)
    await db.commit()
    return {"ok": True}


@router.post("/calendar/schedule")
async def add_to_schedule(event_id: int = Query(...), assigned_to: Optional[str] = Query(None), location: Optional[str] = Query(None), notes: Optional[str] = Query(None), item_time: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        text("SELECT id FROM schedule_items WHERE source_event_id = :eid"),
        {"eid": event_id},
    )
    if existing.first():
        raise HTTPException(status_code=409, detail="Already on schedule")

    result = await db.execute(
        text("SELECT id, title, event_date, end_date, location FROM events WHERE id = :eid"),
        {"eid": event_id},
    )
    evt = result.mappings().first()
    if not evt:
        raise HTTPException(status_code=404, detail="Event not found")

    await db.execute(
        text("""
            INSERT INTO schedule_items (title, item_date, end_date, item_type, source_event_id, notes, assigned_to, location, item_time)
            VALUES (:title, :item_date, :end_date, 'event', :source_event_id, :notes, :assigned_to, :location, :item_time)
        """),
        {
            "title": evt["title"],
            "item_date": str(evt["event_date"])[:10],
            "end_date": evt["end_date"],
            "source_event_id": evt["id"],
            "notes": notes or None,
            "assigned_to": assigned_to or None,
            "location": location or evt["location"],
            "item_time": time.fromisoformat(item_time) if item_time else None,
        },
    )
    await db.commit()
    return {"ok": True}


@router.post("/calendar/schedule/custom")
async def create_custom_schedule_item(
    title: str = Query(...),
    item_date: str = Query(...),
    item_type: Literal["entity_visit", "follow_up", "presentation", "event", "custom"] = Query("custom"),
    notes: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    item_time: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    official_id: Optional[int] = Query(None),
    vendor_id: Optional[int] = Query(None),
    location: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Create a custom schedule item with optional entity/official/vendor links."""
    # Look up entity name if entity_id provided
    entity_name = None
    if entity_id:
        r = await db.execute(text("SELECT name FROM common.jurisdictions WHERE jurisdiction_id = :id"), {"id": entity_id})
        row = r.first()
        if row:
            entity_name = row[0]

    result = await db.execute(
        text("""
            INSERT INTO schedule_items (title, item_date, item_time, item_type, notes, assigned_to,
                                        entity_id, entity_name, official_id, vendor_id, location)
            VALUES (:title, :item_date, :item_time, :item_type, :notes, :assigned_to,
                    :entity_id, :entity_name, :official_id, :vendor_id, :location)
            RETURNING id
        """),
        {"title": title, "item_date": date.fromisoformat(item_date),
         "item_time": time.fromisoformat(item_time) if item_time else None,
         "item_type": item_type, "notes": notes, "assigned_to": assigned_to or None,
         "entity_id": entity_id, "entity_name": entity_name,
         "official_id": official_id, "vendor_id": vendor_id, "location": location},
    )
    await db.commit()
    row = result.first()
    return {"ok": True, "id": row[0]}


@router.patch("/calendar/schedule/{item_id}")
async def update_schedule_item(
    item_id: int,
    completed: Optional[bool] = None,
    title: Optional[str] = None,
    item_date: Optional[str] = None,
    notes: Optional[str] = None,
    assigned_to: Optional[str] = None,
    item_time: Optional[str] = None,
    official_id: Optional[int] = None,
    vendor_id: Optional[int] = None,
    location: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Update a schedule item. When marking complete, clears entity/vendor next_action fields."""
    # Check item exists
    result = await db.execute(
        text("SELECT id, entity_id, vendor_id, completed FROM schedule_items WHERE id = :id"),
        {"id": item_id},
    )
    item = result.mappings().first()
    if not item:
        raise HTTPException(status_code=404, detail="Schedule item not found")

    set_parts = ["updated_at = now()"]
    params = {"id": item_id}

    if completed is not None:
        set_parts.append("completed = :completed")
        params["completed"] = completed

    if title is not None:
        set_parts.append("title = :title")
        params["title"] = title

    if item_date is not None:
        set_parts.append("item_date = :item_date")
        params["item_date"] = date.fromisoformat(item_date)

    if notes is not None:
        set_parts.append("notes = :notes")
        params["notes"] = notes if notes else None

    if assigned_to is not None:
        set_parts.append("assigned_to = :assigned_to")
        params["assigned_to"] = assigned_to if assigned_to else None

    if item_time is not None:
        set_parts.append("item_time = :item_time")
        params["item_time"] = time.fromisoformat(item_time) if item_time else None

    if official_id is not None:
        set_parts.append("official_id = :official_id")
        params["official_id"] = official_id if official_id else None

    if vendor_id is not None:
        set_parts.append("vendor_id = :vendor_id")
        params["vendor_id"] = vendor_id if vendor_id else None

    if location is not None:
        set_parts.append("location = :location")
        params["location"] = location if location else None

    set_clause = ", ".join(set_parts)
    sql = "UPDATE schedule_items SET " + set_clause + " WHERE id = :id"
    await db.execute(text(sql), params)

    # When marking complete and linked to an entity, clear entity next_action fields
    if completed and item["entity_id"]:
        await db.execute(
            text(
                "UPDATE ces.outreach_status"
                " SET next_action_date = NULL, next_action_type = NULL, updated_date = now()"
                " WHERE jurisdiction_id = :jid"
            ),
            {"jid": item["entity_id"]},
        )

    # When marking complete and linked to a vendor, clear vendor next_action fields
    if completed and item["vendor_id"]:
        await db.execute(
            text(
                "UPDATE ces.vendors"
                " SET next_action_date = NULL, next_action_type = NULL"
                " WHERE vendor_id = :vid"
            ),
            {"vid": item["vendor_id"]},
        )

    await db.commit()
    return {"ok": True}


@router.delete("/calendar/unschedule/{event_id}")
async def unschedule_event(event_id: int, db: AsyncSession = Depends(get_db)):
    """Remove schedule item linked to a calendar event."""
    await db.execute(text("DELETE FROM schedule_items WHERE source_event_id = :eid"), {"eid": event_id})
    await db.commit()
    return {"ok": True}


@router.delete("/calendar/schedule/{item_id}")
async def remove_from_schedule(item_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM schedule_items WHERE id = :id"), {"id": item_id})
    await db.commit()
    return {"ok": True}


@router.get("/calendar/stats")
async def calendar_stats(db: AsyncSession = Depends(get_db)):
    today = datetime.now(_MT).date()
    ten_days = today + timedelta(days=10)

    next10 = await db.execute(
        text(
            "SELECT COUNT(*) FROM events e"
            " JOIN calendar_sources cs ON cs.id = e.source_id"
            " WHERE cs.active = true AND e.event_date BETWEEN :today AND :ten"
        ),
        {"today": today, "ten": ten_days},
    )
    upcoming = await db.execute(
        text(
            "SELECT COUNT(*) FROM events e"
            " JOIN calendar_sources cs ON cs.id = e.source_id"
            " WHERE cs.active = true AND e.event_date >= :today"
        ),
        {"today": today},
    )
    scheduled = await db.execute(
        text("SELECT COUNT(*) FROM schedule_items WHERE completed = false"),
    )
    overdue = await db.execute(
        text("SELECT COUNT(*) FROM schedule_items WHERE completed = false AND item_date < :today"),
        {"today": today},
    )
    sources = await db.execute(
        text("SELECT COUNT(*) FROM calendar_sources WHERE active = true"),
    )

    return {
        "next_10_days": next10.scalar(),
        "total_upcoming": upcoming.scalar(),
        "scheduled": scheduled.scalar(),
        "overdue": overdue.scalar(),
        "sources": sources.scalar(),
    }
