"""Shared SQLite connection primitives for all library.db operations."""

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

DB_DIR = Path.home() / ".TestCaseAI"
DB_DIR.mkdir(exist_ok=True)
DB_PATH = DB_DIR / "library.db"

_lock = threading.Lock()


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def _init_db() -> None:
    with _lock:
        conn = _get_conn()
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS folders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS test_case_sets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    test_cases TEXT NOT NULL DEFAULT '[]',
                    requirement_text TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            try:
                conn.execute(
                    "ALTER TABLE test_case_sets ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL"
                )
            except sqlite3.OperationalError:
                pass

            try:
                conn.execute(
                    "ALTER TABLE test_case_sets ADD COLUMN user_id INTEGER DEFAULT 0"
                )
            except sqlite3.OperationalError:
                pass

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS bugs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER DEFAULT 0,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    severity TEXT DEFAULT 'P2',
                    status TEXT DEFAULT 'open',
                    module TEXT DEFAULT '',
                    steps TEXT DEFAULT '',
                    expected_result TEXT DEFAULT '',
                    actual_result TEXT DEFAULT '',
                    tags TEXT DEFAULT '',
                    related_case_id TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_bugs_user ON bugs(user_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sets_folder ON test_case_sets(folder_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sets_user ON test_case_sets(user_id)")

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS shared_set_access (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    set_id INTEGER NOT NULL REFERENCES test_case_sets(id) ON DELETE CASCADE,
                    shared_by_user_id INTEGER NOT NULL,
                    shared_with_user_id INTEGER NOT NULL,
                    permission TEXT NOT NULL DEFAULT 'read',
                    created_at TEXT NOT NULL,
                    UNIQUE(set_id, shared_with_user_id)
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_shared_with ON shared_set_access(shared_with_user_id)")

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    from_user_id INTEGER NOT NULL,
                    to_user_id INTEGER NOT NULL,
                    set_id INTEGER NOT NULL,
                    type TEXT NOT NULL DEFAULT 'share_request',
                    status TEXT NOT NULL DEFAULT 'pending',
                    message TEXT DEFAULT '',
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_notif_to ON notifications(to_user_id, status)")
            # Migration: add is_read column for read/unread tracking
            try:
                conn.execute("ALTER TABLE notifications ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0")
            except Exception:
                pass  # Column already exists

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS generation_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL DEFAULT 0,
                    requirement_text TEXT NOT NULL,
                    test_cases TEXT NOT NULL DEFAULT '[]',
                    model TEXT NOT NULL DEFAULT 'deepseek-chat',
                    fields TEXT DEFAULT '',
                    case_count INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_history_user ON generation_history(user_id, created_at)")

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS contacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    contact_user_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(user_id, contact_user_id)
                )
                """
            )
            conn.commit()
        finally:
            conn.close()


def now_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


# Auto-initialize on import
_init_db()
