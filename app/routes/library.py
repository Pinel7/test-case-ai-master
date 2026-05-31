from fastapi import APIRouter, Depends, HTTPException
from app.models import (
    LibrarySaveRequest, LibraryUpdateRequest,
    FolderCreateRequest, FolderRenameRequest, SetMoveRequest,
)
from app.deps import logger, current_user

router = APIRouter(tags=["library"])


@router.get("/api/library/list")
async def library_list(folder_id: int | None = None, q: str = "", user: dict = Depends(current_user)):
    from app.services.database import list_sets

    try:
        return {"sets": list_sets(folder_id, user.get("id", 0), q.strip())}
    except Exception as e:
        logger.exception("Failed to list library sets")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.get("/api/library/folders")
async def folder_list():
    from app.services.database import get_folder_tree

    try:
        return {"folders": get_folder_tree()}
    except Exception as e:
        logger.exception("Failed to list folders")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.post("/api/library/folders")
async def folder_create(req: FolderCreateRequest):
    from app.services.database import create_folder

    try:
        if not req.name.strip():
            raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Name is required"})
        fid = create_folder(req.name.strip(), req.parent_id)
        return {"id": fid, "message": "Folder created"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to create folder")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.put("/api/library/folders/{folder_id}")
async def folder_rename(folder_id: int, req: FolderRenameRequest):
    from app.services.database import rename_folder

    try:
        if not req.name.strip():
            raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Name is required"})
        ok = rename_folder(folder_id, req.name.strip())
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Folder not found"})
        return {"message": "Renamed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to rename folder")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.delete("/api/library/folders/{folder_id}")
async def folder_delete(folder_id: int):
    from app.services.database import delete_folder

    try:
        ok = delete_folder(folder_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Folder not found"})
        return {"message": "Deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to delete folder")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.get("/api/library/cases/search")
async def library_cases_search(q: str = "", user: dict = Depends(current_user)):
    from app.services.database import search_library_cases

    try:
        return {"results": search_library_cases(q, user.get("id", 0))}
    except Exception as e:
        logger.exception("Failed to search library cases")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.get("/api/library/{set_id}")
async def library_get(set_id: int, user: dict = Depends(current_user)):
    from app.services.database import get_set

    try:
        s = get_set(set_id, user.get("id", 0))
        if s is None:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Set not found"})
        return s
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get library set")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.post("/api/library/save")
async def library_save(req: LibrarySaveRequest, user: dict = Depends(current_user)):
    from app.services.database import save_set

    try:
        if not req.name.strip():
            raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Name is required"})
        set_id = save_set(req.name.strip(), req.test_cases, req.requirement_text, req.folder_id, user.get("id", 0))
        return {"id": set_id, "message": "Saved successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to save library set")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.put("/api/library/{set_id}")
async def library_update(set_id: int, req: LibraryUpdateRequest, user: dict = Depends(current_user)):
    from app.services.database import update_set

    try:
        if not req.name.strip():
            raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Name is required"})
        ok = update_set(set_id, req.name.strip(), req.test_cases, req.requirement_text, user.get("id", 0))
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Set not found"})
        return {"message": "Updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update library set")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.delete("/api/library/{set_id}")
async def library_delete(set_id: int, user: dict = Depends(current_user)):
    from app.services.database import delete_set

    try:
        ok = delete_set(set_id, user.get("id", 0))
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Set not found"})
        return {"message": "Deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to delete library set")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.put("/api/library/{set_id}/move")
async def library_move(set_id: int, req: SetMoveRequest, user: dict = Depends(current_user)):
    from app.services.database import move_set_to_folder

    try:
        ok = move_set_to_folder(set_id, req.folder_id, user.get("id", 0))
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Set not found"})
        return {"message": "Moved successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to move library set")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.post("/api/library/{set_id}/share")
async def share_set(set_id: int, req: dict, user: dict = Depends(current_user)):
    from app.services.database import send_share_request
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
    try:
        notif_id = send_share_request(set_id, user.get("id", 0), target_user["id"])
        if not notif_id:
            raise HTTPException(status_code=403, detail={"error_code": "forbidden", "message": "你无权共享此集合"})
        return {"message": f"已向 {target_user['username']} 发送共享请求"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to share set")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.delete("/api/library/{set_id}/share/{share_user_id}")
async def revoke_share(set_id: int, share_user_id: int, user: dict = Depends(current_user)):
    from app.services.database import revoke_share as db_revoke

    try:
        ok = db_revoke(set_id, user.get("id", 0), share_user_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "共享记录不存在"})
        return {"message": "已取消共享"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to revoke share")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.get("/api/library/{set_id}/shares")
async def list_shares(set_id: int, user: dict = Depends(current_user)):
    from app.services.database import list_shares as db_list_shares

    try:
        shares = db_list_shares(set_id, user.get("id", 0))
        return {"shares": shares}
    except Exception as e:
        logger.exception("Failed to list shares")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


# ---------------------------------------------------------------------------
# Share Request Notifications
# ---------------------------------------------------------------------------

@router.get("/api/notifications")
async def get_notifications(user: dict = Depends(current_user)):
    from app.services.database import list_notifications, get_unread_notification_count

    try:
        notifs = list_notifications(user.get("id", 0))
        unread = get_unread_notification_count(user.get("id", 0))
        return {"notifications": notifs, "unread_count": unread}
    except Exception as e:
        logger.exception("Failed to list notifications")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.post("/api/notifications/{notif_id}/accept")
async def accept_notification(notif_id: int, user: dict = Depends(current_user)):
    from app.services.database import accept_share_request, accept_friend_request, list_notifications

    try:
        # Determine notification type
        notifs = list_notifications(user.get("id", 0))
        notif = next((n for n in notifs if n["id"] == notif_id and n["status"] == "pending"), None)
        if not notif:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "通知不存在或已处理"})
        if notif["type"] == "friend_request":
            ok = accept_friend_request(notif_id, user.get("id", 0))
            if not ok:
                raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "请求不存在或已处理"})
            return {"message": "已接受好友请求"}
        else:
            ok = accept_share_request(notif_id, user.get("id", 0))
            if not ok:
                raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "通知不存在或已处理"})
            return {"message": "已接受共享，用例集已复制到你的用例库"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to accept notification")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.post("/api/notifications/{notif_id}/decline")
async def decline_notification(notif_id: int, user: dict = Depends(current_user)):
    from app.services.database import decline_share_request, decline_friend_request, list_notifications

    try:
        # Determine notification type
        notifs = list_notifications(user.get("id", 0))
        notif = next((n for n in notifs if n["id"] == notif_id and n["status"] == "pending"), None)
        if not notif:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "通知不存在或已处理"})
        if notif["type"] == "friend_request":
            ok = decline_friend_request(notif_id, user.get("id", 0))
            if not ok:
                raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "请求不存在或已处理"})
            return {"message": "已拒绝好友请求"}
        else:
            ok = decline_share_request(notif_id, user.get("id", 0))
            if not ok:
                raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "通知不存在或已处理"})
            return {"message": "已拒绝共享请求"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to decline notification")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------

@router.get("/api/contacts")
async def get_contacts(user: dict = Depends(current_user)):
    from app.services.database import list_contacts

    try:
        contacts = list_contacts(user.get("id", 0))
        return {"contacts": contacts}
    except Exception as e:
        logger.exception("Failed to list contacts")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.post("/api/contacts/add")
async def send_friend_request(req: dict, user: dict = Depends(current_user)):
    from app.services.database import send_friend_request as db_send_fr

    username = req.get("username", "").strip()
    if not username:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "请输入用户名"})
    try:
        result = db_send_fr(user.get("id", 0), username)
        if result == 0:
            raise HTTPException(status_code=400, detail={"error_code": "not_found", "message": "用户不存在"})
        if result == -1:
            raise HTTPException(status_code=400, detail={"error_code": "already_contacts", "message": "已是联系人"})
        if result == -2:
            raise HTTPException(status_code=400, detail={"error_code": "already_requested", "message": "已发送过好友请求，等待对方处理"})
        return {"message": "好友请求已发送"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to send friend request")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.delete("/api/contacts/{contact_user_id}")
async def remove_contact(contact_user_id: int, user: dict = Depends(current_user)):
    from app.services.database import remove_contact as db_remove_contact

    try:
        ok = db_remove_contact(user.get("id", 0), contact_user_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "联系人不存在"})
        return {"message": "已删除联系人"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to remove contact")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})
