from pydantic import BaseModel, Field
from enum import Enum


class Priority(str, Enum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"


class TestCase(BaseModel):
    case_id: str = Field(description="Sequential ID: TC-001, TC-002, etc.")
    module: str = Field(description="三级模块名称")
    sub_module: str = Field(default="", description="子模块名称")
    title: str = Field(description="用例标题")
    preconditions: str = Field(description="前置条件")
    steps: str = Field(description="测试步骤")
    expected_result: str = Field(description="预期结果")
    keywords: str = Field(default="", description="关键字/标签")
    priority: Priority = Field(description="P0=blocker, P1=important, P2=edge, P3=cosmetic")
    category: str = Field(default="", description="用例类型：功能测试/接口测试/性能测试等")
    applicable_phase: str = Field(default="", description="适用阶段")
    description: str = Field(default="", description="用例说明")
    test_method: str = Field(default="", description="测试方法：手工/自动化/半自动化")
    estimated_time: str = Field(default="", description="预计执行时间")
    notes: str = Field(default="", description="其他/备注")
    test_level: str = Field(default="", description="测试级别：单元测试/集成测试/系统测试/验收测试")
    duration: str = Field(default="", description="时长")
    reviewer: str = Field(default="", description="由谁评审")
    test_frequency: str = Field(default="", description="测试频率")
    tags: str = Field(default="", description="逗号分隔的标签，如 'smoke,regression,login'")
    review_status: str = Field(default="draft", description="draft / pending_review / approved / needs_changes")
    review_comment: str = Field(default="", description="评审意见")
    execution_status: str = Field(default="not_executed", description="not_executed / pass / fail / blocked")


class GenerationRequest(BaseModel):
    requirement_text: str = Field(..., min_length=1, max_length=150000)
    api_key: str | None = None
    model: str = "deepseek-chat"
    fields: list[str] | None = None  # If provided, only these fields will be generated
    case_count: int = Field(default=10, ge=0, le=200)  # 0=auto, 1-200=target count


class GenerationResponse(BaseModel):
    test_cases: list[TestCase]
    warnings: list[str] = []
    usage: dict | None = None  # Token usage info: {input_tokens, output_tokens, model}


class ErrorResponse(BaseModel):
    error_code: str
    message: str


class PolishRequest(BaseModel):
    requirement_text: str = Field(..., min_length=1, max_length=150000)
    api_key: str | None = None
    model: str = "deepseek-chat"


class PolishResponse(BaseModel):
    polished_text: str
    usage: dict | None = None


class LibrarySaveRequest(BaseModel):
    name: str
    test_cases: list[dict]
    requirement_text: str = ""
    folder_id: int | None = None


class LibraryUpdateRequest(BaseModel):
    name: str
    test_cases: list[dict]
    requirement_text: str = ""


class FolderCreateRequest(BaseModel):
    name: str
    parent_id: int | None = None


class FolderRenameRequest(BaseModel):
    name: str


class SetMoveRequest(BaseModel):
    folder_id: int | None = None


class ReviewBatchUpdateRequest(BaseModel):
    case_indices: list[int] = Field(..., description="Indices of test cases to update")
    review_status: str = Field(default="", description="New review status")
    review_comment: str = Field(default="", description="Review comment")
    execution_status: str = Field(default="", description="New execution status")


class RtmItem(BaseModel):
    req_id: str = Field(description="Requirement item ID, e.g. '1.1', '2.3'")
    req_title: str = Field(description="Requirement section heading text")
    req_content: str = Field(description="Requirement item content/summary")
    matched_case_ids: list[str] = Field(default=[], description="TC-XXX IDs of matching test cases")
    coverage_status: str = Field(default="uncovered", description="covered / partial / uncovered")
    match_reason: str = Field(default="", description="Brief explanation of the mapping")


class RtmRequest(BaseModel):
    requirement_text: str = Field(..., min_length=1, max_length=150000)
    test_cases: list[dict] = Field(..., description="Current test cases array")
    model: str = "deepseek-chat"
    api_key: str | None = None


class RtmResponse(BaseModel):
    items: list[RtmItem]
    coverage_stats: dict


class ScriptItem(BaseModel):
    case_id: str = Field(description="TC-XXX")
    title: str = Field(description="Test case title")
    filename: str = Field(description="Generated .py filename")
    code: str = Field(description="Generated Playwright Python code")


class ScriptRequest(BaseModel):
    test_cases: list[dict] = Field(..., min_length=1, max_length=50)
    model: str = "deepseek-chat"
    api_key: str | None = None


class ScriptResponse(BaseModel):
    scripts: list[ScriptItem]
    usage: dict | None = None


# ---- SQL Query Tool ----


class QueryRequest(BaseModel):
    sql: str = Field(..., min_length=1, max_length=10000)


class QueryResponse(BaseModel):
    columns: list[str] = []
    rows: list[list] = []
    row_count: int = 0
    error: str | None = None
    execution_time_ms: float = 0.0


# ---- Auth Models ----
class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


class UserInfo(BaseModel):
    id: int
    username: str
    role: str


class UserSettingsRequest(BaseModel):
    api_key: str = ""
    model: str = ""
    theme: str = "light"


class UserSettingsResponse(BaseModel):
    api_key: str = ""
    model: str = ""
    theme: str = "light"


class BugCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str = ""
    severity: str = "P2"
    status: str = "open"
    module: str = ""
    steps: str = ""
    expected_result: str = ""
    actual_result: str = ""
    tags: str = ""
    related_case_id: str = ""


class BugUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    severity: str | None = None
    status: str | None = None
    module: str | None = None
    steps: str | None = None
    expected_result: str | None = None
    actual_result: str | None = None
    tags: str | None = None
    related_case_id: str | None = None


class BugResponse(BaseModel):
    id: int
    user_id: int = 0
    title: str
    description: str = ""
    severity: str = "P2"
    status: str = "open"
    module: str = ""
    steps: str = ""
    expected_result: str = ""
    actual_result: str = ""
    tags: str = ""
    related_case_id: str = ""
    created_at: str = ""
    updated_at: str = ""
