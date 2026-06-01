"""Tests for app.services.notifications — share request notifications."""


class TestShareRequests:
    def test_send_and_list(self, db, auth):
        owner = auth.register_user("owner", "password123")
        recipient = auth.register_user("recip", "password123")
        sid = db.save_set("Shared Set", [{"title": "TC1"}], user_id=owner["id"])
        from app.services.notifications import send_share_request, list_notifications
        nid = send_share_request(sid, owner["id"], recipient["id"])
        assert nid > 0
        notifs = list_notifications(recipient["id"])
        assert any(n["id"] == nid for n in notifs)
        assert any("Shared Set" in n["message"] for n in notifs)

    def test_send_not_owner(self, db, auth):
        owner = auth.register_user("owner2", "password123")
        stranger = auth.register_user("stranger", "password123")
        recipient = auth.register_user("recip2", "password123")
        sid = db.save_set("Not Yours", [], user_id=owner["id"])
        from app.services.notifications import send_share_request
        nid = send_share_request(sid, stranger["id"], recipient["id"])
        assert nid == 0  # not owner → fails

    def test_send_nonexistent_set(self, auth):
        me = auth.register_user("userA", "password123")
        other = auth.register_user("userB", "password123")
        from app.services.notifications import send_share_request
        nid = send_share_request(99999, me["id"], other["id"])
        assert nid == 0


class TestAcceptDecline:
    def test_accept_share(self, db, auth):
        owner = auth.register_user("alice", "password123")
        recipient = auth.register_user("bob", "password123")
        sid = db.save_set("To Share", [{"title": "TC1"}], user_id=owner["id"])
        from app.services.notifications import send_share_request, accept_share_request, list_notifications
        nid = send_share_request(sid, owner["id"], recipient["id"])
        ok = accept_share_request(nid, recipient["id"])
        assert ok
        # Check notification is accepted
        notifs = list_notifications(recipient["id"])
        n = next(n for n in notifs if n["id"] == nid)
        assert n["status"] == "accepted"
        # Check set was copied to recipient
        sets, _ = db.list_sets(user_id=recipient["id"])
        assert any("To Share" in s["name"] for s in sets)

    def test_decline_share(self, db, auth):
        owner = auth.register_user("carol", "password123")
        recipient = auth.register_user("dave", "password123")
        sid = db.save_set("Declined Set", [], user_id=owner["id"])
        from app.services.notifications import send_share_request, decline_share_request, list_notifications
        nid = send_share_request(sid, owner["id"], recipient["id"])
        ok = decline_share_request(nid, recipient["id"])
        assert ok
        notifs = list_notifications(recipient["id"])
        n = next(n for n in notifs if n["id"] == nid)
        assert n["status"] == "declined"

    def test_accept_twice(self, db, auth):
        owner = auth.register_user("eve", "password123")
        recipient = auth.register_user("frank", "password123")
        sid = db.save_set("Double", [], user_id=owner["id"])
        from app.services.notifications import send_share_request, accept_share_request
        nid = send_share_request(sid, owner["id"], recipient["id"])
        assert accept_share_request(nid, recipient["id"])
        assert not accept_share_request(nid, recipient["id"])  # already accepted

    def test_accept_nonexistent(self, auth):
        me = auth.register_user("grace", "password123")
        from app.services.notifications import accept_share_request
        assert not accept_share_request(99999, me["id"])


class TestUnread:
    def test_unread_count(self, db, auth):
        owner = auth.register_user("hank", "password123")
        recipient = auth.register_user("iris", "password123")
        sid = db.save_set("Set", [], user_id=owner["id"])
        from app.services.notifications import send_share_request, get_unread_notification_count
        assert get_unread_notification_count(recipient["id"]) == 0
        send_share_request(sid, owner["id"], recipient["id"])
        assert get_unread_notification_count(recipient["id"]) > 0

    def test_mark_read(self, db, auth):
        owner = auth.register_user("jack", "password123")
        recipient = auth.register_user("kate", "password123")
        sid = db.save_set("Another", [], user_id=owner["id"])
        from app.services.notifications import send_share_request, get_unread_notification_count, mark_notifications_read
        send_share_request(sid, owner["id"], recipient["id"])
        mark_notifications_read(recipient["id"])
        assert get_unread_notification_count(recipient["id"]) == 0
