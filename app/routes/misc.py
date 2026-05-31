from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from urllib.parse import quote
from pydantic import BaseModel
from app.deps import logger

router = APIRouter(tags=["misc"])


@router.post("/api/export/xlsx")
async def export_xlsx(request: Request):
    data = await request.json()
    test_cases = data.get("test_cases", [])
    filename = data.get("filename", "test_cases")
    if not filename.endswith(".xlsx"):
        filename += ".xlsx"
    from app.services.exporter import export_to_xlsx

    buffer = export_to_xlsx(test_cases)
    safe_filename = quote(filename)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_filename}"},
    )


@router.post("/api/export/csv")
async def export_csv(request: Request):
    data = await request.json()
    test_cases = data.get("test_cases", [])
    filename = data.get("filename", "test_cases")
    if not filename.endswith(".csv"):
        filename += ".csv"
    from app.services.exporter import export_to_csv

    buffer = export_to_csv(test_cases)
    safe_filename = quote(filename)
    return StreamingResponse(
        buffer,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_filename}"},
    )


@router.post("/api/review/batch-update")
async def review_batch_update(req: dict):
    if not req.get("case_indices"):
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "No case indices provided"})
    return {
        "message": "Review update accepted",
        "updated_indices": len(req["case_indices"]),
        "review_status": req.get("review_status"),
        "execution_status": req.get("execution_status"),
    }


class ProxyRequest(BaseModel):
    method: str = "GET"
    url: str
    headers: dict[str, str] = {}
    body: str = ""


@router.post("/api/proxy")
async def api_proxy(request: ProxyRequest):
    import httpx
    import json

    method = request.method.upper()
    if method not in ("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"):
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": f"Unsupported method: {method}"})
    if not request.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": "Invalid URL"})
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            hdrs = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length", "transfer-encoding")}
            content = request.body.encode("utf-8") if request.body else None
            if content and "content-type" not in {k.lower() for k in hdrs}:
                hdrs.setdefault("Content-Type", "application/json")
            resp = await client.request(method, request.url, headers=hdrs, content=content)
            resp_body = resp.text
            resp_headers = dict(resp.headers)
            for k in list(resp_headers.keys()):
                if k.lower() in ("transfer-encoding", "content-encoding", "content-length"):
                    del resp_headers[k]
            return {
                "status": resp.status_code,
                "status_text": resp.reason_phrase,
                "body": resp_body,
                "headers": resp_headers,
            }
    except httpx.TimeoutException:
        return {"error": "Request timed out after 30 seconds"}
    except httpx.RequestError as e:
        return {"error": f"Request failed: {e}"}
