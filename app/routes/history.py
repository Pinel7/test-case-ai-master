"""Generation history — saves/restores past test case generations."""
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.deps import logger, current_user
from app.services.db_base import now_str

router = APIRouter(tags=["history"])


class SaveHistoryRequest(BaseModel):
    requirement_text: str
    test_cases: list[dict]
    model: str = "deepseek-chat"


def _get_conn():
    from app.services.db_base import _get_conn
    return _get_conn()


def _get_history(user_id: int, history_id: int) -> dict | None:
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM generation_history WHERE id = ? AND user_id = ?",
            (history_id, user_id),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


@router.get("/api/history")
async def history_list(user: dict = Depends(current_user)):
    """List generation history for the current user, newest first."""
    uid = user.get("id", 0)
    conn = _get_conn()
    try:
        rows = conn.execute(
            """SELECT id, model, case_count, created_at,
               substr(requirement_text, 1, 200) AS requirement_preview
               FROM generation_history WHERE user_id = ?
               ORDER BY created_at DESC LIMIT 50""",
            (uid,),
        ).fetchall()
        return {"history": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/api/history/{history_id}")
async def history_get(history_id: int, user: dict = Depends(current_user)):
    """Get full history entry by ID."""
    entry = _get_history(user.get("id", 0), history_id)
    if not entry:
        raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "History entry not found"})
    entry["test_cases"] = json.loads(entry.get("test_cases", "[]"))
    return entry


@router.post("/api/history")
async def history_save(data: SaveHistoryRequest, user: dict = Depends(current_user)):
    """Save current generation to history."""
    uid = user.get("id", 0)
    conn = _get_conn()
    try:
        cur = conn.execute(
            "INSERT INTO generation_history (user_id, requirement_text, test_cases, model, case_count, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (uid, data.requirement_text, json.dumps(data.test_cases, ensure_ascii=False),
             data.model, len(data.test_cases), now_str()),
        )
        conn.commit()
        return {"id": cur.lastrowid, "message": "已保存到历史记录"}
    finally:
        conn.close()


@router.delete("/api/history/{history_id}")
async def history_delete(history_id: int, user: dict = Depends(current_user)):
    """Delete a history entry."""
    uid = user.get("id", 0)
    conn = _get_conn()
    try:
        cur = conn.execute(
            "DELETE FROM generation_history WHERE id = ? AND user_id = ?",
            (history_id, uid),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "History entry not found"})
        return {"message": "已删除"}
    finally:
        conn.close()


@router.post("/api/history/{history_id}/restore")
async def history_restore(history_id: int, user: dict = Depends(current_user)):
    """Restore a history entry's test cases into the current workspace."""
    entry = _get_history(user.get("id", 0), history_id)
    if not entry:
        raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "History entry not found"})
    entry["test_cases"] = json.loads(entry.get("test_cases", "[]"))
    return {
        "requirement_text": entry["requirement_text"],
        "test_cases": entry["test_cases"],
        "model": entry["model"],
    }
