from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional

from database import get_db

router = APIRouter(tags=["geo"])


@router.get("/geo/counties")
async def county_geojson(db: AsyncSession = Depends(get_db)):
    """Return simplified county boundaries as GeoJSON with entity counts and pipeline stats."""
    result = await db.execute(text("""
        SELECT c.county_id, c.county_name,
               ST_AsGeoJSON(ST_SimplifyPreserveTopology(c.geometry, 0.005))::json as geometry,
               count(DISTINCT j.jurisdiction_id) as entity_count,
               count(DISTINCT j.jurisdiction_id) FILTER (WHERE os.status != 'not_contacted') as active_count
        FROM common.counties c
        LEFT JOIN common.jurisdictions j ON j.county_id = c.county_id
        LEFT JOIN ces.outreach_status os ON os.jurisdiction_id = j.jurisdiction_id
        GROUP BY c.county_id, c.county_name, c.geometry
        ORDER BY c.county_name
    """))
    features = []
    for r in result.mappings().all():
        features.append({
            "type": "Feature",
            "properties": {
                "county_id": r["county_id"],
                "name": r["county_name"],
                "entity_count": r["entity_count"],
                "active_count": r["active_count"],
            },
            "geometry": r["geometry"],
        })
    return {"type": "FeatureCollection", "features": features}


@router.get("/geo/county/{county_id}/entities")
async def county_entities(county_id: int, db: AsyncSession = Depends(get_db)):
    """Return all entities in a county grouped by type."""
    result = await db.execute(text("""
        SELECT j.jurisdiction_id, j.name, j.type,
               jp.population, jp.employee_count,
               os.status, os.assigned_rm
        FROM common.jurisdictions j
        LEFT JOIN ces.jurisdiction_profile jp ON jp.jurisdiction_id = j.jurisdiction_id
        LEFT JOIN ces.outreach_status os ON os.jurisdiction_id = j.jurisdiction_id
        WHERE j.county_id = :cid
        ORDER BY j.type, jp.population DESC NULLS LAST, j.name
    """), {"cid": county_id})
    entities = [dict(r) for r in result.mappings().all()]

    # Get county name
    result = await db.execute(text(
        "SELECT county_name FROM common.counties WHERE county_id = :cid"
    ), {"cid": county_id})
    row = result.first()
    county_name = row[0] if row else "Unknown"

    return {"county_id": county_id, "county_name": county_name, "entities": entities}


@router.get("/geo/locate")
async def locate(
    lat: float = Query(...),
    lng: float = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Given lat/lng, find which county contains the point and return its entities."""
    result = await db.execute(text("""
        SELECT c.county_id, c.county_name
        FROM common.counties c
        WHERE ST_Contains(c.geometry, ST_SetSRID(ST_Point(:lng, :lat), 4326))
        LIMIT 1
    """), {"lat": lat, "lng": lng})
    row = result.mappings().first()
    if not row:
        return {"county_id": None, "county_name": None, "entities": [], "message": "Location not in Idaho"}

    county_id = row["county_id"]
    county_name = row["county_name"]

    result = await db.execute(text("""
        SELECT j.jurisdiction_id, j.name, j.type,
               jp.population, jp.employee_count,
               os.status, os.assigned_rm
        FROM common.jurisdictions j
        LEFT JOIN ces.jurisdiction_profile jp ON jp.jurisdiction_id = j.jurisdiction_id
        LEFT JOIN ces.outreach_status os ON os.jurisdiction_id = j.jurisdiction_id
        WHERE j.county_id = :cid
        ORDER BY j.type, jp.population DESC NULLS LAST, j.name
    """), {"cid": county_id})
    entities = [dict(r) for r in result.mappings().all()]

    return {"county_id": county_id, "county_name": county_name, "entities": entities}
