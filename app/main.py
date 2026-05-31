import logging
import sys
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

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
_TPL_PATH = _APP_DIR / "templates" / "index.html"

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

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return HTMLResponse(content=_TPL_PATH.read_text(encoding="utf-8"))


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

app.include_router(auth_router)
app.include_router(gen_router)
app.include_router(lib_router)
app.include_router(bugs_router)
app.include_router(query_router)
app.include_router(misc_router)
