// ====== Report Page & Markdown Preview ======
// Dependencies: window.toast, window.escHtml, window.showAlert, window.getTestCases, window.setEl

function updateReport() {
    const getTestCases = window.getTestCases;
    const escHtml = window.escHtml;
    const testCases = getTestCases();

    const reportContent = document.getElementById("reportContent");
    const reportEmpty = document.getElementById("reportEmpty");
    if (!reportContent || !reportEmpty) return;
    if (testCases.length === 0) { reportContent.style.display = "none"; reportEmpty.style.display = ""; return; }
    reportContent.style.display = ""; reportEmpty.style.display = "none";

    const total = testCases.length;
    const p0 = testCases.filter(tc => tc.priority === "P0").length;
    const p1 = testCases.filter(tc => tc.priority === "P1").length;
    const p2 = testCases.filter(tc => tc.priority === "P2").length;
    const p3 = testCases.filter(tc => tc.priority === "P3").length;
    const pass = testCases.filter(tc => tc.execution_status === "pass").length;
    const fail = testCases.filter(tc => tc.execution_status === "fail").length;
    const reviewed = testCases.filter(tc => tc.review_status === "approved").length;

    document.getElementById("reportCardTotal").querySelector(".report-card-value").textContent = total;
    document.getElementById("reportCardP0").querySelector(".report-card-value").textContent = p0;
    document.getElementById("reportCardP1").querySelector(".report-card-value").textContent = p1;
    document.getElementById("reportCardP2").querySelector(".report-card-value").textContent = p2;
    document.getElementById("reportCardP3").querySelector(".report-card-value").textContent = p3;
    document.getElementById("reportCardPass").querySelector(".report-card-value").textContent = pass;
    document.getElementById("reportCardFail").querySelector(".report-card-value").textContent = fail;
    document.getElementById("reportCardReview").querySelector(".report-card-value").textContent = reviewed;

    const pMax = Math.max(p0, p1, p2, p3, 1);
    const pBars = document.getElementById("reportPriorityBars");
    pBars.innerHTML = [
        { label: "P0", val: p0, cls: "bar-p0" },
        { label: "P1", val: p1, cls: "bar-p1" },
        { label: "P2", val: p2, cls: "bar-p2" },
        { label: "P3", val: p3, cls: "bar-p3" },
    ].map(d => `<div class="report-bar-row"><span class="report-bar-label">${d.label}</span><div class="report-bar-track"><div class="report-bar-fill ${d.cls}" style="width:${(d.val / pMax * 100).toFixed(0)}%"></div></div><span class="report-bar-count">${d.val}</span></div>`).join("");

    const modMap = {};
    testCases.forEach(tc => { const m = tc.module || "未分类"; modMap[m] = (modMap[m] || 0) + 1; });
    const mods = Object.entries(modMap).sort((a, b) => b[1] - a[1]);
    const mMax = Math.max(...mods.map(m => m[1]), 1);
    const mBars = document.getElementById("reportModuleBars");
    mBars.innerHTML = mods.map(([name, count]) => `<div class="report-bar-row"><span class="report-bar-label" title="${escHtml(name)}">${escHtml(name)}</span><div class="report-bar-track"><div class="report-bar-fill bar-module" style="width:${(count / mMax * 100).toFixed(0)}%"></div></div><span class="report-bar-count">${count}</span></div>`).join("");

    const execMap = { not_executed: "未执行", pass: "通过", fail: "失败", blocked: "阻塞" };
    const execColors = { not_executed: "#adb5bd", pass: "#198754", fail: "#dc3545", blocked: "#fd7e14" };
    const execCounts = {};
    testCases.forEach(tc => { const s = tc.execution_status || "not_executed"; execCounts[s] = (execCounts[s] || 0) + 1; });
    const ringSvg = document.querySelector("#reportExecRing .report-svg");
    const ringCenter = document.getElementById("reportRingCenter");
    const execKeys = Object.keys(execMap);
    if (ringSvg) {
        const cx = 60, cy = 60, r = 48, circ = 2 * Math.PI * r;
        let offset = 0;
        let paths = "";
        execKeys.forEach(key => {
            const count = execCounts[key] || 0;
            const pct = total > 0 ? count / total : 0;
            if (pct > 0) {
                const dash = pct * circ;
                paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${execColors[key]}" stroke-width="14" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
                offset += dash;
            }
        });
        ringSvg.innerHTML = paths;
        if (ringCenter) ringCenter.textContent = (total > 0 ? Math.round(pass / total * 100) : 0) + "%";
    }
    const legend = document.getElementById("reportExecLegend");
    if (legend) {
        legend.innerHTML = execKeys.map(key =>
            `<span class="report-legend-item"><span class="report-legend-dot" style="background:${execColors[key]}"></span>${execMap[key]}: ${execCounts[key] || 0}</span>`
        ).join("");
    }

    const revLabels = { draft: "草稿", pending_review: "待评审", approved: "已通过", needs_changes: "需修改" };
    const revColors = { draft: "#6c757d", pending_review: "#0d6efd", approved: "#198754", needs_changes: "#dc3545" };
    const revBars = document.getElementById("reportReviewBars");
    revBars.innerHTML = Object.entries(revLabels).map(([key, label]) => {
        const count = testCases.filter(tc => (tc.review_status || "draft") === key).length;
        const pct = total > 0 ? (count / total * 100).toFixed(0) : 0;
        return `<div class="report-bar-row"><span class="report-bar-label">${label}</span><div class="report-bar-track"><div class="report-bar-fill" style="width:${pct}%;background:${revColors[key]}"></div></div><span class="report-bar-count">${count} (${pct}%)</span></div>`;
    }).join("");
}

