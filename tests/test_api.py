"""API integration tests — routes, auth, error response format."""

import re
import pytest
from fastapi.testclient import TestClient


def _solve_captcha(client):
    """Helper: fetch captcha question and return (captcha_id, answer)."""
    resp = client.get("/api/auth/captcha")
    assert resp.status_code == 200
    data = resp.json()
    m = re.match(r"(\d+)\s*([+−])\s*(\d+)\s*=\s*\?", data["question"])
    if not m:
        pytest.fail(f"Cannot parse captcha: {data['question']}")
    a, op, b = int(m.group(1)), m.group(2), int(m.group(3))
    answer = a + b if op == "+" else a - b
    return data["id"], answer


def _register(client, username, password):
    """Helper: register with captcha auto-solved."""
    cid, ans = _solve_captcha(client)
    resp = client.post("/api/auth/register", json={
        "username": username, "password": password,
        "captcha_id": cid, "captcha_answer": ans,
    })
    return resp


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


class TestAuthAPI:
    def test_register(self, client):
        resp = _register(client, "api_newuser", "testpass123")
        assert resp.status_code == 200
        data = resp.json()
        user = data.get("user", data)
        assert user.get("id", data.get("id")) is not None
        assert data.get("username", user.get("username")) == "api_newuser"

    def test_register_duplicate(self, client):
        _register(client, "api_dupuser", "testpass123")
        resp = _register(client, "api_dupuser", "otherpass1")
        assert resp.status_code == 400

    def test_login_success(self, client):
        _register(client, "api_loginuser", "testpass123")
        resp = client.post("/api/auth/login", json={"username": "api_loginuser", "password": "testpass123"})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data or "access_token" in data

    def test_login_wrong_password(self, client):
        _register(client, "api_wrongpw", "testpass123")
        resp = client.post("/api/auth/login", json={"username": "api_wrongpw", "password": "wrongpass"})
        assert resp.status_code == 401

    def test_me_authenticated(self, client):
        _register(client, "api_meuser", "testpass123")
        login_resp = client.post("/api/auth/login", json={"username": "api_meuser", "password": "testpass123"})
        token = login_resp.json().get("token") or login_resp.json().get("access_token")
        resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["username"] == "api_meuser"

    def test_me_unauthenticated(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 200
        assert resp.json().get("id") == 0  # guest

    def test_logout(self, client):
        _register(client, "api_logoutuser", "testpass123")
        login_resp = client.post("/api/auth/login", json={"username": "api_logoutuser", "password": "testpass123"})
        token = login_resp.json().get("token") or login_resp.json().get("access_token")
        resp = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        # Token should be invalid now
        resp2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp2.json().get("id") == 0  # guest fallback


class TestLibraryAPI:
    def _login(self, client):
        _register(client, "lib_user", "testpass123")
        resp = client.post("/api/auth/login", json={"username": "lib_user", "password": "testpass123"})
        token = resp.json().get("token") or resp.json().get("access_token")
        client.headers["Authorization"] = f"Bearer {token}"
        return token

    def test_list_empty(self, client):
        self._login(client)
        resp = client.get("/api/library/list")
        assert resp.status_code == 200
        data = resp.json()
        assert data["sets"] == []

    def test_save_and_get(self, client):
        self._login(client)
        cases = [{"title": "Test case 1", "steps": "Step 1"}]
        save_resp = client.post("/api/library/save", json={
            "name": "Test Set", "test_cases": cases, "requirement_text": "req", "folder_id": None,
        })
        assert save_resp.status_code == 200
        set_id = save_resp.json()["id"]

        get_resp = client.get(f"/api/library/{set_id}")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["name"] == "Test Set"

    def test_list_after_save(self, client):
        self._login(client)
        # Save a set first so listing returns results
        client.post("/api/library/save", json={
            "name": "List Test Set", "test_cases": [{"title": "TC"}],
            "requirement_text": "req", "folder_id": None,
        })
        resp = client.get("/api/library/list")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["sets"]) > 0

    def test_update(self, client):
        self._login(client)
        cases = [{"title": "Original"}]
        save_resp = client.post("/api/library/save", json={
            "name": "Update Set", "test_cases": cases, "requirement_text": "req", "folder_id": None,
        })
        set_id = save_resp.json()["id"]

        new_cases = [{"title": "Updated"}]
        upd_resp = client.put(f"/api/library/{set_id}", json={
            "name": "Updated Set", "test_cases": new_cases, "requirement_text": "new",
        })
        assert upd_resp.status_code == 200

        get_resp = client.get(f"/api/library/{set_id}")
        assert get_resp.json()["name"] == "Updated Set"

    def test_delete(self, client):
        self._login(client)
        resp = client.post("/api/library/save", json={
            "name": "Delete Set", "test_cases": [], "requirement_text": "", "folder_id": None,
        })
        set_id = resp.json()["id"]
        del_resp = client.delete(f"/api/library/{set_id}")
        assert del_resp.status_code == 200
        get_resp = client.get(f"/api/library/{set_id}")
        assert get_resp.status_code == 404

    def test_folder_crud(self, client):
        self._login(client)
        # Create
        resp = client.post("/api/library/folders", json={"name": "Test Folder", "parent_id": None})
        assert resp.status_code == 200
        folder_id = resp.json()["id"]
        folders = client.get("/api/library/folders").json()["folders"]
        assert any(f["id"] == folder_id for f in folders)

        # Rename
        client.put(f"/api/library/folders/{folder_id}", json={"name": "Renamed"})
        folders = client.get("/api/library/folders").json()["folders"]
        assert any(f["name"] == "Renamed" for f in folders)

        # Delete
        client.delete(f"/api/library/folders/{folder_id}")
        folders = client.get("/api/library/folders").json()["folders"]
        assert not any(f["id"] == folder_id for f in folders)

    def test_save_empty_name_fails(self, client):
        self._login(client)
        resp = client.post("/api/library/save", json={
            "name": "", "test_cases": [], "requirement_text": "", "folder_id": None,
        })
        assert resp.status_code == 400

    def test_get_not_found(self, client):
        self._login(client)
        resp = client.get("/api/library/99999")
        assert resp.status_code == 404

    def test_delete_not_found(self, client):
        self._login(client)
        resp = client.delete("/api/library/99999")
        assert resp.status_code == 404


