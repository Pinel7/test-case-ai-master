from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.models import QueryResponse, QueryRequest
from app.deps import logger

router = APIRouter(tags=["sql_query"])


@router.post("/api/query", response_model=QueryResponse)
async def execute_sql_query(request: QueryRequest):
    from app.services.sql_runner import execute_query as run_query
    import time

    t0 = time.time()
    columns, rows, error = run_query(request.sql)
    elapsed = round((time.time() - t0) * 1000, 1)
    return QueryResponse(
        columns=columns,
        rows=rows,
        row_count=len(rows) if not error else 0,
        error=error,
        execution_time_ms=elapsed,
    )


@router.get("/api/query/schema")
async def get_query_schema():
    from app.services.sql_runner import get_schema

    return {"tables": get_schema()}


class CsvImportRequest(BaseModel):
    table_name: str
    csv_content: str


class ImportResponse(BaseModel):
    success: bool
    message: str


@router.post("/api/query/import-csv", response_model=ImportResponse)
async def import_csv_endpoint(request: CsvImportRequest):
    from app.services.sql_runner import import_csv

    success, msg = import_csv(request.table_name, request.csv_content)
    return ImportResponse(success=success, message=msg)


@router.delete("/api/query/tables/{table_name}")
async def drop_table_endpoint(table_name: str):
    from app.services.sql_runner import drop_table

    success, msg = drop_table(table_name)
    if success:
        return {"success": True, "message": msg}
    raise HTTPException(status_code=400, detail=msg)