function initReport() {
    const toast = window.toast;
    const escHtml = window.escHtml;
    const showAlert = window.showAlert;
    const getTestCases = window.getTestCases;

    // Export report as HTML
    const btnExportReport = document.getElementById("btnExportReport");
    if (btnExportReport) {
        btnExportReport.addEventListener("click", () => {
            const testCases = getTestCases();
            if (testCases.length === 0) { showAlert("暂无用例数据可导出。"); return; }
            const rows = testCases.map(tc => {
                const revLabels = { draft: "草稿", pending_review: "待评审", approved: "已通过", needs_changes: "需修改" };
                const execLabels = { not_executed: "未执行", pass: "通过", fail: "失败", blocked: "阻塞" };
                return `<tr><td>${escHtml(tc.case_id || "")}</td><td>${escHtml(tc.module || "")}</td><td>${escHtml(tc.title || "")}</td><td>${tc.priority || ""}</td><td>${revLabels[tc.review_status] || tc.review_status || "草稿"}</td><td>${execLabels[tc.execution_status] || tc.execution_status || "未执行"}</td></tr>`;
            }).join("");
            const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>测试报告</title><style>body{font-family:-apple-system,sans-serif;max-width:1200px;margin:0 auto;padding:20px;background:#f5f5f5}h1{color:#333}table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}th{background:#4f46e5;color:#fff;padding:10px 12px;text-align:left}td{padding:8px 12px;border-bottom:1px solid #eee}tr:hover{background:#f0f0ff}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:24px}.stat-card{background:#fff;border-radius:8px;padding:16px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1)}.stat-value{font-size:24px;font-weight:700;color:#4f46e5}.stat-label{font-size:12px;color:#666}</style></head><body><h1>测试报告</h1><p>生成时间: ${new Date().toLocaleString("zh-CN")}</p><div class="stats"><div class="stat-card"><div class="stat-value">${testCases.length}</div><div class="stat-label">总用例数</div></div></div><table><thead><tr><th>编号</th><th>模块</th><th>标题</th><th>优先级</th><th>评审状态</th><th>执行状态</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
            const blob = new Blob([html], { type: "text/html;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = "test_report_" + new Date().toISOString().slice(0, 10) + ".html";
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            toast("报告已导出", "success");
        });
    }

    // ---- Markdown Preview ----
    const _mdTextarea = document.getElementById("requirementText");
    const _mdPreview = document.getElementById("mdPreview");
    if (typeof marked !== "undefined") {
        marked.setOptions({ breaks: true, gfm: true });
    }
    document.querySelectorAll(".input-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".input-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            const isPreview = tab.dataset.itab === "preview";
            if (_mdTextarea) _mdTextarea.style.display = isPreview ? "none" : "";
            if (_mdPreview) {
                _mdPreview.style.display = isPreview ? "" : "none";
                if (isPreview && typeof marked !== "undefined") {
                    _mdPreview.innerHTML = marked.parse(_mdTextarea ? _mdTextarea.value : "");
                }
            }
        });
    });
    if (_mdTextarea) {
        _mdTextarea.addEventListener("input", () => {
            if (_mdPreview && _mdPreview.style.display !== "none" && typeof marked !== "undefined") {
                _mdPreview.innerHTML = marked.parse(_mdTextarea.value);
            }
        });
    }
}
