// ====== Script Generation Page ======
// Dependencies: window.toast, window.escHtml, window.getTestCases, window.setBtnLoading, window.fetchWithRetry

function initScriptGen() {
    const toast = window.toast;
    const escHtml = window.escHtml;
    const getTestCases = window.getTestCases;
    const setBtnLoading = window.setBtnLoading;
    const fetchWithRetry = window.fetchWithRetry;

    document.getElementById("btnScriptGenerate")?.addEventListener("click", async () => {
        const testCases = getTestCases();
        if (testCases.length === 0) { toast("请先生成测试用例", "warning"); return; }
        const btnScript = document.getElementById("btnScriptGenerate");
        const noCases = document.getElementById("scriptNoCases");
        const content = document.getElementById("scriptContent");
        const list = document.getElementById("scriptList");
        const usage = document.getElementById("scriptUsage");
        setBtnLoading(btnScript, true);
        if (noCases) noCases.style.display = "none";
        if (content) content.style.display = "none";
        if (list) list.innerHTML = '<div class="rtm-loading"><div class="spinner-border spinner-border-sm me-2"></div>正在生成脚本...</div>';
        try {
            const resp = await fetchWithRetry("/api/generate-script", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    test_cases: testCases,
                    model: window.userModel || document.getElementById("modelSelect")?.value,
                    api_key: window.userApiKey || null,
                }),
            });
            if (!resp.ok) { const err = await resp.json().catch(() => ({})); toast(err.detail?.message || "生成失败", "error"); return; }
            const data = await resp.json();
            if (content) content.style.display = "";
            if (list && data.scripts) {
                list.innerHTML = data.scripts.map((s, idx) => {
                    const code = escHtml(s.code || "# No code generated");
                    return `<div class="sc-card"><div class="sc-card-header"><span class="sc-id">${escHtml(s.case_id || "")}</span><span class="sc-title">${escHtml(s.title || "")}</span><span class="sc-actions"><button class="btn btn-ghost btn-xs sc-copy-btn"><i class="bi bi-copy"></i></button><button class="btn btn-ghost btn-xs sc-download-btn"><i class="bi bi-download"></i></button></span></div><div class="sc-code"><pre><code>${code}</code></pre></div></div>`;
                }).join("");

                list.querySelectorAll(".sc-copy-btn").forEach((btn, idx) => {
                    btn.addEventListener("click", () => {
                        const code = data.scripts[idx]?.code;
                        if (code) navigator.clipboard.writeText(code).then(() => toast("已复制", "success")).catch(() => {});
                    });
                });
                list.querySelectorAll(".sc-download-btn").forEach((btn, idx) => {
                    btn.addEventListener("click", () => {
                        const s = data.scripts[idx];
                        if (!s || !s.code) return;
                        const blob = new Blob([s.code], { type: "text/x-python;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = s.filename || ("script_" + (s.case_id || idx) + ".py");
                        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                    });
                });
            }
            if (usage && data.usage) { usage.style.display = ""; usage.innerHTML = `<i class="bi bi-currency-dollar"></i> 输入 ${data.usage.input_tokens || 0} · 输出 ${data.usage.output_tokens || 0} tokens <span class="text-muted">(${data.usage.model || ""})</span>`; }
        } catch(e) { toast("请求失败: " + e.message, "error"); }
        finally { setBtnLoading(btnScript, false); }
    });
}
