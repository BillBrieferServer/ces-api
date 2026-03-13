"""CES Idaho Events Calendar - API Router"""

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import date, timedelta
from typing import Optional, List

from database import get_db

router = APIRouter(tags=["calendar"])


@router.get("/calendar/events")
async def get_events(
    start: Optional[str] = None,
    end: Optional[str] = None,
    source: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
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
    org_name: str = Query(...),
    org_abbrev: str = Query(...),
    url: str = Query(...),
    color: str = Query("#2563EB"),
    parser_type: str = Query("claude_ai"),
    db: AsyncSession = Depends(get_db),
):
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
async def add_events(events: List[dict] = Body(...), db: AsyncSession = Depends(get_db)):
    added = 0
    for evt in events:
        try:
            await db.execute(
                text("""
                    INSERT INTO events (source_id, title, event_date, end_date, location, description, url, ext_id)
                    VALUES (:source_id, :title, :event_date, :end_date, :location, :description, :url, :ext_id)
                    ON CONFLICT (source_id, ext_id) DO NOTHING
                """),
                {
                    "source_id": evt["source_id"],
                    "title": evt["title"],
                    "event_date": evt["event_date"],
                    "end_date": evt.get("end_date"),
                    "location": evt.get("location"),
                    "description": evt.get("description"),
                    "url": evt.get("url"),
                    "ext_id": evt.get("ext_id", evt.get("url", evt["title"] + "-" + evt["event_date"])),
                },
            )
            added += 1
        except Exception:
            pass
    await db.commit()
    return {"added": added}


@router.get("/calendar/schedule")
async def get_schedule(
    start: Optional[str] = None,
    end: Optional[str] = None,
    item_type: Optional[str] = None,
    include_completed: bool = False,
    include_overdue: bool = True,
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    start_date = date.fromisoformat(start) if start else today
    end_date = date.fromisoformat(end) if end else today + timedelta(days=10)

    conditions = []
    params = {"start_date": start_date, "end_date": end_date, "today": today}

    # Date range: include overdue items (before start_date) if requested
    if include_overdue:
        conditions.append("(item_date <= :end_date)")
    else:
        conditions.append("(item_date BETWEEN :start_date AND :end_date)")

    if not include_completed:
        conditions.append("completed = false")

    if item_type:
        conditions.append("item_type = :item_type")
        params["item_type"] = item_type

    where = " AND ".join(conditions)

    result = await db.execute(
        text(
            "SELECT id, title, item_date, item_time, end_date, item_type,"
            " source_event_id, entity_id, entity_name, notes, completed"
            " FROM schedule_items"
            " WHERE " + where +
            " ORDER BY"
            " CASE WHEN item_date < :today THEN 0 ELSE 1 END,"
            " item_date, item_time"
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
        }
        for r in rows
    ]


@router.post("/calendar/schedule")
async def add_to_schedule(event_id: int = Query(...), db: AsyncSession = Depends(get_db)):
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
            INSERT INTO schedule_items (title, item_date, end_date, item_type, source_event_id, notes)
            VALUES (:title, :item_date, :end_date, 'event', :source_event_id, :notes)
        """),
        {
            "title": evt["title"],
            "item_date": evt["event_date"],
            "end_date": evt["end_date"],
            "source_event_id": evt["id"],
            "notes": evt["location"] or None,
        },
    )
    await db.commit()
    return {"ok": True}


@router.post("/calendar/schedule/custom")
async def create_custom_schedule_item(
    title: str = Query(...),
    item_date: str = Query(...),
    item_type: str = Query("custom"),
    notes: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Create a custom schedule item (not linked to an entity or event)."""
    result = await db.execute(
        text("""
            INSERT INTO schedule_items (title, item_date, item_type, notes)
            VALUES (:title, :item_date, :item_type, :notes)
            RETURNING id
        """),
        {"title": title, "item_date": item_date, "item_type": item_type, "notes": notes},
    )
    await db.commit()
    row = result.first()
    return {"ok": True, "id": row[0]}


@router.patch("/calendar/schedule/{item_id}")
async def update_schedule_item(
    item_id: int,
    completed: Optional[bool] = Query(None),
    title: Optional[str] = Query(None),
    item_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Update a schedule item. When marking complete, clears entity next_action fields."""
    # Check item exists
    result = await db.execute(
        text("SELECT id, entity_id, completed FROM schedule_items WHERE id = :id"),
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
        params["item_date"] = item_date

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

    await db.commit()
    return {"ok": True}


@router.delete("/calendar/schedule/{item_id}")
async def remove_from_schedule(item_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM schedule_items WHERE id = :id"), {"id": item_id})
    await db.commit()
    return {"ok": True}


@router.get("/calendar/stats")
async def calendar_stats(db: AsyncSession = Depends(get_db)):
    today = date.today()
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
