"""CES Idaho Regional Manager API - with authentication"""

import os
import json
import logging
import secrets
from pathlib import Path
from typing import Any, Dict, Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from starlette.middleware.base import BaseHTTPMiddleware

from routers import jurisdictions, officials, outreach, interactions, vendors, brief, search, geo, calendar, reports, admin, notes
from auth import (
    get_user_by_email,
    auth_router, set_templates as set_auth_templates, init_auth_db,
    run_cleanup_jobs as auth_cleanup_jobs,
    get_session_by_token_hash, hash_token, update_session_last_used,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="CES Idaho Regional Manager API", version="1.0.0", docs_url=None, redoc_url=None, openapi_url=None)

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ces.quietimpact.ai"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CSRF Session Middleware ---
class CSRFSessionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        new_csrf = getattr(request.state, "new_csrf_session", None)
        if new_csrf:
            response.set_cookie("csrf_session", new_csrf, max_age=3600, httponly=True, secure=True, samesite="lax")
        elif not request.cookies.get("ces_session") and not request.cookies.get("csrf_session"):
            csrf_session = secrets.token_hex(32)
            response.set_cookie("csrf_session", csrf_session, max_age=3600, httponly=True, secure=True, samesite="lax")
        return response

app.add_middleware(CSRFSessionMiddleware)

# --- Templates ---
TEMPLATES_DIR = Path("/opt/ces-api/templates")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# CSRF-aware template response
_original_template_response = templates.TemplateResponse

def _csrf_template_response(name, context, **kwargs):
    request = context.get("request")
    if request and "csrf_token" not in context:
        context["csrf_token"] = _get_csrf_token(request)
    return _original_template_response(name, context, **kwargs)

templates.TemplateResponse = _csrf_template_response

# --- Auth Router ---
set_auth_templates(templates)
app.include_router(auth_router)

# --- CSRF Protection (deterministic, multi-worker safe) ---
import hmac as _hmac

CSRF_SECRET = os.getenv("CSRF_SECRET")
if not CSRF_SECRET:
    raise RuntimeError("CSRF_SECRET environment variable is required")

def _get_csrf_token(request) -> str:
    session_cookie = request.cookies.get("bb_session", "")
    if not session_cookie:
        session_cookie = request.cookies.get("csrf_session", "")
    if not session_cookie:
        session_cookie = secrets.token_hex(32)
        request.state.new_csrf_session = session_cookie
    return _hmac.new(CSRF_SECRET.encode(), session_cookie.encode(), "sha256").hexdigest()

def _validate_csrf_token(request, token: str) -> bool:
    session_cookie = request.cookies.get("bb_session", "")
    if not session_cookie:
        session_cookie = request.cookies.get("csrf_session", "")
    if not session_cookie:
        session_cookie = getattr(request.state, "new_csrf_session", "")
    if not session_cookie:
        return False
    expected = _hmac.new(CSRF_SECRET.encode(), session_cookie.encode(), "sha256").hexdigest()
    return secrets.compare_digest(expected, token)

def _require_csrf(request, csrf_token: str) -> bool:
    if not csrf_token:
        return False
    return _validate_csrf_token(request, csrf_token)

# --- Admin Allowlist ---
ADMIN_ALLOWLIST_PATH = Path("/opt/ces-api/data/admin_emails.txt")

def _load_admin_allowlist() -> set:
    if not ADMIN_ALLOWLIST_PATH.exists():
        return set()
    out = set()
    for raw in ADMIN_ALLOWLIST_PATH.read_text().splitlines():
        s = (raw or "").strip().lower()
        if s and "@" in s:
            out.add(s)
    return out

# --- Auth Helpers ---
def current_user(request: Request) -> Optional[Dict[str, Any]]:
    """Get current authenticated user from session cookie."""
    token = request.cookies.get("bb_session")
    if not token:
        return None
    token_hash = hash_token(token)
    session = get_session_by_token_hash(token_hash)
    if not session:
        return None
    from datetime import datetime
    expires_at = session.get("expires_at")
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at <= datetime.utcnow():
            return None
    if session.get("account_status") not in (None, "active"):
        return None
    update_session_last_used(token_hash)
    return {
        "email": session.get("email", "").lower(),
        "user_id": session.get("user_id"),
        "name": session.get("name"),
        "auth_type": "password",
    }

