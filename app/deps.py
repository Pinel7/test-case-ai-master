import logging
from fastapi import Request

logger = logging.getLogger(__name__)


async def current_user(request: Request):
    from app.services.auth import get_user_by_token

    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        user = get_user_by_token(auth[7:])
        if user:
            return user
    return {"id": 0, "username": "guest", "role": "guest"}
