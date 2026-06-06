# 智能测试用例生成器 TestForge

基于 LLM 大语言模型的智能测试用例生成工具，支持从需求文档自动生成 19 字段结构化测试用例，提供在线编辑器、用例库管理、多格式导出、前置依赖关联等功能。

## 目录

- [功能总览](#功能总览)
- [快速开始](#快速开始)
- [使用教程](#使用教程)
- [部署方案](#部署方案)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [API 参考](#api-参考)

---

## 功能总览

### 核心能力

| 功能 | 说明 |
|------|------|
| AI 生成测试用例 | 粘贴需求文档，LLM 自动生成 19 字段结构化测试用例 |
| AI 润色需求 | 原始文档整理为规范的需求文档，支持词级差异对比（红删绿增） |
| 多模型支持 | DeepSeek-Chat / DeepSeek-Reasoner / Claude Sonnet 4 / Opus 4 / Haiku 4 |
| 省 Token 设计 | 按需勾选输出字段（未选中不输出）；控制生成 3-30 条用例 |

### 用例编辑

| 功能 | 说明 |
|------|------|
| 可编辑表格 | 19 个字段：文本输入、下拉选择、组合输入（带 datalist 提示） |
| 批量修改 | 勾选多行 → 浮动底栏一键设置优先级 / 类型 / 方法 / 级别 |
| 导入用例 | 从 `.xlsx` / `.xls` / `.csv` 导入，自动列映射，追加或替换模式 |
| 用例模板 | 8 种预设场景：登录、CRUD、表单验证、文件上传、搜索筛选、权限控制、API 接口、数据导出 |
| 撤销 / 重做 | `Ctrl+Z` / `Ctrl+Y`，最多 50 步历史 |
| 复制 / 删除 | 选中行后一键批量操作 |
| 全文搜索 | 实时关键词过滤 |
| 前置依赖 | 点击链接图标搜索并关联前置用例，自动填入 `preconditions` |

### 持久化与导出

| 功能 | 说明 |
|------|------|
| 用例库 | SQLite 持久化存储（`~/.TestCaseAI/library.db`），保存/加载/删除用例集 |
| 浏览器恢复 | localStorage 自动保存，刷新页面后自动恢复编辑中的用例 |
| Excel 导出 | `.xlsx`，彩色标题行、优先级颜色标记、冻结窗格、自动列宽 |
| CSV 导出 | UTF-8 BOM 编码，Excel 直接打开中文不乱码 |

### 在线编辑器

| 类型 | 技术 | 能力 |
|------|------|------|
| TXT | CodeMirror 5 | Monokai 主题，自动语言语法高亮 |
| Excel | Luckysheet | 全功能电子表格（公式、格式、多 Sheet） |
| Word | Quill.js | 富文本编辑，导出标准 `.docx` |

支持拖放打开、多标签页切换、新建 TXT/XLSX/DOCX 文件。

### 用户体验

| 功能 | 说明 |
|------|------|
| 深色模式 | 全局浅色/深色主题切换，侧边栏、滚动条、编辑器全部适配 |
| API 设置面板 | 用户填入自己的 Key，与部署者 Key 完全隔离，各自付费 |
| 新用户引导 | 无 Key 时自动展开设置面板、红点提示，面板内含注册链接 |
| Token 统计 | 生成 / 润色后 toast 展示消耗，工具栏累计会话总量 |

---

## 快速开始

### 环境要求

- Python 3.10+
- Windows 10+ / macOS / Linux

### 安装

```bash
cd intelligent-test-generator
pip install -r requirements.txt
```

### 配置 API Key（二选一）

**方式一：环境变量 `.env`（部署者自己用）**

```bash
echo DEEPSEEK_API_KEY=sk-your-key > .env
echo ANTHROPIC_API_KEY=sk-ant-your-key >> .env
```

**方式二：页面内填写（给其他人用）**

不创建 `.env`，用户打开页面后在「API 设置」面板填入自己的 Key。

### 启动

```bash
python run.py
```

浏览器访问 `http://127.0.0.1:8000`。

---

## 使用教程

### 典型流程

```
1. 打开页面 → 首次使用在「API 设置」面板填入 Key
2. 「需求编辑」→ 粘贴 PRD 或需求文档
3. 勾选需要生成的字段、选择用例数量 → （可选）点击「AI 润色」
4. 点击「生成测试用例」→ 自动跳转到用例管理页
5. 在表格中编辑、批量修改、插入模板、关联前置用例
6. 「导出」→ 下载 Excel 或 CSV
7. 「保存到库」→ 下次可继续编辑
```

### 1. 需求编辑

- 左侧文本区域粘贴需求（最多 150,000 字符）
- 点击「示例」加载内置示例
- 顶部可切换 AI 模型
- 工具栏选择「用例数量」（3-30 条）
- 底部标签选择需要输出的字段（选得越少越省 Token）

**AI 润色**：点击后将原始文档整理为结构化需求，右侧面板展示结果。可点击「差异」查看词级别对比（红色=删除，绿色=新增）。满意后点击「采用润色」替换原文。

**差异对比**：点击润色面板的「差异」按钮切换视图。

### 2. 用例管理

**编辑用例**：直接在表格单元格中修改。下拉字段直接点选，组合输入框可自由输入或从提示列表选择。点击铅笔图标打开详情弹窗编辑全部 19 个字段。

**行操作**：
- 添加：在表格末尾新增空白行
- 删除：勾选一行或多行，点击删除
- 复制：勾选后点击复制，副本追加到末尾
- 导入：从 xlsx/xls/csv 导入，弹窗中映射列对应关系，可选追加或替换
- 搜索：搜索框中输入关键词实时筛选

**批量修改**：勾选多行 → 底部出现浮动操作栏 → 点击「批量设置」→ 直接选择目标值，一键应用。

**前置依赖**：点击行末链接图标（🔗）或在详情弹窗中点击「查找前置用例」→ 弹出搜索窗口 → 输入关键词查找目标用例 → 点击选中 → 自动填入 `preconditions` 字段：`依赖 [TC-001] 用例标题：需先执行该用例并通过`。支持 Ctrl+Z 撤销。

**用例模板**：点击「模板」→ 8 种预设场景 → 点击即插入完整用例。

**用例库**：点击「保存到库」存入本地 SQLite 数据库。点击「用例库」打开管理面板，可加载历史集合（替换或追加）或删除。

### 3. 导出管理

- 自动生成带时间戳的文件名，可自定义
- 点击「Excel」导出 `.xlsx`（带样式、冻结窗格、优先级颜色标记）
- 点击「CSV」导出 `.csv`（UTF-8 BOM）
- 导出内容仅为当前勾选的字段列

### 4. 在线编辑器

- 侧边栏点击「在线编辑器」进入
- 打开文件：点击按钮选择或直接拖拽文件到编辑区
- 新建文件：点击「新建」，选择 TXT/XLSX/DOCX
- 保存 / 另存为：触发浏览器下载
- 支持多标签页同时编辑，Ctrl+S 保存

---

## 部署方案

### 方案一：本地使用

```bash
python run.py
# 访问 http://127.0.0.1:8000
```

### 方案二：局域网分享

```bash
# run.py 中 host 设为 0.0.0.0：
# uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

python run.py
# 同事访问 http://你的内网IP:8000（如 http://192.168.1.100:8000）
```

查看本机 IP：Windows 上用 `ipconfig`，Mac/Linux 上用 `ifconfig`。

**注意**：如果本机有 `.env`，局域网用户不填 Key 也能用，但消耗的是你的 Token。去掉 `.env` 后用户必须自己在「API 设置」面板填 Key。

### 方案三：云服务器部署

```bash
# 1. 上传代码到服务器（.env 不包含你的 Key）
# 2. 安装依赖
pip install -r requirements.txt

# 3. 后台启动（推荐用 screen 或 systemd）
nohup python run.py > server.log 2>&1 &

# 4. 配置防火墙允许 8000 端口
# 5. 如需域名，前面加一层 nginx 反向代理
```

服务器上没有 `.env`，所有用户必须自己在页面「API 设置」中填入自己的 Key，完全隔离。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | FastAPI (Python 3.10+) |
| LLM SDK | openai（DeepSeek）+ anthropic（Claude），双 SDK 运行时路由 |
| 数据验证 | Pydantic v2 |
| Excel 导出 | openpyxl（XLSX 样式、冻结、筛选） |
| 持久化 | SQLite（WAL 模式，线程安全） |
| 前端 | 原生 JavaScript + Bootstrap 5，零构建工具 |
| 文本编辑器 | CodeMirror 5 (CDN) |
| 电子表格 | Luckysheet 2.1 (CDN) |
| Excel 解析 | SheetJS 0.20 (CDN) |
| Word 读写 | Mammoth.js + Quill.js + docx (CDN) |

### 架构

```
浏览器 → FastAPI (/)
         ├── POST /api/generate   → LLM 生成用例（tool-call 模式）
         ├── POST /api/polish     → LLM 润色需求
         ├── POST /api/export/*   → Excel / CSV 导出
         └── CRUD /api/library/*  → SQLite 用例库
```

- 模型路由：`deepseek*` → OpenAI SDK，`claude*` → Anthropic SDK
- Key 回退：请求参数 → `DEEPSEEK_API_KEY` 环境变量 → `ANTHROPIC_API_KEY` 环境变量
- Tool-call 强制结构化输出，动态 schema 按需包含字段

---

## 项目结构

```
intelligent-test-generator/
├── run.py                  # 开发服务器入口
├── requirements.txt        # Python 依赖
├── .env                    # API Key 配置（不提交到 git）
├── README.md
│
├── app/
│   ├── main.py             # FastAPI 路由 & 异常处理
│   ├── models.py           # Pydantic 数据模型（19 字段 TestCase）
│   │
│   ├── services/
│   │   ├── generator.py    # LLM 调用编排（DeepSeek + Anthropic）
│   │   ├── exporter.py     # XLSX / CSV 导出引擎
│   │   └── database.py     # SQLite 用例库持久化
│   │
│   ├── templates/
│   │   └── index.html      # 单页 HTML 入口
│   │
│   └── static/
│       ├── css/
│       │   └── app.css     # 全局样式（浅色 / 深色双主题）
│       └── js/
│           ├── app.js      # 主应用逻辑
│           └── editor.js   # 在线文件编辑器
```

---

## API 参考

### 生成测试用例

```http
POST /api/generate
Content-Type: application/json

{
  "requirement_text": "用户注册功能...",
  "model": "deepseek-chat",
  "api_key": "sk-...",          // 可选，不填走环境变量
  "fields": ["case_id", "title", "steps", "expected_result"],  // 可选，不填输出全部字段
  "case_count": 10              // 3-30，默认 10
}
```

### 润色需求

```http
POST /api/polish
Content-Type: application/json

{
  "requirement_text": "原始需求文档...",
  "model": "deepseek-chat",
  "api_key": "sk-..."           // 可选
}
```

### 导出

```http
POST /api/export/xlsx
POST /api/export/csv
Content-Type: application/json

{
  "test_cases": [...],
  "filename": "test_cases_2026-05-26"
}
```

### 用例库

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/library/list` | 列出所有已保存集合 |
| GET | `/api/library/{id}` | 获取完整集合（含测试用例数据） |
| POST | `/api/library/save` | 保存新集合 |
| PUT | `/api/library/{id}` | 更新集合 |
| DELETE | `/api/library/{id}` | 删除集合 |

启动服务后访问 `http://127.0.0.1:8000/docs` 查看 Swagger UI。

---

## 数据存储

| 数据 | 路径 |
|------|------|
| 用例库数据库 | `~/.TestCaseAI/library.db` |
| 浏览器缓存 | localStorage（页面刷新自动恢复） |
