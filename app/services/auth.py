"""User authentication service — uses SQLite + built-in hashing, no external deps."""

import hashlib
import os
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
        """)


def _hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
    return pwd_hash, salt


def register_user(username: str, password: str) -> dict:
    if len(username) < 3 or len(password) < 6:
        raise ValueError("用户名至少3个字符，密码至少6个字符")
    pwd_hash, salt = _hash_password(password)
    try:
        with _get_db() as db:
            db.execute("INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
                       (username, pwd_hash, salt))
            user_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
            db.execute("INSERT INTO user_settings (user_id) VALUES (?)", (user_id,))
            return {"id": user_id, "username": username, "role": "user"}
    except sqlite3.IntegrityError:
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


def search_users(query: str, limit: int = 10) -> list[dict]:
    """Search users by username."""
    with _get_db() as db:
        rows = db.execute(
            "SELECT id, username, role FROM users WHERE username LIKE ? ORDER BY username LIMIT ?",
            (f"%{query}%", limit),
        ).fetchall()
        return [{"id": r["id"], "username": r["username"], "role": r["role"]} for r in rows]
