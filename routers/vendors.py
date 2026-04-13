from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional

from database import get_db
from models import VendorCreate, VendorUpdate, VendorListItem, VendorDetail, VendorJurisdictionCreate, VendorSummary, VendorPipelineUpdate

router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.post("", response_model=VendorDetail, status_code=201)
async def create_vendor(vendor: VendorCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        INSERT INTO ces.vendors
            (vendor_name, contact_name, phone, email, website, address,
             bluebook_status, ces_contract_category, source,
             contact_title, cell_phone, pipeline_status, assigned_rm,
             next_action_date, next_action_type)
        VALUES (:vendor_name, :contact_name, :phone, :email, :website, :address,
                :bluebook_status, :ces_contract_category, :source,
                :contact_title, :cell_phone, :pipeline_status, :assigned_rm,
                :next_action_date, :next_action_type)
        RETURNING vendor_id, created_date
    """), vendor.model_dump())
    await db.commit()
    row = result.mappings().first()

    return VendorDetail(vendor_id=row["vendor_id"], created_date=row["created_date"],
                        **vendor.model_dump())


@router.get("")
async def list_vendors(
    pipeline: Optional[str] = None,
    bluebook_status: Optional[str] = None,
    name: Optional[str] = None,
    pipeline_status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    where = []
    params = {}

    if pipeline == "active":
        where.append("v.pipeline_status IS NOT NULL")
    elif pipeline == "intelligence":
        where.append("v.pipeline_status IS NULL")

    if pipeline_status:
        where.append("v.pipeline_status = :pipeline_status")
        params["pipeline_status"] = pipeline_status
    if bluebook_status:
        where.append("v.bluebook_status = :bluebook_status")
        params["bluebook_status"] = bluebook_status
    if name:
        where.append("v.vendor_name ILIKE :name")
        params["name"] = f"%{name}%"

    where_clause = ("WHERE " + " AND ".join(where)) if where else ""

    # Sort: pipeline view by next_action_date, intelligence by spend
    order = "next_action_date ASC NULLS LAST, vendor_name" if pipeline == "active" else "total_spend DESC, vendor_name"

    result = await db.execute(text(f"""
        SELECT * FROM (
            SELECT v.vendor_id, v.vendor_name, v.contact_name, v.phone, v.email,
                   v.bluebook_status, v.ces_contract_category, v.source,
                   v.contact_title, v.cell_phone,
                   v.pipeline_status, v.assigned_rm,
                   v.next_action_date, v.next_action_type,
                   string_agg(DISTINCT j.name, \', \') as jurisdictions,
                   COALESCE(SUM(vj.annual_spend), 0)::float as total_spend
            FROM ces.vendors v
            LEFT JOIN ces.vendor_jurisdictions vj ON vj.vendor_id = v.vendor_id
            LEFT JOIN common.jurisdictions j ON j.jurisdiction_id = vj.jurisdiction_id
            {where_clause}
            GROUP BY v.vendor_id
        ) sub
        ORDER BY {order}
        LIMIT 500
    """), params)

    return [dict(r) for r in result.mappings().all()]


@router.get("/{vendor_id}")
async def get_vendor(vendor_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT v.vendor_id, v.vendor_name, v.contact_name, v.phone, v.email,
               v.website, v.address, v.contact_title, v.cell_phone, v.bluebook_status, v.ces_contract_category,
               v.source, v.created_date,
               v.pipeline_status, v.assigned_rm,
               v.next_action_date, v.next_action_type,
               string_agg(DISTINCT j.name, ', ') as jurisdictions,
               COALESCE(SUM(vj.annual_spend), 0)::float as total_spend
        FROM ces.vendors v
        LEFT JOIN ces.vendor_jurisdictions vj ON vj.vendor_id = v.vendor_id
        LEFT JOIN common.jurisdictions j ON j.jurisdiction_id = vj.jurisdiction_id
        WHERE v.vendor_id = :vendor_id
        GROUP BY v.vendor_id
    """), {"vendor_id": vendor_id})
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return dict(row)


