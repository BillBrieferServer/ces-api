from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
from datetime import date

from database import get_db
from models import (
    NoteCreate, NoteUpdate, NoteListItem, NoteDetail, NoteLinkOut
)

router = APIRouter(prefix='/notes', tags=['notes'])


RM_FIRST_NAMES = {
    'sbrown@ces.org': 'Steve',
    'devans@ces.org': 'Drew',
}


def _first_name(email: str) -> str:
    return RM_FIRST_NAMES.get(email, email.split("@")[0].capitalize())


def _user_email(request: Request) -> str:
    from main import current_user
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail='Not authenticated')
    return user.get('email', '').lower()


async def _resolve_link_names(db: AsyncSession, links: list[dict]) -> list[NoteLinkOut]:
    if not links:
        return []
    by_type: dict[str, list[int]] = {}
    for l in links:
        by_type.setdefault(l['target_type'], []).append(l['target_id'])

    name_map: dict[tuple, str] = {}

    if 'entity' in by_type:
        r = await db.execute(text('SELECT jurisdiction_id, name FROM common.jurisdictions WHERE jurisdiction_id = ANY(:ids)'),
                             {'ids': by_type['entity']})
        for row in r.mappings():
            name_map[('entity', row['jurisdiction_id'])] = row['name']
    if 'official' in by_type:
        r = await db.execute(text('SELECT official_id, name FROM public.officials WHERE official_id = ANY(:ids)'),
                             {'ids': by_type['official']})
        for row in r.mappings():
            name_map[('official', row['official_id'])] = row['name']
    if 'vendor' in by_type:
        r = await db.execute(text('SELECT vendor_id, vendor_name FROM ces.vendors WHERE vendor_id = ANY(:ids)'),
                             {'ids': by_type['vendor']})
        for row in r.mappings():
            name_map[('vendor', row['vendor_id'])] = row['vendor_name']
    if 'event' in by_type:
        r = await db.execute(text('SELECT id, title FROM public.events WHERE id = ANY(:ids)'),
                             {'ids': by_type['event']})
        for row in r.mappings():
            name_map[('event', row['id'])] = row['title']

    return [
        NoteLinkOut(
            target_type=l['target_type'],
            target_id=l['target_id'],
            target_name=name_map.get((l['target_type'], l['target_id'])),
        )
        for l in links
    ]


async def _fetch_links_for_notes(db: AsyncSession, note_ids: list[int]) -> dict[int, list[dict]]:
    if not note_ids:
        return {}
    r = await db.execute(text('SELECT note_id, target_type, target_id FROM ces.note_links WHERE note_id = ANY(:ids)'), {'ids': note_ids})
    out: dict[int, list[dict]] = {nid: [] for nid in note_ids}
    for row in r.mappings():
        out[row['note_id']].append({'target_type': row['target_type'], 'target_id': row['target_id']})
    return out


async def _upsert_followup_schedule(db: AsyncSession, note_id: int, user_email: str,
                                     title: Optional[str], follow_up_date: Optional[date],
                                     links_raw: list[dict]):
    r = await db.execute(text('SELECT id FROM public.schedule_items WHERE note_id = :nid'), {'nid': note_id})
    existing = r.scalar()

    if not follow_up_date:
        if existing:
            await db.execute(text('DELETE FROM public.schedule_items WHERE id = :sid'), {'sid': existing})
        return

    entity_id = next((l['target_id'] for l in links_raw if l['target_type'] == 'entity'), None)
    official_id = next((l['target_id'] for l in links_raw if l['target_type'] == 'official'), None)
    vendor_id = next((l['target_id'] for l in links_raw if l['target_type'] == 'vendor'), None)
    item_title = title or 'Note follow-up'

    if existing:
        await db.execute(text('UPDATE public.schedule_items SET title = :title, item_date = :d, entity_id = :eid, official_id = :oid, vendor_id = :vid, assigned_to = :ae, updated_at = now() WHERE id = :sid'),
                         {'title': item_title, 'd': follow_up_date, 'eid': entity_id, 'oid': official_id,
                          'vid': vendor_id, 'ae': _first_name(user_email), 'sid': existing})
    else:
        await db.execute(text("INSERT INTO public.schedule_items (title, item_date, item_type, entity_id, official_id, vendor_id, assigned_to, note_id) VALUES (:title, :d, 'note_followup', :eid, :oid, :vid, :ae, :nid)"),
                         {'title': item_title, 'd': follow_up_date, 'eid': entity_id, 'oid': official_id,
                          'vid': vendor_id, 'ae': _first_name(user_email), 'nid': note_id})


