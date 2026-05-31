"""Tests for app.services.database — folder/set/bug CRUD and sharing."""


class TestFolders:
    def test_create_and_list(self, db):
        fid = db.create_folder("My Folder")
        assert fid > 0
        tree = db.get_folder_tree()
        names = [f["name"] for f in tree]
        assert "My Folder" in names

    def test_create_nested(self, db):
        parent = db.create_folder("Parent")
        child = db.create_folder("Child", parent)
        tree = db.get_folder_tree()
        parent_entry = next(f for f in tree if f["id"] == parent)
        child_entry = next(f for f in tree if f["id"] == child)
        assert parent_entry["parent_id"] is None
        assert child_entry["parent_id"] == parent

    def test_rename(self, db):
        fid = db.create_folder("Old")
        ok = db.rename_folder(fid, "New")
        assert ok
        tree = db.get_folder_tree()
        entry = next(f for f in tree if f["id"] == fid)
        assert entry["name"] == "New"

    def test_delete_cascade_sets(self, db):
        fid = db.create_folder("ToDelete")
        sid = db.save_set("MySet", [{"title": "TC1"}], folder_id=fid, user_id=1)
        ok = db.delete_folder(fid)
        assert ok
        s = db.get_set(sid, user_id=1)
        assert s is not None  # set survives but folder_id becomes NULL
        assert s["folder_id"] is None


class TestSets:
    def test_save_and_get(self, db):
        cases = [{"title": "TC1", "module": "Login"}]
        sid = db.save_set("Test Set", cases, "req text", user_id=1)
        assert sid > 0
        s = db.get_set(sid, user_id=1)
        assert s is not None
        assert s["name"] == "Test Set"
        assert len(s["test_cases"]) == 1
        assert s["test_cases"][0]["title"] == "TC1"

    def test_list_owned(self, db):
        db.save_set("A", [], user_id=1)
        db.save_set("B", [], user_id=1)
        sets = db.list_sets(user_id=1)
        assert len(sets) >= 2
        names = [s["name"] for s in sets]
        assert "A" in names
        assert "B" in names

    def test_list_filters_by_user(self, db):
        db.save_set("Mine", [], user_id=1)
        db.save_set("NotMine", [], user_id=2)
        sets = db.list_sets(user_id=1)
        assert any(s["name"] == "Mine" for s in sets)
        assert not any(s["name"] == "NotMine" for s in sets)

    def test_update(self, db):
        sid = db.save_set("Old", [{"title": "TC1"}], user_id=1)
        ok = db.update_set(sid, "New", [{"title": "TC2"}], user_id=1)
        assert ok
        s = db.get_set(sid, user_id=1)
        assert s["name"] == "New"
        assert s["test_cases"][0]["title"] == "TC2"

    def test_update_wrong_user(self, db):
        sid = db.save_set("Mine", [], user_id=1)
        ok = db.update_set(sid, "Hacked", [], user_id=2)
        assert not ok  # user 2 can't update user 1's set

    def test_delete(self, db):
        sid = db.save_set("ToDelete", [], user_id=1)
        ok = db.delete_set(sid, user_id=1)
        assert ok
        assert db.get_set(sid, user_id=1) is None

    def test_move_to_folder(self, db):
        fid = db.create_folder("Dest")
        sid = db.save_set("Movable", [], user_id=1)
        ok = db.move_set_to_folder(sid, fid, user_id=1)
        assert ok
        s = db.get_set(sid, user_id=1)
        assert s["folder_id"] == fid

    def test_list_by_folder(self, db):
        fid = db.create_folder("F")
        db.save_set("InFolder", [], folder_id=fid, user_id=1)
        db.save_set("Root", [], user_id=1)
        sets = db.list_sets(folder_id=fid, user_id=1)
        names = [s["name"] for s in sets]
        assert "InFolder" in names
        assert "Root" not in names

    def test_list_search(self, db):
        db.save_set("Login Feature", [], user_id=1)
        db.save_set("Logout Feature", [], user_id=1)
        db.save_set("Dashboard", [], user_id=1)
        sets = db.list_sets(user_id=1, q="Log")
        assert all("Log" in s["name"] for s in sets)

    def test_case_count(self, db):
        sid = db.save_set("Counted", [{"title": "A"}, {"title": "B"}], user_id=1)
        s = db.get_set(sid, user_id=1)
        assert s["case_count"] == 2