@router.put("/{vendor_id}")
async def update_vendor(vendor_id: int, update: VendorUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT vendor_id FROM ces.vendors WHERE vendor_id = :id"),
        {"id": vendor_id},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Vendor not found")
    fields = update.model_dump(exclude_unset=True)
    if not fields:
        return {"ok": True}
    set_parts = []
    params = {"id": vendor_id}
    allowed = ["vendor_name", "contact_name", "contact_title", "phone", "cell_phone", "email", "website",
               "address", "bluebook_status", "ces_contract_category", "source",
               "pipeline_status", "assigned_rm", "next_action_date", "next_action_type"]
    for key, val in fields.items():
        if key in allowed:
            set_parts.append(f"{key} = :{key}")
            params[key] = val
    if not set_parts:
        return {"ok": True}
    sql = "UPDATE ces.vendors SET " + ", ".join(set_parts) + " WHERE vendor_id = :id"
    await db.execute(text(sql), params)
    await db.commit()
    return {"ok": True}


@router.patch("/{vendor_id}/pipeline")
async def update_vendor_pipeline(vendor_id: int, data: VendorPipelineUpdate, db: AsyncSession = Depends(get_db)):
    """Add to pipeline or update pipeline status."""
    result = await db.execute(text("SELECT vendor_id FROM ces.vendors WHERE vendor_id = :id"), {"id": vendor_id})
    if not result.first():
        raise HTTPException(status_code=404, detail="Vendor not found")

    fields = data.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_parts = []
    params = {"id": vendor_id}
    for key, val in fields.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = val

    sql = "UPDATE ces.vendors SET " + ", ".join(set_parts) + " WHERE vendor_id = :id"
    await db.execute(text(sql), params)
    await db.commit()
    return {"ok": True}


@router.delete("/{vendor_id}")
async def delete_vendor(vendor_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM ces.vendor_jurisdictions WHERE vendor_id = :id"), {"id": vendor_id})
    result = await db.execute(text("DELETE FROM ces.vendors WHERE vendor_id = :id RETURNING vendor_id"), {"id": vendor_id})
    if not result.first():
        raise HTTPException(status_code=404, detail="Vendor not found")
    await db.commit()
    return {"ok": True}


@router.post("/{vendor_id}/jurisdictions", status_code=201)
async def link_vendor_jurisdiction(
    vendor_id: int,
    link: VendorJurisdictionCreate,
    db: AsyncSession = Depends(get_db),
):
    try:
        await db.execute(text("""
            INSERT INTO ces.vendor_jurisdictions
                (vendor_id, jurisdiction_id, relationship_type, annual_spend, source)
            VALUES (:vendor_id, :jurisdiction_id, :relationship_type, :annual_spend, :source)
        """), {"vendor_id": vendor_id, **link.model_dump()})
        await db.commit()
    except Exception as e:
        await db.rollback()
        import logging
        logging.getLogger(__name__).error(f"Vendor link failed: {e}")
        raise HTTPException(status_code=400, detail="Failed to link vendor to jurisdiction")

    return {"status": "linked", "vendor_id": vendor_id,
            "jurisdiction_id": link.jurisdiction_id}


from models import VendorContactCreate, VendorContactUpdate, VendorContactOut


@router.get("/{vendor_id}/contacts", response_model=list[VendorContactOut])
async def list_vendor_contacts(vendor_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT contact_id, vendor_id, contact_name, contact_title,
               phone, cell_phone, email, is_primary
        FROM ces.vendor_contacts
        WHERE vendor_id = :vendor_id
        ORDER BY is_primary DESC, contact_id
    """), {"vendor_id": vendor_id})
    rows = result.mappings().all()
    if not rows:
        # Auto-migrate from legacy single-contact fields
        v = await db.execute(text("""
            SELECT contact_name, contact_title, phone, cell_phone, email
            FROM ces.vendors WHERE vendor_id = :vendor_id
              AND contact_name IS NOT NULL AND contact_name != ''
        """), {"vendor_id": vendor_id})
        legacy = v.mappings().first()
        if legacy:
            ins = await db.execute(text("""
                INSERT INTO ces.vendor_contacts
                    (vendor_id, contact_name, contact_title, phone, cell_phone, email, is_primary)
                VALUES (:vendor_id, :contact_name, :contact_title, :phone, :cell_phone, :email, true)
                RETURNING contact_id, vendor_id, contact_name, contact_title, phone, cell_phone, email, is_primary
            """), {"vendor_id": vendor_id, **dict(legacy)})
            await db.commit()
            rows = ins.mappings().all()
    return [dict(r) for r in rows]


@router.post("/{vendor_id}/contacts", response_model=VendorContactOut, status_code=201)
async def create_vendor_contact(vendor_id: int, contact: VendorContactCreate, db: AsyncSession = Depends(get_db)):
    # If marked primary, clear other primaries first
    if contact.is_primary:
        await db.execute(text("""
            UPDATE ces.vendor_contacts SET is_primary = false WHERE vendor_id = :vendor_id
        """), {"vendor_id": vendor_id})
    result = await db.execute(text("""
        INSERT INTO ces.vendor_contacts
            (vendor_id, contact_name, contact_title, phone, cell_phone, email, is_primary)
        VALUES (:vendor_id, :contact_name, :contact_title, :phone, :cell_phone, :email, :is_primary)
        RETURNING contact_id, vendor_id, contact_name, contact_title, phone, cell_phone, email, is_primary
    """), {"vendor_id": vendor_id, **contact.model_dump()})
    await db.commit()
    return dict(result.mappings().first())


@router.put("/{vendor_id}/contacts/{contact_id}", response_model=VendorContactOut)
async def update_vendor_contact(vendor_id: int, contact_id: int, update: VendorContactUpdate, db: AsyncSession = Depends(get_db)):
    fields = update.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    # If setting primary, clear others first
    if fields.get("is_primary"):
        await db.execute(text("""
            UPDATE ces.vendor_contacts SET is_primary = false WHERE vendor_id = :vendor_id
        """), {"vendor_id": vendor_id})
    set_parts = [f"{k} = :{k}" for k in fields]
    params = {"contact_id": contact_id, "vendor_id": vendor_id, **fields}
    result = await db.execute(text(f"""
        UPDATE ces.vendor_contacts SET {', '.join(set_parts)}
        WHERE contact_id = :contact_id AND vendor_id = :vendor_id
        RETURNING contact_id, vendor_id, contact_name, contact_title, phone, cell_phone, email, is_primary
    """), params)
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Contact not found")
    await db.commit()
    return dict(row)


@router.delete("/{vendor_id}/contacts/{contact_id}")
async def delete_vendor_contact(vendor_id: int, contact_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        DELETE FROM ces.vendor_contacts
        WHERE contact_id = :contact_id AND vendor_id = :vendor_id
        RETURNING contact_id
    """), {"contact_id": contact_id, "vendor_id": vendor_id})
    if not result.first():
        raise HTTPException(status_code=404, detail="Contact not found")
    await db.commit()
    return {"ok": True}
