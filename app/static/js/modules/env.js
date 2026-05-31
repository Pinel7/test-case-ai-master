// ====== Environment Config Manager ======
// Dependencies: window.toast, window.escHtml, window.showConfirm, window.getTestCases

function initEnvManager() {
    const toast = window.toast;
    const escHtml = window.escHtml;
    const showConfirm = window.showConfirm;
    const getTestCases = window.getTestCases;

    const STORAGE_ENV_KEY = "itg_environments";
    function loadEnvs() { try { return JSON.parse(localStorage.getItem(STORAGE_ENV_KEY)) || []; } catch { return []; } }
    function saveEnvs(envs) { try { localStorage.setItem(STORAGE_ENV_KEY, JSON.stringify(envs)); } catch (_) {} }

    function renderEnvs() {
        const envs = loadEnvs();
        const list = document.getElementById("envList");
        const empty = document.getElementById("envEmpty");
        if (!list || !empty) return;
        if (envs.length === 0) { list.style.display = "none"; empty.style.display = ""; return; }
        list.style.display = ""; empty.style.display = "none";
        list.innerHTML = envs.map((env, idx) => {
            const accHtml = (env.accounts || []).map(a =>
                `<span class="env-account-chip" data-env-idx="${idx}" data-role="${escHtml(a.role)}" data-username="${escHtml(a.username)}"><span class="env-role">${escHtml(a.role)}</span> ${escHtml(a.username)}</span>`
            ).join("");
            const hdrHtml = (env.headers || []).map(h =>
                `<span class="env-header-chip">${escHtml(h.key)}: ${escHtml(h.value)}</span>`
            ).join("");
            return `<div class="env-card"><div class="env-card-header"><span class="env-card-name">${escHtml(env.name)}</span><span class="env-card-url">${escHtml(env.base_url || "(未设置 URL)")}</span><div class="env-card-actions"><button class="btn btn-ghost btn-sm env-edit-btn" data-idx="${idx}"><i class="bi bi-pencil"></i></button><button class="btn btn-ghost btn-sm env-copy-btn" data-idx="${idx}" title="复制 URL 占位符"><i class="bi bi-clipboard"></i></button><button class="btn btn-ghost btn-sm env-del-btn" data-idx="${idx}"><i class="bi bi-trash text-danger"></i></button></div></div>${accHtml ? '<div class="env-card-section-title">账号</div><div>' + accHtml + '</div>' : ''}${hdrHtml ? '<div class="env-card-section-title">请求头</div><div>' + hdrHtml + '</div>' : ''}</div>`;
        }).join("");

        list.querySelectorAll(".env-edit-btn").forEach(btn => btn.addEventListener("click", () => openEnvModal(parseInt(btn.dataset.idx))));
        list.querySelectorAll(".env-copy-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const env = loadEnvs()[parseInt(btn.dataset.idx)];
                if (!env) return;
                navigator.clipboard.writeText("{{env." + env.name.toUpperCase() + ".URL}}").then(() => toast("已复制占位符", "success")).catch(() => {});
            });
        });
        list.querySelectorAll(".env-del-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const ok = await showConfirm("确定删除环境配置？");
                if (!ok) return;
                const envs2 = loadEnvs(); envs2.splice(parseInt(btn.dataset.idx), 1); saveEnvs(envs2); renderEnvs(); toast("已删除", "success");
            });
        });
        list.querySelectorAll(".env-account-chip").forEach(chip => {
            chip.addEventListener("click", () => {
                const envName = chip.closest(".env-card").querySelector(".env-card-name").textContent.toUpperCase();
                navigator.clipboard.writeText("{{env." + envName + ".USER." + chip.dataset.role.toUpperCase() + "." + chip.dataset.username.toUpperCase() + "}}").then(() => toast("已复制账号占位符", "success")).catch(() => {});
            });
        });
    }

    let editingEnvIdx = -1;
    let envBsModal = null;
    try { envBsModal = new bootstrap.Modal(document.getElementById("envModal")); } catch(_) {}

    function openEnvModal(idx) {
        editingEnvIdx = idx;
        const envs = loadEnvs();
        const env = idx >= 0 && idx < envs.length ? envs[idx] : null;
        document.getElementById("envModalTitle").textContent = env ? "编辑环境" : "新建环境";
        document.getElementById("envFormName").value = env ? env.name : "";
        document.getElementById("envFormBaseUrl").value = env ? (env.base_url || "") : "";
        renderEnvFormHeaders(env ? (env.headers || []) : [{ key: "", value: "" }]);
        renderEnvFormAccounts(env ? (env.accounts || []) : [{ role: "", username: "", password: "", note: "" }]);
        if (envBsModal) envBsModal.show();
    }

    function collectEnvForm() {
        const name = document.getElementById("envFormName").value.trim();
        const baseUrl = document.getElementById("envFormBaseUrl").value.trim();
        const headers = []; const accs = [];
        document.querySelectorAll("#envFormHeaders .env-form-row").forEach(row => {
            const inputs = row.querySelectorAll("input");
            if (inputs.length >= 2) { const k = inputs[0].value.trim(), v = inputs[1].value.trim(); if (k) headers.push({ key: k, value: v }); }
        });
        document.querySelectorAll("#envFormAccounts .env-form-row").forEach(row => {
            const inputs = row.querySelectorAll("input");
            if (inputs.length >= 4) { const r = inputs[0].value.trim(), u = inputs[1].value.trim(), p = inputs[2].value.trim(), n = inputs[3].value.trim(); if (r && u) accs.push({ role: r, username: u, password: p, note: n }); }
        });
        return { name, base_url: baseUrl, headers, accounts: accs };
    }

    function renderEnvFormHeaders(headers) {
        const c = document.getElementById("envFormHeaders"); if (!c) return;
        c.innerHTML = headers.map((h, i) =>
            `<div class="env-form-row"><input type="text" class="form-control form-control-sm" placeholder="Header Key" value="${escHtml(h.key)}"><input type="text" class="form-control form-control-sm" placeholder="Value" value="${escHtml(h.value)}"><button class="btn btn-ghost btn-sm env-header-del"><i class="bi bi-x-lg"></i></button></div>`
        ).join("");
        c.querySelectorAll(".env-header-del").forEach(btn => btn.addEventListener("click", function() { const rows = c.querySelectorAll(".env-form-row"); if (rows.length > 1) this.closest(".env-form-row").remove(); }));
    }
    function renderEnvFormAccounts(accounts) {
        const c = document.getElementById("envFormAccounts"); if (!c) return;
        c.innerHTML = accounts.map((a, i) =>
            `<div class="env-form-row"><input type="text" class="form-control form-control-sm" placeholder="角色" value="${escHtml(a.role)}"><input type="text" class="form-control form-control-sm" placeholder="用户名" value="${escHtml(a.username)}"><input type="text" class="form-control form-control-sm" placeholder="密码" value="${escHtml(a.password)}"><input type="text" class="form-control form-control-sm" placeholder="备注" value="${escHtml(a.note)}"><button class="btn btn-ghost btn-sm env-account-del"><i class="bi bi-x-lg"></i></button></div>`
        ).join("");
        c.querySelectorAll(".env-account-del").forEach(btn => btn.addEventListener("click", function() { const rows = c.querySelectorAll(".env-form-row"); if (rows.length > 1) this.closest(".env-form-row").remove(); }));
    }

    document.getElementById("btnEnvSave")?.addEventListener("click", () => {
        const data = collectEnvForm();
        if (!data.name) { toast("请输入环境名称", "warning"); return; }
        const envs = loadEnvs();
        if (editingEnvIdx >= 0 && editingEnvIdx < envs.length) envs[editingEnvIdx] = data;
        else envs.push({ id: "env_" + Date.now(), ...data });
        saveEnvs(envs); if (envBsModal) envBsModal.hide(); renderEnvs(); toast("环境配置已保存", "success");
    });
    document.getElementById("btnEnvAdd")?.addEventListener("click", () => openEnvModal(-1));
    document.getElementById("btnEnvAddHeader")?.addEventListener("click", () => {
        const c = document.getElementById("envFormHeaders"); renderEnvFormHeaders(Array.from({ length: c.querySelectorAll(".env-form-row").length + 1 }, () => ({ key: "", value: "" })));
    });
    document.getElementById("btnEnvAddAccount")?.addEventListener("click", () => {
        const c = document.getElementById("envFormAccounts"); renderEnvFormAccounts(Array.from({ length: c.querySelectorAll(".env-form-row").length + 1 }, () => ({ role: "", username: "", password: "", note: "" })));
    });

    // Hook into detail modal
    function addEnvInsertBar(detailBody) {
        if (!detailBody || document.getElementById("btnEnvInsertPlaceholder")) return;
        const bar = document.createElement("div"); bar.className = "env-insert-bar"; bar.id = "envInsertBar";
        bar.style.display = "none";
        bar.innerHTML = `<div style="position:relative;"><button class="btn btn-ghost btn-sm" id="btnEnvInsertPlaceholder"><i class="bi bi-gear-wide-connected"></i> 插入环境变量</button><div class="env-placeholder-menu" id="envPlaceholderMenu"></div></div><div id="envUsageBadge" class="env-usage-badge" style="display:none;"></div>`;
        detailBody.parentNode.insertBefore(bar, detailBody);
    }

    function updateEnvBadge(tc) {
        const badge = document.getElementById("envUsageBadge"); const bar = document.getElementById("envInsertBar");
        if (!badge || !bar) return;
        const envs = loadEnvs();
        if (envs.length === 0) { bar.style.display = "none"; return; }
        bar.style.display = "";
        const textFields = ["title", "steps", "preconditions", "expected_result", "description", "notes"];
        const used = [];
        textFields.forEach(f => {
            const val = (tc[f] || "").toUpperCase();
            envs.forEach(env => { if (val.includes("{{ENV." + env.name.toUpperCase())) { if (!used.find(u => u === env.name)) used.push(env.name); } });
        });
        if (used.length > 0) { badge.style.display = ""; badge.innerHTML = '<i class="bi bi-gear-wide-connected"></i> 使用了: ' + used.map(u => '<strong>' + escHtml(u) + '</strong>').join(", "); }
        else { badge.style.display = "none"; }
        const menu = document.getElementById("envPlaceholderMenu");
        if (menu) {
            let items = envs.map(e => `<button class="env-placeholder-item" data-placeholder="{{env.${e.name.toUpperCase()}.URL}}"><code>{{env.${e.name.toUpperCase()}.URL}}</code> <small>${escHtml(e.name)} 基础 URL</small></button>`).join("");
            envs.forEach(e => {
                (e.accounts || []).forEach(a => {
                    items += `<button class="env-placeholder-item" data-placeholder="{{env.${e.name.toUpperCase()}.USER.${a.role.toUpperCase()}.${a.username.toUpperCase()}}}"><code>{{env.${e.name.toUpperCase()}.USER.${a.role.toUpperCase()}.${a.username.toUpperCase()}}}</code> <small>${escHtml(e.name)} / ${escHtml(a.role)}</small></button>`;
                });
            });
            menu.innerHTML = items;
            menu.querySelectorAll(".env-placeholder-item").forEach(item => {
                item.addEventListener("click", function() {
                    navigator.clipboard.writeText(this.dataset.placeholder).then(() => { toast("已复制 " + this.dataset.placeholder, "success"); menu.classList.remove("show"); }).catch(() => {});
                });
            });
            document.getElementById("btnEnvInsertPlaceholder")?.addEventListener("click", (e) => {
                e.stopPropagation(); menu.classList.toggle("show");
            });
            document.addEventListener("click", (e) => { if (!e.target.closest("#btnEnvInsertPlaceholder") && !e.target.closest("#envPlaceholderMenu")) menu.classList.remove("show"); });
        }
    }

    // Hook openDetailModal
    if (typeof window.openDetailModal === "function") {
        const _origDetail = window.openDetailModal;
        window.openDetailModal = function(idx) {
            if (_origDetail) _origDetail(idx);
            const body = document.getElementById("detailModalBody");
            if (body) addEnvInsertBar(body);
            const tc = getTestCases()[idx];
            if (tc) updateEnvBadge(tc);
        };
    }

    renderEnvs();
}
