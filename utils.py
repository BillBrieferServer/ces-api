"""Shared utilities for CES routers."""
from typing import Optional
from fastapi import Request


def get_user_name(request: Request) -> Optional[str]:
    """Extract first name from session cookie for display."""
    token = request.cookies.get("bb_session")
    if not token:
        return None
    try:
        from auth import get_session_by_token_hash, hash_token
        session = get_session_by_token_hash(hash_token(token))
        if not session:
            return None
        full_name = session.get("name", "")
        return full_name.split()[0] if full_name else None
    except Exception:
        return None
