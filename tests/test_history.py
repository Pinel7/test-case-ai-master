"""Tests for generation_history — save, list, get, delete, restore."""

import json


class TestHistory:
    def _save(self, user_id, requirement, cases, model="deepseek-chat"):
        from app.services.db_base import _get_conn, now_str
        conn = _get_conn()
        try:
            cur = conn.execute(
                "INSERT INTO generation_history (user_id, requirement_text, test_cases, model, case_count, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, requirement, json.dumps(cases, ensure_ascii=False), model, len(cases), now_str()),
            )
            conn.commit()
            return cur.lastrowid
        finally:
            conn.close()

    def _list(self, user_id):
        from app.services.db_base import _get_conn
        conn = _get_conn()
        try:
            rows = conn.execute(
                "SELECT id FROM generation_history WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
            return [r["id"] for r in rows]
        finally:
            conn.close()

    def _get(self, history_id):
        from app.services.db_base import _get_conn
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT * FROM generation_history WHERE id = ?",
                (history_id,),
            ).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    def test_save(self, auth):
        user = auth.register_user("hist_user1", "password123")
        hid = self._save(user["id"], "test requirement", [{"title": "TC1"}, {"title": "TC2"}])
        assert hid > 0

    def test_list(self, auth):
        user = auth.register_user("hist_user2", "password123")
        self._save(user["id"], "req1", [])
        self._save(user["id"], "req2", [])
        ids = self._list(user["id"])
        assert len(ids) == 2

    def test_list_per_user(self, auth):
        u1 = auth.register_user("hist_user3", "password123")
        u2 = auth.register_user("hist_user4", "password123")
        self._save(u1["id"], "u1 req", [])
        self._save(u2["id"], "u2 req", [])
        assert len(self._list(u1["id"])) == 1
        assert len(self._list(u2["id"])) == 1

    def test_get(self, auth):
        user = auth.register_user("hist_user5", "password123")
        cases = [{"title": "TC1", "module": "Auth"}]
        hid = self._save(user["id"], "get test", cases)
        entry = self._get(hid)
        assert entry is not None
        assert entry["requirement_text"] == "get test"
        assert json.loads(entry["test_cases"]) == cases
        assert entry["model"] == "deepseek-chat"
        assert entry["case_count"] == 1

    def test_delete(self, auth):
        user = auth.register_user("hist_user6", "password123")
        hid = self._save(user["id"], "delete me", [])
        from app.services.db_base import _get_conn
        conn = _get_conn()
        try:
            cur = conn.execute(
                "DELETE FROM generation_history WHERE id = ? AND user_id = ?",
                (hid, user["id"]),
            )
            conn.commit()
            assert cur.rowcount == 1
        finally:
            conn.close()
        assert self._get(hid) is None

    def test_delete_wrong_user(self, auth):
        u1 = auth.register_user("hist_user7", "password123")
        u2 = auth.register_user("hist_user8", "password123")
        hid = self._save(u1["id"], "u1's entry", [])
        from app.services.db_base import _get_conn
        conn = _get_conn()
        try:
            cur = conn.execute(
                "DELETE FROM generation_history WHERE id = ? AND user_id = ?",
                (hid, u2["id"]),
            )
            conn.commit()
            assert cur.rowcount == 0
        finally:
            conn.close()
        assert self._get(hid) is not None  # still exists

    def test_restore(self, auth):
        user = auth.register_user("hist_user9", "password123")
        cases = [{"title": "TC1"}]
        hid = self._save(user["id"], "restore req", cases)
        entry = self._get(hid)
        restored_cases = json.loads(entry["test_cases"])
        assert restored_cases == cases
        assert entry["requirement_text"] == "restore req"

    def test_save_with_model(self, auth):
        user = auth.register_user("hist_user10", "password123")
        hid = self._save(user["id"], "model test", [], model="claude-sonnet-4-7")
        entry = self._get(hid)
        assert entry["model"] == "claude-sonnet-4-7"

    def test_case_count(self, auth):
        user = auth.register_user("hist_user11", "password123")
        cases = [{"title": f"TC{i}"} for i in range(5)]
        hid = self._save(user["id"], "count test", cases)
        entry = self._get(hid)
        assert entry["case_count"] == 5
