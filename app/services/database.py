"""
SQLite-based persistent storage for test case sets and hierarchical folders.

Stores each saved set as a row in a local SQLite database.
The database file lives under ~/.TestCaseAI/library.db.
"""
import json
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
            # Migration: add folder_id column if missing
            try:
                conn.execute(
                    "ALTER TABLE test_case_sets ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL"
                )
            except sqlite3.OperationalError:
                pass  # column already exists

            # Migration: add user_id column if missing
            try:
                conn.execute(
                    "ALTER TABLE test_case_sets ADD COLUMN user_id INTEGER DEFAULT 0"
                )
            except sqlite3.OperationalError:
                pass  # column already exists

            # Migration: bugs table
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
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_bugs_user ON bugs(user_id)"
            )

            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_sets_folder ON test_case_sets(folder_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_sets_user ON test_case_sets(user_id)"
            )
            # Migration: shared_set_access table
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
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_shared_with ON shared_set_access(shared_with_user_id)"
            )
            # Migration: notifications table
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
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_notif_to ON notifications(to_user_id, status)"
            )
            # Migration: contacts table
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


# Auto-initialize on import
_init_db()


# ---------------------------------------------------------------------------
# Folder CRUD
# ---------------------------------------------------------------------------

def create_folder(name: str, parent_id: int | None = None) -> int:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "INSERT INTO folders (name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (name, parent_id, now, now),
            )
            conn.commit()
            return cur.lastrowid
        finally:
            conn.close()


