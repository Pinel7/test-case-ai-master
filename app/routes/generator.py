import asyncio
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.models import (
    GenerationRequest, GenerationResponse,
    PolishRequest, PolishResponse,
    RtmRequest, RtmResponse,
    ScriptRequest, ScriptResponse,
)
from app.deps import logger

router = APIRouter(tags=["generation"])


@router.post("/api/generate/stream")
async def generate_stream(request: GenerationRequest):
    from app.services.generator import generate_test_cases

    async def event_stream():
        yield "data: " + json.dumps({"type": "status", "message": "正在分析需求文档结构..."}) + "\n\n"
        await asyncio.sleep(0.5)
        yield "data: " + json.dumps({"type": "status", "message": "正在提取关键业务场景..."}) + "\n\n"
        try:
            cases, warnings, usage = await generate_test_cases(
                requirement_text=request.requirement_text,
                api_key=request.api_key,
                model=request.model,
                fields=request.fields,
                case_count=request.case_count,
            )
            yield "data: " + json.dumps({
                "type": "complete",
                "test_cases": [c.model_dump() for c in cases],
                "warnings": warnings,
                "usage": usage,
            }, ensure_ascii=False) + "\n\n"
        except ValueError as e:
            yield "data: " + json.dumps({"type": "error", "error_code": "invalid_request", "message": str(e)}) + "\n\n"
        except RuntimeError as e:
            yield "data: " + json.dumps({"type": "error", "error_code": "generation_failed", "message": str(e)}) + "\n\n"
        except Exception as e:
            yield "data: " + json.dumps({"type": "error", "error_code": "internal_error", "message": str(e)}) + "\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/api/generate", response_model=GenerationResponse)
async def generate(request: GenerationRequest):
    from app.services.generator import generate_test_cases

    try:
        cases, warnings, usage = await generate_test_cases(
            requirement_text=request.requirement_text,
            api_key=request.api_key,
            model=request.model,
            fields=request.fields,
            case_count=request.case_count,
        )
        return GenerationResponse(test_cases=cases, warnings=warnings, usage=usage)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": str(e)})
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail={"error_code": "generation_failed", "message": str(e)})


@router.post("/api/polish", response_model=PolishResponse)
async def polish(request: PolishRequest):
    from app.services.generator import polish_requirement

    try:
        polished, usage = await polish_requirement(
            requirement_text=request.requirement_text,
            model=request.model,
            api_key=request.api_key,
        )
        return PolishResponse(polished_text=polished, usage=usage)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": str(e)})
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail={"error_code": "polish_failed", "message": str(e)})


@router.post("/api/rtm/generate", response_model=RtmResponse)
async def generate_rtm(request: RtmRequest):
    from app.services.generator import generate_rtm as rtm_service

    try:
        items, usage = await rtm_service(
            requirement_text=request.requirement_text,
            test_cases=request.test_cases,
            model=request.model,
            api_key=request.api_key,
        )
        total = len(items)
        covered = sum(1 for i in items if i.get("coverage_status") == "covered")
        partial = sum(1 for i in items if i.get("coverage_status") == "partial")
        uncovered = sum(1 for i in items if i.get("coverage_status") == "uncovered")
        rate = round((covered + partial * 0.5) / total * 100, 1) if total > 0 else 0.0
        return RtmResponse(
            items=items,
            coverage_stats={
                "total_items": total,
                "covered": covered,
                "partial": partial,
                "uncovered": uncovered,
                "coverage_rate": rate,
            },
            usage=usage,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": str(e)})
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail={"error_code": "rtm_failed", "message": str(e)})


@router.post("/api/generate-script", response_model=ScriptResponse)
async def generate_script(request: ScriptRequest):
    from app.services.generator import generate_scripts

    try:
        scripts, usage = await generate_scripts(
            test_cases=request.test_cases,
            model=request.model,
            api_key=request.api_key,
        )
        return ScriptResponse(scripts=scripts, usage=usage)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_request", "message": str(e)})
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail={"error_code": "script_generation_failed", "message": str(e)})
