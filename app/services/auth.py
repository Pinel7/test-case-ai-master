"""User authentication service — uses SQLite + built-in hashing, no external deps."""

import hashlib
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

DB_DIR = Path.home() / ".TestCaseAI"
DB_DIR.mkdir(exist_ok=True)
AUTH_DB_PATH = DB_DIR / "auth.db"


def _get_db() -> sqlite3.Connection:
    db = sqlite3.connect(str(AUTH_DB_PATH))
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA busy_timeout=5000")
    return db


def init_auth_db():
    with _get_db() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                last_login TEXT
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                expires_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY,
                theme TEXT DEFAULT 'light',
                model TEXT DEFAULT '',
                api_key TEXT DEFAULT '',
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS registration_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT NOT NULL,
                username TEXT NOT NULL DEFAULT '',
                success INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_reg_ip ON registration_attempts(ip, created_at);
            CREATE TABLE IF NOT EXISTS captcha_challenges (
                id TEXT PRIMARY KEY,
                answer INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                username TEXT DEFAULT '',
                action TEXT NOT NULL,
                detail TEXT DEFAULT '',
                ip TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log(created_at DESC);
        """)


_RESERVED_USERNAMES = {
    "root", "system", "administrator", "guest", "test",
    "user", "null", "undefined", "api", "manager", "operator",
    "superuser", "superadmin", "master", "sa", "sysadmin",
}


def _check_register_rate_limit(ip: str) -> None:
    """Check if this IP has exceeded registration rate limits.
    Max 3 failed attempts per hour, max 10 total per day."""
    with _get_db() as db:
        # Last hour
        recent = db.execute(
            "SELECT COUNT(*) as cnt FROM registration_attempts "
            "WHERE ip = ? AND created_at > datetime('now', '-1 hour') AND success = 0",
            (ip,),
        ).fetchone()
        if recent and recent["cnt"] >= 3:
            raise ValueError("注册过于频繁，请稍后再试")

        # Last 24 hours total
        daily = db.execute(
            "SELECT COUNT(*) as cnt FROM registration_attempts "
            "WHERE ip = ? AND created_at > datetime('now', '-1 day')",
            (ip,),
        ).fetchone()
        if daily and daily["cnt"] >= 10:
            raise ValueError("今日注册次数已达上限")


def _record_registration_attempt(ip: str, username: str, success: bool) -> None:
    with _get_db() as db:
        db.execute(
            "INSERT INTO registration_attempts (ip, username, success) VALUES (?, ?, ?)",
            (ip, username, 1 if success else 0),
        )


def _validate_username(username: str) -> None:
    if len(username) < 3:
        raise ValueError("用户名至少3个字符")
    if len(username) > 30:
        raise ValueError("用户名不能超过30个字符")
    if not re.match(r"^[a-zA-Z一-鿿][a-zA-Z0-9_一-鿿]{1,29}$", username):
        raise ValueError("用户名只能包含字母、数字、下划线和中文，且不能以数字开头")
    if username.lower() in _RESERVED_USERNAMES:
        raise ValueError("该用户名已被保留，请更换")


def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise ValueError("密码至少8个字符")
    if len(password) > 64:
        raise ValueError("密码不能超过64个字符")
    # Must contain at least one letter and one number or special char
    if not re.search(r"[a-zA-Z]", password):
        raise ValueError("密码必须包含至少一个字母")
    if not re.search(r"[0-9!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?~`]", password):
        raise ValueError("密码必须包含至少一个数字或特殊字符")


def _hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
    return pwd_hash, salt


def register_user(username: str, password: str, ip: str = "") -> dict:
    _validate_username(username)
    _validate_password(password)
    if ip:
        _check_register_rate_limit(ip)
    pwd_hash, salt = _hash_password(password)
    try:
        with _get_db() as db:
            db.execute("INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
                       (username, pwd_hash, salt))
            user_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
            db.execute("INSERT INTO user_settings (user_id) VALUES (?)", (user_id,))
        if ip:
            _record_registration_attempt(ip, username, True)
        return {"id": user_id, "username": username, "role": "user"}
    except sqlite3.IntegrityError:
        if ip:
            _record_registration_attempt(ip, username, False)
        raise ValueError("用户名已存在")


def authenticate_user(username: str, password: str) -> dict | None:
    with _get_db() as db:
        row = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if not row:
            return None
        pwd_hash, _ = _hash_password(password, row["salt"])
        if pwd_hash != row["password_hash"]:
            return None
        # Update last login
        db.execute("UPDATE users SET last_login = datetime('now') WHERE id = ?", (row["id"],))
        return {"id": row["id"], "username": row["username"], "role": row["role"]}


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(48)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    with _get_db() as db:
        db.execute("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
                   (user_id, token, expires_at))
    return token


def get_user_by_token(token: str) -> dict | None:
    with _get_db() as db:
        row = db.execute(
            "SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON s.user_id = u.id "
            "WHERE s.token = ? AND s.expires_at > datetime('now')",
            (token,),
        ).fetchone()
        if row:
            return {"id": row["id"], "username": row["username"], "role": row["role"]}
    return None


def delete_session(token: str):
    with _get_db() as db:
        db.execute("DELETE FROM sessions WHERE token = ?", (token,))


def get_user_by_id(user_id: int) -> dict | None:
    with _get_db() as db:
        row = db.execute("SELECT id, username, role FROM users WHERE id = ?", (user_id,)).fetchone()
        if row:
            return {"id": row["id"], "username": row["username"], "role": row["role"]}
    return None


# ---------------------------------------------------------------------------
# CAPTCHA (math challenge, no external service)
# ---------------------------------------------------------------------------

_CAPTCHA_OPERATORS = [
    ("+", lambda a, b: a + b),
    ("−", lambda a, b: a - b),
]


def generate_captcha() -> dict:
    """Generate a math captcha challenge. Returns {id, question, hint}."""
    import uuid
    a = secrets.randbelow(30) + 5  # 5..34
    b = secrets.randbelow(a) + 1   # 1..a (keep subtraction result >= 0)
    op_sym, op_fn = secrets.choice(_CAPTCHA_OPERATORS)
    answer = op_fn(a, b)
    challenge_id = uuid.uuid4().hex[:12]
    with _get_db() as db:
        db.execute(
            "INSERT INTO captcha_challenges (id, answer) VALUES (?, ?)",
            (challenge_id, answer),
        )
        # Clean up old challenges (> 10 minutes)
        db.execute(
            "DELETE FROM captcha_challenges WHERE created_at < datetime('now', '-10 minutes')",
        )
    return {
        "id": challenge_id,
        "question": f"{a} {op_sym} {b} = ?",
    }


def verify_captcha(challenge_id: str, answer: int) -> bool:
    """Verify a captcha challenge answer. Returns True if correct."""
    if not challenge_id or answer is None:
        return False
    with _get_db() as db:
        row = db.execute(
            "SELECT answer FROM captcha_challenges WHERE id = ?",
            (challenge_id,),
        ).fetchone()
        if not row:
            return False
        # Delete used challenge (one-time use)
        db.execute("DELETE FROM captcha_challenges WHERE id = ?", (challenge_id,))
        # Allow small tolerance for subtraction
        return row["answer"] == answer


def search_users(query: str, limit: int = 10) -> list[dict]:
    """Search users by username."""
    with _get_db() as db:
        rows = db.execute(
            "SELECT id, username, role FROM users WHERE username LIKE ? ORDER BY username LIMIT ?",
            (f"%{query}%", limit),
        ).fetchall()
        return [{"id": r["id"], "username": r["username"], "role": r["role"]} for r in rows]


# ---------------------------------------------------------------------------
# Activity log
# ---------------------------------------------------------------------------

def log_action(user_id: int, username: str, action: str, detail: str = "", ip: str = ""):
    """Record an action in the activity_log table."""
    try:
        with _get_db() as db:
            db.execute(
                "INSERT INTO activity_log (user_id, username, action, detail, ip) VALUES (?, ?, ?, ?, ?)",
                (user_id, username, action, detail, ip),
            )
    except Exception:
        pass


def get_activity_log(limit: int = 50) -> list[dict]:
    """Fetch recent activity log entries."""
    with _get_db() as db:
        rows = db.execute(
            "SELECT id, user_id, username, action, detail, ip, created_at "
            "FROM activity_log ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_all_users_with_stats() -> list[dict]:
    """Get all users with additional stats (case/history/session counts)."""
    with _get_db() as db:
        rows = db.execute(
            "SELECT id, username, role, created_at, last_login FROM users ORDER BY id ASC"
        ).fetchall()
        users = [dict(r) for r in rows]

    # Enrich with stats from library.db
    from app.services.db_base import _get_conn as lib_conn
    conn = lib_conn()
    for u in users:
        uid = u["id"]
        u["case_count"] = conn.execute(
            "SELECT COUNT(*) FROM test_case_sets WHERE user_id = ?", (uid,)
        ).fetchone()[0]
        u["history_count"] = conn.execute(
            "SELECT COUNT(*) FROM generation_history WHERE user_id = ?", (uid,)
        ).fetchone()[0]
        u["session_count"] = db.execute(
            "SELECT COUNT(*) FROM sessions WHERE user_id = ? AND expires_at > datetime('now')", (uid,)
        ).fetchone()[0]
    conn.close()
    return users
