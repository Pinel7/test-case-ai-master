import asyncio
import logging
import sys
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel

from app.models import (
    GenerationRequest, GenerationResponse,
    PolishRequest, PolishResponse,
    LibrarySaveRequest, LibraryUpdateRequest,
    FolderCreateRequest, FolderRenameRequest, SetMoveRequest,
    RtmRequest, RtmResponse,
    ScriptRequest, ScriptResponse,
    ReviewBatchUpdateRequest,
    QueryRequest, QueryResponse,
    RegisterRequest, LoginRequest, AuthResponse, UserInfo,
    UserSettingsRequest, UserSettingsResponse,
    BugCreateRequest, BugUpdateRequest, BugResponse,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Intelligent Test Case Generator")

# Resolve base dir correctly in both dev and PyInstaller-bundled modes
def _get_app_dir() -> Path:
    if getattr(sys, "frozen", False):
        # PyInstaller 6+ puts data in _internal/; 5.x uses sys._MEIPASS directly
        candidates = [
            Path(sys._MEIPASS) / "app",
            Path(sys.executable).parent / "_internal" / "app",
        ]
        for p in candidates:
            if (p / "templates" / "index.html").exists():
                return p
        return Path(sys._MEIPASS) / "app"
    return Path(__file__).parent

_APP_DIR = _get_app_dir()

_TPL_PATH = _APP_DIR / "templates" / "index.html"

app.mount("/static", StaticFiles(directory=str(_APP_DIR / "static")), name="static")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        if isinstance(exc.detail, dict):
            content = {"detail": exc.detail}
        else:
            content = {"detail": {"error_code": "http_error", "message": exc.detail}}
        return JSONResponse(status_code=exc.status_code, content=content)
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": {"error_code": "internal_error", "message": str(exc)}},
    )


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return HTMLResponse(content=_TPL_PATH.read_text(encoding="utf-8"))


# ---- Auth ----
async def _current_user(request: Request):
    from app.services.auth import get_user_by_token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        user = get_user_by_token(auth[7:])
        if user:
            return user
    return {"id": 0, "username": "guest", "role": "guest"}


@app.post("/api/auth/register", response_model=AuthResponse)
async def register(request: RegisterRequest, response: JSONResponse):
    from app.services.auth import register_user, create_session
    try:
        user = register_user(request.username, request.password)
        token = create_session(user["id"])
        return AuthResponse(token=token, user=user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error_code": "auth_error", "message": str(e)})


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    from app.services.auth import authenticate_user, create_session
    user = authenticate_user(request.username, request.password)
    if not user:
        raise HTTPException(status_code=401, detail={"error_code": "auth_error", "message": "用户名或密码错误"})
    token = create_session(user["id"])
    return AuthResponse(token=token, user=user)


@app.get("/api/auth/me", response_model=UserInfo)
async def auth_me(user: dict = Depends(_current_user)):
    return UserInfo(**user)


@app.get("/api/user/settings", response_model=UserSettingsResponse)
async def get_user_settings(user: dict = Depends(_current_user)):
    from app.services.auth import _get_db
    if user.get("id", 0) <= 0:
        return UserSettingsResponse()
    with _get_db() as db:
        row = db.execute("SELECT theme, model, api_key FROM user_settings WHERE user_id = ?", (user["id"],)).fetchone()
        if row:
            return UserSettingsResponse(theme=row["theme"] or "light", model=row["model"] or "", api_key=row["api_key"] or "")
    return UserSettingsResponse()


@app.put("/api/user/settings")
async def save_user_settings(req: UserSettingsRequest, user: dict = Depends(_current_user)):
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


@app.post("/api/auth/logout")
async def logout(request: Request):
    from app.services.auth import delete_session
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        delete_session(auth[7:])
    return {"message": "已退出"}


@app.post("/api/auth/test-key")
async def test_key(req: dict):
    """Test if an API key is valid by hitting the DeepSeek / Anthropic models endpoint."""
    import httpx
    api_key = req.get("api_key", "")
    if not api_key:
        return {"valid": False, "message": "API Key 为空"}
    # Try DeepSeek first
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
    # Try Anthropic
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
    # If both fail, check format hint
    if api_key.startswith("sk-"):
        return {"valid": False, "message": "无法连接到 DeepSeek，请检查 Key 是否正确或网络是否可达"}
    if api_key.startswith("sk-ant-"):
        return {"valid": False, "message": "无法连接到 Anthropic，请检查 Key 是否正确"}
    return {"valid": False, "message": "Key 格式似乎不正确（应以 sk- 开头），请检查后重试"}


@app.post("/api/generate/stream")
async def generate_stream(request: GenerationRequest):
    from app.services.generator import generate_test_cases
    import json

    async def event_stream():
        yield "data: " + json.dumps({"type": "status", "message": "正在分析需求文档结构..."}) + "\n\n"
        await asyncio.sleep(0.5)
        yield "data: " + json.dumps({"type": "status", "message": "正在提取关键业务场景..."}) + "\n\n"
        try:
            cases, warnings, usage = await generate_test_cases(
                requirement_text=request.requirement_text,
                api_key=request.api_key,
                model=request.model,
                fields=request.fields,
                case_count=request.case_count,
            )
            yield "data: " + json.dumps({
                "type": "complete",
                "test_cases": [c.model_dump() for c in cases],
                "warnings": warnings,
                "usage": usage,
            }, ensure_ascii=False) + "\n\n"
        except ValueError as e:
            yield "data: " + json.dumps({"type": "error", "error_code": "invalid_request", "message": str(e)}) + "\n\n"
        except RuntimeError as e:
            yield "data: " + json.dumps({"type": "error", "error_code": "generation_failed", "message": str(e)}) + "\n\n"
        except Exception as e:
            yield "data: " + json.dumps({"type": "error", "error_code": "internal_error", "message": str(e)}) + "\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/generate", response_model=GenerationResponse)
