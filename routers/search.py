from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_db

router = APIRouter(tags=["search"])

STOPWORDS = {"of", "the", "in", "at", "for", "and", "or", "a", "an", "to", "is"}


@router.get("/search")
async def universal_search(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    words = [w for w in q.strip().split() if w.lower() not in STOPWORDS and len(w) > 0]
    if not words:
        words = [q.strip()]

    params = {}
    for i, w in enumerate(words):
        params[f"w{i}"] = f"%{w}%"

    # --- Jurisdictions ---
    j_conditions = " AND ".join(
        f"(j.name ILIKE :w{i} OR c.county_name ILIKE :w{i})"
        for i in range(len(words))
    )
    result = await db.execute(text(f"""
        SELECT j.jurisdiction_id, j.name, j.type,
               c.county_name, jp.population,
               os.status
        FROM common.jurisdictions j
        LEFT JOIN common.counties c ON c.county_id = j.county_id
        LEFT JOIN ces.jurisdiction_profile jp ON jp.jurisdiction_id = j.jurisdiction_id
        LEFT JOIN ces.outreach_status os ON os.jurisdiction_id = j.jurisdiction_id
        WHERE {j_conditions}
        ORDER BY jp.population DESC NULLS LAST
        LIMIT 25
    """), params)
    jurisdictions = [dict(r) for r in result.mappings().all()]

    # --- Officials: search name, title, email, notes, jurisdiction, county ---
    o_conditions = " AND ".join(
        f"(o.name ILIKE :w{i} OR o.title ILIKE :w{i} OR o.email ILIKE :w{i} "
        f"OR COALESCE(o.notes, '') ILIKE :w{i} "
        f"OR j.name ILIKE :w{i} OR c.county_name ILIKE :w{i})"
        for i in range(len(words))
    )
    result = await db.execute(text(f"""
        SELECT o.official_id, o.name, o.title, o.phone, o.email, o.notes,
               j.jurisdiction_id, j.name as jurisdiction_name,
               j.type as jurisdiction_type, c.county_name
        FROM public.officials o
        LEFT JOIN common.jurisdictions j ON j.jurisdiction_id = o.jurisdiction_id
        LEFT JOIN common.counties c ON c.county_id = j.county_id
        WHERE {o_conditions}
        ORDER BY j.name, o.name
        LIMIT 25
    """), params)
    officials = [dict(r) for r in result.mappings().all()]

    # --- Vendors ---
    v_conditions = " AND ".join(
        f"(v.vendor_name ILIKE :w{i} OR v.contact_name ILIKE :w{i} "
        f"OR COALESCE(v.ces_contract_category, '') ILIKE :w{i})"
        for i in range(len(words))
    )
    result = await db.execute(text(f"""
        SELECT v.vendor_id, v.vendor_name, v.contact_name, v.phone, v.email,
               v.bluebook_status, v.ces_contract_category
        FROM ces.vendors v
        WHERE {v_conditions}
        ORDER BY v.vendor_name
        LIMIT 25
    """), params)
    vendors = [dict(r) for r in result.mappings().all()]

    # --- Interactions: search summary, follow_up_note, official name, entity name ---
    i_conditions = " AND ".join(
        f"(COALESCE(i.summary, '') ILIKE :w{i} OR COALESCE(i.follow_up_note, '') ILIKE :w{i} "
        f"OR COALESCE(o.name, '') ILIKE :w{i} OR COALESCE(j.name, '') ILIKE :w{i})"
        for i in range(len(words))
    )
    result = await db.execute(text(f"""
        SELECT i.interaction_id, i.interaction_date, i.type, i.summary, i.follow_up_date,
               i.follow_up_note, i.completed,
               o.name as official_name,
               j.jurisdiction_id, j.name as jurisdiction_name
        FROM ces.interactions i
        LEFT JOIN public.officials o ON o.official_id = i.official_id
        LEFT JOIN common.jurisdictions j ON j.jurisdiction_id = i.jurisdiction_id
        WHERE {i_conditions}
        ORDER BY i.interaction_date DESC
        LIMIT 25
    """), params)
    interactions = [dict(r) for r in result.mappings().all()]

    # --- Schedule items: search title, notes, entity_name ---
    s_conditions = " AND ".join(
        f"(COALESCE(s.title, '') ILIKE :w{i} OR COALESCE(s.notes, '') ILIKE :w{i} "
        f"OR COALESCE(s.entity_name, '') ILIKE :w{i})"
        for i in range(len(words))
    )
    result = await db.execute(text(f"""
        SELECT s.id, s.title, s.item_date, s.item_type, s.entity_name, s.entity_id,
               s.notes, s.completed, s.assigned_to
        FROM public.schedule_items s
        WHERE {s_conditions}
        ORDER BY s.item_date DESC
        LIMIT 25
    """), params)
    schedule = [dict(r) for r in result.mappings().all()]

    # --- Events: search title, description, location ---
    e_conditions = " AND ".join(
        f"(COALESCE(e.title, '') ILIKE :w{i} OR COALESCE(e.description, '') ILIKE :w{i} "
        f"OR COALESCE(e.location, '') ILIKE :w{i})"
        for i in range(len(words))
    )
    result = await db.execute(text(f"""
        SELECT e.id, e.title, e.event_date, e.end_date, e.location, e.description, e.url
        FROM public.events e
        WHERE {e_conditions}
        ORDER BY e.event_date DESC
        LIMIT 25
    """), params)
    events = [dict(r) for r in result.mappings().all()]

    # --- Outreach notes: search notes field on outreach_status ---
    on_conditions = " AND ".join(
        f"(COALESCE(os.notes, '') ILIKE :w{i} OR j.name ILIKE :w{i})"
        for i in range(len(words))
    )
    result = await db.execute(text(f"""
        SELECT j.jurisdiction_id, j.name as jurisdiction_name, j.type,
               os.status, os.notes, os.priority, os.next_action_date, os.next_action_type
        FROM ces.outreach_status os
        JOIN common.jurisdictions j ON j.jurisdiction_id = os.jurisdiction_id
        WHERE os.notes IS NOT NULL AND os.notes != ''
        AND {on_conditions}
        ORDER BY j.name
        LIMIT 25
    """), params)
    outreach_notes = [dict(r) for r in result.mappings().all()]

    return {
        "query": q,
        "jurisdictions": jurisdictions,
        "officials": officials,
        "vendors": vendors,
        "interactions": interactions,
        "schedule": schedule,
        "events": events,
        "outreach_notes": outreach_notes,
    }
