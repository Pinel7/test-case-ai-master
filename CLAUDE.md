# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run dev server (hot-reload on port 8000)
python run.py

# Desktop app build (PyInstaller bundle)
python deploy/build_desktop.py

# Docker build
docker build -f deploy/Dockerfile -t test-case-ai .
```

## Architecture

**智能测试用例生成器** — a single-page FastAPI app that generates structured test cases from requirement documents via LLM APIs, plus an online file editor (TXT/XLSX/DOCX), SQL query tool, bug tracker, and user auth.

### File structure

```
├── run.py                      # Entry: uvicorn.run("app.main:app")
├── app/
│   ├── main.py                 # All FastAPI routes, exception handler, startup events
│   ├── models.py               # All Pydantic models (~30 request/response/enum models)
│   ├── services/
│   │   ├── generator.py        # LLM orchestration — DeepSeek + Anthropic, ~1050 lines
│   │   ├── exporter.py         # XLSX (openpyxl with styling) / CSV (UTF-8 BOM) export
│   │   ├── database.py         # SQLite library.db — folders, test case sets, bugs
│   │   ├── auth.py             # User auth — PBKDF2, session tokens, user_settings
│   │   └── sql_runner.py       # SQL query tool — sandboxed test_data.db, SELECT-only+
│   ├── templates/
│   │   └── index.html          # Single-page HTML — ~8000+ lines, all JS/CSS inlined
│   ├── static/
│   │   ├── css/app.css         # Global styles (light + dark themes)
│   │   └── js/editor.js        # Online file editor (CodeMirror/Luckysheet/Quill)
│   └── __init__.py
└── deploy/
    ├── build_desktop.py        # PyInstaller build script
    ├── desktop.spec            # PyInstaller spec for webview app
    ├── desktop_main.py         # pywebview desktop entry point
    ├── Dockerfile              # Multi-stage Docker build
    └── render.yaml / railway.json / Procfile  # Cloud deployment configs
```

### Route patterns

All routes defined in `app/main.py` using lazy imports (`from app.services.X import Y` inside each handler). Routes fall into these groups:

| Group | Key routes | Backend |
|-------|-----------|---------|
| Generate | `POST /api/generate`, `POST /api/generate/stream` | generator.py — routes to DeepSeek (openai SDK) or Anthropic based on `model` prefix |
| Polish | `POST /api/polish` | generator.py — same dual-SDK routing |
| RTM | `POST /api/rtm/generate` | generator.py — coverage analysis |
| Scripts | `POST /api/generate-script` | generator.py — Playwright Python code gen |
| Export | `POST /api/export/xlsx`, `POST /api/export/csv` | exporter.py |
| Library | `GET /api/library/list`, `POST /api/library/save`, `PUT/DELETE /api/library/{id}`, folder CRUD, cross-set case search | database.py — SQLite at `~/.TestCaseAI/library.db` |
| Bugs | CRUD `/api/bugs/...` | database.py — bugs table in library.db |
| Auth | `POST /api/auth/register|login|logout`, `GET /api/auth/me`, `POST /api/auth/test-key` | auth.py — `~/.TestCaseAI/auth.db` |
| Settings | `GET|PUT /api/user/settings` | auth.py — per-user theme/model/api_key |
| SQL Query | `POST /api/query`, `GET /api/query/schema`, `POST /api/query/import-csv`, `DELETE /api/query/tables/{name}` | sql_runner.py — `~/.TestCaseAI/test_data.db` (demo data seeded on startup) |
| API Proxy | `POST /api/proxy` | httpx passthrough (for the "API Tester" tool in frontend) |
| Review | `POST /api/review/batch-update` | Placeholder — state is frontend-only |

### LLM generation flow (generator.py)

1. `generate_test_cases()` uses model prefix to route: `deepseek*` → OpenAI SDK (`_generate_with_deepseek`), anything else → Anthropic SDK (`_generate_with_anthropic`)
2. Both paths use tool-call functions (`create_test_cases`) with dynamic JSON schema (`_build_field_schema`) — only requested fields are included in schema (core fields always required)
3. Tool call output → `_validate_and_build()` → `TestCase` Pydantic model
4. Fallback: `_extract_json_from_content()` if tool-call parsing fails
5. Retry logic: up to 2 retries on 429/5xx/timeout; immediately fail on 401
6. Same pattern for polish, RTM, and script generation — each has its own tool schema and system prompt

### Key design decisions

- **Lazy imports in routes**: Every route handler imports its service module inside the function body. This means FastAPI startup is fast and dead code is never imported. All service modules are discoverable by grepping `from app.services.`.
- **Streaming**: `/api/generate/stream` sends SSE events. The streaming route duplicates the generation logic instead of wrapping the non-streaming path. Frontend reads via `EventSource`.
- **Frontend is a single HTML file** at `app/templates/index.html`. It embeds all JavaScript (~3000+ lines of vanilla JS) and CSS. State is held in a global `testCases` array, synced to/from DOM via `collectTableData()` / `syncTableData()`. Features: editable table, batch edit, undo/redo (50-step history), search filter, template insertion, dependency linking, Excel import with column mapping.
- **Three SQLite databases** in `~/.TestCaseAI/`: `auth.db` (users/sessions/settings), `library.db` (case sets/folders/bugs), `test_data.db` (SQL query tool — demo data recreated on every startup).
- **No ORM**: Raw SQLite with thread locks. WAL mode for concurrent reads.
- **Auth**: PBKDF2-HMAC-SHA256 hashing, token-based sessions (30-day expiry, stored in SQLite). Guest fallback (user_id=0) if no token.
- **Desktop build**: PyInstaller + pywebview wraps the FastAPI server in a native window. Serves via `uvicorn` in a background thread.
- **Deploy**: Docker (multi-stage), Render, Railway, Heroku (Procfile with gunicorn) supported.
- **No build step**: No bundler, transpiler, or CSS preprocessor. Bootstrap 5, SheetJS, CodeMirror, Luckysheet, Mammoth.js, Quill.js, docx all loaded from CDN.
