"""SQLite-based persistent storage for test case sets and hierarchical folders.

Stores each saved set as a row in a local SQLite database.
The database file lives under ~/.TestCaseAI/library.db.
"""
import json
from app.services.db_base import _get_conn, _lock, now_str


# ---------------------------------------------------------------------------
# Folder CRUD
# ---------------------------------------------------------------------------

def create_folder(name: str, parent_id: int | None = None) -> int:
    now = now_str()
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
    now = now_str()
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
    with _lock:
        conn = _get_conn()
        try:
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
# Set CRUD
# ---------------------------------------------------------------------------

def list_sets(folder_id: int | None = None, user_id: int = 0, q: str = "",
              limit: int = 0, offset: int = 0, status: str = "") -> list[dict]:
    from app.services.auth import get_user_by_id
    with _lock:
        conn = _get_conn()
        try:
            own_sql = "SELECT id, name, test_cases, requirement_text, folder_id, created_at, updated_at, user_id, status FROM test_case_sets"
            own_where = []
            own_params = []
            if q:
                own_where.append("name LIKE ?")
                own_params.append(f"%{q}%")
            if folder_id is None or folder_id == "null":
                own_where.append("folder_id IS NULL")
            elif folder_id == -1 or folder_id == "-1":
                pass
            else:
                own_where.append("folder_id = ?")
                own_params.append(int(folder_id))
            own_where.append("user_id = ?")
            own_params.append(user_id)
            if status:
                own_where.append("status = ?")
                own_params.append(status)
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
                    "status": r["status"] if "status" in r.keys() else "pending",
                })

            if folder_id is None or folder_id == "null" or folder_id == -1 or folder_id == "-1":
                shared_sql = """SELECT s.id, s.name, s.test_cases, s.requirement_text, s.folder_id,
                                       s.created_at, s.updated_at, s.status, sa.shared_by_user_id
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
                    sharer_name = f"用户{r['shared_by_user_id']}"
                    try:
                        sharer = get_user_by_id(r["shared_by_user_id"])
                        if sharer:
                            sharer_name = sharer["username"]
                    except Exception:
                        pass
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
                            "status": r["status"] if "status" in r.keys() else "pending",
                        })
            total = len(result)
            if limit > 0:
                result = result[offset:offset + limit]
            return result, total
        finally:
            conn.close()


def get_set(set_id: int, user_id: int = 0) -> dict | None:
    with _lock:
        conn = _get_conn()
        try:
            r = conn.execute(
                "SELECT id, name, test_cases, requirement_text, folder_id, created_at, updated_at, status FROM test_case_sets WHERE id = ? AND user_id = ?",
                (set_id, user_id),
            ).fetchone()
            owned = True
            if not r:
                r = conn.execute(
                    """SELECT s.id, s.name, s.test_cases, s.requirement_text,
                              s.folder_id, s.created_at, s.updated_at, s.status
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
                "status": r["status"] if "status" in r.keys() else "pending",
            }
        finally:
            conn.close()


def set_set_status(set_id: int, user_id: int, status: str) -> bool:
    now = now_str()
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "UPDATE test_case_sets SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                (status, now, set_id, user_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def save_set(name: str, test_cases: list[dict], requirement_text: str = "", folder_id: int | None = None, user_id: int = 0) -> int:
    now = now_str()
    cases_json = json.dumps(test_cases, ensure_ascii=False)
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "INSERT INTO test_case_sets (name, test_cases, requirement_text, folder_id, user_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (name, cases_json, requirement_text, folder_id, user_id, "pending", now, now),
            )
            conn.commit()
            return cur.lastrowid
        finally:
            conn.close()


