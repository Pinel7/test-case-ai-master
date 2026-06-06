# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Start dev server (hot-reload on port 8000)
python run.py

# Run all tests
python -m pytest tests/ -v

# Run a single test file
python -m pytest tests/test_database.py -v

# Run a single test class or test method
python -m pytest tests/test_auth.py::TestAuth::test_register -v

# Package desktop app (PyInstaller)
python deploy/build_desktop.py

# Docker build
docker build -f deploy/Dockerfile -t test-case-ai .
```

**Windows Python path**: The msys2 bash `python` may lack uvicorn. Use full path if needed:
```bash
/c/Users/lenovo/AppData/Local/Programs/Python/Python312/python.exe run.py
```

**Git proxy**: This machine has Clash proxy that interferes with git. After closing Clash:
```bash
git config --global --unset http.https://github.com.proxy
git config --global --unset https.https://github.com.proxy
```

## Architecture

**TestForge** — a single-page FastAPI app that generates structured test cases from requirement documents via LLM APIs. Includes an online file editor (TXT/XLSX/DOCX), SQL query tool, bug tracker, buddy system (notifications, contacts, sharing), generation history, and JWT-free token-based auth.

### File structure

```
├── run.py                      # Entry: uvicorn.run("app.main:app")
├── app/
│   ├── main.py                 # App factory, exception handler, startup events, route registration
│   ├── deps.py                 # Shared dependencies (current_user, logger, safe_api_call)
│   ├── models.py               # ~30 Pydantic request/response/enum models
│   ├── routes/
│   │   ├── auth.py             # Register, login, logout, user settings, user search
│   │   ├── generator.py        # Generate test cases, streaming, polish, RTM, script gen
│   │   ├── library.py          # Library CRUD, folders, sharing, search, notifications, contacts
│   │   ├── bugs.py             # Bug CRUD
│   │   ├── history.py          # Generation history save/list/get/delete/restore
│   │   ├── query.py            # SQL query tool
│   │   └── misc.py             # Export xlsx/csv, API proxy, review placeholder
│   ├── services/
│   │   ├── db_base.py          # Shared SQLite connection for library.db (all tables, _init_db)
│   │   ├── generator.py        # LLM orchestration — DeepSeek (OpenAI SDK) + Claude (Anthropic SDK)
│   │   ├── exporter.py         # XLSX (openpyxl) / CSV (UTF-8 BOM) export
│   │   ├── database.py         # Legacy library.db operations; newer code uses services/* directly
│   │   ├── auth.py             # PBKDF2-HMAC-SHA256 hashing, session tokens, user_settings
│   │   ├── sql_runner.py       # Sandboxed test_data.db, SELECT-only + CSV import
│   │   ├── notifications.py    # Share request & friend request notification logic
│   │   ├── contacts.py         # Contact management with invitation-based friend requests
│   │   └── websocket_manager.py# WebSocket ConnectionManager for real-time notification push
│   ├── templates/
│   │   ├── index.html          # Main SPA workspace (2000+ lines, all JS/CSS inlined references)
│   │   ├── core/
│   │   │   └── base.html       # Jinja2 base template (auth overlay, sidebar, shared modals)
│   │   └── tools/
│   │       ├── sql.html        # Standalone SQL query tool page
│   │       └── bugs.html       # Standalone bug tracker page
│   ├── static/
│   │   ├── css/app.css         # Light + dark theme (~1500 lines)
│   │   └── js/
│   │       ├── app.js          # Main workspace app (editable table, undo/redo, export, library save/load)
│   │       ├── editor.js       # Online file editor (CodeMirror/Luckysheet/Quill)
│   │       ├── global-init.js  # Shared initializer for all pages: sidebar, theme, auth UI, modals, contacts
│   │       └── modules/        # Feature modules loaded by page type
│   │           ├── shared.js   # Field definitions, localStorage keys, utility functions
│   │           ├── auth.js     # Auth system: token management, login/register overlay, setup guide
│   │           ├── shortcuts.js# Keyboard shortcuts (Ctrl+Enter, Ctrl+Z/Y, Ctrl+S, etc.)
│   │           ├── rtm.js      # RTM (requirements traceability matrix) generation
│   │           ├── scriptgen.js# Test script generation from test cases
│   │           ├── bugs.js     # Bug tracker UI
│   │           ├── sql.js      # SQL query tool UI
│   │           ├── history.js  # Generation history panel
│   │           ├── apitest.js  # API testing tool
│   │           ├── report.js   # Report generation
│   │           ├── regex.js    # Regex tester tool
│   │           ├── env.js      # Environment config UI
│   │           ├── json-tools.js # JSON formatter/validator
│   │           └── toolkit.js  # Toolkit panel orchestrator
├── tests/
│   ├── conftest.py             # Monkeypatches DB_DIR/AUTH_DB_PATH, init test DBs, helper fixtures
│   ├── test_database.py        # Folders, case sets, sharing, bugs, search
│   ├── test_auth.py            # Register, auth, sessions, user search
│   ├── test_exporter.py        # XLSX/CSV export, BOM, Chinese headers
│   ├── test_api.py             # API integration tests (TestClient): auth routes, error format
│   ├── test_history.py         # Generation history CRUD
│   ├── test_contacts.py        # Contact management (add friend, remove, friend requests)
│   ├── test_notifications.py   # Notification system (share requests, accept/decline)
│   └── test_websocket.py       # WebSocket ConnectionManager unit tests
└── deploy/
    ├── build_desktop.py        # PyInstaller build script
    ├── desktop.spec            # PyInstaller spec for pywebview app
    ├── desktop_main.py         # pywebview desktop entry point
    ├── Dockerfile              # Multi-stage Docker build
    └── render.yaml / railway.json / Procfile  # Cloud deployment configs
