from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional


# ── Jurisdiction ──

class JurisdictionListItem(BaseModel):
    jurisdiction_id: int
    name: str
    type: str
    county_name: Optional[str] = None
    population: Optional[int] = None
    employee_count: Optional[int] = None
    aic_district: Optional[int] = None
    status: Optional[str] = None
    assigned_rm: Optional[str] = None


class OfficialSummary(BaseModel):
    official_id: int
    name: str
    title: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class InteractionSummary(BaseModel):
    interaction_id: int
    interaction_date: Optional[datetime] = None
    type: Optional[str] = None
    summary: Optional[str] = None
    official_name: Optional[str] = None
    follow_up_date: Optional[date] = None
    completed: bool = False


class VendorSummary(BaseModel):
    vendor_id: int
    vendor_name: Optional[str] = None
    relationship_type: Optional[str] = None
    annual_spend: Optional[float] = None


class ProfileDetail(BaseModel):
    population: Optional[int] = None
    employee_count: Optional[int] = None
    aic_district: Optional[int] = None
    council_meeting_schedule: Optional[str] = None
    office_phone: Optional[str] = None
    office_fax: Optional[str] = None
    office_hours: Optional[str] = None
    mailing_address: Optional[str] = None
    physical_address: Optional[str] = None


class OutreachDetail(BaseModel):
    status: Optional[str] = None
    assigned_rm: Optional[str] = None
    priority: Optional[str] = None
    first_contact_date: Optional[date] = None
    next_action_date: Optional[date] = None
    next_action_type: Optional[str] = None
    board_approval_date: Optional[date] = None
    ces_member_since: Optional[date] = None
    notes: Optional[str] = None


class JurisdictionDetail(BaseModel):
    jurisdiction_id: int
    name: str
    type: str
    county_name: Optional[str] = None
    website_url: Optional[str] = None
    profile: Optional[ProfileDetail] = None
    outreach: Optional[OutreachDetail] = None
    officials: list[OfficialSummary] = []
    interactions: list[InteractionSummary] = []
    vendors: list[VendorSummary] = []


# ── Officials ──

class OfficialListItem(BaseModel):
    official_id: int
    name: str
    title: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    jurisdiction_name: Optional[str] = None
    jurisdiction_type: Optional[str] = None


class OfficialDetail(OfficialListItem):
    fax: Optional[str] = None
    mailing_address: Optional[str] = None
    physical_address: Optional[str] = None
    source: Optional[str] = None
    source_year: Optional[int] = None
    interactions: list[InteractionSummary] = []


# ── Outreach ──

class OutreachUpdate(BaseModel):
    status: Optional[str] = None
    assigned_rm: Optional[str] = None
    priority: Optional[str] = None
    first_contact_date: Optional[date] = None
    next_action_date: Optional[date] = None
    next_action_type: Optional[str] = None
    board_approval_date: Optional[date] = None
    ces_member_since: Optional[date] = None
    notes: Optional[str] = None


# ── Interactions ──

class InteractionCreate(BaseModel):
    jurisdiction_id: int
    official_id: Optional[int] = None
    interaction_date: datetime
    type: str
    summary: str
    follow_up_date: Optional[date] = None
    follow_up_note: Optional[str] = None


class InteractionListItem(BaseModel):
    interaction_id: int
    jurisdiction_id: int
    jurisdiction_name: Optional[str] = None
    official_id: Optional[int] = None
    official_name: Optional[str] = None
    interaction_date: Optional[datetime] = None
    type: Optional[str] = None
    summary: Optional[str] = None
    follow_up_date: Optional[date] = None
    follow_up_note: Optional[str] = None
    completed: bool = False


# ── Vendors ──

class VendorCreate(BaseModel):
    vendor_name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    bluebook_status: Optional[str] = "not_listed"
    ces_contract_category: Optional[str] = None
    source: Optional[str] = None


class VendorListItem(BaseModel):
    vendor_id: int
    vendor_name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    bluebook_status: Optional[str] = None


class VendorDetail(VendorListItem):
    website: Optional[str] = None
    address: Optional[str] = None
    ces_contract_category: Optional[str] = None
    source: Optional[str] = None
    created_date: Optional[datetime] = None


class VendorJurisdictionCreate(BaseModel):
    jurisdiction_id: int
    relationship_type: Optional[str] = "current_vendor"
    annual_spend: Optional[float] = None
    source: Optional[str] = None


# ── Morning Brief ──

class PipelineCount(BaseModel):
    status: str
    count: int


class MorningBrief(BaseModel):
    today: date
    pending_followups: list[InteractionListItem] = []
    upcoming_actions: list[dict] = []
    pipeline_summary: list[PipelineCount] = []
    recent_interactions: list[InteractionListItem] = []


# ── Official Create/Update ──

class OfficialCreate(BaseModel):
    jurisdiction_id: int
    name: str
    title: str
    phone: Optional[str] = None
    email: Optional[str] = None
    mailing_address: Optional[str] = None
    physical_address: Optional[str] = None


class OfficialUpdateRequest(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    mailing_address: Optional[str] = None
    physical_address: Optional[str] = None


class OfficialResponse(BaseModel):
    official_id: int
    jurisdiction_id: Optional[int] = None
    name: str
    title: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    mailing_address: Optional[str] = None
    physical_address: Optional[str] = None
    source: Optional[str] = None
    source_date: Optional[date] = None