def update_set(set_id: int, name: str, test_cases: list[dict], requirement_text: str = "", user_id: int = 0) -> bool:
    now = now_str()
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
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute("DELETE FROM test_case_sets WHERE id = ? AND user_id = ?", (set_id, user_id))
            if cur.rowcount > 0:
                conn.commit()
                return True
            cur = conn.execute(
                "DELETE FROM shared_set_access WHERE set_id = ? AND shared_with_user_id = ?",
                (set_id, user_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def move_set_to_folder(set_id: int, folder_id: int | None, user_id: int = 0) -> bool:
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
# Cross-set case search
# ---------------------------------------------------------------------------

def search_library_cases(q: str, user_id: int = 0) -> list[dict]:
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
    now = now_str()
    with _lock:
        conn = _get_conn()
        try:
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
    now = now_str()
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
    allowed = {"title", "description", "severity", "status", "module",
               "steps", "expected_result", "actual_result", "tags", "related_case_id"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return False
    now = now_str()
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


def list_bugs(user_id: int = 0, status: str = "", severity: str = "", q: str = "",
              limit: int = 0, offset: int = 0) -> list[dict]:
    with _lock:
        conn = _get_conn()
        try:
            count_sql = "SELECT COUNT(*) as cnt FROM bugs WHERE user_id = ?"
            params = [user_id]
            if status:
                count_sql += " AND status = ?"
                params.append(status)
            if severity:
                count_sql += " AND severity = ?"
                params.append(severity)
            if q:
                count_sql += " AND (title LIKE ? OR module LIKE ? OR tags LIKE ?)"
                like = f"%{q}%"
                params.extend([like, like, like])
            total_row = conn.execute(count_sql, params).fetchone()
            total = total_row["cnt"] if total_row else 0

            data_sql = "SELECT * FROM bugs WHERE user_id = ?"
            data_params = [user_id]
            if status:
                data_sql += " AND status = ?"
                data_params.append(status)
            if severity:
                data_sql += " AND severity = ?"
                data_params.append(severity)
            if q:
                data_sql += " AND (title LIKE ? OR module LIKE ? OR tags LIKE ?)"
                like = f"%{q}%"
                data_params.extend([like, like, like])
            data_sql += " ORDER BY updated_at DESC"
            if limit > 0:
                data_sql += " LIMIT ? OFFSET ?"
                data_params.extend([limit, offset])
            rows = conn.execute(data_sql, data_params).fetchall()
            return [dict(r) for r in rows], total
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Prompt Template CRUD
# ---------------------------------------------------------------------------

def list_prompt_templates() -> list[dict]:
    with _lock:
        conn = _get_conn()
        try:
            rows = conn.execute(
                "SELECT id, name, label, prompt_text, description, model_pattern, is_active, created_at, updated_at FROM prompt_templates ORDER BY id"
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def get_prompt_template(template_id: int) -> dict | None:
    with _lock:
        conn = _get_conn()
        try:
            r = conn.execute(
                "SELECT id, name, label, prompt_text, description, model_pattern, is_active, created_at, updated_at FROM prompt_templates WHERE id = ?",
                (template_id,),
            ).fetchone()
            return dict(r) if r else None
        finally:
            conn.close()


def update_prompt_template(template_id: int, prompt_text: str, label: str = "",
                           description: str = "", model_pattern: str = "",
                           is_active: int = 1) -> bool:
    now = now_str()
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "UPDATE prompt_templates SET prompt_text = ?, label = ?, description = ?, model_pattern = ?, is_active = ?, updated_at = ? WHERE id = ?",
                (prompt_text, label, description, model_pattern, is_active, now, template_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def reset_prompt_template(template_id: int) -> bool:
    """Reset a prompt template back to use the default from generator.py."""
    now = now_str()
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "UPDATE prompt_templates SET prompt_text = '__USE_DEFAULT__', updated_at = ? WHERE id = ?",
                (now, template_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def get_active_prompt_text(name: str) -> str | None:
    """Get the active prompt text for a given name.
    Returns None if it should use the default from generator.py constants."""
    with _lock:
        conn = _get_conn()
        try:
            r = conn.execute(
                "SELECT prompt_text FROM prompt_templates WHERE name = ? AND is_active = 1",
                (name,),
            ).fetchone()
            if not r:
                return None
            text = r["prompt_text"]
            if text == "__USE_DEFAULT__":
                return None
            return text
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Specifications CRUD (module-specific test writing guidelines)
# ---------------------------------------------------------------------------

def list_specifications() -> list[dict]:
    with _lock:
        conn = _get_conn()
        try:
            rows = conn.execute(
                "SELECT id, name, module_keywords, content, is_active, created_at, updated_at FROM specifications ORDER BY updated_at DESC"
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def get_specification(spec_id: int) -> dict | None:
    with _lock:
        conn = _get_conn()
        try:
            r = conn.execute(
                "SELECT id, name, module_keywords, content, is_active, created_at, updated_at FROM specifications WHERE id = ?",
                (spec_id,),
            ).fetchone()
            return dict(r) if r else None
        finally:
            conn.close()


def create_specification(name: str, module_keywords: str, content: str) -> int:
    now = now_str()
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "INSERT INTO specifications (name, module_keywords, content, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
                (name, module_keywords, content, now, now),
            )
            conn.commit()
            return cur.lastrowid
        finally:
            conn.close()


def update_specification(spec_id: int, name: str, module_keywords: str, content: str, is_active: int = 1) -> bool:
    now = now_str()
    with _lock:
        conn = _get_conn()
        try:
            conn.execute(
                "UPDATE specifications SET name = ?, module_keywords = ?, content = ?, is_active = ?, updated_at = ? WHERE id = ?",
                (name, module_keywords, content, is_active, now, spec_id),
            )
            conn.commit()
            return True
        finally:
            conn.close()


def delete_specification(spec_id: int) -> bool:
    with _lock:
        conn = _get_conn()
        try:
            conn.execute("DELETE FROM specifications WHERE id = ?", (spec_id,))
            conn.commit()
            return True
        finally:
            conn.close()


def match_specifications(keywords: str) -> list[dict]:
    """Find active specifications whose module_keywords overlap with the given keywords.
    Returns matched specs ordered by most keyword matches first."""
    if not keywords or not keywords.strip():
        return []
    kw_set = {k.strip().lower() for k in keywords.split(",") if k.strip()}
    if not kw_set:
        return []
    with _lock:
        conn = _get_conn()
        try:
            rows = conn.execute(
                "SELECT id, name, module_keywords, content FROM specifications WHERE is_active = 1"
            ).fetchall()
        finally:
            conn.close()
    results = []
    for r in rows:
        spec_kws = {k.strip().lower() for k in (r["module_keywords"] or "").split(",") if k.strip()}
        overlap = kw_set & spec_kws
        if overlap:
            results.append((len(overlap), dict(r)))
    results.sort(key=lambda x: x[0], reverse=True)
    return [r[1] for r in results]