class TestSharing:
    def test_share_and_list(self, db):
        sid = db.save_set("SharedSet", [], user_id=1)
        ok = db.share_set(sid, shared_by_user_id=1, shared_with_user_id=2)
        assert ok
        # User 2 sees it
        sets = db.list_sets(user_id=2)
        shared = [s for s in sets if not s["owned"]]
        assert len(shared) == 1
        assert shared[0]["name"] == "SharedSet"
        assert shared[0]["shared_by"] is not None

    def test_share_not_owner(self, db):
        sid = db.save_set("Mine", [], user_id=1)
        ok = db.share_set(sid, shared_by_user_id=2, shared_with_user_id=3)
        assert not ok  # user 2 doesn't own the set

    def test_revoke_share(self, db):
        sid = db.save_set("ToRevoke", [], user_id=1)
        db.share_set(sid, 1, 2)
        ok = db.revoke_share(sid, shared_by_user_id=1, shared_with_user_id=2)
        assert ok
        sets = db.list_sets(user_id=2)
        assert not any(not s["owned"] for s in sets)

    def test_list_shares(self, db):
        sid = db.save_set("MultiShare", [], user_id=1)
        db.share_set(sid, 1, 2)
        db.share_set(sid, 1, 3)
        shares = db.list_shares(sid, user_id=1)
        shared_ids = [s["user_id"] for s in shares]
        assert 2 in shared_ids
        assert 3 in shared_ids


class TestBugs:
    def test_create_and_get(self, db):
        bid = db.create_bug("Bug title", user_id=1, severity="P1", module="Login")
        assert bid > 0
        b = db.get_bug(bid)
        assert b["title"] == "Bug title"
        assert b["severity"] == "P1"

    def test_update(self, db):
        bid = db.create_bug("B", user_id=1)
        ok = db.update_bug(bid, severity="P0", status="closed")
        assert ok
        b = db.get_bug(bid)
        assert b["severity"] == "P0"
        assert b["status"] == "closed"

    def test_delete(self, db):
        bid = db.create_bug("B", user_id=1)
        db.delete_bug(bid)
        assert db.get_bug(bid) is None

    def test_list_filters(self, db):
        db.create_bug("Bug A", user_id=1, severity="P1", status="open")
        db.create_bug("Bug B", user_id=1, severity="P2", status="closed")
        db.create_bug("Bug C", user_id=2, severity="P1", status="open")
        # Filter by user
        assert len(db.list_bugs(user_id=1)) == 2
        # Filter by severity
        assert len(db.list_bugs(user_id=1, severity="P1")) == 1
        # Filter by status
        assert len(db.list_bugs(user_id=1, status="closed")) == 1


class TestSearch:
    def test_search_library_cases(self, db):
        cases = [
            {"case_id": "TC-001", "title": "Login Success", "module": "Auth"},
            {"case_id": "TC-002", "title": "Logout", "module": "Auth"},
        ]
        db.save_set("Auth Set", cases, user_id=1)
        results = db.search_library_cases("TC-001", user_id=1)
        assert len(results) == 1
        assert results[0]["case_id"] == "TC-001"
        # Search by title
        results = db.search_library_cases("Logout", user_id=1)
        assert len(results) == 1
        # Search by module
        results = db.search_library_cases("Auth", user_id=1)
        assert len(results) == 2
        # No match
        results = db.search_library_cases("Nonexistent", user_id=1)
        assert len(results) == 0