def rename_folder(folder_id: int, name: str) -> bool:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "UPDATE folders SET name = ?, updated_at = ? WHERE id = ?",
                (name, now, folder_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def delete_folder(folder_id: int) -> bool:
    """Delete a folder. Child folders cascade-deleted, sets in this folder get folder_id=NULL."""
    with _lock:
        conn = _get_conn()
        try:
            # Unlink sets first (before cascade deletes child folders)
            conn.execute(
                "UPDATE test_case_sets SET folder_id = NULL WHERE folder_id = ?",
                (folder_id,),
            )
            cur = conn.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def get_folder_tree() -> list[dict]:
    """Return all folders as a flat list with id, name, parent_id for client-side tree building."""
    with _lock:
        conn = _get_conn()
        try:
            rows = conn.execute(
                "SELECT id, name, parent_id FROM folders ORDER BY name"
            ).fetchall()
            return [{"id": r["id"], "name": r["name"], "parent_id": r["parent_id"]} for r in rows]
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Set CRUD (updated with folder_id support)
# ---------------------------------------------------------------------------

def list_sets(folder_id: int | None = None, user_id: int = 0, q: str = "") -> list[dict]:
    """Return sets. folder_id=None returns root-level (folder_id IS NULL), -1 returns all.
    Includes sets shared with the user. q filters by name."""
    from app.services.auth import get_user_by_id
    with _lock:
        conn = _get_conn()
        try:
            # Own sets
            own_sql = "SELECT id, name, test_cases, requirement_text, folder_id, created_at, updated_at, user_id FROM test_case_sets"
            own_where = []
            own_params = []
            if q:
                own_where.append("name LIKE ?")
                own_params.append(f"%{q}%")
            if folder_id is None or folder_id == "null":
                own_where.append("folder_id IS NULL")
            elif folder_id == -1 or folder_id == "-1":
                pass  # no folder filter
            else:
                own_where.append("folder_id = ?")
                own_params.append(int(folder_id))
            own_where.append("user_id = ?")
            own_params.append(user_id)
            rows = conn.execute(
                own_sql + " WHERE " + " AND ".join(own_where) + " ORDER BY updated_at DESC",
                own_params,
            ).fetchall()

            result = []
            for r in rows:
                cases = json.loads(r["test_cases"]) if r["test_cases"] else []
                result.append({
                    "id": r["id"],
                    "name": r["name"],
                    "case_count": len(cases),
                    "requirement_text": r["requirement_text"] or "",
                    "folder_id": r["folder_id"],
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                    "shared_by": None,
                    "owned": True,
                })

            # Shared sets (for root-level only, ignore folder for now)
            if folder_id is None or folder_id == "null" or folder_id == -1 or folder_id == "-1":
                shared_sql = """SELECT s.id, s.name, s.test_cases, s.requirement_text, s.folder_id,
                                       s.created_at, s.updated_at, sa.shared_by_user_id
                                FROM shared_set_access sa
                                JOIN test_case_sets s ON s.id = sa.set_id
                                WHERE sa.shared_with_user_id = ?"""
                shared_params = [user_id]
                if q:
                    shared_sql += " AND s.name LIKE ?"
                    shared_params.append(f"%{q}%")
                shared_sql += " ORDER BY sa.created_at DESC"
                shared_rows = conn.execute(shared_sql, shared_params).fetchall()
                for r in shared_rows:
                    cases = json.loads(r["test_cases"]) if r["test_cases"] else []
                    # Look up sharer username
                    sharer_name = f"用户{r['shared_by_user_id']}"
                    try:
                        sharer = get_user_by_id(r["shared_by_user_id"])
                        if sharer:
                            sharer_name = sharer["username"]
                    except Exception:
                        pass
                    # Avoid duplicating if the user somehow owns the same set
                    if not any(x["id"] == r["id"] for x in result):
                        result.append({
                            "id": r["id"],
                            "name": r["name"],
                            "case_count": len(cases),
                            "requirement_text": r["requirement_text"] or "",
                            "folder_id": r["folder_id"],
                            "created_at": r["created_at"],
                            "updated_at": r["updated_at"],
                            "shared_by": sharer_name,
                            "owned": False,
                        })

            return result
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Share Request Notifications
# ---------------------------------------------------------------------------

def send_share_request(set_id: int, from_user_id: int, to_user_id: int) -> int:
    """Send a share request notification. Returns notification id (0 on failure)."""
    from app.services.auth import get_user_by_id
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    sharer = get_user_by_id(from_user_id)
    sharer_name = sharer["username"] if sharer else f"用户{from_user_id}"
    with _lock:
        conn = _get_conn()
        try:
            owner = conn.execute(
                "SELECT id, name FROM test_case_sets WHERE id = ? AND user_id = ?",
                (set_id, from_user_id),
            ).fetchone()
            if not owner:
                return 0
            cur = conn.execute(
                """INSERT INTO notifications (from_user_id, to_user_id, set_id, type, status, message, created_at)
                   VALUES (?, ?, ?, 'share_request', 'pending', ?, ?)""",
                (from_user_id, to_user_id, set_id, f"{sharer_name} 分享了「{owner['name']}」给你", now),
            )
            conn.commit()
            return cur.lastrowid
        except Exception:
            return 0
        finally:
            conn.close()


def accept_share_request(notif_id: int, user_id: int) -> bool:
    """Accept a share request: copy the set to recipient's library."""
    with _lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT * FROM notifications WHERE id = ? AND to_user_id = ? AND status = 'pending'",
                (notif_id, user_id),
            ).fetchone()
            if not row:
                return False
            src = conn.execute(
                "SELECT * FROM test_case_sets WHERE id = ?",
                (row["set_id"],),
            ).fetchone()
            if not src:
                return False
            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            conn.execute(
                "INSERT INTO test_case_sets (name, test_cases, requirement_text, folder_id, user_id, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)",
                (src["name"] + " (来自共享)", src["test_cases"], src["requirement_text"], user_id, now, now),
            )
            conn.execute(
                "UPDATE notifications SET status = 'accepted' WHERE id = ?",
                (notif_id,),
            )
            conn.commit()
            return True
        except Exception:
            return False
        finally:
            conn.close()


