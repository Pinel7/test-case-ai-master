"""Tests for app.services.auth — user registration, login, sessions."""


class TestAuth:
    def test_register_and_authenticate(self, auth):
        user = auth.register_user("testuser", "password123")
        assert user["id"] > 0
        assert user["username"] == "testuser"

        authed = auth.authenticate_user("testuser", "password123")
        assert authed is not None
        assert authed["username"] == "testuser"

    def test_wrong_password(self, auth):
        auth.register_user("pwuser", "sekret123")
        assert auth.authenticate_user("pwuser", "wrongpass") is None

    def test_unknown_user(self, auth):
        assert auth.authenticate_user("nobody", "x") is None

    def test_duplicate_username(self, auth):
        auth.register_user("dupuser", "password123")
        try:
            auth.register_user("dupuser", "other456")
            assert False, "Expected ValueError"
        except ValueError as e:
            assert "已存在" in str(e)

    def test_short_username(self, auth):
        try:
            auth.register_user("ab", "password123")
            assert False, "Expected ValueError"
        except ValueError as e:
            assert "至少" in str(e)

    def test_short_password(self, auth):
        try:
            auth.register_user("validuser", "short")
            assert False, "Expected ValueError"
        except ValueError as e:
            assert "至少" in str(e)

    def test_session_create_and_validate(self, auth):
        user = auth.register_user("sessionuser", "password123")
        token = auth.create_session(user["id"])
        assert token is not None and len(token) > 20

        validated = auth.get_user_by_token(token)
        assert validated is not None
        assert validated["id"] == user["id"]

    def test_invalid_token(self, auth):
        assert auth.get_user_by_token("invalid_token_here") is None

    def test_delete_session(self, auth):
        user = auth.register_user("deluser", "password123")
        token = auth.create_session(user["id"])
        auth.delete_session(token)
        assert auth.get_user_by_token(token) is None

    def test_get_user_by_id(self, auth):
        user = auth.register_user("idlookup", "password123")
        found = auth.get_user_by_id(user["id"])
        assert found is not None
        assert found["username"] == "idlookup"

    def test_get_nonexistent_user(self, auth):
        assert auth.get_user_by_id(99999) is None

    def test_search_users(self, auth):
        auth.register_user("alice", "password123")
        auth.register_user("bob", "password123")
        auth.register_user("charlie", "password123")

        results = auth.search_users("ali")
        assert any(u["username"] == "alice" for u in results)

        results = auth.search_users("notfound")
        assert len(results) == 0

    def test_password_hashing_differs(self, auth):
        """Same password gets different hashes due to random salt."""
        u1 = auth.register_user("user_a", "samepassword")
        u2 = auth.register_user("user_b", "samepassword")
        assert u1["id"] != u2["id"]
        # Both should authenticate
        assert auth.authenticate_user("user_a", "samepassword") is not None
        assert auth.authenticate_user("user_b", "samepassword") is not None
