"""Contact management with invitation-based friend requests."""

from app.services.db_base import _get_conn, _lock, now_str


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
    now = now_str()
    with _lock:
        conn = _get_conn()
        try:
            existing = conn.execute(
                "SELECT id FROM contacts WHERE user_id = ? AND contact_user_id = ?",
                (from_user_id, to_user["id"]),
            ).fetchone()
            if existing:
                return -1  # already contacts
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
    from app.services.auth import get_user_by_id
    with _lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT * FROM notifications WHERE id = ? AND to_user_id = ? AND type = 'friend_request' AND status = 'pending'",
                (notif_id, user_id),
            ).fetchone()
            if not row:
                return False
            now = now_str()
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
            # Notify the original sender that the request was accepted
            accepter = get_user_by_id(user_id)
            accepter_name = accepter["username"] if accepter else f"用户{user_id}"
            conn.execute(
                """INSERT INTO notifications (from_user_id, to_user_id, set_id, type, status, message, created_at)
                   VALUES (?, ?, 0, 'friend_request', 'accepted', ?, ?)""",
                (user_id, from_uid, f"{accepter_name} 已接受你的好友请求", now),
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


def search_contacts(user_id: int, q: str) -> list[dict]:
    """Search contacts by username keyword."""
    from app.services.auth import get_user_by_id
    q_lower = q.lower()
    result = []
    for c in list_contacts(user_id):
        if q_lower in c["username"].lower():
            result.append({"id": c["id"], "username": c["username"]})
    return result