class TestBugsAPI:
    def _login(self, client):
        _register(client, "bug_user", "testpass123")
        resp = client.post("/api/auth/login", json={"username": "bug_user", "password": "testpass123"})
        token = resp.json().get("token") or resp.json().get("access_token")
        client.headers["Authorization"] = f"Bearer {token}"

    def test_create_and_list(self, client):
        self._login(client)
        resp = client.post("/api/bugs", json={
            "title": "Bug 1", "description": "desc", "severity": "P1", "status": "open",
        })
        assert resp.status_code == 200
        list_resp = client.get("/api/bugs")
        assert list_resp.status_code == 200
        data = list_resp.json()
        assert len(data["bugs"]) > 0

    def test_update(self, client):
        self._login(client)
        resp = client.post("/api/bugs", json={
            "title": "Bug Update", "description": "d", "severity": "P2", "status": "open",
        })
        bug_id = resp.json()["id"]
        upd = client.put(f"/api/bugs/{bug_id}", json={"title": "Updated Bug"})
        assert upd.status_code == 200
        assert upd.json()["title"] == "Updated Bug"

    def test_delete(self, client):
        self._login(client)
        resp = client.post("/api/bugs", json={
            "title": "Bug Delete", "description": "d", "severity": "P3", "status": "open",
        })
        bug_id = resp.json()["id"]
        del_resp = client.delete(f"/api/bugs/{bug_id}")
        assert del_resp.status_code == 200
        list_resp = client.get("/api/bugs")
        assert list_resp.status_code == 200
        assert not any(b["id"] == bug_id for b in list_resp.json()["bugs"])

    def test_not_found_delete(self, client):
        self._login(client)
        resp = client.delete("/api/bugs/99999")
        assert resp.status_code == 404
        data = resp.json()
        assert "detail" in data
        assert "error_code" in data["detail"]
        assert "message" in data["detail"]


class TestHistoryAPI:
    def _login(self, client):
        _register(client, "hist_api_user", "testpass123")
        resp = client.post("/api/auth/login", json={"username": "hist_api_user", "password": "testpass123"})
        token = resp.json().get("token") or resp.json().get("access_token")
        client.headers["Authorization"] = f"Bearer {token}"

    def test_save_and_list(self, client):
        self._login(client)
        resp = client.post("/api/history", json={
            "requirement_text": "req text", "test_cases": [{"title": "TC1"}],
            "model": "deepseek-chat",
        })
        assert resp.status_code == 200
        list_resp = client.get("/api/history")
        assert list_resp.status_code == 200
        assert len(list_resp.json()["history"]) > 0

    def test_get(self, client):
        self._login(client)
        resp = client.post("/api/history", json={
            "requirement_text": "get test", "test_cases": [{"title": "TC1"}],
            "model": "deepseek-chat",
        })
        hid = resp.json()["id"]
        get_resp = client.get(f"/api/history/{hid}")
        assert get_resp.status_code == 200
        assert get_resp.json()["requirement_text"] == "get test"

    def test_delete(self, client):
        self._login(client)
        resp = client.post("/api/history", json={
            "requirement_text": "del test", "test_cases": [], "model": "deepseek-chat",
        })
        hid = resp.json()["id"]
        del_resp = client.delete(f"/api/history/{hid}")
        assert del_resp.status_code == 200
        get_resp = client.get(f"/api/history/{hid}")
        assert get_resp.status_code == 404

    def test_restore(self, client):
        self._login(client)
        resp = client.post("/api/history", json={
            "requirement_text": "restore test", "test_cases": [{"title": "TC1"}],
            "model": "deepseek-chat",
        })
        hid = resp.json()["id"]
        restore_resp = client.post(f"/api/history/{hid}/restore")
        assert restore_resp.status_code == 200
        data = restore_resp.json()
        assert len(data["test_cases"]) == 1

    def test_get_not_found(self, client):
        self._login(client)
        resp = client.get("/api/history/99999")
        assert resp.status_code == 404

    def test_delete_not_found(self, client):
        self._login(client)
        resp = client.delete("/api/history/99999")
        assert resp.status_code == 404


class TestErrorFormat:
    def _login(self, client):
        _register(client, "err_user", "testpass123")
        resp = client.post("/api/auth/login", json={"username": "err_user", "password": "testpass123"})
        token = resp.json().get("token") or resp.json().get("access_token")
        client.headers["Authorization"] = f"Bearer {token}"

    def test_404_format(self, client):
        self._login(client)
        resp = client.get("/api/library/99999")
        assert resp.status_code == 404
        data = resp.json()
        assert "detail" in data
        assert "error_code" in data["detail"]
        assert "message" in data["detail"]

    def test_400_format(self, client):
        self._login(client)
        resp = client.post("/api/library/save", json={
            "name": "", "test_cases": [], "requirement_text": "", "folder_id": None,
        })
        assert resp.status_code == 400
        data = resp.json()
        assert "detail" in data
        assert "error_code" in data["detail"]
        assert "message" in data["detail"]
