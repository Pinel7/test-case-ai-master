// ====== Bug CRUD Module ======
let bugs = [];
let bugEditId = null;
const BUG_PAGE_SIZE = 20;
let _bugPageOffset = 0;

function renderBugSeverity(s) {
    const map = {P0:"bug-sv-p0",P1:"bug-sv-p1",P2:"bug-sv-p2",P3:"bug-sv-p3"};
    return `<span class="bug-sv-badge ${map[s]||"bug-sv-p2"}">${s||"P2"}</span>`;
}
function renderBugStatus(s) {
    const st = (s||"open").toLowerCase().replace(/\s+/g,"_");
    return `<span class="bug-status ${st}">${s||"open"}</span>`;
}

async function refreshBugList() {
    const status = document.getElementById("bugFilterStatus")?.value || "";
    const severity = document.getElementById("bugFilterSeverity")?.value || "";
    const q = document.getElementById("bugSearchInput")?.value || "";
    const tbody = document.getElementById("bugTableBody");
    const empty = document.getElementById("bugEmpty");
    const countEl = document.getElementById("bugCount");
    try {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (severity) params.set("severity", severity);
        if (q) params.set("q", q);
        params.set("limit", String(BUG_PAGE_SIZE));
        params.set("offset", String(_bugPageOffset));
        const data = await apiFetch("/api/bugs?" + params.toString());
        bugs = data.bugs || data || [];
        const total = data.total || bugs.length;
        if (countEl) {
            const showing = Math.min(bugs.length, total);
            countEl.textContent = total > BUG_PAGE_SIZE ? `${showing}/${total} 个 Bug` : `${total} 个 Bug`;
        }
        if (!tbody) return;
        if (bugs.length === 0) {
            tbody.innerHTML = "";
            document.getElementById("bugTableWrap").style.display = "none";
            if (empty) empty.style.display = "";
            return;
        }
        document.getElementById("bugTableWrap").style.display = "";
        if (empty) empty.style.display = "none";
        tbody.innerHTML = bugs.map(b => {
            const sevHtml = renderBugSeverity(b.severity);
            const stHtml = renderBugStatus(b.status);
            const created = window.formatTime(b.created_at || "").slice(0, 10);
            return `<tr data-id="${b.id}">
                <td>${escHtml(b.id)}</td>
                <td class="bug-title-cell">${escHtml(b.title)}</td>
                <td>${sevHtml}</td>
                <td>${stHtml}</td>
                <td>${escHtml(b.module || "-")}</td>
                <td>${created}</td>
                <td class="bug-actions-cell">
                    <button class="bug-action-btn" onclick="openBugEdit(${b.id})" title="编辑"><i class="bi-pencil"></i></button>
                    <button class="bug-action-btn danger" onclick="deleteBug(${b.id})" title="删除"><i class="bi-trash"></i></button>
                </td>
            </tr>`;
        }).join("");
        tbody.querySelectorAll("tr").forEach(tr => {
            tr.addEventListener("click", (e) => {
                if (e.target.closest(".bug-action-btn")) return;
                const id = parseInt(tr.dataset.id);
                if (!isNaN(id)) openBugEdit(id);
            });
        });

        // Pagination controls
        const paginationId = "bugPagination";
        let pagEl = document.getElementById(paginationId);
        if (total > BUG_PAGE_SIZE) {
            const totalPages = Math.ceil(total / BUG_PAGE_SIZE);
            const currentPage = Math.floor(_bugPageOffset / BUG_PAGE_SIZE) + 1;
            const html = `
            <div id="${paginationId}" class="pagination-bar d-flex align-items-center justify-content-between px-2 py-1 mt-1">
                <small class="text-muted">共 ${total} 个 Bug</small>
                <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-ghost btn-sm ${_bugPageOffset <= 0 ? 'disabled' : ''}" id="btnBugPrevPage" ${_bugPageOffset <= 0 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i> 上一页</button>
                    <small class="text-muted">第 ${currentPage}/${totalPages} 页</small>
                    <button class="btn btn-ghost btn-sm ${_bugPageOffset + BUG_PAGE_SIZE >= total ? 'disabled' : ''}" id="btnBugNextPage" ${_bugPageOffset + BUG_PAGE_SIZE >= total ? 'disabled' : ''}>下一页 <i class="bi bi-chevron-right"></i></button>
                </div>
            </div>`;
            if (!pagEl) {
                document.getElementById("bugListArea")?.insertAdjacentHTML('beforeend', html);
            } else {
                pagEl.outerHTML = html;
            }
            document.getElementById("btnBugPrevPage")?.addEventListener("click", () => {
                _bugPageOffset = Math.max(0, _bugPageOffset - BUG_PAGE_SIZE);
                refreshBugList();
            });
            document.getElementById("btnBugNextPage")?.addEventListener("click", () => {
                _bugPageOffset += BUG_PAGE_SIZE;
                refreshBugList();
            });
        } else {
            if (pagEl) pagEl.remove();
            _bugPageOffset = 0;
        }
    } catch(e) {
        toast("获取 Bug 列表失败: " + e.message, "danger");
    }
}

