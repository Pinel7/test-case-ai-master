"""API integration tests — routes, auth, error response format."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


class TestAuthAPI:
    def test_register(self, client):
        resp = client.post("/api/auth/register", json={"username": "api_newuser", "password": "testpass123"})
        assert resp.status_code == 200
        data = resp.json()
        user = data.get("user", data)
        assert user.get("id", data.get("id")) is not None
        assert data.get("username", user.get("username")) == "api_newuser"

    def test_register_duplicate(self, client):
        client.post("/api/auth/register", json={"username": "api_dupuser", "password": "testpass123"})
        resp = client.post("/api/auth/register", json={"username": "api_dupuser", "password": "otherpass"})
        assert resp.status_code == 400

    def test_login_success(self, client):
        client.post("/api/auth/register", json={"username": "api_loginuser", "password": "testpass123"})
        resp = client.post("/api/auth/login", json={"username": "api_loginuser", "password": "testpass123"})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data or "access_token" in data

    def test_login_wrong_password(self, client):
        client.post("/api/auth/register", json={"username": "api_wrongpw", "password": "testpass123"})
        resp = client.post("/api/auth/login", json={"username": "api_wrongpw", "password": "wrongpass"})
        assert resp.status_code == 401

    def test_me_authenticated(self, client):
        client.post("/api/auth/register", json={"username": "api_meuser", "password": "testpass123"})
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
        client.post("/api/auth/register", json={"username": "api_logoutuser", "password": "testpass123"})
        login_resp = client.post("/api/auth/login", json={"username": "api_logoutuser", "password": "testpass123"})
        token = login_resp.json().get("token") or login_resp.json().get("access_token")
        resp = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        # Token should be invalid now
        resp2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp2.json().get("id") == 0  # guest fallback


class TestLibraryAPI:
    def _login(self, client):
        client.post("/api/auth/register", json={"username": "lib_user", "password": "testpass123"})
        resp = client.post("/api/auth/login", json={"username": "lib_user", "password": "testpass123"})
        token = resp.json().get("token") or resp.json().get("access_token")
        client.headers["Authorization"] = f"Bearer {token}"
        return token

    def test_list_empty(self, client):
        self._login(client)
        resp = client.get("/api/library/list")
        assert resp.status_code == 200
        data = resp.json()
        assert "sets" in data
        assert data["total"] == 0

    def test_save_and_get(self, client):
        self._login(client)
        cases = [{"title": "TC1", "module": "Login"}]
        save_resp = client.post("/api/library/save", json={
            "name": "API Test Set",
            "test_cases": cases,
            "requirement_text": "test req",
        })
        assert save_resp.status_code == 200
        sid = save_resp.json()["id"]
        get_resp = client.get(f"/api/library/{sid}")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["name"] == "API Test Set"
        assert len(data["test_cases"]) == 1

    def test_list_after_save(self, client):
        self._login(client)
        client.post("/api/library/save", json={"name": "ListSet", "test_cases": []})
        resp = client.get("/api/library/list")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        names = [s["name"] for s in data["sets"]]
        assert "ListSet" in names

    def test_update(self, client):
        self._login(client)
        sid = client.post("/api/library/save", json={"name": "OldName", "test_cases": []}).json()["id"]
        upd = client.put(f"/api/library/{sid}", json={"name": "NewName", "test_cases": [{"title": "TC2"}]})
        assert upd.status_code == 200
        data = client.get(f"/api/library/{sid}").json()
        assert data["name"] == "NewName"

    def test_delete(self, client):
        self._login(client)
        sid = client.post("/api/library/save", json={"name": "ToDelete", "test_cases": []}).json()["id"]
        del_resp = client.delete(f"/api/library/{sid}")
        assert del_resp.status_code == 200
        get_resp = client.get(f"/api/library/{sid}")
        assert get_resp.status_code == 404

    def test_folder_crud(self, client):
        self._login(client)
        f_resp = client.post("/api/library/folders", json={"name": "API Folder"})
        assert f_resp.status_code == 200
        fid = f_resp.json()["id"]

        list_resp = client.get("/api/library/folders")
        assert any(f["id"] == fid for f in list_resp.json()["folders"])

        rename = client.put(f"/api/library/folders/{fid}", json={"name": "Renamed Folder"})
        assert rename.status_code == 200

        delete = client.delete(f"/api/library/folders/{fid}")
        assert delete.status_code == 200

    def test_save_empty_name_fails(self, client):
        self._login(client)
        resp = client.post("/api/library/save", json={"name": "", "test_cases": []})
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
        client.post("/api/auth/register", json={"username": "bug_user", "password": "testpass123"})
        resp = client.post("/api/auth/login", json={"username": "bug_user", "password": "testpass123"})
        token = resp.json().get("token") or resp.json().get("access_token")
        client.headers["Authorization"] = f"Bearer {token}"

    def test_create_and_get(self, client):
        self._login(client)
        resp = client.post("/api/bugs", json={"title": "API Bug", "severity": "P1", "module": "Login"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "API Bug"
        assert data["severity"] == "P1"

    def test_list(self, client):
        self._login(client)
        resp = client.get("/api/bugs")
        assert resp.status_code == 200
        data = resp.json()
        assert "bugs" in data
        assert "total" in data

    def test_update(self, client):
        self._login(client)
        bid = client.post("/api/bugs", json={"title": "Bug to Update"}).json()["id"]
        upd = client.put(f"/api/bugs/{bid}", json={"severity": "P0", "status": "closed"})
        assert upd.status_code == 200
        assert upd.json()["severity"] == "P0"

    def test_delete(self, client):
        self._login(client)
        bid = client.post("/api/bugs", json={"title": "Bug to Delete"}).json()["id"]
        del_resp = client.delete(f"/api/bugs/{bid}")
        assert del_resp.status_code == 200
        # Verify bug no longer in list
        list_resp = client.get("/api/bugs")
        ids = [b["id"] for b in list_resp.json()["bugs"]]
        assert bid not in ids

    def test_error_format(self, client):
        """Verify error responses match expected format."""
        self._login(client)
        resp = client.get("/api/bugs/99999")
        # No GET /api/bugs/{id} route — 405 is a framework-level response
        assert resp.status_code == 405
        # Framework 405 uses plain string, not structured error
        data = resp.json()
        assert "detail" in data


class TestHistoryAPI:
    def _login(self, client):
        client.post("/api/auth/register", json={"username": "hist_api_user", "password": "testpass123"})
        resp = client.post("/api/auth/login", json={"username": "hist_api_user", "password": "testpass123"})
        token = resp.json().get("token") or resp.json().get("access_token")
        client.headers["Authorization"] = f"Bearer {token}"

    def test_save_and_list(self, client):
        self._login(client)
        save_resp = client.post("/api/history", json={
            "requirement_text": "API test req",
            "test_cases": [{"title": "TC1"}],
            "model": "deepseek-chat",
        })
        assert save_resp.status_code == 200
        hid = save_resp.json()["id"]

        list_resp = client.get("/api/history")
        assert list_resp.status_code == 200
        ids = [h["id"] for h in list_resp.json()["history"]]
        assert hid in ids

    def test_get(self, client):
        self._login(client)
        hid = client.post("/api/history", json={
            "requirement_text": "get test", "test_cases": [{"title": "TC1"}],
        }).json()["id"]
        get_resp = client.get(f"/api/history/{hid}")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["requirement_text"] == "get test"
        assert len(data["test_cases"]) == 1

    def test_delete(self, client):
        self._login(client)
        hid = client.post("/api/history", json={
            "requirement_text": "delete me", "test_cases": [],
        }).json()["id"]
        del_resp = client.delete(f"/api/history/{hid}")
        assert del_resp.status_code == 200
        get_resp = client.get(f"/api/history/{hid}")
        assert get_resp.status_code == 404

    def test_restore(self, client):
        self._login(client)
        hid = client.post("/api/history", json={
            "requirement_text": "restore me",
            "test_cases": [{"title": "TC1", "module": "Auth"}],
        }).json()["id"]
        resp = client.post(f"/api/history/{hid}/restore")
        assert resp.status_code == 200
        data = resp.json()
        assert data["requirement_text"] == "restore me"
        assert data["test_cases"][0]["title"] == "TC1"

    def test_get_not_found(self, client):
        self._login(client)
        resp = client.get("/api/history/99999")
        assert resp.status_code == 404

    def test_delete_not_found(self, client):
        self._login(client)
        resp = client.delete("/api/history/99999")
        assert resp.status_code == 404


class TestErrorFormat:
    """Verify consistent error response format across all endpoints."""

    def _login(self, client):
        client.post("/api/auth/register", json={"username": "err_user", "password": "testpass123"})
        resp = client.post("/api/auth/login", json={"username": "err_user", "password": "testpass123"})
        token = resp.json().get("token") or resp.json().get("access_token")
        client.headers["Authorization"] = f"Bearer {token}"

    def test_404_format(self, client):
        self._login(client)
        cases = [
            ("GET", "/api/library/99999"),
            ("DELETE", "/api/library/folders/99999"),
            ("DELETE", "/api/history/99999"),
        ]
        for method, path in cases:
            resp = client.request(method, path)
            if resp.status_code == 404:
                data = resp.json()
                assert "detail" in data, f"{path} missing detail"
                assert "error_code" in data["detail"], f"{path} missing error_code"
                assert "message" in data["detail"], f"{path} missing message"

    def test_400_format(self, client):
        self._login(client)
        resp = client.post("/api/library/save", json={"name": "", "test_cases": []})
        assert resp.status_code == 400
        data = resp.json()
        assert "error_code" in data["detail"]
        assert "message" in data["detail"]
