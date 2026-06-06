from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.models import (
    LibrarySaveRequest, LibraryUpdateRequest,
    FolderCreateRequest, FolderRenameRequest, SetMoveRequest,
)
from app.deps import logger, current_user, safe_api_call

router = APIRouter(tags=["library"])


@router.get("/api/library/list")
async def library_list(folder_id: int | None = None, q: str = "",
                       limit: int = 0, offset: int = 0, status: str = "",
                       user: dict = Depends(current_user)):
    from app.services.database import list_sets
    def _list():
        sets, total = list_sets(folder_id, user.get("id", 0), q.strip(), limit, offset, status.strip())
        return {"sets": sets, "total": total, "limit": limit, "offset": offset}
    return safe_api_call(_list, "Failed to list library sets")


@router.get("/api/library/folders")
async def folder_list():
    from app.services.database import get_folder_tree
    return safe_api_call(lambda: {"folders": get_folder_tree()}, "Failed to list folders")


@router.post("/api/library/folders")
async def folder_create(req: FolderCreateRequest):
    from app.services.database import create_folder
    if not req.name.strip():
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Name is required"})
    return safe_api_call(lambda: {"id": create_folder(req.name.strip(), req.parent_id), "message": "Folder created"}, "Failed to create folder")


@router.put("/api/library/folders/{folder_id}")
async def folder_rename(folder_id: int, req: FolderRenameRequest):
    from app.services.database import rename_folder
    if not req.name.strip():
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Name is required"})
    def _rename():
        ok = rename_folder(folder_id, req.name.strip())
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Folder not found"})
        return {"message": "Renamed successfully"}
    return safe_api_call(_rename, "Failed to rename folder")


@router.delete("/api/library/folders/{folder_id}")
async def folder_delete(folder_id: int):
    from app.services.database import delete_folder
    def _delete():
        ok = delete_folder(folder_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Folder not found"})
        return {"message": "Deleted successfully"}
    return safe_api_call(_delete, "Failed to delete folder")


@router.get("/api/library/cases/search")
async def library_cases_search(q: str = "", user: dict = Depends(current_user)):
    from app.services.database import search_library_cases
    return safe_api_call(lambda: {"results": search_library_cases(q, user.get("id", 0))}, "Failed to search library cases")


@router.get("/api/library/{set_id}")
async def library_get(set_id: int, user: dict = Depends(current_user)):
    from app.services.database import get_set
    def _get():
        s = get_set(set_id, user.get("id", 0))
        if s is None:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Set not found"})
        return s
    return safe_api_call(_get, "Failed to get library set")


@router.post("/api/library/save")
async def library_save(req: LibrarySaveRequest, user: dict = Depends(current_user)):
    from app.services.database import save_set
    if not req.name.strip():
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Name is required"})
    return safe_api_call(lambda: {"id": save_set(req.name.strip(), req.test_cases, req.requirement_text, req.folder_id, user.get("id", 0)), "message": "Saved successfully"}, "Failed to save library set")


@router.put("/api/library/{set_id}")
async def library_update(set_id: int, req: LibraryUpdateRequest, user: dict = Depends(current_user)):
    from app.services.database import update_set
    if not req.name.strip():
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Name is required"})
    def _update():
        ok = update_set(set_id, req.name.strip(), req.test_cases, req.requirement_text, user.get("id", 0))
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Set not found"})
        return {"message": "Updated successfully"}
    return safe_api_call(_update, "Failed to update library set")


class SetStatusRequest(BaseModel):
    status: str


@router.put("/api/library/{set_id}/status")
async def library_set_status(set_id: int, req: SetStatusRequest, user: dict = Depends(current_user)):
    from app.services.database import set_set_status
    if req.status not in ("draft", "pending", "approved", "rejected"):
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Invalid status"})
    def _set():
        ok = set_set_status(set_id, user.get("id", 0), req.status)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Set not found"})
        return {"message": "状态已更新"}
    return safe_api_call(_set, "Failed to set status")


@router.delete("/api/library/{set_id}")
async def library_delete(set_id: int, user: dict = Depends(current_user)):
    from app.services.database import delete_set
    def _delete():
        ok = delete_set(set_id, user.get("id", 0))
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Set not found"})
        return {"message": "Deleted successfully"}
    return safe_api_call(_delete, "Failed to delete library set")


@router.put("/api/library/{set_id}/move")
async def library_move(set_id: int, req: SetMoveRequest, user: dict = Depends(current_user)):
    from app.services.database import move_set_to_folder
    def _move():
        ok = move_set_to_folder(set_id, req.folder_id, user.get("id", 0))
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Set not found"})
        return {"message": "Moved successfully"}
    return safe_api_call(_move, "Failed to move library set")


@router.post("/api/library/{set_id}/share")
async def share_set(set_id: int, req: dict, user: dict = Depends(current_user)):
    from app.services.notifications import send_share_request
    from app.services.auth import get_user_by_id, search_users

    target_user = None
    target_user_id = req.get("user_id")
    target_username = req.get("username", "").strip()
    if target_user_id:
        target_user = get_user_by_id(target_user_id)
    elif target_username:
        users = search_users(target_username, 1)
        if users:
            target_user = users[0]
    if not target_user or target_user["id"] == user.get("id"):
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "未找到指定用户"})
    def _share():
        notif_id = send_share_request(set_id, user.get("id", 0), target_user["id"])
        if not notif_id:
            raise HTTPException(status_code=403, detail={"error_code": "forbidden", "message": "你无权共享此集合"})
        # Push real-time notification via WebSocket
        try:
            from app.services.websocket_manager import manager
            import asyncio
            asyncio.ensure_future(manager.send_to_user(target_user["id"], {"type": "notification", "message": "您收到了一个新的共享请求"}))
        except Exception:
            pass
        return {"message": f"已向 {target_user['username']} 发送共享请求"}
    return safe_api_call(_share, "Failed to share set")


