"""CES Admin User Management Routes"""

import json
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import APIRouter, Request, Form
from fastapi.responses import RedirectResponse, JSONResponse

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parent / "data"
ALLOWLIST_PATH = DATA_DIR / "allowlist_emails.txt"
MANUAL_USERS_PATH = DATA_DIR / "manual_users.json"
ADMIN_ALLOWLIST_PATH = DATA_DIR / "admin_emails.txt"


# ── Helpers ──

def _load_allowlist_emails() -> list:
    if not ALLOWLIST_PATH.exists():
        return []
    return [l.strip().lower() for l in ALLOWLIST_PATH.read_text().splitlines() if l.strip() and "@" in l.strip()]

def _save_allowlist_emails(emails: list):
    ALLOWLIST_PATH.write_text("\n".join(sorted(set(emails))) + "\n")

def _load_manual_users() -> dict:
    if not MANUAL_USERS_PATH.exists():
        return {}
    try:
        return json.loads(MANUAL_USERS_PATH.read_text())
    except Exception:
        return {}

def _save_manual_users(users: dict):
    MANUAL_USERS_PATH.write_text(json.dumps(users, indent=2) + "\n")

def _load_admin_allowlist() -> set:
    if not ADMIN_ALLOWLIST_PATH.exists():
        return set()
    out = set()
    for raw in ADMIN_ALLOWLIST_PATH.read_text().splitlines():
        s = (raw or "").strip().lower()
        if s and "@" in s:
            out.add(s)
    return out

def _save_admin_emails(emails: set):
    ADMIN_ALLOWLIST_PATH.write_text("\n".join(sorted(emails)) + "\n")

def _get_users_list(current_email: str) -> list:
    from auth import get_user_by_email
    allowlist = _load_allowlist_emails()
    manual = _load_manual_users()
    admins = _load_admin_allowlist()
    users = []
    for email in sorted(set(allowlist)):
        user_info = manual.get(email, {})
        db_user = get_user_by_email(email)
        users.append({
            "email": email,
            "name": user_info.get("name", db_user.get("name", "") if db_user else ""),
            "registered": db_user is not None,
            "is_admin": email in admins,
            "is_self": email == current_email,
        })
    return users


# ── Auth checks (import from main at runtime to avoid circular imports) ──

def _current_user(request):
    from main import current_user
    return current_user(request)

def _require_admin(request):
    from main import require_admin
    return require_admin(request)

def _require_csrf(request, token):
    from main import _require_csrf
    return _require_csrf(request, token)

def _get_templates():
    from main import templates
    return templates


# ── Routes ──

@router.get("/admin/users")
async def admin_users_page(request: Request):
    redir = _require_admin(request)
    if redir:
        return redir
    user = _current_user(request)
    t = _get_templates()
    return t.TemplateResponse("admin_users.html", {
        "request": request,
        "users": _get_users_list(user["email"]),
        "error": request.query_params.get("error"),
        "success": request.query_params.get("success"),
    })

@router.post("/admin/users/add")
async def admin_users_add(request: Request, email: str = Form(...), name: str = Form(""), is_admin: str = Form(""), csrf_token: str = Form("")):
    redir = _require_admin(request)
    if redir:
        return redir
    if not _require_csrf(request, csrf_token):
        return RedirectResponse(url="/admin/users?error=Invalid+request", status_code=302)
    email = email.strip().lower()
    if not email or "@" not in email:
        return RedirectResponse(url="/admin/users?error=Invalid+email", status_code=302)
    emails = _load_allowlist_emails()
    if email in emails:
        return RedirectResponse(url="/admin/users?error=User+already+authorized", status_code=302)
    emails.append(email)
    _save_allowlist_emails(emails)
    if name.strip():
        manual = _load_manual_users()
        manual[email] = {"name": name.strip()}
        _save_manual_users(manual)
    if is_admin == "1":
        admins = _load_admin_allowlist()
        admins.add(email)
        _save_admin_emails(admins)
    return RedirectResponse(url=f"/admin/users?success={email}+added", status_code=302)

@router.post("/admin/users/remove")
async def admin_users_remove(request: Request, email: str = Form(...), csrf_token: str = Form("")):
    redir = _require_admin(request)
    if redir:
        return redir
    if not _require_csrf(request, csrf_token):
        return RedirectResponse(url="/admin/users?error=Invalid+request", status_code=302)
    email = email.strip().lower()
    me = _current_user(request)
    if email == me.get("email"):
        return RedirectResponse(url="/admin/users?error=Cannot+remove+yourself", status_code=302)
    emails = _load_allowlist_emails()
    emails = [e for e in emails if e != email]
    _save_allowlist_emails(emails)
    manual = _load_manual_users()
    manual.pop(email, None)
    _save_manual_users(manual)
    admins = _load_admin_allowlist()
    admins.discard(email)
    _save_admin_emails(admins)
    return RedirectResponse(url=f"/admin/users?success={email}+removed", status_code=302)

@router.post("/admin/users/promote")
async def admin_users_promote(request: Request, email: str = Form(...), csrf_token: str = Form("")):
    redir = _require_admin(request)
    if redir:
        return redir
    if not _require_csrf(request, csrf_token):
        return RedirectResponse(url="/admin/users?error=Invalid+request", status_code=302)
    email = email.strip().lower()
    admins = _load_admin_allowlist()
    admins.add(email)
    _save_admin_emails(admins)
    return RedirectResponse(url=f"/admin/users?success={email}+promoted+to+admin", status_code=302)

@router.post("/admin/users/demote")
async def admin_users_demote(request: Request, email: str = Form(...), csrf_token: str = Form("")):
    redir = _require_admin(request)
    if redir:
        return redir
    if not _require_csrf(request, csrf_token):
        return RedirectResponse(url="/admin/users?error=Invalid+request", status_code=302)
    email = email.strip().lower()
    me = _current_user(request)
    if email == me.get("email"):
        return RedirectResponse(url="/admin/users?error=Cannot+remove+your+own+admin+access", status_code=302)
    admins = _load_admin_allowlist()
    admins.discard(email)
    _save_admin_emails(admins)
    return RedirectResponse(url=f"/admin/users?success=Admin+removed+from+{email}", status_code=302)

@router.get("/auth/request-access")
async def request_access_page(request: Request):
    t = _get_templates()
    return t.TemplateResponse("auth/request_access.html", {"request": request})

@router.post("/auth/request-access")
async def request_access_submit(request: Request, name: str = Form(""), email: str = Form(""), csrf_token: str = Form("")):
    t = _get_templates()
    if not _require_csrf(request, csrf_token):
        return t.TemplateResponse("auth/request_access.html", {"request": request, "error": "Invalid request. Please try again."})
    name = name.strip()
    email = email.strip().lower()
    if not name or not email or "@" not in email:
        return t.TemplateResponse("auth/request_access.html", {"request": request, "error": "Please enter both your name and a valid email."})
    from auth.auth_email import send_email
    from datetime import datetime
    body = f"""New access request for CES Idaho:

Name:  {name}
Email: {email}
Time:  {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}

To approve, log in to https://ces.quietimpact.ai/admin/users and add this email to the authorized users list."""
    send_email("steve@quietimpact.ai", f"CES Access Request: {name} ({email})", body)
    return t.TemplateResponse("auth/request_access.html", {"request": request, "success": True})
