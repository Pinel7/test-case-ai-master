from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from app.models import (
    RegisterRequest, LoginRequest, AuthResponse, UserInfo,
    UserSettingsRequest, UserSettingsResponse,
)
from app.deps import logger, current_user

router = APIRouter(tags=["auth"])


@router.post("/api/auth/register", response_model=AuthResponse)
async def register(request: RegisterRequest, response: JSONResponse):
    from app.services.auth import register_user, create_session

    try:
        user = register_user(request.username, request.password)
        token = create_session(user["id"])
        return AuthResponse(token=token, user=user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error_code": "auth_error", "message": str(e)})


@router.post("/api/auth/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    from app.services.auth import authenticate_user, create_session

    user = authenticate_user(request.username, request.password)
    if not user:
        raise HTTPException(status_code=401, detail={"error_code": "auth_error", "message": "用户名或密码错误"})
    token = create_session(user["id"])
    return AuthResponse(token=token, user=user)


@router.get("/api/auth/me", response_model=UserInfo)
async def auth_me(user: dict = Depends(current_user)):
    return UserInfo(**user)


@router.get("/api/user/settings", response_model=UserSettingsResponse)
async def get_user_settings(user: dict = Depends(current_user)):
    from app.services.auth import _get_db

    if user.get("id", 0) <= 0:
        return UserSettingsResponse()
    with _get_db() as db:
        row = db.execute(
            "SELECT theme, model, api_key FROM user_settings WHERE user_id = ?", (user["id"],)
        ).fetchone()
        if row:
            return UserSettingsResponse(
                theme=row["theme"] or "light", model=row["model"] or "", api_key=row["api_key"] or ""
            )
    return UserSettingsResponse()


@router.put("/api/user/settings")
async def save_user_settings(req: UserSettingsRequest, user: dict = Depends(current_user)):
    from app.services.auth import _get_db

    if user.get("id", 0) <= 0:
        raise HTTPException(status_code=401, detail={"error_code": "auth_error", "message": "请先登录"})
    with _get_db() as db:
        db.execute(
            "INSERT INTO user_settings (user_id, theme, model, api_key) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme, model=excluded.model, api_key=excluded.api_key",
            (user["id"], req.theme, req.model, req.api_key),
        )
    return {"message": "保存成功"}


@router.post("/api/auth/logout")
async def logout(request: Request):
    from app.services.auth import delete_session

    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        delete_session(auth[7:])
    return {"message": "已退出"}


@router.post("/api/auth/test-key")
async def test_key(req: dict):
    import httpx

    api_key = req.get("api_key", "")
    if not api_key:
        return {"valid": False, "message": "API Key 为空"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.deepseek.com/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code == 200:
                return {"valid": True, "model": "DeepSeek"}
    except Exception:
        pass
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            )
            if resp.status_code == 200:
                return {"valid": True, "model": "Anthropic"}
    except Exception:
        pass
    if api_key.startswith("sk-"):
        return {"valid": False, "message": "无法连接到 DeepSeek，请检查 Key 是否正确或网络是否可达"}
    if api_key.startswith("sk-ant-"):
        return {"valid": False, "message": "无法连接到 Anthropic，请检查 Key 是否正确"}
    return {"valid": False, "message": "Key 格式似乎不正确（应以 sk- 开头），请检查后重试"}


@router.get("/api/users/search")
async def user_search(q: str = "", user: dict = Depends(current_user)):
    from app.services.auth import search_users

    if not q.strip():
        return {"users": []}
    users = search_users(q.strip(), 10)
    return {"users": [u for u in users if u["id"] != user.get("id")]}
