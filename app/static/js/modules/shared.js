/**
 * Shared utilities for TestCaseAI
 * Loaded before app.js — all helpers are assigned to window for cross-module access.
 */

// ======== Field Definitions ========
const FIELD_DEFS = [
    { key: "case_id", label: "用例编号", type: "text" },
    { key: "module", label: "三级模块名称", type: "text" },
    { key: "sub_module", label: "子模块", type: "text" },
    { key: "title", label: "用例标题", type: "text" },
    { key: "preconditions", label: "前置条件", type: "textarea" },
    { key: "steps", label: "测试步骤", type: "textarea" },
    { key: "expected_result", label: "预期结果", type: "textarea" },
    { key: "keywords", label: "关键字/标签", type: "text" },
    { key: "priority", label: "优先级", type: "select", options: ["P0", "P1", "P2", "P3"] },
    { key: "category", label: "用例类型", type: "combo", options: ["功能测试", "接口测试", "性能测试", "安全测试", "兼容性测试", "UI测试", "回归测试", "冒烟测试", "Positive", "Negative", "Boundary"] },
    { key: "applicable_phase", label: "适用阶段", type: "text" },
    { key: "description", label: "用例说明", type: "textarea" },
    { key: "reviewer", label: "由谁评审", type: "text" },
    { key: "test_method", label: "测试方法", type: "combo", options: ["手工测试", "自动化测试", "半自动化测试"] },
    { key: "estimated_time", label: "预计执行时间", type: "text" },
    { key: "notes", label: "其他/备注", type: "textarea" },
    { key: "test_frequency", label: "测试频率", type: "text" },
    { key: "test_level", label: "测试级别", type: "select", options: ["单元测试", "集成测试", "系统测试", "验收测试"] },
    { key: "duration", label: "时长", type: "text" },
    { key: "tags", label: "标签", type: "text" },
    { key: "review_status", label: "评审状态", type: "select", options: ["draft", "pending_review", "approved", "needs_changes"] },
    { key: "review_comment", label: "评审意见", type: "textarea" },
    { key: "execution_status", label: "执行状态", type: "select", options: ["not_executed", "pass", "fail", "blocked"] },
];

const ALL_FIELD_KEYS = FIELD_DEFS.map(f => f.key);
const FIELD_BY_KEY = Object.fromEntries(FIELD_DEFS.map(f => [f.key, f]));
const DEFAULT_TABLE_FIELDS = ["case_id", "module", "sub_module", "title", "priority", "category", "test_method", "test_level", "tags", "review_status", "execution_status"];

const STORAGE_KEY = "itg_testcases";
const STORAGE_REQ_KEY = "itg_requirement";
const STORAGE_FIELDS_KEY = "itg_selected_fields";
const STORAGE_THEME_KEY = "itg_theme";
const STORAGE_RECOVERY_KEY = "itg_recovery_backup";
const UNDO_MAX = 50;

const BATCH_FIELD_OPTIONS = {
    priority: ["P0", "P1", "P2", "P3"],
    category: ["功能测试", "接口测试", "性能测试", "安全测试", "兼容性测试", "UI测试", "回归测试", "冒烟测试", "Positive", "Negative", "Boundary"],
    test_method: ["手工测试", "自动化测试", "半自动化测试"],
    test_level: ["单元测试", "集成测试", "系统测试", "验收测试"],
    review_status: ["draft", "pending_review", "approved", "needs_changes"],
    execution_status: ["not_executed", "pass", "fail", "blocked"],
};

const TEMPLATES = [
    { name: "登录功能", desc: "用户名/密码/验证码/锁定", icon: "bi-box-arrow-in-right" },
    { name: "CRUD 操作", desc: "创建/读取/更新/删除", icon: "bi-table" },
    { name: "表单验证", desc: "必填/格式/边界值", icon: "bi-input-cursor-text" },
    { name: "文件上传", desc: "类型/大小/数量限制", icon: "bi-upload" },
    { name: "搜索筛选", desc: "关键词/多条件/分页", icon: "bi-search" },
    { name: "权限控制", desc: "角色/权限/越权", icon: "bi-shield-lock" },
    { name: "API 接口", desc: "请求/响应/异常/超时", icon: "bi-hdd-rack" },
    { name: "数据导出", desc: "格式/筛选/大数据量", icon: "bi-download" },
];

// ======== Pure helpers (no DOM dependency, safe to load before DOMContentLoaded) ========

function escHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str ?? "");
    return div.innerHTML;
}
window.escHtml = escHtml;

function toast(msg, type, duration) {
    if (!msg) return;
    const existing = document.querySelector(".toast-notify");
    if (existing) existing.remove();
    const t = type || "info";
    const dur = duration || (t === "error" ? 4000 : t === "warning" ? 3500 : 2600);
    const iconMap = { success: "check-circle-fill", warning: "exclamation-triangle-fill", error: "x-circle-fill", info: "info-circle-fill" };
    const el = document.createElement("div");
    el.className = "toast-notify " + t;
    el.innerHTML = '<i class="bi bi-' + (iconMap[t] || iconMap.info) + '"></i><span>' + escHtml(msg) + '</span><button class="toast-notify-close">&times;</button><div class="toast-progress"><div class="toast-progress-bar"></div></div>';
    document.body.appendChild(el);
    el.querySelector(".toast-notify-close").onclick = () => { if (el.parentNode) el.remove(); };
    const bar = el.querySelector(".toast-progress-bar");
    bar.style.animationDuration = dur + "ms";
    setTimeout(() => { if (el.parentNode) el.remove(); }, dur);
}
window.toast = toast;

function setBtnLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
        if (!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>' + (btn.dataset.loadingText || '处理中...');
    } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.origHtml || btn.innerHTML;
    }
}
window.setBtnLoading = setBtnLoading;

async function fetchWithRetry(url, options, retries = 3) {
    const timeout = options?.timeout || 120000;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            const resp = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            return resp;
        } catch (err) {
            clearTimeout(timeoutId);
            if (attempt === retries) throw err;
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
            await new Promise(r => setTimeout(r, delay));
        }
    }
}
window.fetchWithRetry = fetchWithRetry;

async function apiFetch(url, options = {}) {
    const resp = await fetch(url, {
        headers: { "Content-Type": "application/json", ...options.headers },
        ...options,
    });
    if (!resp.ok) {
        let msg = "HTTP " + resp.status;
        try { const d = await resp.json(); msg = d.detail?.message || d.detail || msg; } catch(_) {}
        throw new Error(msg);
    }
    return resp.json();
}
window.apiFetch = apiFetch;

/**
 * Convert a UTC datetime string ("YYYY-MM-DD HH:MM:SS") to local time display.
 * Returns the formatted local datetime string, or the original value if parsing fails.
 */
window.formatTime = function (utcStr) {
    if (!utcStr) return "";
    try {
        // Append Z to treat as UTC, then convert to locale string
        const d = new Date((utcStr + "Z").replace(" ", "T"));
        if (isNaN(d.getTime())) return utcStr;
        const pad = (n) => String(n).padStart(2, "0");
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
            " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    } catch (_) {
        return utcStr;
    }
};
