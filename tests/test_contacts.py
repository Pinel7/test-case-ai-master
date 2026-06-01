"""Tests for app.services.contacts — friend request flow and contact management."""

import pytest


class TestFriendRequests:
    def test_send_friend_request(self, auth):
        me = auth.register_user("alice", "password123")
        other = auth.register_user("bob", "password123")
        from app.services.contacts import send_friend_request
        nid = send_friend_request(me["id"], "bob")
        assert nid > 0  # returns notification id

    def test_send_to_nonexistent(self, auth):
        me = auth.register_user("charlie", "password123")
        from app.services.contacts import send_friend_request
        nid = send_friend_request(me["id"], "nobody")
        assert nid == 0

    def test_send_to_self(self, auth):
        me = auth.register_user("dave", "password123")
        from app.services.contacts import send_friend_request
        nid = send_friend_request(me["id"], "dave")
        assert nid == 0

    def test_duplicate_request(self, auth):
        me = auth.register_user("eve", "password123")
        other = auth.register_user("frank", "password123")
        from app.services.contacts import send_friend_request
        nid1 = send_friend_request(me["id"], "frank")
        assert nid1 > 0
        nid2 = send_friend_request(me["id"], "frank")
        assert nid2 == -2  # already requested


class TestAcceptDecline:
    def test_accept_friend_request(self, auth):
        me = auth.register_user("grace", "password123")
        other = auth.register_user("heidi", "password123")
        from app.services.contacts import send_friend_request, accept_friend_request
        nid = send_friend_request(me["id"], "heidi")
        ok = accept_friend_request(nid, other["id"])
        assert ok

    def test_accept_creates_contacts(self, auth):
        me = auth.register_user("ivan", "password123")
        other = auth.register_user("judy", "password123")
        from app.services.contacts import send_friend_request, accept_friend_request, list_contacts
        nid = send_friend_request(me["id"], "judy")
        accept_friend_request(nid, other["id"])
        # Both users should see each other
        me_contacts = list_contacts(me["id"])
        other_contacts = list_contacts(other["id"])
        assert any(c["username"] == "judy" for c in me_contacts)
        assert any(c["username"] == "ivan" for c in other_contacts)

    def test_decline_friend_request(self, auth):
        me = auth.register_user("karl", "password123")
        other = auth.register_user("lisa", "password123")
        from app.services.contacts import send_friend_request, decline_friend_request, list_contacts
        nid = send_friend_request(me["id"], "lisa")
        ok = decline_friend_request(nid, other["id"])
        assert ok
        # No contacts created
        assert len(list_contacts(me["id"])) == 0

    def test_accept_nonexistent_notification(self, auth):
        me = auth.register_user("mallory", "password123")
        from app.services.contacts import accept_friend_request
        ok = accept_friend_request(99999, me["id"])
        assert not ok

    def test_decline_nonexistent_notification(self, auth):
        me = auth.register_user("nina", "password123")
        from app.services.contacts import decline_friend_request
        ok = decline_friend_request(99999, me["id"])
        assert not ok


class TestContacts:
    def test_remove_contact(self, auth):
        me = auth.register_user("oscar", "password123")
        other = auth.register_user("peggy", "password123")
        from app.services.contacts import send_friend_request, accept_friend_request, remove_contact, list_contacts
        nid = send_friend_request(me["id"], "peggy")
        accept_friend_request(nid, other["id"])
        ok = remove_contact(me["id"], other["id"])
        assert ok
        # Bidirectional deletion
        assert len(list_contacts(me["id"])) == 0
        assert len(list_contacts(other["id"])) == 0

    def test_list_contacts(self, auth):
        me = auth.register_user("quentin", "password123")
        other1 = auth.register_user("rupert", "password123")
        other2 = auth.register_user("sybil", "password123")
        from app.services.contacts import send_friend_request, accept_friend_request, list_contacts
        nid1 = send_friend_request(me["id"], "rupert")
        accept_friend_request(nid1, other1["id"])
        nid2 = send_friend_request(me["id"], "sybil")
        accept_friend_request(nid2, other2["id"])
        contacts = list_contacts(me["id"])
        assert len(contacts) == 2
        usernames = [c["username"] for c in contacts]
        assert "rupert" in usernames
        assert "sybil" in usernames

    def test_empty_contacts(self, auth):
        me = auth.register_user("trudy", "password123")
        from app.services.contacts import list_contacts
        assert list_contacts(me["id"]) == []

    def test_search_contacts(self, auth):
        me = auth.register_user("ursula", "password123")
        other = auth.register_user("victor", "password123")
        from app.services.contacts import send_friend_request, accept_friend_request, search_contacts
        nid = send_friend_request(me["id"], "victor")
        accept_friend_request(nid, other["id"])
        results = search_contacts(me["id"], "vict")
        assert len(results) >= 1
        results = search_contacts(me["id"], "nonexistent")
        assert len(results) == 0
