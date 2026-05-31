// ====== API Test Tool ======
// Dependencies: window.toast, window.escHtml, window.syntaxHighlightJson, window.fetchWithRetry, window.setBtnLoading

function initApiTest() {
    const toast = window.toast;
    const escHtml = window.escHtml;
    const syntaxHighlightJson = window.syntaxHighlightJson;
    const fetchWithRetry = window.fetchWithRetry;
    const setBtnLoading = window.setBtnLoading;

    function renderAptHeaders() {
        const c = document.getElementById("aptHeaders"); if (!c) return;
        if (c.querySelectorAll(".api-test-header-row").length === 0) {
            c.innerHTML = `<div class="api-test-header-row"><input type="text" class="form-control form-control-sm" placeholder="Header Key"><input type="text" class="form-control form-control-sm" placeholder="Value"><button class="btn btn-ghost btn-xs" onclick="this.closest('.api-test-header-row').remove()"><i class="bi bi-x-lg"></i></button></div>`;
        }
    }
    document.getElementById("btnAptAddHdr")?.addEventListener("click", () => {
        const c = document.getElementById("aptHeaders"); if (!c) return;
        const row = document.createElement("div"); row.className = "api-test-header-row";
        row.innerHTML = `<input type="text" class="form-control form-control-sm" placeholder="Header Key"><input type="text" class="form-control form-control-sm" placeholder="Value"><button class="btn btn-ghost btn-xs" onclick="this.closest('.api-test-header-row').remove()"><i class="bi bi-x-lg"></i></button>`;
        c.appendChild(row);
    });
    renderAptHeaders();

    function buildAptEnvMenu() {
        const menu = document.getElementById("aptEnvMenu"); if (!menu) return;
        let html = "";
        try {
            const envs = JSON.parse(localStorage.getItem("itg_environments")) || [];
            if (envs.length === 0) { menu.innerHTML = '<li><span class="dropdown-item-text text-muted">无环境配置</span></li>'; return; }
            envs.forEach((env, idx) => {
                html += `<li><a class="dropdown-item" data-env-idx="${idx}" href="#"><code>{{env.${env.name.toUpperCase()}.URL}}</code> <small>${escHtml(env.name)}</small></a></li>`;
            });
            menu.innerHTML = html;
            menu.querySelectorAll(".dropdown-item").forEach(item => {
                item.addEventListener("click", (e) => {
                    e.preventDefault();
                    const envs2 = JSON.parse(localStorage.getItem("itg_environments")) || [];
                    const env = envs2[parseInt(item.dataset.envIdx)];
                    if (!env) return;
                    const urlInput = document.getElementById("aptUrl");
                    if (urlInput && env.base_url) urlInput.value = env.base_url;
                    const hdrContainer = document.getElementById("aptHeaders");
                    if (hdrContainer && env.headers) {
                        hdrContainer.innerHTML = env.headers.map(h => `<div class="api-test-header-row"><input type="text" class="form-control form-control-sm" value="${escHtml(h.key)}"><input type="text" class="form-control form-control-sm" value="${escHtml(h.value)}"><button class="btn btn-ghost btn-xs" onclick="this.closest('.api-test-header-row').remove()"><i class="bi bi-x-lg"></i></button></div>`).join("");
                    }
                    toast("已加载环境: " + env.name, "success");
                });
            });
        } catch(e) { menu.innerHTML = '<li><span class="dropdown-item-text text-muted">无环境配置</span></li>'; }
    }
    document.getElementById("page-apitest")?.addEventListener("pageshow", buildAptEnvMenu);

    // Sample API buttons
    document.querySelectorAll(".apt-sample-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const method = btn.dataset.method || "GET";
            const url = btn.dataset.url || "";
            const body = btn.dataset.body || "";
            const methodEl = document.getElementById("aptMethod");
            const urlEl = document.getElementById("aptUrl");
            const bodyEl = document.getElementById("aptBody");
            if (methodEl) methodEl.value = method;
            if (urlEl) urlEl.value = url;
            if (bodyEl) bodyEl.value = body;
            document.getElementById("aptResponse").innerHTML = '<div class="api-test-placeholder">点击「发送」发起请求</div>';
            const s = document.getElementById("aptStatus"); if (s) s.textContent = "";
            const d = document.getElementById("aptDuration"); if (d) d.textContent = "";
            toast("已填入示例 " + method + " " + url.replace(/https?:\/\//, "").split("/")[0], "success");
        });
    });

    const btnAptSend = document.getElementById("btnAptSend");
    btnAptSend?.addEventListener("click", async () => {
        const method = document.getElementById("aptMethod")?.value || "GET";
        const url = document.getElementById("aptUrl")?.value.trim();
        if (!url) { toast("请输入 URL", "warning"); return; }
        setBtnLoading(btnAptSend, true);
        const statusEl = document.getElementById("aptStatus");
        const durEl = document.getElementById("aptDuration");
        const respEl = document.getElementById("aptResponse");
        if (statusEl) statusEl.textContent = ""; if (durEl) durEl.textContent = ""; if (respEl) respEl.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>请求中...';
        const headers = {};
        document.querySelectorAll("#aptHeaders .api-test-header-row").forEach(row => {
            const inputs = row.querySelectorAll("input");
            if (inputs.length >= 2) { const k = inputs[0].value.trim(), v = inputs[1].value.trim(); if (k) headers[k] = v; }
        });
        const body = document.getElementById("aptBody")?.value.trim() || "";
        const t0 = performance.now();
        try {
            const resp = await fetchWithRetry("/api/proxy", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ method, url, headers, body }),
            });
            const data = await resp.json();
            const elapsed = Math.round(performance.now() - t0);
            if (data.error) {
                if (respEl) respEl.innerHTML = `<span style="color:#ef4444;">错误: ${escHtml(data.error)}</span>`;
                if (statusEl) statusEl.textContent = "错误";
            } else {
                if (statusEl) statusEl.textContent = data.status + " " + (data.status_text || "");
                if (durEl) durEl.textContent = elapsed + " ms";
                if (respEl) {
                    let bodyHtml = escHtml(data.body || "(空响应)");
                    try {
                        const parsed = JSON.parse(data.body || "null");
                        if (parsed !== null) bodyHtml = syntaxHighlightJson(parsed);
                    } catch(_) {}
                    const hdrStr = data.headers ? Object.entries(data.headers).slice(0, 20).map(([k, v]) => escHtml(k) + ": " + escHtml(v)).join("\n") : "";
                    respEl.innerHTML = `<div style="margin-bottom:8px;font-weight:600;font-size:0.78rem;color:var(--color-text-secondary);">响应头</div><pre style="font-size:0.72rem;margin-bottom:12px;">${hdrStr || "(无)"}</pre><div style="margin-bottom:8px;font-weight:600;font-size:0.78rem;color:var(--color-text-secondary);">响应体</div><pre style="margin:0;">${bodyHtml}</pre>`;
                }
            }
        } catch(e) {
            if (respEl) respEl.innerHTML = `<span style="color:#ef4444;">请求失败: ${escHtml(e.message)}</span>`;
            if (statusEl) statusEl.textContent = "错误";
        } finally {
            setBtnLoading(btnAptSend, false);
        }
    });

    document.getElementById("btnAptClear")?.addEventListener("click", () => {
        const url = document.getElementById("aptUrl"); if (url) url.value = "";
        document.getElementById("aptHeaders").innerHTML = ""; renderAptHeaders();
        document.getElementById("aptBody").value = "";
        document.getElementById("aptResponse").innerHTML = '<div class="api-test-placeholder">点击「发送」发起请求</div>';
        const s = document.getElementById("aptStatus"); if (s) s.textContent = "";
        const d = document.getElementById("aptDuration"); if (d) d.textContent = "";
    });
}