@router.get('', response_model=list[NoteListItem])
async def list_notes(
    request: Request,
    q: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    follow_ups_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    email = _user_email(request)
    where = ['(n.user_email = :email OR :email = ANY(n.shared_with))']
    params: dict = {'email': email}

    if q:
        where.append("n.tsv @@ websearch_to_tsquery('english', :q)")
        params['q'] = q
    if target_type and target_id:
        where.append('EXISTS (SELECT 1 FROM ces.note_links nl WHERE nl.note_id = n.note_id AND nl.target_type = :tt AND nl.target_id = :ti)')
        params['tt'] = target_type
        params['ti'] = target_id
    if follow_ups_only:
        where.append('n.follow_up_date IS NOT NULL AND n.follow_up_done = false')

    where_clause = 'WHERE ' + ' AND '.join(where)
    sql = 'SELECT n.note_id, n.title, n.body, n.user_email AS owner_email, n.shared_with, n.created_at, n.updated_at, n.follow_up_date, n.follow_up_done FROM ces.notes n ' + where_clause + ' ORDER BY n.updated_at DESC LIMIT 200'
    r = await db.execute(text(sql), params)
    rows = [dict(x) for x in r.mappings().all()]
    note_ids = [row['note_id'] for row in rows]
    links_by_note = await _fetch_links_for_notes(db, note_ids)

    out: list[NoteListItem] = []
    for row in rows:
        body = row['body'] or ''
        snippet = body[:200] + ('...' if len(body) > 200 else '')
        raw_links = links_by_note.get(row['note_id'], [])
        resolved = await _resolve_link_names(db, raw_links)
        out.append(NoteListItem(
            note_id=row['note_id'],
            title=row['title'],
            snippet=snippet,
            owner_email=row['owner_email'],
            shared_with=list(row['shared_with'] or []),
            created_at=row['created_at'],
            updated_at=row['updated_at'],
            follow_up_date=row['follow_up_date'],
            follow_up_done=row['follow_up_done'],
            links=resolved,
        ))
    return out


@router.get('/{note_id}', response_model=NoteDetail)
async def get_note(note_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    email = _user_email(request)
    r = await db.execute(text('SELECT note_id, title, body, user_email AS owner_email, shared_with, created_at, updated_at, follow_up_date, follow_up_done FROM ces.notes WHERE note_id = :nid AND (user_email = :email OR :email = ANY(shared_with))'),
                         {'nid': note_id, 'email': email})
    row = r.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail='Note not found')
    raw_links = (await _fetch_links_for_notes(db, [note_id])).get(note_id, [])
    resolved = await _resolve_link_names(db, raw_links)
    return NoteDetail(
        note_id=row['note_id'],
        title=row['title'],
        body=row['body'] or '',
        owner_email=row['owner_email'],
        shared_with=list(row['shared_with'] or []),
        created_at=row['created_at'],
        updated_at=row['updated_at'],
        follow_up_date=row['follow_up_date'],
        follow_up_done=row['follow_up_done'],
        links=resolved,
    )


@router.post('', response_model=NoteDetail, status_code=201)
async def create_note(data: NoteCreate, request: Request, db: AsyncSession = Depends(get_db)):
    email = _user_email(request)
    r = await db.execute(text('INSERT INTO ces.notes (user_email, title, body, follow_up_date, shared_with) VALUES (:email, :title, :body, :fud, :sw) RETURNING note_id, created_at, updated_at'),
                         {'email': email, 'title': data.title, 'body': data.body or '', 'fud': data.follow_up_date, 'sw': data.shared_with or []})
    row = r.mappings().first()
    note_id = row['note_id']

    links_raw = [{'target_type': l.target_type, 'target_id': l.target_id} for l in data.links]
    for l in links_raw:
        await db.execute(text('INSERT INTO ces.note_links (note_id, target_type, target_id) VALUES (:nid, :tt, :ti) ON CONFLICT DO NOTHING'),
                         {'nid': note_id, 'tt': l['target_type'], 'ti': l['target_id']})

    if data.follow_up_date:
        await _upsert_followup_schedule(db, note_id, email, data.title, data.follow_up_date, links_raw)

    await db.commit()
    return await get_note(note_id, request, db)


@router.put('/{note_id}', response_model=NoteDetail)
async def update_note(note_id: int, data: NoteUpdate, request: Request, db: AsyncSession = Depends(get_db)):
    email = _user_email(request)
    r = await db.execute(text('SELECT title, follow_up_date FROM ces.notes WHERE note_id = :nid AND user_email = :email'),
                         {'nid': note_id, 'email': email})
    existing = r.mappings().first()
    if not existing:
        raise HTTPException(status_code=404, detail='Note not found')

    fields = data.model_dump(exclude_unset=True)
    set_parts = []
    params: dict = {'nid': note_id}
    for f in ('title', 'body', 'follow_up_date', 'follow_up_done', 'shared_with'):
        if f in fields:
            set_parts.append(f + ' = :' + f)
            params[f] = fields[f] if f != 'shared_with' else (fields[f] or [])
    if set_parts:
        set_parts.append('updated_at = now()')
        sql = 'UPDATE ces.notes SET ' + ', '.join(set_parts) + ' WHERE note_id = :nid'
        await db.execute(text(sql), params)

    if 'links' in fields and fields['links'] is not None:
        await db.execute(text('DELETE FROM ces.note_links WHERE note_id = :nid'), {'nid': note_id})
        for l in fields['links']:
            await db.execute(text('INSERT INTO ces.note_links (note_id, target_type, target_id) VALUES (:nid, :tt, :ti) ON CONFLICT DO NOTHING'),
                             {'nid': note_id, 'tt': l['target_type'], 'ti': l['target_id']})

    r = await db.execute(text('SELECT title, follow_up_date FROM ces.notes WHERE note_id = :nid'), {'nid': note_id})
    cur = r.mappings().first()
    r2 = await db.execute(text('SELECT target_type, target_id FROM ces.note_links WHERE note_id = :nid'), {'nid': note_id})
    links_raw = [dict(x) for x in r2.mappings().all()]
    await _upsert_followup_schedule(db, note_id, email, cur['title'], cur['follow_up_date'], links_raw)

    await db.commit()
    return await get_note(note_id, request, db)


@router.post('/{note_id}/append', response_model=NoteDetail)
async def append_to_note(note_id: int, data: dict, request: Request, db: AsyncSession = Depends(get_db)):
    """Append a timestamped entry to a note. Available to owner OR sharees."""
    email = _user_email(request)
    text_in = (data.get('text') or '').strip()
    if not text_in:
        raise HTTPException(status_code=400, detail='Empty text')

    r = await db.execute(text('SELECT note_id, body FROM ces.notes WHERE note_id = :nid AND (user_email = :email OR :email = ANY(shared_with))'),
                         {'nid': note_id, 'email': email})
    row = r.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail='Note not found')

    from datetime import datetime
    stamp = datetime.now().strftime('%b %d, %Y %I:%M %p').lstrip('0').replace(' 0', ' ')
    rm_names = {'sbrown@ces.org': 'Steve', 'devans@ces.org': 'Drew'}
    author = rm_names.get(email, email.split('@')[0])
    nl = chr(10)
    em = chr(8212)
    appended = nl + nl + '---' + nl + '**' + stamp + ' ' + em + ' ' + author + '**' + nl + text_in
    new_body = (row['body'] or '') + appended

    await db.execute(text('UPDATE ces.notes SET body = :b, updated_at = now() WHERE note_id = :nid'),
                     {'b': new_body, 'nid': note_id})
    await db.commit()
    return await get_note(note_id, request, db)

@router.delete('/{note_id}', status_code=204)
async def delete_note(note_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    email = _user_email(request)
    r = await db.execute(text('SELECT note_id FROM ces.notes WHERE note_id = :nid AND user_email = :email'),
                         {'nid': note_id, 'email': email})
    if not r.first():
        raise HTTPException(status_code=404, detail='Note not found')
    await db.execute(text('DELETE FROM public.schedule_items WHERE note_id = :nid'), {'nid': note_id})
    await db.execute(text('DELETE FROM ces.notes WHERE note_id = :nid'), {'nid': note_id})
    await db.commit()