@router.delete("/api/library/{set_id}/share/{share_user_id}")
async def revoke_share(set_id: int, share_user_id: int, user: dict = Depends(current_user)):
    from app.services.database import revoke_share as db_revoke
    def _revoke():
        ok = db_revoke(set_id, user.get("id", 0), share_user_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "共享记录不存在"})
        return {"message": "已取消共享"}
    return safe_api_call(_revoke, "Failed to revoke share")


@router.get("/api/library/{set_id}/shares")
async def list_shares(set_id: int, user: dict = Depends(current_user)):
    from app.services.database import list_shares as db_list_shares
    return safe_api_call(lambda: {"shares": db_list_shares(set_id, user.get("id", 0))}, "Failed to list shares")


# ---------------------------------------------------------------------------
# Share Request Notifications
# ---------------------------------------------------------------------------

@router.get("/api/notifications")
async def get_notifications(user: dict = Depends(current_user)):
    from app.services.notifications import list_notifications, get_unread_notification_count
    return safe_api_call(lambda: {"notifications": list_notifications(user.get("id", 0)), "unread_count": get_unread_notification_count(user.get("id", 0))}, "Failed to list notifications")


@router.post("/api/notifications/read")
async def read_notifications(user: dict = Depends(current_user)):
    from app.services.notifications import mark_notifications_read
    return safe_api_call(lambda: mark_notifications_read(user.get("id", 0)) or {"message": "已标记已读"}, "Failed to mark notifications read")


@router.post("/api/notifications/{notif_id}/accept")
async def accept_notification(notif_id: int, req: dict = {}, user: dict = Depends(current_user)):
    from app.services.notifications import accept_share_request, list_notifications
    from app.services.contacts import accept_friend_request

    def _accept():
        notifs = list_notifications(user.get("id", 0))
        notif = next((n for n in notifs if n["id"] == notif_id and n["status"] == "pending"), None)
        if not notif:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "通知不存在或已处理"})
        if notif["type"] == "friend_request":
            if not accept_friend_request(notif_id, user.get("id", 0)):
                raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "请求不存在或已处理"})
            return {"message": "已接受好友请求"}
        else:
            folder_id = req.get("folder_id")
            new_name = req.get("name")
            if not accept_share_request(notif_id, user.get("id", 0), name=new_name, folder_id=folder_id):
                raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "通知不存在或已处理"})
            return {"message": "已接受共享，用例集已复制到你的用例库"}
    return safe_api_call(_accept, "Failed to accept notification")


