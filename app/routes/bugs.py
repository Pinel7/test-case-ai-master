from fastapi import APIRouter, Depends, HTTPException
from app.models import BugCreateRequest, BugUpdateRequest, BugResponse
from app.deps import logger, current_user

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
    user: dict = Depends(current_user),
):
    from app.services.database import list_bugs

    try:
        items = list_bugs(user.get("id", 0), status, severity, q)
        return {"bugs": [BugResponse(**b) for b in items]}
    except Exception as e:
        logger.exception("Failed to list bugs")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.post("/api/bugs", response_model=BugResponse)
async def bug_create(req: BugCreateRequest, user: dict = Depends(current_user)):
    from app.services.database import create_bug

    try:
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
        b = get_bug_or_404(bid)
        return BugResponse(**b)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": str(e)})
    except Exception as e:
        logger.exception("Failed to create bug")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.put("/api/bugs/{bug_id}", response_model=BugResponse)
async def bug_update(bug_id: int, req: BugUpdateRequest, user: dict = Depends(current_user)):
    from app.services.database import update_bug

    try:
        updates = req.model_dump(exclude_none=True)
        if not updates:
            b = get_bug_or_404(bug_id)
            return BugResponse(**b)
        ok = update_bug(bug_id, **updates)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Bug not found"})
        b = get_bug_or_404(bug_id)
        return BugResponse(**b)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update bug")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})


@router.delete("/api/bugs/{bug_id}")
async def bug_delete(bug_id: int, user: dict = Depends(current_user)):
    from app.services.database import delete_bug

    try:
        ok = delete_bug(bug_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error_code": "not_found", "message": "Bug not found"})
        return {"message": "Bug deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to delete bug")
        raise HTTPException(status_code=500, detail={"error_code": "db_error", "message": str(e)})