async def generate(request: GenerationRequest):
    from app.services.generator import generate_test_cases

    try:
        cases, warnings, usage = await generate_test_cases(
            requirement_text=request.requirement_text,
            api_key=request.api_key,
            model=request.model,
            fields=request.fields,
            case_count=request.case_count,
        )
        return GenerationResponse(test_cases=cases, warnings=warnings, usage=usage)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": str(e)})
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail={"error_code": "generation_failed", "message": str(e)})


@app.post("/api/polish", response_model=PolishResponse)
async def polish(request: PolishRequest):
    from app.services.generator import polish_requirement

    try:
        polished, usage = await polish_requirement(
            requirement_text=request.requirement_text,
            model=request.model,
            api_key=request.api_key,
        )
        return PolishResponse(polished_text=polished, usage=usage)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": str(e)})
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail={"error_code": "polish_failed", "message": str(e)})


# ---- RTM (Requirements Traceability Matrix) ----

@app.post("/api/rtm/generate", response_model=RtmResponse)
async def generate_rtm(request: RtmRequest):
    from app.services.generator import generate_rtm as rtm_service

    try:
        items, usage = await rtm_service(
            requirement_text=request.requirement_text,
            test_cases=request.test_cases,
            model=request.model,
            api_key=request.api_key,
        )
        total = len(items)
        covered = sum(1 for i in items if i.get("coverage_status") == "covered")
        partial = sum(1 for i in items if i.get("coverage_status") == "partial")
        uncovered = sum(1 for i in items if i.get("coverage_status") == "uncovered")
        rate = round((covered + partial * 0.5) / total * 100, 1) if total > 0 else 0.0
        return RtmResponse(
            items=items,
            coverage_stats={
                "total_items": total,
                "covered": covered,
                "partial": partial,
                "uncovered": uncovered,
                "coverage_rate": rate,
            },
            usage=usage,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": str(e)})
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail={"error_code": "rtm_failed", "message": str(e)})


# ---- Playwright Script Generation ----

@app.post("/api/generate-script", response_model=ScriptResponse)
async def generate_script(request: ScriptRequest):
    from app.services.generator import generate_scripts

    try:
        scripts, usage = await generate_scripts(
            test_cases=request.test_cases,
            model=request.model,
            api_key=request.api_key,
        )
        return ScriptResponse(scripts=scripts, usage=usage)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": str(e)})
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail={"error_code": "script_generation_failed", "message": str(e)})