def decline_share_request(notif_id: int, user_id: int) -> bool:
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "UPDATE notifications SET status = 'declined' WHERE id = ? AND to_user_id = ? AND status = 'pending'",
                (notif_id, user_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def list_notifications(user_id: int) -> list[dict]:
    with _lock:
        conn = _get_conn()
        try:
            rows = conn.execute(
                "SELECT * FROM notifications WHERE to_user_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def get_unread_notification_count(user_id: int) -> int:
    with _lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM notifications WHERE to_user_id = ? AND status = 'pending'",
                (user_id,),
            ).fetchone()
            return row["cnt"] if row else 0
        finally:
            conn.close()


def get_set(set_id: int, user_id: int = 0) -> dict | None:
    """Get a full set by id, including test_cases array. Checks ownership then shared access."""
    with _lock:
        conn = _get_conn()
        try:
            r = conn.execute(
                "SELECT id, name, test_cases, requirement_text, folder_id, created_at, updated_at FROM test_case_sets WHERE id = ? AND user_id = ?",
                (set_id, user_id),
            ).fetchone()
            owned = True
            if not r:
                # Check shared access
                r = conn.execute(
                    """SELECT s.id, s.name, s.test_cases, s.requirement_text,
                              s.folder_id, s.created_at, s.updated_at
                       FROM shared_set_access sa
                       JOIN test_case_sets s ON s.id = sa.set_id
                       WHERE sa.set_id = ? AND sa.shared_with_user_id = ?""",
                    (set_id, user_id),
                ).fetchone()
                owned = False
            if not r:
                return None
            cases = json.loads(r["test_cases"]) if r["test_cases"] else []
            return {
                "id": r["id"],
                "name": r["name"],
                "test_cases": cases,
                "case_count": len(cases),
                "requirement_text": r["requirement_text"] or "",
                "folder_id": r["folder_id"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
        finally:
            conn.close()


def save_set(name: str, test_cases: list[dict], requirement_text: str = "", folder_id: int | None = None, user_id: int = 0) -> int:
    """Create a new set. Returns the new set id."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    cases_json = json.dumps(test_cases, ensure_ascii=False)
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "INSERT INTO test_case_sets (name, test_cases, requirement_text, folder_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (name, cases_json, requirement_text, folder_id, user_id, now, now),
            )
            conn.commit()
            return cur.lastrowid
        finally:
            conn.close()


def update_set(set_id: int, name: str, test_cases: list[dict], requirement_text: str = "", user_id: int = 0) -> bool:
    """Update an existing set. Returns True if successful."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    cases_json = json.dumps(test_cases, ensure_ascii=False)
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "UPDATE test_case_sets SET name = ?, test_cases = ?, requirement_text = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                (name, cases_json, requirement_text, now, set_id, user_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def delete_set(set_id: int, user_id: int = 0) -> bool:
    """Delete a set by id (owner) or remove shared access (recipient). Returns True if successful."""
    with _lock:
        conn = _get_conn()
        try:
            # Try as owner first
            cur = conn.execute("DELETE FROM test_case_sets WHERE id = ? AND user_id = ?", (set_id, user_id))
            if cur.rowcount > 0:
                conn.commit()
                return True
            # Not owner — check if user has shared access and remove it
            cur = conn.execute(
                "DELETE FROM shared_set_access WHERE set_id = ? AND shared_with_user_id = ?",
                (set_id, user_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def move_set_to_folder(set_id: int, folder_id: int | None, user_id: int = 0) -> bool:
    """Move a set to a different folder (or root if folder_id is None)."""
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "UPDATE test_case_sets SET folder_id = ? WHERE id = ? AND user_id = ?",
                (folder_id, set_id, user_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Cross-set case search (for dependency linking from library)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Bug CRUD
# ---------------------------------------------------------------------------

def create_bug(
    title: str,
    user_id: int = 0,
    description: str = "",
    severity: str = "P2",
    status: str = "open",
    module: str = "",
    steps: str = "",
    expected_result: str = "",
    actual_result: str = "",
    tags: str = "",
    related_case_id: str = "",
) -> int:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                """INSERT INTO bugs (user_id, title, description, severity, status, module,
                   steps, expected_result, actual_result, tags, related_case_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (user_id, title, description, severity, status, module,
                 steps, expected_result, actual_result, tags, related_case_id, now, now),
            )
            conn.commit()
            return cur.lastrowid
        finally:
            conn.close()


def update_bug(bug_id: int, **kwargs) -> bool:
    """Update bug fields. Only provided fields are updated."""
    allowed = {"title", "description", "severity", "status", "module",
               "steps", "expected_result", "actual_result", "tags", "related_case_id"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return False
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    updates["updated_at"] = now
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [bug_id]
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                f"UPDATE bugs SET {set_clause} WHERE id = ?", values
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def delete_bug(bug_id: int) -> bool:
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute("DELETE FROM bugs WHERE id = ?", (bug_id,))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def get_bug(bug_id: int) -> dict | None:
    with _lock:
        conn = _get_conn()
        try:
            row = conn.execute("SELECT * FROM bugs WHERE id = ?", (bug_id,)).fetchone()
            if row:
                return dict(row)
            return None
        finally:
            conn.close()


def list_bugs(user_id: int = 0, status: str = "", severity: str = "", q: str = "") -> list[dict]:
    with _lock:
        conn = _get_conn()
        try:
            sql = "SELECT * FROM bugs WHERE user_id = ?"
            params = [user_id]
            if status:
                sql += " AND status = ?"
                params.append(status)
            if severity:
                sql += " AND severity = ?"
                params.append(severity)
            if q:
                sql += " AND (title LIKE ? OR module LIKE ? OR tags LIKE ?)"
                like = f"%{q}%"
                params.extend([like, like, like])
            sql += " ORDER BY updated_at DESC"
            rows = conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def search_library_cases(q: str, user_id: int = 0) -> list[dict]:
    """Search test cases across all sets by case_id, title, or module.
    Returns matching cases with their parent set name and folder path.
    """
    if not q or not q.strip():
        return []
    query = q.strip().lower()

    with _lock:
        conn = _get_conn()
        try:
            rows = conn.execute(
                "SELECT id, name, test_cases, folder_id FROM test_case_sets WHERE user_id = ?",
                (user_id,)
            ).fetchall()

            # Build folder path lookup
            folder_rows = conn.execute("SELECT id, name, parent_id FROM folders").fetchall()
            folders = {}
            for fr in folder_rows:
                folders[fr["id"]] = {"name": fr["name"], "parent_id": fr["parent_id"]}

            def _folder_path(fid):
                parts = []
                current = fid
                while current and current in folders:
                    parts.append(folders[current]["name"])
                    current = folders[current]["parent_id"]
                parts.reverse()
                return "/".join(parts) if parts else ""

            results = []
            for r in rows:
                cases = json.loads(r["test_cases"]) if r["test_cases"] else []
                for c in cases:
                    if (query in (c.get("case_id") or "").lower()
                            or query in (c.get("title") or "").lower()
                            or query in (c.get("module") or "").lower()):
                        results.append({
                            "set_id": r["id"],
                            "set_name": r["name"],
                            "folder_path": _folder_path(r["folder_id"]) if r["folder_id"] else "",
                            "case_id": c.get("case_id", ""),
                            "title": c.get("title", ""),
                            "module": c.get("module", ""),
                            "preconditions": c.get("preconditions", ""),
                        })
            return results
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Share / Revoke
# ---------------------------------------------------------------------------

def share_set(set_id: int, shared_by_user_id: int, shared_with_user_id: int, permission: str = "read") -> bool:
    """Share a set with another user. Returns True if successful."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    with _lock:
        conn = _get_conn()
        try:
            # Verify ownership
            owner = conn.execute(
                "SELECT id FROM test_case_sets WHERE id = ? AND user_id = ?",
                (set_id, shared_by_user_id),
            ).fetchone()
            if not owner:
                return False
            conn.execute(
                "INSERT OR REPLACE INTO shared_set_access (set_id, shared_by_user_id, shared_with_user_id, permission, created_at) VALUES (?, ?, ?, ?, ?)",
                (set_id, shared_by_user_id, shared_with_user_id, permission, now),
            )
            conn.commit()
            return True
        except Exception:
            return False
        finally:
            conn.close()


def revoke_share(set_id: int, shared_by_user_id: int, shared_with_user_id: int) -> bool:
    """Revoke sharing of a set. Only the owner can revoke."""
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "DELETE FROM shared_set_access WHERE set_id = ? AND shared_with_user_id = ? AND set_id IN (SELECT id FROM test_case_sets WHERE user_id = ?)",
                (set_id, shared_with_user_id, shared_by_user_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def list_shares(set_id: int, user_id: int) -> list[dict]:
    """List users a set is shared with. Only the owner can view."""
    from app.services.auth import get_user_by_id
    with _lock:
        conn = _get_conn()
        try:
            rows = conn.execute(
                """SELECT sa.shared_with_user_id, sa.permission, sa.created_at
                   FROM shared_set_access sa
                   JOIN test_case_sets s ON s.id = sa.set_id
                   WHERE sa.set_id = ? AND s.user_id = ?""",
                (set_id, user_id),
            ).fetchall()
            result = []
            for r in rows:
                username = f"用户{r['shared_with_user_id']}"
                try:
                    u = get_user_by_id(r["shared_with_user_id"])
                    if u:
                        username = u["username"]
                except Exception:
                    pass
                result.append({
                    "user_id": r["shared_with_user_id"],
                    "username": username,
                    "permission": r["permission"],
                    "created_at": r["created_at"],
                })
            return result
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Contacts — invitation-based
# ---------------------------------------------------------------------------

def send_friend_request(from_user_id: int, to_username: str) -> int:
    """Send a friend request notification. Returns notification id (0 on failure)."""
    from app.services.auth import search_users, get_user_by_id
    users = search_users(to_username, 1)
    if not users:
        return 0
    to_user = users[0]
    if to_user["id"] == from_user_id:
        return 0
    me = get_user_by_id(from_user_id)
    my_name = me["username"] if me else f"用户{from_user_id}"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    with _lock:
        conn = _get_conn()
        try:
            # Check if already friends
            existing = conn.execute(
                "SELECT id FROM contacts WHERE user_id = ? AND contact_user_id = ?",
                (from_user_id, to_user["id"]),
            ).fetchone()
            if existing:
                return -1  # already contacts
            # Check for existing pending request
            dup = conn.execute(
                "SELECT id FROM notifications WHERE from_user_id = ? AND to_user_id = ? AND type = 'friend_request' AND status = 'pending'",
                (from_user_id, to_user["id"]),
            ).fetchone()
            if dup:
                return -2  # already requested
            cur = conn.execute(
                """INSERT INTO notifications (from_user_id, to_user_id, set_id, type, status, message, created_at)
                   VALUES (?, ?, 0, 'friend_request', 'pending', ?, ?)""",
                (from_user_id, to_user["id"], f"{my_name} 请求添加你为联系人", now),
            )
            conn.commit()
            return cur.lastrowid
        except Exception:
            return 0
        finally:
            conn.close()


def accept_friend_request(notif_id: int, user_id: int) -> bool:
    """Accept a friend request: create bidirectional contact relationship."""
    with _lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT * FROM notifications WHERE id = ? AND to_user_id = ? AND type = 'friend_request' AND status = 'pending'",
                (notif_id, user_id),
            ).fetchone()
            if not row:
                return False
            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            from_uid = row["from_user_id"]
            conn.execute(
                "INSERT OR IGNORE INTO contacts (user_id, contact_user_id, created_at) VALUES (?, ?, ?)",
                (user_id, from_uid, now),
            )
            conn.execute(
                "INSERT OR IGNORE INTO contacts (user_id, contact_user_id, created_at) VALUES (?, ?, ?)",
                (from_uid, user_id, now),
            )
            conn.execute(
                "UPDATE notifications SET status = 'accepted' WHERE id = ?",
                (notif_id,),
            )
            conn.commit()
            return True
        except Exception:
            return False
        finally:
            conn.close()


def decline_friend_request(notif_id: int, user_id: int) -> bool:
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "UPDATE notifications SET status = 'declined' WHERE id = ? AND to_user_id = ? AND type = 'friend_request' AND status = 'pending'",
                (notif_id, user_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def remove_contact(user_id: int, contact_user_id: int) -> bool:
    with _lock:
        conn = _get_conn()
        try:
            conn.execute(
                "DELETE FROM contacts WHERE (user_id = ? AND contact_user_id = ?) OR (user_id = ? AND contact_user_id = ?)",
                (user_id, contact_user_id, contact_user_id, user_id),
            )
            conn.commit()
            return True
        finally:
            conn.close()


def list_contacts(user_id: int) -> list[dict]:
    with _lock:
        conn = _get_conn()
        try:
            from app.services.auth import get_user_by_id
            rows = conn.execute(
                "SELECT contact_user_id, created_at FROM contacts WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
            result = []
            for r in rows:
                u = get_user_by_id(r["contact_user_id"])
                if u:
                    result.append({
                        "id": u["id"],
                        "username": u["username"],
                        "role": u.get("role", "user"),
                        "created_at": r["created_at"],
                    })
            return result
        finally:
            conn.close()