```

### Three SQLite databases (~/.TestCaseAI/)

| Database | Init source | Tables |
|----------|------------|--------|
| auth.db | `services/auth.py` | users, sessions, user_settings |
| library.db | `services/db_base.py` | folders, test_case_sets, bugs, shared_set_access, notifications, generation_history, contacts |
| test_data.db | `services/sql_runner.py` | Demo tables (re-seeded on startup) |

All tests monkeypatch `DB_DIR` / `AUTH_DB_PATH` to temp dirs. The sql_runner uses `TEST_DB_DIR`.

### Routes

All routes use `APIRouter` with lazy service imports (inside handler body). Registered in `main.py`.

| Group | Key routes | Service |
|-------|-----------|---------|
| Generate | `POST /api/generate`, `/api/generate/stream` | generator.py |
| Polish | `POST /api/polish` | generator.py |
| RTM | `POST /api/rtm/generate` | generator.py |
| Scripts | `POST /api/generate-script` | generator.py |
| Export | `POST /api/export/xlsx`, `/api/export/csv` | exporter.py |
| Library | `GET/POST /api/library/*`, folders CRUD, sharing, search | database.py |
| Notifications | `GET /api/notifications`, accept/decline | notifications.py |
| Contacts | `GET /api/contacts`, add (friend request), remove | contacts.py |
| Bugs | CRUD `/api/bugs/*` | database.py |
| History | CRUD `/api/history/*`, restore | history.py |
| Auth | register/login/logout/me/test-key/settings | auth.py |
| WebSocket | `WS /ws?token=` — real-time notifications | websocket_manager.py |
| SQL Query | query/schema/import-csv/delete-tables | sql_runner.py |
| Tool pages | `GET /tools/sql`, `/tools/bugs` | — (Jinja2 template) |

### LLM generation flow

1. `generate_test_cases()` routes by model prefix: `deepseek*` → OpenAI SDK, others → Anthropic SDK
2. Both use tool-call functions with dynamic JSON schema (`_build_field_schema`) — only requested fields included
3. Output → `_validate_and_build()` → `TestCase` Pydantic model
4. Fallback: `_extract_json_from_content()` if tool-call fails
5. Retry: up to 2 retries on 429/5xx/timeout; immediate fail on 401

### Key design decisions

- **Lazy imports in routes**: Each handler imports its service inside the function body. Grep `from app.services.` to discover all service calls.
- **db_base.py**: Centralized SQLite connection management for library.db — all services that touch library.db import `_get_conn()` and `_lock` from here. Tables are created in `_init_db()` with migration-friendly `ALTER TABLE` + try/except.
- **Frontend is multi-page**: Main workspace (`index.html`) is a single-page app (~2000+ lines JS inline). Standalone tool pages (`/tools/sql`, `/tools/bugs`) extend `core/base.html` and load feature-specific JS modules. `global-init.js` provides shared logic (sidebar, auth overlay, theme, contacts) across all pages.
- **JS modules**: Feature code lives in `app/static/js/modules/*.js`, loaded via `<script>` tags per page. Shared state (auth token, user) lives on `window`. Module init is manual — each page calls `initXxx()` at the bottom.
- **No build step**: No bundler/transpiler. Bootstrap 5, SheetJS, CodeMirror, Luckysheet, Mammoth.js, Quill.js, docx loaded from CDN.
- **No ORM**: Raw SQLite with thread locks, WAL mode, `busy_timeout=5000`.
- **Auth**: PBKDF2-HMAC-SHA256 hashing, token-based sessions (30-day expiry, SQLite storage). Guest fallback (user_id=0) when no token.
- **Sharing flow**: Send share request → notification → recipient accepts → copy to recipient's library. Friend requests use same notification mechanism with bidirectional contact creation on accept.
- **WebSocket**: Single endpoint `/ws?token=` — validates session token, dispatches real-time notifications (share requests, friend requests) to connected clients via `ConnectionManager`.
- **Desktop build**: PyInstaller + pywebview wraps FastAPI in a native window.
- **CI**: GitHub Actions (`.github/workflows/test.yml`) runs `pytest tests/ -v` on push.
