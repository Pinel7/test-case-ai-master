// ====== RTM (Requirements Traceability Matrix) Page ======
// Dependencies: window.toast, window.escHtml, window.getTestCases, window.setBtnLoading, window.fetchWithRetry, window.setEl

let _rtmData = null;

function initRtm() {
    const toast = window.toast;
    const escHtml = window.escHtml;
    const getTestCases = window.getTestCases;
    const setBtnLoading = window.setBtnLoading;
    const fetchWithRetry = window.fetchWithRetry;
    const setEl = window.setEl;
    const requirementText = document.getElementById("requirementText");

    const btnRtmGenerate = document.getElementById("btnRtmGenerate");
    const btnRtmCopy = document.getElementById("btnRtmCopy");

    async function doRtm() {
        const testCases = getTestCases();
        if (testCases.length === 0) { toast("请先生成测试用例", "warning"); return; }
        if (!requirementText.value.trim()) { toast("请先输入需求文档", "warning"); return; }
        const loading = document.getElementById("rtmLoading");
        const noCases = document.getElementById("rtmNoCases");
        const content = document.getElementById("rtmContent");
        const stats = document.getElementById("rtmStats");
        if (loading) loading.style.display = "";
        if (noCases) noCases.style.display = "none";
        if (content) content.style.display = "none";
        if (stats) stats.style.display = "none";
        setBtnLoading(btnRtmGenerate, true);
        try {
            const resp = await fetchWithRetry("/api/rtm/generate", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requirement_text: requirementText.value,
                    test_cases: testCases,
                    model: window.userModel || document.getElementById("modelSelect")?.value,
                    api_key: window.userApiKey || null,
                }),
            });
            if (!resp.ok) { const err = await resp.json().catch(() => ({})); toast(err.detail?.message || "生成失败", "error"); return; }
            const data = await resp.json();
            _rtmData = data;
            renderRtm(data);
        } catch(e) { toast("请求失败: " + e.message, "error"); }
        finally { if (loading) loading.style.display = "none"; setBtnLoading(btnRtmGenerate, false); }
    }

    function renderRtm(data) {
        const stats = document.getElementById("rtmStats");
        const content = document.getElementById("rtmContent");
        const noCases = document.getElementById("rtmNoCases");
        if (stats) { stats.style.display = ""; setEl("rtmTotal", data.coverage_stats?.total_items || 0); setEl("rtmCovered", data.coverage_stats?.covered || 0); setEl("rtmPartial", data.coverage_stats?.partial || 0); setEl("rtmUncovered", data.coverage_stats?.uncovered || 0); setEl("rtmRate", (data.coverage_stats?.coverage_rate || 0) + "%"); }
        if (content) content.style.display = "";
        if (noCases) noCases.style.display = "none";
        const body = document.getElementById("rtmBody");
        if (!body) return;
        const items = data.items || [];
        if (items.length === 0) { body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--color-text-secondary);">未识别到需求项</td></tr>'; return; }
        body.innerHTML = items.map((item, idx) => {
            const statusLabel = { covered: "已覆盖", partial: "部分覆盖", uncovered: "未覆盖" }[item.coverage_status] || item.coverage_status;
            const caseLinks = (item.matched_case_ids || []).map(id => `<span class="rtm-case-link">${escHtml(id)}</span>`).join(", ");
            return `<tr class="rtm-row-${item.coverage_status}"><td>${escHtml(item.req_id)}</td><td>${escHtml(item.req_title)}</td><td>${escHtml(item.req_content)}</td><td>${caseLinks || "—"}</td><td class="rv-${item.coverage_status}">${statusLabel}</td><td style="font-size:0.78rem;">${escHtml(item.match_reason || "")}</td></tr>`;
        }).join("");
        const usage = document.getElementById("rtmUsage");
        if (usage && data.usage) { usage.style.display = ""; usage.innerHTML = `<i class="bi bi-currency-dollar"></i> 输入 ${data.usage.input_tokens || 0} · 输出 ${data.usage.output_tokens || 0} tokens <span class="text-muted">(${data.usage.model || ""})</span>`; }
    }

    function filterRtm() {
        const status = document.getElementById("rtmFilterStatus")?.value || "";
        const q = (document.getElementById("rtmFilterInput")?.value || "").toLowerCase();
        const rows = document.querySelectorAll("#rtmBody tr");
        rows.forEach(row => {
            const showStatus = !status || row.classList.contains("rtm-row-" + status);
            const showText = !q || row.textContent.toLowerCase().includes(q);
            row.style.display = showStatus && showText ? "" : "none";
        });
    }

    btnRtmGenerate?.addEventListener("click", doRtm);
    btnRtmCopy?.addEventListener("click", () => {
        if (!_rtmData || !_rtmData.items) { toast("请先生成追溯矩阵", "warning"); return; }
        const text = _rtmData.items.map(i => `${i.req_id}\t${i.req_title}\t${i.coverage_status}\t${(i.matched_case_ids || []).join(", ")}`).join("\n");
        navigator.clipboard.writeText(text).then(() => toast("已复制", "success")).catch(() => {});
    });
    document.getElementById("rtmFilterStatus")?.addEventListener("change", filterRtm);
    document.getElementById("rtmFilterInput")?.addEventListener("input", filterRtm);
}
