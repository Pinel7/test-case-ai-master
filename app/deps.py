import logging
from fastapi import Request, HTTPException

logger = logging.getLogger(__name__)


async def current_user(request: Request):
    from app.services.auth import get_user_by_token

    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        user = get_user_by_token(auth[7:])
        if user:
            return user
    return {"id": 0, "username": "guest", "role": "guest"}


def safe_api_call(callable_fn, log_msg="API call failed"):
    """Execute a synchronous API call with standard error handling.
    Passes through HTTPException, logs and wraps other exceptions as 500.
    Usage: return safe_api_call(lambda: service_fn(...), "Failed to do X")
    """
    try:
        return callable_fn()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(log_msg)
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})
