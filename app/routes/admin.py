"""Admin API — server stats, user management, activity log, maintenance."""

import time
import tarfile
import io
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse

from app.deps import current_user

router = APIRouter(tags=["admin"])

START_TIME = time.time()


def _require_admin(user: dict):
    """Ensure user is the first registered user."""
    if user.get("id", 0) <= 0:
        raise HTTPException(status_code=401, detail={"error_code": "auth_error", "message": "请先登录"})
    from app.services.auth import _get_db
    with _get_db() as db:
        first = db.execute("SELECT username FROM users ORDER BY id ASC LIMIT 1").fetchone()
    if not first or user.get("username") != first["username"]:
        raise HTTPException(status_code=403, detail={"error_code": "forbidden", "message": "仅管理员可访问"})


def _get_db_dir() -> Path:
    from app.services.auth import AUTH_DB_PATH
    return Path(AUTH_DB_PATH).parent


@router.get("/api/admin/stats")
async def admin_stats(user: dict = Depends(current_user)):
    """Server overview statistics."""
    _require_admin(user)

    uptime_seconds = int(time.time() - START_TIME)
    days, remainder = divmod(uptime_seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, seconds = divmod(remainder, 60)

    from app.services.auth import _get_db
    from app.services.db_base import _get_conn as lib_conn

    db_dir = _get_db_dir()
    sizes = {}
    for name in ("auth.db", "library.db", "test_data.db"):
        p = db_dir / name
        sizes[name] = p.stat().st_size if p.exists() else 0

    counts = {}
    with _get_db() as db:
        counts["users"] = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        counts["sessions"] = db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]

    conn = lib_conn()
    counts["case_sets"] = conn.execute("SELECT COUNT(*) FROM test_case_sets").fetchone()[0]
    counts["bugs"] = conn.execute("SELECT COUNT(*) FROM bugs").fetchone()[0]
    counts["notifications"] = conn.execute("SELECT COUNT(*) FROM notifications").fetchone()[0]
    conn.close()

    return {
        "uptime": f"{days}天 {hours}时 {minutes}分 {seconds}秒",
        "uptime_seconds": uptime_seconds,
        "db_sizes": sizes,
        "counts": counts,
    }


@router.get("/api/admin/users")
async def admin_users(user: dict = Depends(current_user)):
    """List all users with stats."""
    _require_admin(user)
    from app.services.auth import get_all_users_with_stats
    return {"users": get_all_users_with_stats()}


@router.get("/api/admin/logs")
async def admin_logs(user: dict = Depends(current_user)):
    """Recent activity log."""
    _require_admin(user)
    from app.services.auth import get_activity_log
    return {"logs": get_activity_log(100)}


# ---------------------------------------------------------------------------
# Maintenance endpoints (kept from original)
# ---------------------------------------------------------------------------

@router.get("/admin/backup")
async def admin_backup(user: dict = Depends(current_user)):
    """Download full database backup as tar.gz."""
    _require_admin(user)

    db_dir = _get_db_dir()
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name in ("auth.db", "library.db", "test_data.db"):
            p = db_dir / name
            if p.exists():
                tar.add(str(p), arcname=name)
    buf.seek(0)
    date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        buf,
        media_type="application/gzip",
        headers={"Content-Disposition": f"attachment; filename=testcase-ai-backup_{date_str}.tar.gz"},
    )


@router.post("/admin/clear-sessions")
async def clear_sessions(user: dict = Depends(current_user)):
    """Delete expired sessions."""
    from app.services.auth import _get_db
    _require_admin(user)

    with _get_db() as db:
        deleted = db.execute(
            "DELETE FROM sessions WHERE expires_at < datetime('now')"
        ).rowcount
    return {"message": f"已清理 {deleted} 条过期会话"}


# ---------------------------------------------------------------------------
# Prompt Template Management
# ---------------------------------------------------------------------------

from pydantic import BaseModel


class PromptUpdateRequest(BaseModel):
    prompt_text: str
    label: str = ""
    description: str = ""
    model_pattern: str = ""
    is_active: int = 1


@router.get("/api/admin/prompts")
async def admin_list_prompts(user: dict = Depends(current_user)):
    _require_admin(user)
    from app.services.database import list_prompt_templates
    return {"prompts": list_prompt_templates()}


@router.get("/api/admin/prompts/{template_id}")
async def admin_get_prompt(template_id: int, user: dict = Depends(current_user)):
    _require_admin(user)
    from app.services.database import get_prompt_template
    tmpl = get_prompt_template(template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "提示词模板不存在"})
    return {"prompt": tmpl}


@router.put("/api/admin/prompts/{template_id}")
async def admin_update_prompt(template_id: int, body: PromptUpdateRequest, user: dict = Depends(current_user)):
    _require_admin(user)
    from app.services.database import update_prompt_template
    ok = update_prompt_template(
        template_id,
        prompt_text=body.prompt_text,
        label=body.label,
        description=body.description,
        model_pattern=body.model_pattern,
        is_active=body.is_active,
    )
    if not ok:
        raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "提示词模板不存在或更新失败"})
    return {"message": "更新成功"}


@router.post("/api/admin/prompts/{template_id}/reset")
async def admin_reset_prompt(template_id: int, user: dict = Depends(current_user)):
    _require_admin(user)
    from app.services.database import reset_prompt_template
    ok = reset_prompt_template(template_id)
    if not ok:
        raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "提示词模板不存在"})
    return {"message": "已恢复默认"}


# ---------------------------------------------------------------------------
# Specifications Management (module-specific test writing guidelines)
# ---------------------------------------------------------------------------


class SpecCreateRequest(BaseModel):
    name: str
    module_keywords: str = ""
    content: str = ""


class SpecUpdateRequest(BaseModel):
    name: str
    module_keywords: str = ""
    content: str = ""
    is_active: int = 1


@router.get("/api/admin/specs")
async def admin_list_specs(user: dict = Depends(current_user)):
    _require_admin(user)
    from app.services.database import list_specifications
    return {"specs": list_specifications()}


@router.get("/api/admin/specs/{spec_id}")
async def admin_get_spec(spec_id: int, user: dict = Depends(current_user)):
    _require_admin(user)
    from app.services.database import get_specification
    spec = get_specification(spec_id)
    if not spec:
        raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "规范不存在"})
    return {"spec": spec}


@router.post("/api/admin/specs")
async def admin_create_spec(body: SpecCreateRequest, user: dict = Depends(current_user)):
    _require_admin(user)
    from app.services.database import create_specification
    spec_id = create_specification(body.name, body.module_keywords, body.content)
    return {"id": spec_id, "message": "创建成功"}


@router.put("/api/admin/specs/{spec_id}")
async def admin_update_spec(spec_id: int, body: SpecUpdateRequest, user: dict = Depends(current_user)):
    _require_admin(user)
    from app.services.database import update_specification
    ok = update_specification(spec_id, body.name, body.module_keywords, body.content, body.is_active)
    if not ok:
        raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "规范不存在"})
    return {"message": "更新成功"}


@router.delete("/api/admin/specs/{spec_id}")
async def admin_delete_spec(spec_id: int, user: dict = Depends(current_user)):
    _require_admin(user)
    from app.services.database import delete_specification
    ok = delete_specification(spec_id)
    if not ok:
        raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "规范不存在"})
    return {"message": "已删除"}
