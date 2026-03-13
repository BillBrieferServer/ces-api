from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import date, timedelta

from database import get_db
from models import MorningBrief, InteractionListItem, PipelineCount

router = APIRouter(tags=["brief"])


@router.get("/brief", response_model=MorningBrief)
async def morning_brief(db: AsyncSession = Depends(get_db)):
    today = date.today()

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

    return MorningBrief(
        today=today,
        pending_followups=pending,
        upcoming_actions=actions,
        pipeline_summary=pipeline,
        recent_interactions=recent,
    )