@router.post("/api/notifications/{notif_id}/decline")
async def decline_notification(notif_id: int, user: dict = Depends(current_user)):
    from app.services.notifications import decline_share_request, list_notifications
    from app.services.contacts import decline_friend_request

    def _decline():
        notifs = list_notifications(user.get("id", 0))
        notif = next((n for n in notifs if n["id"] == notif_id and n["status"] == "pending"), None)
        if not notif:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "通知不存在或已处理"})
        if notif["type"] == "friend_request":
            if not decline_friend_request(notif_id, user.get("id", 0)):
                raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "请求不存在或已处理"})
            return {"message": "已拒绝好友请求"}
        else:
            if not decline_share_request(notif_id, user.get("id", 0)):
                raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "通知不存在或已处理"})
            return {"message": "已拒绝共享请求"}
    return safe_api_call(_decline, "Failed to decline notification")


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------

@router.get("/api/contacts")
async def get_contacts(user: dict = Depends(current_user)):
    from app.services.contacts import list_contacts
    return safe_api_call(lambda: {"contacts": list_contacts(user.get("id", 0))}, "Failed to list contacts")


@router.get("/api/contacts/search")
async def search_contacts(q: str = "", user: dict = Depends(current_user)):
    from app.services.contacts import search_contacts as db_search_contacts
    if not q.strip():
        return {"results": []}
    return safe_api_call(lambda: {"results": db_search_contacts(user.get("id", 0), q.strip())}, "Failed to search contacts")


@router.post("/api/contacts/add")
async def send_friend_request(req: dict, user: dict = Depends(current_user)):
    from app.services.contacts import send_friend_request as db_send_fr

    username = req.get("username", "").strip()
    if not username:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "请输入用户名"})
    def _add():
        result = db_send_fr(user.get("id", 0), username)
        if result == 0:
            raise HTTPException(status_code=400, detail={"error_code": "not_found", "message": "用户不存在"})
        if result == -1:
            raise HTTPException(status_code=400, detail={"error_code": "already_contacts", "message": "已是联系人"})
        if result == -2:
            raise HTTPException(status_code=400, detail={"error_code": "already_requested", "message": "已发送过好友请求，等待对方处理"})
        return {"message": "好友请求已发送"}
    return safe_api_call(_add, "Failed to send friend request")


@router.delete("/api/contacts/{contact_user_id}")
async def remove_contact(contact_user_id: int, user: dict = Depends(current_user)):
    from app.services.contacts import remove_contact as db_remove_contact
    def _remove():
        ok = db_remove_contact(user.get("id", 0), contact_user_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "联系人不存在"})
        return {"message": "已删除联系人"}
    return safe_api_call(_remove, "Failed to remove contact")


# ---------------------------------------------------------------------------
# Outgoing Shares
# ---------------------------------------------------------------------------

@router.get("/api/shared/outgoing")
async def get_outgoing_shares(user: dict = Depends(current_user)):
    from app.services.notifications import list_outgoing_shares
    return safe_api_call(lambda: {"shares": list_outgoing_shares(user.get("id", 0))}, "Failed to list outgoing shares")


@router.delete("/api/shared/outgoing/{notif_id}")
async def cancel_outgoing_share(notif_id: int, user: dict = Depends(current_user)):
    from app.services.notifications import cancel_share_request
    def _cancel():
        ok = cancel_share_request(notif_id, user.get("id", 0))
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "共享请求不存在或已处理"})
        return {"message": "已取消共享请求"}
    return safe_api_call(_cancel, "Failed to cancel share request")
