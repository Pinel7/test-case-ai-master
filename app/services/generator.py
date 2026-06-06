"""Core test case generation supporting both DeepSeek and Anthropic APIs."""

import os
import json
import hashlib
import logging
import asyncio
import time
from dotenv import load_dotenv
from app.models import TestCase

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

MAX_RETRIES = 2
RETRY_DELAY = 2  # seconds

# Per-1K-token pricing in USD (approximate, update as models change)
MODEL_PRICING = {
    "deepseek-chat":                {"input": 0.00027,  "output": 0.00110},
    "deepseek-reasoner":            {"input": 0.00055,  "output": 0.00219},
    "claude-sonnet-4-20250514":     {"input": 0.00300,  "output": 0.01500},
    "claude-opus-4-20250514":       {"input": 0.01500,  "output": 0.07500},
    "claude-haiku-4-20250514":      {"input": 0.00025,  "output": 0.00125},
}

def _compute_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Approximate cost in USD from token counts and model pricing."""
    pricing = MODEL_PRICING.get(model, {"input": 0.001, "output": 0.002})
    return (input_tokens / 1000) * pricing["input"] + (output_tokens / 1000) * pricing["output"]

# In-memory LLM response cache: {cache_key: (expires_at, result)}
_cache: dict[str, tuple[float, tuple]] = {}
_CACHE_TTL = 3600  # 1 hour


def _cache_key(*args, **kwargs) -> str:
    """Generate a cache key from args/kwargs for LLM response caching."""
    raw = json.dumps((args, sorted(kwargs.items())), sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def _cache_get(key: str):
    entry = _cache.get(key)
    if entry and entry[0] > time.time():
        return entry[1]
    _cache.pop(key, None)
    return None


def _cache_set(key: str, value: tuple):
    _cache[key] = (time.time() + _CACHE_TTL, value)

def _get_deepseek_client(api_key: str, base_url: str | None = None):
    from openai import AsyncOpenAI
    return AsyncOpenAI(
        api_key=api_key,
        base_url=base_url or "https://api.deepseek.com",
        timeout=30,
        max_retries=0,
    )


def _get_anthropic_client(api_key: str, base_url: str | None = None):
    from anthropic import AsyncAnthropic
    kwargs = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return AsyncAnthropic(**kwargs)

SYSTEM_PROMPT = """You are a senior QA engineer with deep expertise in software testing methodology. Your task is to analyze the provided requirement document and produce comprehensive, production-quality test cases.

## Testing Methodology — Apply ALL relevant techniques below (perform internally, do not output)

For EACH functional area in the requirement, systematically apply these testing techniques:

### 1. Equivalence Partitioning (等价类划分)
- Divide all possible inputs into valid and invalid equivalence classes
- Select ONE representative from each class (not multiple from the same class)
- Cover: valid input classes, invalid input classes, null/empty classes
- Apply to: input fields, API parameters, data formats, file types

### 2. Boundary Value Analysis (边界值分析)
- For each equivalence class boundary, test: the boundary value itself, value just below boundary, value just above boundary
- Apply to: numeric ranges, string length limits, list sizes, time/duration thresholds, pagination
- Examples: maxLength-1, maxLength, maxLength+1; minimum, minimum+1, maximum, maximum-1

### 3. Decision Table Testing (判定表/因果图)
- For business rules with multiple conditions (2+), construct a decision table
- Cover: all combinations of true/false for each condition, or use pairwise if >4 conditions
- Identify: impossible combinations, default rules, rule conflicts
- Apply to: approval workflows, discount/pricing rules, permission/role logic, multi-condition branching

### 4. State Transition Testing (状态转换)
- Identify all valid states and transitions between them
- Test: each valid transition, invalid/forbidden transitions, state entry/exit events
- Apply to: order lifecycle (pending→paid→shipped→delivered→cancelled), user session states, workflow approvals

