"""Notification system: share requests and friend requests."""

from app.services.db_base import _get_conn, _lock, now_str


def send_share_request(set_id: int, from_user_id: int, to_user_id: int) -> int:
    """Send a share request notification. Returns notification id (0 on failure)."""
    from app.services.auth import get_user_by_id
    sharer = get_user_by_id(from_user_id)
    sharer_name = sharer["username"] if sharer else f"用户{from_user_id}"
    now = now_str()
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


def accept_share_request(notif_id: int, user_id: int, name: str | None = None, folder_id: int | None = None) -> bool:
    """Accept a share request: copy the set to recipient's library.

    Args:
        notif_id: Notification ID
        user_id: Recipient user ID
        name: Optional custom name (default: original name + " (来自共享)")
        folder_id: Optional target folder ID (default: root / no folder)
    """
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
            now = now_str()
            final_name = name if name else (src["name"] + " (来自共享)")
            conn.execute(
                "INSERT INTO test_case_sets (name, test_cases, requirement_text, folder_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (final_name, src["test_cases"], src["requirement_text"], folder_id, user_id, now, now),
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
                """SELECT n.*, s.name as set_name
                   FROM notifications n
                   LEFT JOIN test_case_sets s ON n.set_id = s.id
                   WHERE n.to_user_id = ?
                   ORDER BY n.created_at DESC""",
                (user_id,),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def list_outgoing_shares(user_id: int) -> list[dict]:
    """List share requests sent by this user (outgoing shares)."""
    from app.services.auth import get_user_by_id
    with _lock:
        conn = _get_conn()
        try:
            rows = conn.execute(
                """SELECT n.*, s.name as set_name
                   FROM notifications n
                   LEFT JOIN test_case_sets s ON n.set_id = s.id
                   WHERE n.from_user_id = ? AND n.type = 'share_request'
                   ORDER BY n.created_at DESC""",
                (user_id,),
            ).fetchall()
            result = []
            for r in rows:
                to_username = f"用户{r['to_user_id']}"
                try:
                    u = get_user_by_id(r["to_user_id"])
                    if u:
                        to_username = u["username"]
                except Exception:
                    pass
                result.append({
                    "id": r["id"],
                    "set_id": r["set_id"],
                    "set_name": r["set_name"] or "未知",
                    "to_username": to_username,
                    "status": r["status"],
                    "created_at": r["created_at"],
                })
            return result
        finally:
            conn.close()


def cancel_share_request(notif_id: int, user_id: int) -> bool:
    """Cancel a pending outgoing share request."""
    with _lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "DELETE FROM notifications WHERE id = ? AND from_user_id = ? AND status = 'pending' AND type = 'share_request'",
                (notif_id, user_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def get_unread_notification_count(user_id: int) -> int:
    with _lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM notifications WHERE to_user_id = ? AND is_read = 0",
                (user_id,),
            ).fetchone()
            return row["cnt"] if row else 0
        finally:
            conn.close()


def mark_notifications_read(user_id: int) -> bool:
    """Mark all notifications as read for the given user."""
    with _lock:
        conn = _get_conn()
        try:
            conn.execute(
                "UPDATE notifications SET is_read = 1 WHERE to_user_id = ? AND is_read = 0",
                (user_id,),
            )
            conn.commit()
            return True
        except Exception:
            return False
        finally:
            conn.close()