async function deleteBug(id) {
    const ok = await showConfirm("确定删除这个 Bug 吗？此操作不可撤销。");
    if (!ok) return;
    try {
        await apiFetch("/api/bugs/" + id, { method: "DELETE" });
        toast("Bug 已删除", "success");
        refreshBugList();
    } catch(e) {
        toast("删除失败: " + e.message, "danger");
    }
}

function openBugEdit(id) {
    bugEditId = id;
    const modal = document.getElementById("bugEditModal");
    const titleEl = document.getElementById("bugEditModalTitle");
    document.getElementById("bugFormTitle").value = "";
    document.getElementById("bugFormSeverity").value = "P2";
    document.getElementById("bugFormStatus").value = "open";
    document.getElementById("bugFormModule").value = "";
    document.getElementById("bugFormDescription").value = "";
    document.getElementById("bugFormPreconditions").value = "";
    document.getElementById("bugFormSteps").value = "";
    document.getElementById("bugFormExpected").value = "";
    document.getElementById("bugFormActual").value = "";
    document.getElementById("bugFormTags").value = "";
    document.getElementById("bugFormCaseId").value = "";
    if (id === null) {
        titleEl.textContent = "新建 Bug";
        const idx = document.getElementById("bugFromCaseIdx")?.value;
        if (idx && idx !== "") {
            const tc = (getTestCases() || [])[parseInt(idx)];
            if (tc) {
                document.getElementById("bugFormTitle").value = tc.title || "";
                document.getElementById("bugFormSeverity").value = tc.priority || "P2";
                document.getElementById("bugFormModule").value = tc.module || "";
                document.getElementById("bugFormPreconditions").value = tc.preconditions || "";
                document.getElementById("bugFormSteps").value = tc.steps || "";
                document.getElementById("bugFormExpected").value = tc.expected_result || "";
                document.getElementById("bugFormActual").value = tc.description || "";
                document.getElementById("bugFormTags").value = tc.tags || "";
                document.getElementById("bugFormCaseId").value = tc.case_id || "";
            }
        }
    } else {
        titleEl.textContent = "编辑 Bug";
        const bug = bugs.find(b => b.id === id);
        if (bug) {
            document.getElementById("bugFormTitle").value = bug.title || "";
            document.getElementById("bugFormSeverity").value = bug.severity || "P2";
            document.getElementById("bugFormStatus").value = bug.status || "open";
            document.getElementById("bugFormModule").value = bug.module || "";
            document.getElementById("bugFormDescription").value = bug.description || "";
            document.getElementById("bugFormPreconditions").value = "";
            document.getElementById("bugFormSteps").value = bug.steps || "";
            document.getElementById("bugFormExpected").value = bug.expected_result || "";
            document.getElementById("bugFormActual").value = bug.actual_result || "";
            document.getElementById("bugFormTags").value = bug.tags || "";
            document.getElementById("bugFormCaseId").value = bug.related_case_id || "";
        }
    }
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

async function saveBug() {
    const data = {
        title: document.getElementById("bugFormTitle").value.trim(),
        severity: document.getElementById("bugFormSeverity").value,
        status: document.getElementById("bugFormStatus").value,
        module: document.getElementById("bugFormModule").value.trim(),
        description: document.getElementById("bugFormDescription").value.trim(),
        steps: document.getElementById("bugFormSteps").value.trim(),
        expected_result: document.getElementById("bugFormExpected").value.trim(),
        actual_result: document.getElementById("bugFormActual").value.trim(),
        tags: document.getElementById("bugFormTags").value.trim(),
        related_case_id: document.getElementById("bugFormCaseId").value.trim(),
    };
    if (!data.title) { toast("请输入 Bug 标题", "warning"); return; }
    const id = bugEditId;
    try {
        if (id === null) {
            await apiFetch("/api/bugs", { method: "POST", body: JSON.stringify(data) });
        } else {
            await apiFetch("/api/bugs/" + id, { method: "PUT", body: JSON.stringify(data) });
        }
        toast(id === null ? "Bug 已创建" : "Bug 已更新", "success");
        bootstrap.Modal.getInstance(document.getElementById("bugEditModal"))?.hide();
        refreshBugList();
    } catch(e) {
        toast("保存失败: " + e.message, "danger");
    }
}

// ---- Export ----
let _bugExportFormat = "jira";
function getSelectedBugsForExport() {
    return bugs.filter(b => b.status !== "closed");
}
function exportBugJira(items) {
    return items.map(b => {
        return "h2. " + (b.title || "未命名 Bug") + "\n\n*Priority:* " + (b.severity || "P2") + "\n*Module:* " + (b.module || "") + "\n*Status:* " + (b.status || "open") + "\n*Labels:* bug" + ((b.tags || "") ? " " + b.tags : "") + "\n\nh3. Steps to Reproduce\n" + (b.steps || "(未填写)") + "\n\nh3. Expected Result\n" + (b.expected_result || "(未填写)") + "\n\nh3. Actual Result\n" + (b.actual_result || b.description || "(未填写)") + (b.related_case_id ? "\n\nh3. Related Case\n" + b.related_case_id : "");
    }).join("\n\n---\n\n");
}
function exportBugGithub(items) {
    return items.map(b => {
        return "## Bug: " + (b.title || "Unnamed Bug") + "\n\n**Priority:** " + (b.severity || "P2") + "\n**Module:** " + (b.module || "") + "\n**Status:** " + (b.status || "open") + "\n**Labels:** `bug`" + ((b.tags || "") ? ", `" + b.tags.split(",").map(t => t.trim()).join("`, `") + "`" : "") + "\n\n### Steps to Reproduce\n\n" + (b.steps || "(Not provided)") + "\n\n### Expected Behavior\n\n" + (b.expected_result || "(Not provided)") + "\n\n### Actual Behavior\n\n" + (b.actual_result || b.description || "(Not provided)") + (b.related_case_id ? "\n\n### Related Case\n`" + b.related_case_id + "`" : "");
    }).join("\n\n---\n\n");
}
function exportBugMarkdown(items) {
    return items.map(b => {
        return "# Bug: " + (b.title || "Unnamed Bug") + "\n\n| Field | Value |\n|-------|-------|\n| ID | " + b.id + " |\n| Severity | " + (b.severity || "P2") + " |\n| Status | " + (b.status || "open") + " |\n| Module | " + (b.module || "") + " |\n| Tags | " + (b.tags || "") + " |\n\n## Steps to Reproduce\n\n" + (b.steps || "(Not provided)") + "\n\n## Expected Result\n\n" + (b.expected_result || "(Not provided)") + "\n\n## Actual Result\n\n" + (b.actual_result || b.description || "(Not provided)") + (b.related_case_id ? "\n\n## Related Case\n" + b.related_case_id : "");
    }).join("\n\n---\n\n");
}
function exportBugCsvJira(items) {
    const header = "Summary,Priority,Status,Labels,Description,Component/s\n";
    return header + items.map(b => {
        const summary = (b.title || "Unnamed Bug").replace(/"/g, '""');
        const desc = ("Steps:\n" + (b.steps || "") + "\n\nExpected:\n" + (b.expected_result || "") + "\n\nActual:\n" + (b.actual_result || b.description || "")).replace(/"/g, '""');
        return '"' + summary + '","' + (b.severity || "P2") + '","' + (b.status || "open") + '","bug' + ((b.tags || "") ? " " + b.tags : "") + '","' + desc + '","' + (b.module || "").replace(/"/g, '""') + '"';
    }).join("\n");
}

function showBugExport(fmt) {
    const section = document.getElementById("bugExportSection");
    const textarea = document.getElementById("bugPreview");
    if (!section || !textarea) return;
    const sel = getSelectedBugsForExport();
    if (sel.length === 0) { toast("没有可导出的 Bug（非 closed 状态）", "warning"); return; }
    _bugExportFormat = fmt || "jira";
    let text = "";
    switch(_bugExportFormat) {
        case "github": text = exportBugGithub(sel); break;
        case "markdown": text = exportBugMarkdown(sel); break;
        case "csv-jira": text = exportBugCsvJira(sel); break;
        default: text = exportBugJira(sel); break;
    }
    textarea.value = text;
    document.getElementById("bugExportCount").textContent = sel.length;
    section.style.display = "";
}

function initBugPage() {
    document.getElementById("btnBugNew")?.addEventListener("click", () => { openBugEdit(null); });
    document.getElementById("btnBugFromCase")?.addEventListener("click", () => {
        const cases = getTestCases();
        if (cases.length === 0) { toast("没有测试用例可供导入", "warning"); return; }
        let pickerHtml = cases.map((tc, idx) =>
            `<div class="bug-pick-item" data-idx="${idx}"><input type="radio" name="bugPickCase" value="${idx}"><span class="bug-pick-id">${escHtml(tc.case_id||"")}</span><span>${escHtml(tc.title||"")}</span></div>`
        ).join("");
        showCustomDialog("从用例创建 Bug", `<div style="max-height:300px;overflow-y:auto">${pickerHtml}</div>`, [
            { text: "取消", cls: "btn-secondary", action: () => {} },
            { text: "选择创建", cls: "btn-primary", action: () => {
                const sel = document.querySelector('input[name="bugPickCase"]:checked');
                if (!sel) { toast("请选择一个用例", "warning"); return; }
                document.getElementById("bugFromCaseIdx").value = sel.value;
                openBugEdit(null);
            }}
        ]);
    });
    document.getElementById("btnBugSave")?.addEventListener("click", saveBug);
    document.getElementById("btnBugRefresh")?.addEventListener("click", refreshBugList);

    document.querySelectorAll("[data-bug-export]").forEach(el => {
        el.addEventListener("click", (e) => {
            e.preventDefault();
            showBugExport(el.dataset.bugExport);
        });
    });

    document.getElementById("btnBugCopy")?.addEventListener("click", () => {
        const text = document.getElementById("bugPreview")?.value;
        if (!text) { toast("无内容可复制", "warning"); return; }
        navigator.clipboard.writeText(text).then(() => toast("已复制到剪贴板", "success")).catch(() => {});
    });
    document.getElementById("btnBugDownload")?.addEventListener("click", () => {
        const text = document.getElementById("bugPreview")?.value;
        if (!text) { toast("无内容可下载", "warning"); return; }
        const ext = _bugExportFormat === "csv-jira" ? ".csv" : (_bugExportFormat === "jira" ? ".txt" : ".md");
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "bug_export_" + new Date().toISOString().slice(0, 10) + ext;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        toast("文件已下载", "success");
    });
    document.getElementById("btnBugCloseExport")?.addEventListener("click", () => {
        document.getElementById("bugExportSection").style.display = "none";
    });

    let debounceTimer;
    const doFilter = () => { _bugPageOffset = 0; clearTimeout(debounceTimer); debounceTimer = setTimeout(refreshBugList, 300); };
    document.getElementById("bugSearchInput")?.addEventListener("input", doFilter);
    document.getElementById("bugFilterStatus")?.addEventListener("change", doFilter);
    document.getElementById("bugFilterSeverity")?.addEventListener("change", doFilter);

    let hidden = document.getElementById("bugFromCaseIdx");
    if (!hidden) {
        hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.id = "bugFromCaseIdx";
        document.body.appendChild(hidden);
    }

    refreshBugList();
}
