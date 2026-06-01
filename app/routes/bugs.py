from fastapi import APIRouter, Depends, HTTPException
from app.models import BugCreateRequest, BugUpdateRequest, BugResponse
from app.deps import logger, current_user, safe_api_call

router = APIRouter(tags=["bugs"])


def get_bug_or_404(bug_id: int) -> dict:
    from app.services.database import get_bug
    b = get_bug(bug_id)
    if not b:
        raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Bug not found"})
    return b


@router.get("/api/bugs")
async def bug_list(
    status: str = "",
    severity: str = "",
    q: str = "",
    limit: int = 0,
    offset: int = 0,
    user: dict = Depends(current_user),
):
    from app.services.database import list_bugs

    def _list():
        bugs, total = list_bugs(user.get("id", 0), status, severity, q, limit, offset)
        return {"bugs": [BugResponse(**b) for b in bugs], "total": total, "limit": limit, "offset": offset}
    return safe_api_call(_list, "Failed to list bugs")


@router.post("/api/bugs", response_model=BugResponse)
async def bug_create(req: BugCreateRequest, user: dict = Depends(current_user)):
    from app.services.database import create_bug

    def _create():
        bid = create_bug(
            title=req.title,
            user_id=user.get("id", 0),
            description=req.description,
            severity=req.severity,
            status=req.status,
            module=req.module,
            steps=req.steps,
            expected_result=req.expected_result,
            actual_result=req.actual_result,
            tags=req.tags,
            related_case_id=req.related_case_id,
        )
        return BugResponse(**get_bug_or_404(bid))
    return safe_api_call(_create, "Failed to create bug")


@router.put("/api/bugs/{bug_id}", response_model=BugResponse)
async def bug_update(bug_id: int, req: BugUpdateRequest, user: dict = Depends(current_user)):
    from app.services.database import update_bug

    def _update():
        updates = req.model_dump(exclude_none=True)
        if not updates:
            return BugResponse(**get_bug_or_404(bug_id))
        ok = update_bug(bug_id, **updates)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Bug not found"})
        return BugResponse(**get_bug_or_404(bug_id))
    return safe_api_call(_update, "Failed to update bug")


@router.delete("/api/bugs/{bug_id}")
async def bug_delete(bug_id: int, user: dict = Depends(current_user)):
    from app.services.database import delete_bug

    def _delete():
        ok = delete_bug(bug_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Bug not found"})
        return {"message": "Bug deleted"}
    return safe_api_call(_delete, "Failed to delete bug")