# ---- Review batch update ----

@app.post("/api/review/batch-update")
async def review_batch_update(req: ReviewBatchUpdateRequest):
    # This endpoint is a placeholder; actual state is in-memory on the frontend.
    # It validates the request and returns the accepted changes for logging.
    if not req.case_indices:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "No case indices provided"})
    return {
        "message": "Review update accepted",
        "updated_indices": len(req.case_indices),
        "review_status": req.review_status,
        "execution_status": req.execution_status,
    }


# ---- Bug CRUD ----

@app.get("/api/bugs")
async def bug_list(
    status: str = "",
    severity: str = "",
    q: str = "",
    user: dict = Depends(_current_user),
):
    from app.services.database import list_bugs
    try:
        items = list_bugs(user.get("id", 0), status, severity, q)
        return {"bugs": [BugResponse(**b) for b in items]}
    except Exception as e:
        logger.exception("Failed to list bugs")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@app.post("/api/bugs", response_model=BugResponse)
async def bug_create(req: BugCreateRequest, user: dict = Depends(_current_user)):
    from app.services.database import create_bug
    try:
        bid = create_bug(
            title=req.title,
            user_id=user.get("id", 0),
            description=req.description,
            severity=req.severity,
            status=req.status,
            module=req.module,
            steps=req.steps,
            expected_result=req.expected_result,
            actual_result=req.actual_result,
            tags=req.tags,
            related_case_id=req.related_case_id,
        )
        b = get_bug_or_404(bid)
        return BugResponse(**b)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": str(e)})
    except Exception as e:
        logger.exception("Failed to create bug")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


def get_bug_or_404(bug_id: int) -> dict:
    from app.services.database import get_bug
    b = get_bug(bug_id)
    if not b:
        raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Bug not found"})
    return b


@app.put("/api/bugs/{bug_id}", response_model=BugResponse)
async def bug_update(bug_id: int, req: BugUpdateRequest, user: dict = Depends(_current_user)):
    from app.services.database import update_bug
    try:
        updates = req.model_dump(exclude_none=True)
        if not updates:
            b = get_bug_or_404(bug_id)
            return BugResponse(**b)
        ok = update_bug(bug_id, **updates)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Bug not found"})
        b = get_bug_or_404(bug_id)
        return BugResponse(**b)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update bug")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@app.delete("/api/bugs/{bug_id}")