### 5. Error Guessing (错误推测法)
- Based on common defect patterns, test for: SQL injection, XSS, special characters, Unicode, extremely long inputs, rapid repeated submissions, concurrent access, session expiry, network timeout, file upload limits
- Apply to: text inputs (try <script>, ', ", %, \\), file uploads (try empty file, oversized, wrong format), API calls (try missing fields, extra fields, wrong types)

### 6. Scenario / Use Case Testing (场景法)
- Identify end-to-end user journeys that span multiple functions
- Test: primary success scenario, alternate scenarios, exception scenarios
- Connect related test cases to form complete user workflows

### 7. Consistency & Cross-Module Check
- Check if this feature interacts with other modules (e.g., login affects session management, order affects inventory)
- Include test cases that verify cross-module behavior
- Flag implicit dependencies that the requirement does not mention

When choosing test types, prefer 边界测试 and 异常测试 for areas with clear input rules, 场景测试 for complex workflows, and 判定表 for business logic with multiple conditions.

## Output Instructions
You MUST call the `create_test_cases` function with a JSON array of test case objects. Do NOT output test cases as text — use the function.

## Field Quality Standards
- **case_id**: Sequential: TC-001, TC-002, ..., TC-NNN
- **module**: 三级模块名称. Extract meaningful module names from the requirement context. Examples: "用户认证", "支付处理", "搜索功能", "API限流", "密码重置"
- **sub_module**: 子模块名称. More granular subdivision of the module, e.g. under "用户认证" you might have "手机验证码登录", "账号锁定"
- **title**: 用例标题. Start with one of: 验证 / 校验 / 确认 / 测试. Be specific enough to understand without reading other fields.
- **preconditions**: 前置条件. Each condition MUST start with "1. ", "2. ", "3. ", etc. separated by \n. Include specific data setup, authentication state, system state. Example: "1. 用户以管理员身份登录系统。\n2. 系统中已存在至少一条用户记录。\n3. 浏览器已打开 /admin 页面。" If no setup needed, write "1. 无特殊前置条件。"
- **steps**: 测试步骤. Each step starts with "1. ", "2. ", etc. Steps MUST be concrete actions: "在邮箱输入框中输入'test@example.com'" NOT "输入邮箱". Include specific test data values.
- **expected_result**: 预期结果. Each expected outcome MUST start with "1. ", "2. ", "3. ", etc. separated by \n. Describe OBSERVABLE state changes, UI messages, data changes, or API responses in order. Example: "1. 页面顶部显示绿色成功提示'订单 #12345 已确认'。\n2. 页面自动跳转至 /orders 列表页。\n3. 订单状态列显示'已确认'。" NOT "订单已确认。"
- **keywords**: 关键字/标签. Comma-separated keywords for filtering and searching, e.g. "功能,安全,性能"
- **priority**: 优先级
  - P0 = 核心功能，系统无法正常运行的阻塞性缺陷
  - P1 = 重要功能，若出现问题有变通方案
  - P2 = 边缘场景，中等影响
  - P3 = 美观性或极低概率场景
- **category**: 用例类型. Choose the most appropriate type: 功能测试, 接口测试, 性能测试, 安全测试, 兼容性测试, UI测试, 回归测试, 冒烟测试, Positive, Negative, Boundary, etc.
- **applicable_phase**: 适用阶段. One of: 单元测试, 集成测试, 系统测试, 验收测试. Choose based on the scope of the test case.
- **description**: 用例说明. A brief 1-2 sentence summary explaining what this test case validates and why it matters.
- **test_method**: 测试方法. One of: 手工测试, 自动化测试, 半自动化测试. For API-level tests prefer 自动化测试, for UI tests prefer 手工测试.
- **estimated_time**: 预计执行时间. In minutes, e.g. "5", "10", "30". A simple test case is usually 5-15 minutes.
- **notes**: 其他/备注. Any additional notes, dependencies, or special considerations. Leave empty if none.
- **test_level**: 测试级别. One of: 单元测试, 集成测试, 系统测试, 验收测试.
- **duration**: 时长. Same as estimated_time or more specific, e.g. "15分钟", "30分钟"
- **reviewer**: 由谁评审. Name or role of the reviewer, e.g. "张三", "QA组长". Leave empty if not assigned.
- **test_frequency**: 测试频率. How often this test should be run, e.g. "每次提交", "每日", "每周", "每版本"

## Coverage Distribution
Generate a balanced mix of test types covering different testing perspectives. Include a variety of categories such as 功能测试, 接口测试, 边界测试, 异常测试等.

## Example of Quality

GOOD test case:
```
{
  "case_id": "TC-001",
  "module": "用户注册",
  "sub_module": "手机号注册",
  "title": "验证用户使用有效手机号和强密码可以成功注册",
  "preconditions": "1. 用户已打开注册页面 /register。\n2. 系统中不存在手机号 13800138000 的账号。",
  "steps": "1. 在手机号输入框中输入'13800138000'\n2. 点击'获取验证码'按钮\n3. 输入收到的6位验证码'123456'\n4. 在密码输入框中输入'SecureP@ss123'\n5. 在确认密码输入框中输入'SecureP@ss123'\n6. 点击'注册'按钮",
  "expected_result": "1. 页面顶部显示绿色成功提示'注册成功'。\n2. 页面自动跳转至首页 /home。\n3. 系统向 13800138000 发送注册成功短信。",
  "keywords": "注册,手机号,正向",
  "priority": "P0",
  "category": "功能测试",
  "applicable_phase": "系统测试",
  "description": "验证手机号注册的正常流程，确保用户可以顺利完成注册并登录。",
  "test_method": "手工测试",
  "estimated_time": "15",
  "notes": "",
  "test_level": "系统测试",
  "duration": "15分钟",
  "reviewer": "QA组长",
  "test_frequency": "每版本"
}
```

POOR test case (too vague — DO NOT do this):
```
{
  "title": "测试注册",
  "preconditions": "用户存在",
  "steps": "注册用户",
  "expected_result": "成功了"
}
```

## Quantity
Generate between 8 and 25 test cases depending on requirement complexity. Complex requirements with many modules should have more test cases. Each test case must be unique and test a distinct scenario.

## Language
Write all test case content in Chinese if the requirement is in Chinese, otherwise use English."""


BASE_PROPERTIES = {
    "case_id": {"type": "string"},
    "module": {"type": "string"},
    "sub_module": {"type": "string"},
    "title": {"type": "string"},
    "preconditions": {"type": "string"},
    "steps": {"type": "string"},
    "expected_result": {"type": "string"},
    "keywords": {"type": "string"},
    "priority": {"type": "string", "enum": ["P0", "P1", "P2", "P3"]},
    "category": {"type": "string"},
    "applicable_phase": {"type": "string"},
    "description": {"type": "string"},
    "test_method": {"type": "string"},
    "estimated_time": {"type": "string"},
    "notes": {"type": "string"},
    "test_level": {"type": "string"},
    "duration": {"type": "string"},
    "reviewer": {"type": "string"},
    "test_frequency": {"type": "string"},
}

# Fields without defaults in the TestCase model — the LLM MUST provide these
BASE_REQUIRED = [
    "case_id", "module", "title", "preconditions",
    "steps", "expected_result", "priority",
]

# Core fields that are always included in the tool schema even when the user
# selects a subset of fields (they are mandatory for identity / validation)
CORE_FIELDS = {"case_id", "title", "module", "preconditions", "steps", "expected_result", "priority"}


def _build_field_schema(fields: list[str] | None) -> tuple[dict, list[str]]:
    """Build dynamic properties and required lists based on requested fields.

    If fields is None, use all fields (backward compatible).
    Core fields are always included even if not explicitly requested.
    """
    if fields is None:
        return dict(BASE_PROPERTIES), list(BASE_REQUIRED)

    requested = set(fields) | CORE_FIELDS  # Always include core identity fields
    props = {k: v for k, v in BASE_PROPERTIES.items() if k in requested}
    required = [k for k in BASE_REQUIRED if k in requested]
    return props, required


def _get_tool_schema(fields: list[str] | None = None) -> dict:
    props, required = _build_field_schema(fields)
    return {
        "name": "create_test_cases",
        "description": "Generate structured test cases from analyzed requirements. Call this function once with the complete array of test cases.",
        "input_schema": {
            "type": "object",
            "properties": {
                "test_cases": {
                    "type": "array",
                    "description": "Array of test case objects covering the requirements from multiple angles.",
                    "items": {
                        "type": "object",
                        "properties": props,
                        "required": required,
                    },
                }
            },
            "required": ["test_cases"],
        },
    }


def _get_openai_tool_schema(fields: list[str] | None = None) -> dict:
    """Wrap the Anthropic-style schema into OpenAI function-calling format."""
    inner = _get_tool_schema(fields)
    return {
        "type": "function",
        "function": {
            "name": inner["name"],
            "description": inner["description"],
            "parameters": inner["input_schema"],
        },
    }


def _load_prompt_from_db(name: str) -> str | None:
    """Load a prompt template from DB, returning None to use the code default."""
    try:
        from app.services.database import get_active_prompt_text
        return get_active_prompt_text(name)
    except Exception:
        return None


def _build_system_prompt(case_count: int, requirement_text: str = "") -> str:
    """Build the system prompt with the target case count.

    Tries DB first, falls back to SYSTEM_PROMPT constant.
    When case_count is 0, use AI-determined mode (auto).
    If requirement_text is provided, auto-match specifications.
    """
    base = _load_prompt_from_db("generate_main") or SYSTEM_PROMPT
    if case_count <= 0:
        effective = base
    else:
        replacement = (
            f"Generate exactly {case_count} test case{'s' if case_count != 1 else ''}. Each test case must be unique and test a distinct scenario. If the requirement is too simple to produce {case_count} distinct test case{'s' if case_count != 1 else ''}, generate as many meaningful cases as possible."
        )
        effective = base.replace(
            "Generate between 8 and 25 test cases depending on requirement complexity. Complex requirements with many modules should have more test cases. Each test case must be unique and test a distinct scenario.",
            replacement,
        )

    # Auto-match specifications from requirement text
    if requirement_text:
        try:
            from app.services.database import match_specifications
            keywords = _extract_spec_keywords(requirement_text)
            if keywords:
                matched = match_specifications(keywords)
                if matched:
                    sections = []
                    for spec in matched:
                        spec_name = spec.get("name", "未命名规范")
                        spec_content = spec.get("content", "")
                        if spec_content:
                            sections.append(f"### {spec_name}\n{spec_content}")
                    if sections:
                        effective += (
                            "\n\n## Applicable Test Specifications\n"
                            "The following company-specific test writing guidelines apply to this requirement. "
                            "You MUST follow these specifications when generating test cases:\n\n"
                            + "\n\n".join(sections)
                        )
        except Exception:
            pass  # spec matching is best-effort

    return effective


def _extract_spec_keywords(text: str) -> str:
    """Extract potential module/keyword candidates from requirement text for spec matching."""
    import re
    candidates = set()

    # Extract markdown headings (likely module/feature names)
    for line in text.split("\n"):
        line = line.strip()
        if line.startswith("##") or line.startswith("###"):
            heading = re.sub(r'^#+\s*', '', line).strip().rstrip('：:')
            if heading and len(heading) < 30:
                candidates.add(heading)

    # Look for patterns like "XXX模块", "XXX功能", "XXX页面"
    for m in re.finditer(r'([一-鿿\w]+)(?:模块|功能|页面|系统|管理|中心)', text):
        candidates.add(m.group(1))
        candidates.add(m.group(0))

    # Add common test keywords if text mentions them
    test_keywords_map = {
        "登录|注册|注销|密码|验证码|认证": "登录认证",
        "支付|退款|订单|购物车|结算": "订单支付",
        "搜索|筛选|排序|分页|过滤": "搜索筛选",
        "权限|角色|用户管理|组织|部门": "权限管理",
        "导入|导出|上传|下载|批量": "导入导出",
        "通知|消息|推送|邮件|短信": "消息通知",
        "报表|统计|图表|分析|仪表盘": "报表统计",
    }
    for pattern, tag in test_keywords_map.items():
        if re.search(pattern, text):
            candidates.add(tag)

    return ",".join(sorted(candidates)) if candidates else ""


def _get_polish_prompt() -> str:
    return _load_prompt_from_db("polish") or POLISH_SYSTEM_PROMPT


def _get_outline_prompt() -> str:
    return _load_prompt_from_db("outline") or OUTLINE_SYSTEM_PROMPT


def _get_rtm_prompt() -> str:
    return _load_prompt_from_db("rtm") or RTM_SYSTEM_PROMPT


def _get_script_prompt() -> str:
    return _load_prompt_from_db("script") or SCRIPT_SYSTEM_PROMPT


def _extract_json_from_content(content: str) -> dict | None:
    """Try to extract a JSON object/array from raw text content."""
    if not content:
        return None

    # Try extracting from ```json blocks
    if "```json" in content:
        parts = content.split("```json")
        for part in parts[1:]:
            inner = part.split("```")[0].strip()
            try:
                return json.loads(inner)
            except json.JSONDecodeError:
                continue

    # Try extracting from ``` blocks
    if "```" in content:
        parts = content.split("```")
        for i, part in enumerate(parts):
            if i % 2 == 1:  # inside code blocks
                stripped = part.strip()
                try:
                    return json.loads(stripped)
                except json.JSONDecodeError:
                    continue

    # Try parsing the whole content as JSON
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Try finding JSON object/array boundaries
    # Try bare array first ([...]) so a single { inside the array doesn't match before [
    for prefix, suffix in [("[", "]"), ('{"test_cases"', "}"), ("{", "}")]:
        start = content.find(prefix)
        if start == -1:
            continue
        depth = 0
        for end in range(start, len(content)):
            if content[end] in "{[":
                depth += 1
            elif content[end] in "}]":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(content[start:end + 1])
                    except json.JSONDecodeError:
                        break
    return None


def _validate_and_build(tool_output: dict | list) -> list[TestCase]:
    """Validate and convert tool-use output into TestCase objects.

    Handles both {"test_cases": [...]} and bare [...] formats.
    """
    raw_cases = tool_output.get("test_cases") if isinstance(tool_output, dict) else None
    if raw_cases is None and isinstance(tool_output, list):
        raw_cases = tool_output

    if not isinstance(raw_cases, list):
        raise ValueError("Expected an array of test cases, got: " + str(type(tool_output).__name__))

    cases = []
    errors = []
    for i, item in enumerate(raw_cases):
        try:
            cases.append(TestCase(**item))
        except Exception as e:
            errors.append(f"Case {i}: {e}")
            logger.warning("Failed to validate test case %d: %s", i, e)

    if errors and not cases:
        raise ValueError(f"All test cases failed validation: {'; '.join(errors[:3])}")
    if errors:
        logger.info("%d of %d test cases failed validation and were skipped", len(errors), len(raw_cases))
    return cases


def _get_deepseek_key(api_key: str | None) -> str:
    key = api_key or os.getenv("DEEPSEEK_API_KEY")
    if not key:
        raise ValueError("API key is required. Set DEEPSEEK_API_KEY in .env or enter it in the UI.")
    return key


def _get_anthropic_key(api_key: str | None) -> str:
    key = api_key or os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise ValueError("API key is required. Set ANTHROPIC_API_KEY in .env or enter it in the UI.")
    return key


def _is_retryable(error_msg: str) -> bool:
    """Check if an API error is transient and worth retrying."""
    retryable = ["429", "500", "502", "503", "529", "rate limit", "timeout", "server error", "overloaded", "busy"]
    return any(token in error_msg.lower() for token in retryable)


def _is_auth_error(e: Exception) -> bool:
    """Check if an exception is an authentication/authorization error."""
    try:
        from openai import AuthenticationError as OpenAIAuthError
        if isinstance(e, OpenAIAuthError):
            return True
    except ImportError:
        pass
    try:
        from anthropic import AuthenticationError as AnthropicAuthError
        if isinstance(e, AnthropicAuthError):
            return True
    except ImportError:
        pass
    error_msg = str(e).lower()
    return "401" in error_msg or "authentication" in error_msg or "api key" in error_msg or "auth fails" in error_msg


async def _generate_with_deepseek(
    requirement_text: str, api_key: str | None, model: str,
    fields: list[str] | None = None, case_count: int = 10, retries: int = MAX_RETRIES,
    api_base_url: str | None = None,
) -> tuple[list[TestCase], list[str], dict | None]:
    key = _get_deepseek_key(api_key)
    client = _get_deepseek_client(key, base_url=api_base_url)
    tool_schema = _get_openai_tool_schema(fields)
    system_prompt = _build_system_prompt(case_count, requirement_text)

    last_error = None
    for attempt in range(retries + 1):
        try:
            response = await client.chat.completions.create(
                model=model or "deepseek-chat",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Analyze the following requirement and generate test cases:\n\n---\n{requirement_text}\n---"},
                ],
                tools=[tool_schema],
                tool_choice={"type": "function", "function": {"name": "create_test_cases"}} if "reasoner" not in model.lower() else "auto",
                temperature=0.4,
                max_tokens=16384,
                timeout=120,
            )
            break
        except Exception as e:
            last_error = e
            if _is_auth_error(e):
                raise ValueError("Invalid API key. Please verify your key.") from e
            error_msg = str(e)
            if attempt < retries and _is_retryable(error_msg):
                logger.warning("DeepSeek API attempt %d/%d failed: %s. Retrying in %ds...", attempt + 1, retries + 1, e, RETRY_DELAY)
                await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                continue
            raise RuntimeError(f"Failed to generate test cases: {error_msg}") from e
    else:
        raise RuntimeError(f"Failed after {retries + 1} attempts: {last_error}") from last_error

    msg = response.choices[0].message
    warnings: list[str] = []

    finish_reason = response.choices[0].finish_reason
    if finish_reason == "length":
        warnings.append("Response was truncated due to length. Some test cases may be missing. Consider reducing the case count or splitting the requirement.")

    # Try tool calls first
    if msg.tool_calls:
        tc = msg.tool_calls[0]
        try:
            tool_output = json.loads(tc.function.arguments)
        except json.JSONDecodeError:
            logger.warning("Failed to parse tool call arguments as JSON, trying raw extraction")
            tool_output = _extract_json_from_content(tc.function.arguments)
            if tool_output is None:
                raise RuntimeError("Failed to parse AI tool call output. Please retry.")
    elif msg.content:
        logger.info("No tool call found, trying to extract JSON from content")
        tool_output = _extract_json_from_content(msg.content)
        if tool_output is None:
            raise RuntimeError("AI did not produce structured output. Please try rephrasing your requirement.")
    else:
        raise RuntimeError("AI did not produce any output. Please try again.")

    test_cases = _validate_and_build(tool_output)
    if not test_cases:
        raise RuntimeError("No test cases were generated. Please try with more detailed requirements.")

    usage = None
    if hasattr(response, "usage") and response.usage:
        u = response.usage
        input_tokens = u.prompt_tokens if u.prompt_tokens is not None else getattr(u, "input_tokens", 0) or 0
        output_tokens = u.completion_tokens if u.completion_tokens is not None else getattr(u, "output_tokens", 0) or 0
        usage = {"input_tokens": input_tokens, "output_tokens": output_tokens, "model": model, "cost": _compute_cost(model, input_tokens, output_tokens)}

    logger.info("Generated %d test cases via DeepSeek (%s)", len(test_cases), model)
    return test_cases, warnings, usage


async def _generate_with_anthropic(
    requirement_text: str, api_key: str | None, model: str,
    fields: list[str] | None = None, case_count: int = 10, retries: int = MAX_RETRIES,
    api_base_url: str | None = None,
) -> tuple[list[TestCase], list[str], dict | None]:
    key = _get_anthropic_key(api_key)
    client = _get_anthropic_client(key, base_url=api_base_url)
    tool_schema = _get_tool_schema(fields)
    system_prompt = _build_system_prompt(case_count, requirement_text)
    warnings: list[str] = []

    last_error = None
    for attempt in range(retries + 1):
        try:
            response = await client.messages.create(
                model=model or "claude-sonnet-4-20250514",
                max_tokens=16384,
                temperature=0.4,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": f"Analyze the following requirement and generate test cases:\n\n---\n{requirement_text}\n---",
                    }
                ],
                tools=[tool_schema],
                tool_choice={"type": "tool", "name": "create_test_cases"},
                timeout=120,
            )
            break
        except Exception as e:
            last_error = e
            if _is_auth_error(e):
                raise ValueError("Invalid API key. Please verify your key at https://console.anthropic.com.") from e
            error_msg = str(e)
            if attempt < retries and _is_retryable(error_msg):
                logger.warning("Anthropic API attempt %d/%d failed: %s. Retrying in %ds...", attempt + 1, retries + 1, e, RETRY_DELAY)
                await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                continue
            raise RuntimeError(f"Failed to generate test cases: {error_msg}") from e
    else:
        raise RuntimeError(f"Failed after {retries + 1} attempts: {last_error}") from last_error

    if response.stop_reason == "max_tokens":
        warnings.append("Response was truncated due to length. Some test cases may be missing. Consider splitting the requirement into smaller sections.")

    # Try tool_use blocks first
    tool_blocks = [b for b in response.content if b.type == "tool_use"]
    if tool_blocks:
        tool_output = tool_blocks[0].input
        if isinstance(tool_output, dict):
            test_cases = _validate_and_build(tool_output)
        else:
            raise RuntimeError("Unexpected tool-use format from AI. Please retry.")
    else:
        # Fallback: try to extract JSON from text content
        text_blocks = [b for b in response.content if b.type == "text"]
        if text_blocks:
            logger.info("No tool_use found, trying to extract JSON from Anthropic content")
            tool_output = _extract_json_from_content(text_blocks[0].text)
            if tool_output:
                test_cases = _validate_and_build(tool_output)
            else:
                raise RuntimeError(
                    "AI did not produce structured test cases. This may indicate the requirement text is not a valid requirement document. "
                    "Please try rephrasing or adding more detail."
                )
        else:
            raise RuntimeError("AI did not produce any output. Please try again.")

    if not test_cases:
        raise RuntimeError("No test cases were generated. Please try with more detailed requirements.")

    usage = None
    if hasattr(response, "usage") and response.usage:
        u = response.usage
        input_tokens = u.input_tokens if u.input_tokens is not None else 0
        output_tokens = u.output_tokens if u.output_tokens is not None else 0
        usage = {"input_tokens": input_tokens, "output_tokens": output_tokens, "model": model, "cost": _compute_cost(model, input_tokens, output_tokens)}

    logger.info("Generated %d test cases via Anthropic (%s)", len(test_cases), model)
    return test_cases, warnings, usage


POLISH_SYSTEM_PROMPT = """You are an expert technical writer specializing in software requirement documentation. Your task is to polish raw, unstructured requirement text into a clean, well-organized requirement document.

## Rules
1. Organize content into clear sections with numbered headings (## 1. xxx, ### 1.1 xxx)
2. Use bullet points (- ) for specific requirements and acceptance criteria
3. Keep all original functional requirements — do not add or remove functionality
4. Fix grammar, typos, and inconsistent terminology
5. Standardize technical terms (e.g. "手机号" → "手机号码" consistently)
6. Add missing implicit details only if they are obvious (e.g. "点击按钮" → "点击[提交]按钮")
7. Maintain the original language (Chinese stays Chinese, English stays English)
8. Output ONLY the polished document, no explanations or meta-commentary"""


async def polish_requirement(requirement_text: str, model: str = "deepseek-chat", api_key: str | None = None, api_base_url: str | None = None) -> tuple[str, dict | None]:
    """Polish raw requirement text into structured format using the LLM.

    Results are cached in-memory for 1 hour.
    Returns (polished_text, usage).
    """
    ck = _cache_key("polish", requirement_text, model, api_base_url)
    cached = _cache_get(ck)
    if cached is not None:
        logger.info("Returning cached polish result for key=%s", ck[:12])
        return cached
    if model.startswith("deepseek"):
        result = await _polish_with_deepseek(requirement_text, model, api_key, api_base_url=api_base_url)
    elif model.startswith("claude") or model.startswith("anthropic"):
        result = await _polish_with_anthropic(requirement_text, model, api_key, api_base_url=api_base_url)
    elif model.startswith("gpt") or model.startswith("o1") or model.startswith("o3"):
        raise ValueError(f"Model '{model}' requires OpenAI API key. Use a DeepSeek or Anthropic model instead.")
    else:
        raise ValueError(f"Unknown model prefix: '{model}'")
    _cache_set(ck, result)
    return result


async def _polish_with_deepseek(requirement_text: str, model: str, api_key: str | None = None, retries: int = MAX_RETRIES, api_base_url: str | None = None) -> tuple[str, dict | None]:
    key = _get_deepseek_key(api_key)
    client = _get_deepseek_client(key, base_url=api_base_url)

    last_error = None
    for attempt in range(retries + 1):
        try:
            response = await client.chat.completions.create(
                model=model or "deepseek-chat",
                messages=[
                    {"role": "system", "content": _get_polish_prompt()},
                    {"role": "user", "content": f"Polish the following requirement text into a well-structured document:\n\n---\n{requirement_text}\n---"},
                ],
                temperature=0.3,
                max_tokens=8192,
            )
            break
        except Exception as e:
            last_error = e
            if _is_auth_error(e):
                raise ValueError("Invalid API key. Please verify your key.") from e
            error_msg = str(e)
            if attempt < retries and _is_retryable(error_msg):
                logger.warning("DeepSeek polish attempt %d/%d failed: %s. Retrying in %ds...", attempt + 1, retries + 1, e, RETRY_DELAY)
                await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                continue
            raise RuntimeError(f"Failed to polish requirement: {error_msg}") from e
    else:
        raise RuntimeError(f"Failed after {retries + 1} attempts: {last_error}") from last_error

    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("AI did not return polished content. Please try again.")
    logger.info("Polished requirement via DeepSeek (%d → %d chars)", len(requirement_text), len(content))

    usage = None
    if hasattr(response, "usage") and response.usage:
        u = response.usage
        input_tokens = u.prompt_tokens if u.prompt_tokens is not None else getattr(u, "input_tokens", 0) or 0
        output_tokens = u.completion_tokens if u.completion_tokens is not None else getattr(u, "output_tokens", 0) or 0
        usage = {"input_tokens": input_tokens, "output_tokens": output_tokens, "model": model, "cost": _compute_cost(model, input_tokens, output_tokens)}

    return content.strip(), usage


async def _polish_with_anthropic(requirement_text: str, model: str, api_key: str | None = None, retries: int = MAX_RETRIES, api_base_url: str | None = None) -> tuple[str, dict | None]:
    key = _get_anthropic_key(api_key)
    client = _get_anthropic_client(key, base_url=api_base_url)

    last_error = None
    for attempt in range(retries + 1):
        try:
            response = await client.messages.create(
                model=model or "claude-sonnet-4-20250514",
                max_tokens=8192,
                temperature=0.3,
                system=_get_polish_prompt(),
                messages=[
                    {"role": "user", "content": f"Polish the following requirement text into a well-structured document:\n\n---\n{requirement_text}\n---"},
                ],
            )
            break
        except Exception as e:
            last_error = e
            if _is_auth_error(e):
                raise ValueError("Invalid API key. Please verify your key.") from e
            error_msg = str(e)
            if attempt < retries and _is_retryable(error_msg):
                logger.warning("Anthropic polish attempt %d/%d failed: %s. Retrying in %ds...", attempt + 1, retries + 1, e, RETRY_DELAY)
                await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                continue
            raise RuntimeError(f"Failed to polish requirement: {error_msg}") from e
    else:
        raise RuntimeError(f"Failed after {retries + 1} attempts: {last_error}") from last_error

    text_blocks = [b for b in response.content if b.type == "text"]
    if not text_blocks:
        raise RuntimeError("AI did not return polished content. Please try again.")
    content = text_blocks[0].text
    logger.info("Polished requirement via Anthropic (%d → %d chars)", len(requirement_text), len(content))

    usage = None
    if hasattr(response, "usage") and response.usage:
        u = response.usage
        input_tokens = u.input_tokens if u.input_tokens is not None else 0
        output_tokens = u.output_tokens if u.output_tokens is not None else 0
        usage = {"input_tokens": input_tokens, "output_tokens": output_tokens, "model": model, "cost": _compute_cost(model, input_tokens, output_tokens)}

    return content.strip(), usage


async def generate_test_cases(
    requirement_text: str,
    api_key: str | None = None,
    model: str = "deepseek-chat",
    fields: list[str] | None = None,
    case_count: int = 10,
    api_base_url: str | None = None,
) -> tuple[list[TestCase], list[str], dict | None]:
    """Generate test cases from requirement text.

    Automatically routes to the correct API based on the model name:
    - Models starting with "deepseek" → DeepSeek API
    - Models starting with "claude" → Anthropic API

    Results are cached in-memory for 1 hour to avoid duplicate API calls.
    Returns (test_cases, warnings, usage).
    """
    ck = _cache_key("generate_test_cases", requirement_text, model, fields, case_count, api_base_url)
    cached = _cache_get(ck)
    if cached is not None:
        logger.info("Returning cached generation result for key=%s", ck[:12])
        return cached

    if model.startswith("deepseek"):
        result = await _generate_with_deepseek(requirement_text, api_key, model, fields, case_count, api_base_url=api_base_url)
    elif model.startswith("claude") or model.startswith("anthropic"):
        result = await _generate_with_anthropic(requirement_text, api_key, model, fields, case_count, api_base_url=api_base_url)
    elif model.startswith("gpt") or model.startswith("o1") or model.startswith("o3"):
        raise ValueError(f"Model '{model}' requires OpenAI API key. Please use a DeepSeek or Anthropic/Claude model, or configure OpenAI support separately.")
    else:
        raise ValueError(f"Unknown model prefix: '{model}'. Supported: deepseek-*, claude-*, gpt-*, o1-*, o3-*")
    _cache_set(ck, result)
    return result


# ---------------------------------------------------------------------------
# Outline generation (step-by-step: outline first, then full cases)
# ---------------------------------------------------------------------------

OUTLINE_SYSTEM_PROMPT = """You are a senior QA engineer. Analyze the requirement below and produce a structured outline of test ideas.

For each major feature or module, list 2-5 specific test ideas as concise bullet points. Group by module/feature name.

Output valid JSON via the `create_outline` function with this structure:
{
  "outline": [
    {
      "module": "模块名称",
      "test_ideas": ["验证...", "校验...", "确认..."]
    }
  ]
}"""


def _get_outline_tool_schema() -> dict:
    return {
        "type": "function",
        "function": {
            "name": "create_outline",
            "description": "Create a structured test outline grouped by module",
            "parameters": {
                "type": "object",
                "properties": {
                    "outline": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "module": {"type": "string", "description": "模块或功能名称"},
                                "test_ideas": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "测试要点列表",
                                },
                            },
                            "required": ["module", "test_ideas"],
                        },
                    }
                },
                "required": ["outline"],
            },
        },
    }


async def generate_outline(
    requirement_text: str,
    api_key: str | None = None,
    model: str = "deepseek-chat",
    api_base_url: str | None = None,
) -> tuple[list[dict], dict | None]:
    """Generate a test outline (module + test ideas) from requirement text."""
    from openai import AsyncOpenAI
    from anthropic import AsyncAnthropic

    if model.startswith("deepseek"):
        client = AsyncOpenAI(api_key=_get_deepseek_key(api_key), base_url=api_base_url or "https://api.deepseek.com")
        tool_schema = _get_outline_tool_schema()
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": _get_outline_prompt()},
                    {"role": "user", "content": f"Analyze the following requirement and produce a test outline:\n\n---\n{requirement_text}\n---"},
                ],
                tools=[tool_schema],
                tool_choice={"type": "function", "function": {"name": "create_outline"}},
                temperature=0.4,
                max_tokens=4096,
                timeout=60,
            )
            msg = response.choices[0].message
            if msg.tool_calls:
                result = json.loads(msg.tool_calls[0].function.arguments)
            else:
                result = {"outline": []}
            usage = None
            if hasattr(response, "usage") and response.usage:
                u = response.usage
                input_tokens = u.prompt_tokens if u.prompt_tokens is not None else getattr(u, "input_tokens", 0) or 0
                output_tokens = u.completion_tokens if u.completion_tokens is not None else getattr(u, "output_tokens", 0) or 0
                usage = {"input_tokens": input_tokens, "output_tokens": output_tokens, "model": model, "cost": _compute_cost(model, input_tokens, output_tokens)}
            return result.get("outline", []), usage
        except Exception as e:
            raise RuntimeError(f"Failed to generate outline: {e}")

    elif model.startswith("claude") or model.startswith("anthropic"):
        ac_kwargs = {"api_key": _get_anthropic_key(api_key)}
        if api_base_url:
            ac_kwargs["base_url"] = api_base_url
        client = AsyncAnthropic(**ac_kwargs)
        tool_schema = _get_outline_tool_schema()["function"]
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=4096,
                temperature=0.4,
                system=_get_outline_prompt(),
                messages=[
                    {"role": "user", "content": f"Analyze the following requirement and produce a test outline:\n\n---\n{requirement_text}\n---"},
                ],
                tools=[tool_schema],
                tool_choice={"type": "tool", "name": "create_outline"},
                timeout=60,
            )
            tool_blocks = [b for b in response.content if b.type == "tool_use"]
            if tool_blocks:
                result = tool_blocks[0].input
            else:
                result = {"outline": []}
            usage = None
            if hasattr(response, "usage") and response.usage:
                u = response.usage
                input_tokens = u.input_tokens if u.input_tokens is not None else 0
                output_tokens = u.output_tokens if u.output_tokens is not None else 0
                usage = {"input_tokens": input_tokens, "output_tokens": output_tokens, "model": model, "cost": _compute_cost(model, input_tokens, output_tokens)}
            return result.get("outline", []), usage
        except Exception as e:
            raise RuntimeError(f"Failed to generate outline: {e}")

    else:
        raise ValueError(f"Unsupported model: {model}")


# ---------------------------------------------------------------------------
# RTM (Requirements Traceability Matrix)
# ---------------------------------------------------------------------------

RTM_SYSTEM_PROMPT = """You are a senior QA engineer performing requirements traceability analysis. Your task is to read a requirement document and a set of test cases, then produce a Requirements Traceability Matrix (RTM) that maps each requirement item to its corresponding test cases.

## Input
You will receive:
1. A structured requirement document with sections and headings
2. A JSON array of test cases, each with case_id, module, sub_module, title, steps, expected_result, etc.

## Output Rules
1. Parse the requirement document into individual requirement items based on numbered headings (## = major section, ### = sub-section, bullet points within a section are part of that section's requirements)
2. For each requirement item, identify which test cases cover it by analyzing:
   - The test case's `module` and `sub_module` fields against the requirement section heading
   - The test case's `title` and `steps` against the requirement item's content
3. For each requirement item, assign a coverage status:
   - "covered": there is a dedicated test case that explicitly tests this requirement
   - "partial": parts of this requirement are tested but not all aspects
   - "uncovered": no test case addresses this requirement
4. Provide a brief match_reason explaining the mapping (or why uncovered)

You MUST call the `create_rtm` function with the complete RTM data. Do NOT output RTM data as text — use the function."""


def _get_rtm_tool_schema() -> dict:
    return {
        "name": "create_rtm",
        "description": "Generate a Requirements Traceability Matrix mapping requirement items to test cases.",
        "input_schema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "description": "Array of RTM items, one per requirement item.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "req_id": {"type": "string"},
                            "req_title": {"type": "string"},
                            "req_content": {"type": "string"},
                            "matched_case_ids": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Array of TC-XXX IDs that cover this requirement",
                            },
                            "coverage_status": {
                                "type": "string",
                                "enum": ["covered", "partial", "uncovered"],
                            },
                            "match_reason": {"type": "string"},
                        },
                        "required": ["req_id", "req_title", "req_content", "matched_case_ids", "coverage_status", "match_reason"],
                    },
                }
            },
            "required": ["items"],
        },
    }


def _get_openai_rtm_tool_schema() -> dict:
    inner = _get_rtm_tool_schema()
    return {"type": "function", "function": {"name": inner["name"], "description": inner["description"], "parameters": inner["input_schema"]}}


async def _generate_rtm_with_deepseek(
    requirement_text: str, test_cases: list[dict], model: str,
    api_key: str | None = None, retries: int = MAX_RETRIES,
    api_base_url: str | None = None,
) -> tuple[list[dict], dict | None]:
    key = _get_deepseek_key(api_key)
    client = _get_deepseek_client(key, base_url=api_base_url)
    tool_schema = _get_openai_rtm_tool_schema()

    last_error = None
    for attempt in range(retries + 1):
        try:
            response = await client.chat.completions.create(
                model=model or "deepseek-chat",
                messages=[
                    {"role": "system", "content": _get_rtm_prompt()},
                    {
                        "role": "user",
                        "content": f"Requirement document:\n\n---\n{requirement_text}\n---\n\nTest cases:\n\n{json.dumps(test_cases, ensure_ascii=False, indent=2)}",
                    },
                ],
                tools=[tool_schema],
                tool_choice={"type": "function", "function": {"name": "create_rtm"}} if "reasoner" not in model.lower() else "auto",
                temperature=0.3,
                max_tokens=8192,
            )
            break
        except Exception as e:
            last_error = e
            if _is_auth_error(e):
                raise ValueError("Invalid API key. Please verify your key.") from e
            error_msg = str(e)
            if attempt < retries and _is_retryable(error_msg):
                logger.warning("DeepSeek RTM attempt %d/%d failed: %s. Retrying in %ds...", attempt + 1, retries + 1, e, RETRY_DELAY)
                await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                continue
            raise RuntimeError(f"Failed to generate RTM: {error_msg}") from e
    else:
        raise RuntimeError(f"Failed after {retries + 1} attempts: {last_error}") from last_error

    msg = response.choices[0].message
    if msg.tool_calls:
        try:
            tool_output = json.loads(msg.tool_calls[0].function.arguments)
        except json.JSONDecodeError:
            tool_output = _extract_json_from_content(msg.tool_calls[0].function.arguments)
            if tool_output is None:
                raise RuntimeError("Failed to parse RTM tool output. Please retry.")
    elif msg.content:
        tool_output = _extract_json_from_content(msg.content)
        if tool_output is None:
            raise RuntimeError("AI did not produce structured RTM data. Please try rephrasing your requirement.")
    else:
        raise RuntimeError("AI did not produce any output. Please try again.")

    items = tool_output.get("items") if isinstance(tool_output, dict) else tool_output
    if not isinstance(items, list):
        raise ValueError("Expected an array of RTM items.")
    for item in items:
        if "req_id" not in item or "req_title" not in item:
            raise ValueError("Each RTM item must have req_id and req_title.")

    usage = None
    if hasattr(response, "usage") and response.usage:
        u = response.usage
        input_tokens = u.prompt_tokens if u.prompt_tokens is not None else getattr(u, "input_tokens", 0) or 0
        output_tokens = u.completion_tokens if u.completion_tokens is not None else getattr(u, "output_tokens", 0) or 0
        usage = {"input_tokens": input_tokens, "output_tokens": output_tokens, "model": model, "cost": _compute_cost(model, input_tokens, output_tokens)}

    logger.info("Generated RTM with %d items via DeepSeek", len(items))
    return items, usage


async def _generate_rtm_with_anthropic(
    requirement_text: str, test_cases: list[dict], model: str,
    api_key: str | None = None, retries: int = MAX_RETRIES,
    api_base_url: str | None = None,
) -> tuple[list[dict], dict | None]:
    key = _get_anthropic_key(api_key)
    client = _get_anthropic_client(key, base_url=api_base_url)
    tool_schema = _get_rtm_tool_schema()

    last_error = None
    for attempt in range(retries + 1):
        try:
            response = await client.messages.create(
                model=model or "claude-sonnet-4-20250514",
                max_tokens=8192,
                temperature=0.3,
                system=_get_rtm_prompt(),
                messages=[
                    {
                        "role": "user",
                        "content": f"Requirement document:\n\n---\n{requirement_text}\n---\n\nTest cases:\n\n{json.dumps(test_cases, ensure_ascii=False, indent=2)}",
                    }
                ],
                tools=[tool_schema],
                tool_choice={"type": "tool", "name": "create_rtm"},
            )
            break
        except Exception as e:
            last_error = e
            if _is_auth_error(e):
                raise ValueError("Invalid API key. Please verify your key.") from e
            error_msg = str(e)
            if attempt < retries and _is_retryable(error_msg):
                logger.warning("Anthropic RTM attempt %d/%d failed: %s. Retrying in %ds...", attempt + 1, retries + 1, e, RETRY_DELAY)
                await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                continue
            raise RuntimeError(f"Failed to generate RTM: {error_msg}") from e
    else:
        raise RuntimeError(f"Failed after {retries + 1} attempts: {last_error}") from last_error

    tool_blocks = [b for b in response.content if b.type == "tool_use"]
    if tool_blocks:
        tool_output = tool_blocks[0].input
    else:
        text_blocks = [b for b in response.content if b.type == "text"]
        if text_blocks:
            tool_output = _extract_json_from_content(text_blocks[0].text)
            if tool_output is None:
                raise RuntimeError("AI did not produce structured RTM data. Please try rephrasing.")
        else:
            raise RuntimeError("AI did not produce any output. Please try again.")

    items = tool_output.get("items") if isinstance(tool_output, dict) else tool_output
    if not isinstance(items, list):
        raise ValueError("Expected an array of RTM items.")

    usage = None
    if hasattr(response, "usage") and response.usage:
        u = response.usage
        input_tokens = u.input_tokens if u.input_tokens is not None else 0
        output_tokens = u.output_tokens if u.output_tokens is not None else 0
        usage = {"input_tokens": input_tokens, "output_tokens": output_tokens, "model": model, "cost": _compute_cost(model, input_tokens, output_tokens)}

    logger.info("Generated RTM with %d items via Anthropic", len(items))
    return items, usage


async def generate_rtm(
    requirement_text: str,
    test_cases: list[dict],
    api_key: str | None = None,
    model: str = "deepseek-chat",
    api_base_url: str | None = None,
) -> tuple[list[dict], dict | None]:
    """Generate Requirements Traceability Matrix mapping req items to test cases.

    Returns (rtm_items, usage).
    """
    if model.startswith("deepseek"):
        return await _generate_rtm_with_deepseek(requirement_text, test_cases, model, api_key, api_base_url=api_base_url)
    else:
        return await _generate_rtm_with_anthropic(requirement_text, test_cases, model, api_key, api_base_url=api_base_url)


# ---------------------------------------------------------------------------
# Playwright Script Generation
# ---------------------------------------------------------------------------

SCRIPT_SYSTEM_PROMPT = """You are a senior test automation engineer specializing in Playwright (Python). Your task is to convert manual test case steps into functional, runnable Playwright Python test scripts.

## Rules
1. Generate ONE complete Python file per test case.
2. Use the standard Playwright pytest pattern (sync style):
   - `from playwright.sync_api import Page, expect`
   - `def test_xxx(page: Page):`
3. Each test function should:
   - Navigate to the relevant page (use descriptive placeholder URLs)
   - Follow the numbered steps in the test case
   - Use appropriate Playwright locators like `page.get_by_label()`, `page.get_by_role()`, etc.
   - Add `expect` assertions matching the expected_result
   - Include comments referencing the test case ID and title
4. Handle different test data values shown in the steps
5. If preconditions mention specific state, add setup code or comments explaining manual setup
6. Derive the filename as `test_{module}_{case_id}.py` in snake_case
7. Output ONLY the Python code via the function call, no explanations

You MUST call the `create_scripts` function with the complete array of script objects."""


def _get_script_tool_schema() -> dict:
    return {
        "name": "create_scripts",
        "description": "Generate Playwright Python test scripts from manual test case steps.",
        "input_schema": {
            "type": "object",
            "properties": {
                "scripts": {
                    "type": "array",
                    "description": "Array of generated Python script objects, one per test case.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "case_id": {"type": "string", "description": "TC-XXX"},
                            "title": {"type": "string", "description": "Test case title"},
                            "filename": {"type": "string", "description": "Filename like test_login_TC_001.py"},
                            "code": {"type": "string", "description": "Complete Playwright Python code"},
                        },
                        "required": ["case_id", "title", "filename", "code"],
                    },
                }
            },
            "required": ["scripts"],
        },
    }


def _get_openai_script_tool_schema() -> dict:
    inner = _get_script_tool_schema()
    return {"type": "function", "function": {"name": inner["name"], "description": inner["description"], "parameters": inner["input_schema"]}}


async def _generate_scripts_with_deepseek(
    test_cases: list[dict], model: str,
    api_key: str | None = None, retries: int = MAX_RETRIES,
    api_base_url: str | None = None,
) -> tuple[list[dict], dict | None]:
    key = _get_deepseek_key(api_key)
    client = _get_deepseek_client(key, base_url=api_base_url)
    tool_schema = _get_openai_script_tool_schema()

    last_error = None
    for attempt in range(retries + 1):
        try:
            response = await client.chat.completions.create(
                model=model or "deepseek-chat",
                messages=[
                    {"role": "system", "content": _get_script_prompt()},
                    {
                        "role": "user",
                        "content": f"Convert the following test cases into Playwright Python scripts:\n\n{json.dumps(test_cases, ensure_ascii=False, indent=2)}",
                    },
                ],
                tools=[tool_schema],
                tool_choice={"type": "function", "function": {"name": "create_scripts"}} if "reasoner" not in model.lower() else "auto",
                temperature=0.2,
                max_tokens=16384,
            )
            break
        except Exception as e:
            last_error = e
            if _is_auth_error(e):
                raise ValueError("Invalid API key. Please verify your key.") from e
            error_msg = str(e)
            if attempt < retries and _is_retryable(error_msg):
                logger.warning("DeepSeek script generation attempt %d/%d failed: %s. Retrying in %ds...", attempt + 1, retries + 1, e, RETRY_DELAY)
                await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                continue
            raise RuntimeError(f"Failed to generate scripts: {error_msg}") from e
    else:
        raise RuntimeError(f"Failed after {retries + 1} attempts: {last_error}") from last_error

    msg = response.choices[0].message
    if msg.tool_calls:
        try:
            tool_output = json.loads(msg.tool_calls[0].function.arguments)
        except json.JSONDecodeError:
            tool_output = _extract_json_from_content(msg.tool_calls[0].function.arguments)
            if tool_output is None:
                raise RuntimeError("Failed to parse script output. Please retry.")
    elif msg.content:
        tool_output = _extract_json_from_content(msg.content)
        if tool_output is None:
            raise RuntimeError("AI did not produce structured script data. Please retry.")
    else:
        raise RuntimeError("AI did not produce any output. Please try again.")

    scripts = tool_output.get("scripts") if isinstance(tool_output, dict) else tool_output
    if not isinstance(scripts, list) or len(scripts) == 0:
        raise ValueError("No scripts were generated.")

    usage = None
    if hasattr(response, "usage") and response.usage:
        u = response.usage
        input_tokens = u.prompt_tokens if u.prompt_tokens is not None else getattr(u, "input_tokens", 0) or 0
        output_tokens = u.completion_tokens if u.completion_tokens is not None else getattr(u, "output_tokens", 0) or 0
        usage = {"input_tokens": input_tokens, "output_tokens": output_tokens, "model": model, "cost": _compute_cost(model, input_tokens, output_tokens)}

    logger.info("Generated %d scripts via DeepSeek", len(scripts))
    return scripts, usage


async def _generate_scripts_with_anthropic(
    test_cases: list[dict], model: str,
    api_key: str | None = None, retries: int = MAX_RETRIES,
    api_base_url: str | None = None,
) -> tuple[list[dict], dict | None]:
    key = _get_anthropic_key(api_key)
    client = _get_anthropic_client(key, base_url=api_base_url)
    tool_schema = _get_script_tool_schema()

    last_error = None
    for attempt in range(retries + 1):
        try:
            response = await client.messages.create(
                model=model or "claude-sonnet-4-20250514",
                max_tokens=16384,
                temperature=0.2,
                system=_get_script_prompt(),
                messages=[
                    {
                        "role": "user",
                        "content": f"Convert the following test cases into Playwright Python scripts:\n\n{json.dumps(test_cases, ensure_ascii=False, indent=2)}",
                    }
                ],
                tools=[tool_schema],
                tool_choice={"type": "tool", "name": "create_scripts"},
            )
            break
        except Exception as e:
            last_error = e
            if _is_auth_error(e):
                raise ValueError("Invalid API key. Please verify your key.") from e
            error_msg = str(e)
            if attempt < retries and _is_retryable(error_msg):
                logger.warning("Anthropic script generation attempt %d/%d failed: %s. Retrying in %ds...", attempt + 1, retries + 1, e, RETRY_DELAY)
                await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                continue
            raise RuntimeError(f"Failed to generate scripts: {error_msg}") from e
    else:
        raise RuntimeError(f"Failed after {retries + 1} attempts: {last_error}") from last_error

    tool_blocks = [b for b in response.content if b.type == "tool_use"]
    if tool_blocks:
        tool_output = tool_blocks[0].input
    else:
        text_blocks = [b for b in response.content if b.type == "text"]
        if text_blocks:
            tool_output = _extract_json_from_content(text_blocks[0].text)
            if tool_output is None:
                raise RuntimeError("AI did not produce structured script data. Please retry.")
        else:
            raise RuntimeError("AI did not produce any output. Please try again.")

    scripts = tool_output.get("scripts") if isinstance(tool_output, dict) else tool_output
    if not isinstance(scripts, list) or len(scripts) == 0:
        raise ValueError("No scripts were generated.")

    usage = None
    if hasattr(response, "usage") and response.usage:
        u = response.usage
        input_tokens = u.input_tokens if u.input_tokens is not None else 0
        output_tokens = u.output_tokens if u.output_tokens is not None else 0
        usage = {"input_tokens": input_tokens, "output_tokens": output_tokens, "model": model, "cost": _compute_cost(model, input_tokens, output_tokens)}

    logger.info("Generated %d scripts via Anthropic", len(scripts))
    return scripts, usage


async def generate_scripts(
    test_cases: list[dict],
    api_key: str | None = None,
    model: str = "deepseek-chat",
    api_base_url: str | None = None,
) -> tuple[list[dict], dict | None]:
    """Generate Playwright Python scripts from test case steps.

    Returns (scripts, usage).
    """
    if model.startswith("deepseek"):
        return await _generate_scripts_with_deepseek(test_cases, model, api_key, api_base_url=api_base_url)
    else:
        return await _generate_scripts_with_anthropic(test_cases, model, api_key, api_base_url=api_base_url)
