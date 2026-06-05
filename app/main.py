import json
import logging
import sys
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Intelligent Test Case Generator")


def _get_app_dir() -> Path:
    if getattr(sys, "frozen", False):
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
_DIST_DIR = _APP_DIR / "static" / "dist"
_MANIFEST_PATH = _DIST_DIR / "manifest.json"

def get_bundle_url() -> str:
    """Resolve the hashed bundle filename from Vite's manifest.json."""
    if _MANIFEST_PATH.exists():
        try:
            with open(_MANIFEST_PATH) as f:
                manifest = json.load(f)
            for value in manifest.values():
                if value.get("isEntry"):
                    return "/static/dist/" + value["file"]
        except Exception:
            pass
    # Fallback: glob for main-*.js
    try:
        files = sorted(_DIST_DIR.glob("main-*.js"))
        if files:
            return "/static/dist/" + files[-1].name
    except Exception:
        pass
    return "/static/dist/main.js"

templates = Jinja2Templates(directory=str(_APP_DIR / "templates"))
templates.env.globals["get_bundle_url"] = get_bundle_url

app.mount("/static", StaticFiles(directory=str(_APP_DIR / "static")), name="static")


# ---------------------------------------------------------------------------
# Exception handler
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Root page
# ---------------------------------------------------------------------------

@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html", {"request": request})


# ---------------------------------------------------------------------------
# Tool pages (standalone)
# ---------------------------------------------------------------------------

@app.get("/tools/sql")
async def tool_sql(request: Request):
    return templates.TemplateResponse(request, "tools/sql.html", {"request": request})


@app.get("/tools/bugs")
async def tool_bugs(request: Request):
    return templates.TemplateResponse(request, "tools/bugs.html", {"request": request})


# ---------------------------------------------------------------------------
# WebSocket (real-time notifications)
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    from app.services.auth import get_user_by_token
    from app.services.websocket_manager import manager

    user = get_user_by_token(token)
    if not user:
        await websocket.close(code=4001)
        return
    await manager.connect(websocket, user["id"])
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user["id"])
    except Exception:
        manager.disconnect(websocket, user["id"])


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Route modules
# ---------------------------------------------------------------------------

from app.routes.auth import router as auth_router
from app.routes.generator import router as gen_router
from app.routes.library import router as lib_router
from app.routes.bugs import router as bugs_router
from app.routes.query import router as query_router
from app.routes.misc import router as misc_router
from app.routes.history import router as history_router
from app.routes.admin import router as admin_router
from app.routes.regression import router as regression_router

app.include_router(auth_router)
app.include_router(gen_router)
app.include_router(lib_router)
app.include_router(bugs_router)
app.include_router(query_router)
app.include_router(misc_router)
app.include_router(history_router)
app.include_router(admin_router)
app.include_router(regression_router)
