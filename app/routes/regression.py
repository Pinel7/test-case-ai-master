"""Regression test scope analysis — pick changed modules, get recommended regression scope."""

import json
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.deps import current_user
from app.services.db_base import _get_conn

router = APIRouter()


class AnalyzeRequest(BaseModel):
    modules: list[str]


@router.get("/api/regression/modules")
async def get_modules(user: dict = Depends(current_user)):
    """Get all distinct module names from the current user's test case library."""
    uid = user.get("id", 0)
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT test_cases FROM test_case_sets WHERE user_id = ?",
            (uid,),
        ).fetchall()

        modules: set[str] = set()
        for r in rows:
            try:
                cases = json.loads(r["test_cases"])
                for c in cases:
                    m = (c.get("module") or "").strip()
                    if m:
                        modules.add(m)
            except (json.JSONDecodeError, TypeError):
                continue

        return {"modules": sorted(modules)}
    finally:
        conn.close()


@router.post("/api/regression/analyze")
async def analyze_regression(req: AnalyzeRequest, user: dict = Depends(current_user)):
    """Given selected modules, find matching test cases grouped by priority."""
    uid = user.get("id", 0)
    selected = [m.strip().lower() for m in req.modules if m.strip()]
    if not selected:
        return {"sets": [], "summary": {"total": 0, "groups": {}, "estimated_hours": 0}}

    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT id, name, test_cases FROM test_case_sets WHERE user_id = ?",
            (uid,),
        ).fetchall()

        matched_sets: list[dict] = []
        all_matched: list[dict] = []
        seen: set[str] = set()

        for r in rows:
            try:
                cases = json.loads(r["test_cases"])
            except (json.JSONDecodeError, TypeError):
                continue

            set_matches = []
            for c in cases:
                m = (c.get("module") or "").strip().lower()
                if m in selected:
                    dedup_key = f"{r['id']}_{c.get('case_id', '')}"
                    if dedup_key not in seen:
                        seen.add(dedup_key)
                        set_matches.append(c)
                        all_matched.append(c)

            if set_matches:
                matched_sets.append({
                    "set_id": r["id"],
                    "set_name": r["name"],
                    "count": len(set_matches),
                    "cases": set_matches,
                })

        # Group by priority
        groups: dict[str, int] = {}
        for c in all_matched:
            p = c.get("priority", "P3") or "P3"
            groups[p] = groups.get(p, 0) + 1

        # Estimate: ~3 min per P0, ~5 min per P1, ~2 min per P2/P3
        time_map = {"P0": 3, "P1": 5, "P2": 2, "P3": 2}
        total_minutes = sum(
            count * time_map.get(p, 2) for p, count in groups.items()
        )

        return {
            "sets": matched_sets,
            "summary": {
                "total": len(all_matched),
                "groups": groups,
                "estimated_hours": round(total_minutes / 60, 1),
            },
        }
    finally:
        conn.close()