async def bug_delete(bug_id: int, user: dict = Depends(_current_user)):
    from app.services.database import delete_bug
    try:
        ok = delete_bug(bug_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Bug not found"})
        return {"message": "Bug deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to delete bug")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


# ---- Test Case Library (SQLite persistence) ----
# NOTE: specific routes (/folders, /cases/search) MUST come before parameterized /{set_id}

@app.get("/api/library/list")
async def library_list(folder_id: int | None = None, user: dict = Depends(_current_user)):
    from app.services.database import list_sets
    try:
        return {"sets": list_sets(folder_id, user.get("id", 0))}
    except Exception as e:
        logger.exception("Failed to list library sets")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


# ---- Folder endpoints ----

@app.get("/api/library/folders")
async def folder_list():
    from app.services.database import get_folder_tree
    try:
        return {"folders": get_folder_tree()}
    except Exception as e:
        logger.exception("Failed to list folders")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@app.post("/api/library/folders")
async def folder_create(req: FolderCreateRequest):
    from app.services.database import create_folder
    try:
        if not req.name.strip():
            raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Name is required"})
        fid = create_folder(req.name.strip(), req.parent_id)
        return {"id": fid, "message": "Folder created"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to create folder")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@app.put("/api/library/folders/{folder_id}")
async def folder_rename(folder_id: int, req: FolderRenameRequest):
    from app.services.database import rename_folder
    try:
        if not req.name.strip():
            raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Name is required"})
        ok = rename_folder(folder_id, req.name.strip())
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Folder not found"})
        return {"message": "Renamed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to rename folder")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@app.delete("/api/library/folders/{folder_id}")
async def folder_delete(folder_id: int):
    from app.services.database import delete_folder
    try:
        ok = delete_folder(folder_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Folder not found"})
        return {"message": "Deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to delete folder")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


# ---- Cross-set case search ----

@app.get("/api/library/cases/search")
async def library_cases_search(q: str = "", user: dict = Depends(_current_user)):
    from app.services.database import search_library_cases
    try:
        return {"results": search_library_cases(q, user.get("id", 0))}
    except Exception as e:
        logger.exception("Failed to search library cases")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


# ---- Parameterized set routes ----

@app.get("/api/library/{set_id}")
async def library_get(set_id: int, user: dict = Depends(_current_user)):
    from app.services.database import get_set
    try:
        s = get_set(set_id, user.get("id", 0))
        if s is None:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Set not found"})
        return s
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get library set")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@app.post("/api/library/save")
async def library_save(req: LibrarySaveRequest, user: dict = Depends(_current_user)):
    from app.services.database import save_set
    try:
        if not req.name.strip():
            raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Name is required"})
        set_id = save_set(req.name.strip(), req.test_cases, req.requirement_text, req.folder_id, user.get("id", 0))
        return {"id": set_id, "message": "Saved successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to save library set")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@app.put("/api/library/{set_id}")
async def library_update(set_id: int, req: LibraryUpdateRequest, user: dict = Depends(_current_user)):
    from app.services.database import update_set
    try:
        if not req.name.strip():
            raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Name is required"})
        ok = update_set(set_id, req.name.strip(), req.test_cases, req.requirement_text, user.get("id", 0))
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Set not found"})
        return {"message": "Updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update library set")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@app.delete("/api/library/{set_id}")
async def library_delete(set_id: int, user: dict = Depends(_current_user)):
    from app.services.database import delete_set
    try:
        ok = delete_set(set_id, user.get("id", 0))
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Set not found"})
        return {"message": "Deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to delete library set")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@app.put("/api/library/{set_id}/move")
async def library_move(set_id: int, req: SetMoveRequest, user: dict = Depends(_current_user)):
    from app.services.database import move_set_to_folder
    try:
        ok = move_set_to_folder(set_id, req.folder_id, user.get("id", 0))
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Set not found"})
        return {"message": "Moved successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to move library set")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


# ---- Share ----

@app.post("/api/library/{set_id}/share")
async def share_set(set_id: int, req: dict, user: dict = Depends(_current_user)):
    from app.services.database import share_set as db_share
    from app.services.auth import get_user_by_id, search_users
    target_user = None
    target_user_id = req.get("user_id")
    target_username = req.get("username", "").strip()
    if target_user_id:
        target_user = get_user_by_id(target_user_id)
    elif target_username:
        users = search_users(target_username, 1)
        if users:
            target_user = users[0]
    if not target_user or target_user["id"] == user.get("id"):
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "未找到指定用户"})
    try:
        ok = db_share(set_id, user.get("id", 0), target_user["id"])
        if not ok:
            raise HTTPException(status_code=403, detail={"error_code": "forbidden", "message": "你无权共享此集合"})
        return {"message": f"已共享给 {target_user['username']}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to share set")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@app.delete("/api/library/{set_id}/share/{share_user_id}")
async def revoke_share(set_id: int, share_user_id: int, user: dict = Depends(_current_user)):
    from app.services.database import revoke_share as db_revoke
    try:
        ok = db_revoke(set_id, user.get("id", 0), share_user_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "共享记录不存在"})
        return {"message": "已取消共享"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to revoke share")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@app.get("/api/library/{set_id}/shares")
async def list_shares(set_id: int, user: dict = Depends(_current_user)):
    from app.services.database import list_shares as db_list_shares
    try:
        shares = db_list_shares(set_id, user.get("id", 0))
        return {"shares": shares}
    except Exception as e:
        logger.exception("Failed to list shares")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@app.get("/api/users/search")
async def user_search(q: str = "", user: dict = Depends(_current_user)):
    from app.services.auth import search_users
    if not q.strip():
        return {"users": []}
    users = search_users(q.strip(), 10)
    return {"users": [u for u in users if u["id"] != user.get("id")]}


# ---- SQL Query Tool ----

@app.on_event("startup")
async def init_databases():
    from app.services.auth import init_auth_db
    from app.services.sql_runner import init_test_db
    try:
        init_auth_db()
        logger.info("Auth database initialized")
    except Exception as e:
        logger.warning("Failed to init auth DB: %s", e)
    try:
        init_test_db()
        logger.info("Test database initialized at ~/.TestCaseAI/test_data.db")
    except Exception as e:
        logger.warning("Failed to init test DB: %s", e)


@app.post("/api/query", response_model=QueryResponse)
async def execute_sql_query(request: QueryRequest):
    from app.services.sql_runner import execute_query as run_query
    import time
    t0 = time.time()
    columns, rows, error = run_query(request.sql)
    elapsed = round((time.time() - t0) * 1000, 1)
    return QueryResponse(
        columns=columns,
        rows=rows,
        row_count=len(rows) if not error else 0,
        error=error,
        execution_time_ms=elapsed,
    )


@app.get("/api/query/schema")
async def get_query_schema():
    from app.services.sql_runner import get_schema
    return {"tables": get_schema()}


class CsvImportRequest(BaseModel):
    table_name: str
    csv_content: str


class ImportResponse(BaseModel):
    success: bool
    message: str


@app.post("/api/query/import-csv", response_model=ImportResponse)
async def import_csv_endpoint(request: CsvImportRequest):
    from app.services.sql_runner import import_csv
    success, msg = import_csv(request.table_name, request.csv_content)
    return ImportResponse(success=success, message=msg)


@app.delete("/api/query/tables/{table_name}")
async def drop_table_endpoint(table_name: str):
    from app.services.sql_runner import drop_table
    success, msg = drop_table(table_name)
    if success:
        return {"success": True, "message": msg}
    from fastapi import HTTPException
    raise HTTPException(status_code=400, detail=msg)


# ---- API Proxy for API Tester tool ----
class ProxyRequest(BaseModel):
    method: str = "GET"
    url: str
    headers: dict[str, str] = {}
    body: str = ""


@app.post("/api/proxy")
async def api_proxy(request: ProxyRequest):
    import httpx
    import json
    method = request.method.upper()
    if method not in ("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"):
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": f"Unsupported method: {method}"})
    if not request.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Invalid URL"})
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            hdrs = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length", "transfer-encoding")}
            content = request.body.encode("utf-8") if request.body else None
            if content and "content-type" not in {k.lower() for k in hdrs}:
                hdrs.setdefault("Content-Type", "application/json")
            resp = await client.request(method, request.url, headers=hdrs, content=content)
            resp_body = resp.text
            resp_headers = dict(resp.headers)
            # Limit header size returned to frontend
            for k in list(resp_headers.keys()):
                if k.lower() in ("transfer-encoding", "content-encoding", "content-length"):
                    del resp_headers[k]
            return {
                "status": resp.status_code,
                "status_text": resp.reason_phrase,
                "body": resp_body,
                "headers": resp_headers,
            }
    except httpx.TimeoutException:
        return {"error": "Request timed out after 30 seconds"}
    except httpx.RequestError as e:
        return {"error": f"Request failed: {e}"}


@app.post("/api/export/xlsx")
async def export_xlsx(request: Request):
    from urllib.parse import quote
    data = await request.json()
    test_cases = data.get("test_cases", [])
    filename = data.get("filename", "test_cases")
    if not filename.endswith(".xlsx"):
        filename += ".xlsx"
    from app.services.exporter import export_to_xlsx
    buffer = export_to_xlsx(test_cases)
    safe_filename = quote(filename)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_filename}"},
    )


@app.post("/api/export/csv")
async def export_csv(request: Request):
    from urllib.parse import quote
    data = await request.json()
    test_cases = data.get("test_cases", [])
    filename = data.get("filename", "test_cases")
    if not filename.endswith(".csv"):
        filename += ".csv"
    from app.services.exporter import export_to_csv
    buffer = export_to_csv(test_cases)
    safe_filename = quote(filename)
    return StreamingResponse(
        buffer,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_filename}"},
    )