def require_login(request: Request) -> Optional[RedirectResponse]:
    if current_user(request):
        return None
    return RedirectResponse(url="/auth/login", status_code=302)

def require_admin(request: Request) -> Optional[RedirectResponse]:
    redir = require_login(request)
    if redir:
        return redir
    user = current_user(request) or {}
    email = user.get("email", "").strip().lower()
    admins = _load_admin_allowlist()
    if email not in admins:
        return RedirectResponse(url="/not-authorized", status_code=302)
    return None


def require_admin_api(request: Request) -> Optional[JSONResponse]:
    """Check admin access for API routes. Returns JSONResponse on failure, None on success."""
    user = current_user(request)
    if not user:
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    email = user.get("email", "").strip().lower()
    admins = _load_admin_allowlist()
    if email not in admins:
        return JSONResponse({"detail": "Admin access required"}, status_code=403)
    return None

# --- API CSRF Middleware ---
class APICsrfMiddleware(BaseHTTPMiddleware):
    """Validate X-CSRF-Token header on mutating API requests."""
    MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    async def dispatch(self, request, call_next):
        path = request.url.path
        if (path.startswith("/api/") and
            request.method in self.MUTATING_METHODS and
            path != "/api/csrf-token"):
            token = request.headers.get("X-CSRF-Token", "")
            if not _validate_csrf_token(request, token):
                return JSONResponse({"detail": "CSRF validation failed"}, status_code=403)
        return await call_next(request)

# --- Auth Middleware for API routes ---
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        # Public paths that don't need auth
        if (path.startswith("/auth/") or
            path.startswith("/static/") or
            path == "/health" or
            path == "/manifest.json" or
            path == "/sw.js" or
            path.startswith("/icons/") or
            path == "/not-authorized"):
            return await call_next(request)
        # Check auth for everything else (API + SPA)
        user = current_user(request)
        if not user:
            # API requests get 401, browser requests get redirect
            if path.startswith("/api/"):
                return JSONResponse({"detail": "Not authenticated"}, status_code=401)
            return RedirectResponse(url="/auth/login", status_code=302)
        return await call_next(request)

app.add_middleware(AuthMiddleware)
app.add_middleware(APICsrfMiddleware)

# --- Init ---
@app.on_event("startup")
def _startup():
    init_auth_db()
    try:
        auth_cleanup_jobs()
    except Exception:
        pass

# --- API Routers ---
app.include_router(jurisdictions.router, prefix="/api")
app.include_router(officials.router, prefix="/api")
app.include_router(outreach.router, prefix="/api")
app.include_router(interactions.router, prefix="/api")
app.include_router(vendors.router, prefix="/api")
app.include_router(brief.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(geo.router, prefix="/api")
app.include_router(calendar.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(admin.router)

# --- Static Files ---
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# --- Health ---
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ces-idaho"}


# --- CSRF Token for API ---
@app.get("/api/me")
def get_me(request: Request):
    user = current_user(request)
    if not user:
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    return {"email": user.get("email", "").lower(), "name": user.get("name")}


@app.get("/api/csrf-token")
def get_csrf_token(request: Request):
    """Return CSRF token for SPA to include in mutation requests."""
    return {"token": _get_csrf_token(request)}

# --- Not Authorized ---
@app.get("/not-authorized")
def not_authorized(request: Request):
    return templates.TemplateResponse("not_authorized.html", {"request": request})

# --- PWA files ---
@app.get("/manifest.json")
async def manifest():
    return FileResponse(os.path.join(STATIC_DIR, "manifest.json"), media_type="application/manifest+json")

@app.get("/sw.js")
async def service_worker():
    return FileResponse(os.path.join(STATIC_DIR, "sw.js"), media_type="application/javascript")

@app.get("/icons/{filename}")
async def icons(filename: str):
    # Prevent path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid filename")
    return FileResponse(os.path.join(STATIC_DIR, "icons", filename))


# --- SPA Fallback ---
@app.get("/")
@app.get("/{path:path}")
async def spa_fallback(request: Request, path: str = ""):
    if path.startswith("api/") or path.startswith("static/") or path.startswith("auth/"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404)
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))
