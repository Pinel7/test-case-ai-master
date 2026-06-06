// ====== Auth System & Setup Guide ======
// Dependencies: window.toast, window.showConfirm, window.navigateTo, window.getTestCases,
//               window.userApiKey, window.userModel (getter/setter), window.sessionTokens (via getter)

let authToken = null;
let currentUser = null;
window.currentUser = null;
const AUTH_TOKEN_KEY = "itg_auth_token";

function getAuthHeaders() {
    return authToken ? { "Authorization": "Bearer " + authToken } : {};
}
window.getAuthHeaders = getAuthHeaders;

// ---- Login button handler (top-level, not waiting for DOMContentLoaded) ----
document.getElementById("btnOlLogin")?.addEventListener("click", async () => {
    console.log("[Auth] Login button clicked (top-level)");
    const btn = document.getElementById("btnOlLogin");
    if (!btn) { console.error("[Auth] btnOlLogin not found!"); return; }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> 登录中...';
    try {
        await doLogin(
            document.getElementById("olLoginUsername").value,
            document.getElementById("olLoginPassword").value,
            true
        );
    } catch(e) {
        console.error("[Auth] doLogin error:", e);
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i> 登录';
});

function showLoginOverlay() {
    const overlay = document.getElementById("loginOverlay");
    if (overlay) overlay.style.display = "flex";
}

function hideLoginOverlay() {
    const overlay = document.getElementById("loginOverlay");
    if (overlay) overlay.style.display = "none";
}

function switchOverlayMode(mode) {
    document.querySelectorAll("#loginOverlay .auth-tabs-link").forEach(t => t.classList.remove("active"));
    document.querySelector(`#loginOverlay .auth-tabs-link[data-amode="${mode}"]`)?.classList.add("active");
    const olf = document.getElementById("olFormLogin"); if (olf) olf.style.display = mode === "login" ? "" : "none";
    const orf = document.getElementById("olFormRegister"); if (orf) orf.style.display = mode === "register" ? "" : "none";
    const ole = document.getElementById("olLoginError"); if (ole) ole.style.display = "none";
    const ore = document.getElementById("olRegError"); if (ore) ore.style.display = "none";
    if (mode === "register" && typeof loadCaptcha === "function") {
        setTimeout(() => loadCaptcha("ol"), 100);
    }
}

function switchAuthMode(mode) {
    document.querySelectorAll("#authModal .auth-tabs-link").forEach(t => t.classList.remove("active"));
    document.querySelector(`#authModal .auth-tabs-link[data-amode="${mode}"]`)?.classList.add("active");
    const afl = document.getElementById("authFormLogin"); if (afl) afl.style.display = mode === "login" ? "" : "none";
    const afr = document.getElementById("authFormRegister"); if (afr) afr.style.display = mode === "register" ? "" : "none";
    const amt = document.getElementById("authModalTitle"); if (amt) amt.textContent = mode === "login" ? "登录" : "注册";
    const ale = document.getElementById("authLoginError"); if (ale) ale.style.display = "none";
    const are = document.getElementById("authRegError"); if (are) are.style.display = "none";
    if (mode === "register" && typeof loadCaptcha === "function") {
        setTimeout(() => loadCaptcha("auth"), 100);
    }
}

function updateAuthUI() {
    const userNameEl = document.getElementById("sidebarUserName");
    const authBtn = document.getElementById("btnAuth");
    const logoutBtn = document.getElementById("btnLogout");
    const avatarEl = document.getElementById("sidebarUserAvatar");
    const setupBtn = document.getElementById("btnSetupGuide");
    if (currentUser && currentUser.id > 0) {
        if (userNameEl) userNameEl.textContent = currentUser.username;
        if (authBtn) authBtn.style.display = "none";
        if (logoutBtn) logoutBtn.style.display = "";
        if (avatarEl) avatarEl.innerHTML = '<i class="bi bi-person-check"></i>';
        if (setupBtn) setupBtn.style.display = "";
    } else {
        if (userNameEl) userNameEl.textContent = "未登录";
        if (authBtn) authBtn.style.display = "";
        if (logoutBtn) logoutBtn.style.display = "none";
        if (avatarEl) avatarEl.innerHTML = '<i class="bi bi-person-circle"></i>';
        if (setupBtn) setupBtn.style.display = "none";
    }
}

async function loadUserSettings() {
    if (!authToken || !currentUser || currentUser.id <= 0) return;
    try {
        const resp = await fetch("/api/user/settings", { headers: getAuthHeaders() });
        if (resp.ok) {
            const data = await resp.json();
            if (data.api_key) {
                const input = document.getElementById("apiKeyInput");
                window.userApiKey = data.api_key;
                if (input) input.value = data.api_key;
                try { localStorage.setItem("itg_apikey", data.api_key); } catch (_) {}
                updateApiWarnDot();
            }
            if (data.model) {
                window.userModel = data.model;
                const modelSelect = document.getElementById("modelSelect");
                const customModelInput = document.getElementById("customModelInput");
                const stdModels = ["deepseek-chat","deepseek-reasoner","claude-sonnet-4-20250514","claude-opus-4-20250514","claude-haiku-4-20250514"];
                if (stdModels.includes(data.model)) {
                    if (modelSelect) modelSelect.value = data.model;
                    try { localStorage.setItem("itg_model", data.model); } catch (_) {}
                } else {
                    if (customModelInput) customModelInput.value = data.model;
                    try { localStorage.setItem("itg_usermodel", data.model); } catch (_) {}
                }
            }
            if (data.theme) {
                try { localStorage.setItem("itg_theme", data.theme); } catch (_) {}
                if (data.theme === "dark") {
                    document.documentElement.setAttribute("data-theme", "dark");
                    const btn = document.getElementById("btnThemeToggle");
                    if (btn) btn.innerHTML = '<i class="bi bi-sun"></i>';
                }
            }
        }
    } catch(_) {}
}

async function saveUserSettings(settings) {
    if (!authToken || !currentUser || currentUser.id <= 0) return;
    try {
        await fetch("/api/user/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings),
        });
    } catch(_) {}
}

function updateApiWarnDot() {
    const dot = document.getElementById("apiWarnDot");
    if (!dot) return;
    dot.style.display = window.userApiKey ? "none" : "";
}

function refreshHomePage() {
    const usernameEl = document.getElementById("homeUsername");
    const apiKeyStatus = document.getElementById("homeApiKeyStatus");
    const apiKeyHint = document.getElementById("homeApiKeyHint");
    const modelEl = document.getElementById("homeModel");
    const caseCountEl = document.getElementById("homeCaseCount");
    const tokenCountEl = document.getElementById("homeTokenCount");
    const usageSection = document.getElementById("homeUsageSection");
    const homeKeyInput = document.getElementById("homeApiKeyInput");
    const homeModelSelect = document.getElementById("homeModelSelect");
    const homeThemeLabel = document.getElementById("homeThemeLabel");
    const homeThemeBtn = document.getElementById("homeBtnTheme");
    const apiKeyInput = document.getElementById("apiKeyInput");

    if (currentUser && currentUser.id > 0) {
        if (usernameEl) usernameEl.textContent = currentUser.username;
    } else {
        if (usernameEl) usernameEl.textContent = "未登录";
    }

    const hasKey = !!(window.userApiKey || (apiKeyInput && apiKeyInput.value.trim()));
    if (apiKeyStatus) {
        apiKeyStatus.innerHTML = hasKey
            ? '<span class="home-status-dot status-on"></span> 已配置'
            : '<span class="home-status-dot status-off"></span> 未配置';
    }
    if (apiKeyHint) {
        apiKeyHint.textContent = hasKey ? "Key 已保存" : "请在下方的设置中配置 API Key";
    }

    const modelVal = window.userModel || (document.getElementById("modelSelect")?.value) || "deepseek-chat";
    if (modelEl) modelEl.textContent = modelVal;

    const count = window.getTestCases ? window.getTestCases().length : 0;
    if (caseCountEl) caseCountEl.textContent = String(count);
    const hint = document.getElementById("homeCaseHint");
    if (hint) hint.textContent = count > 0 ? "共 " + count + " 条用例" : "生成或导入用例后更新";

    const tokens = window.getSessionTokens ? window.getSessionTokens() : 0;
    if (tokenCountEl) tokenCountEl.textContent = tokens.toLocaleString();
    if (usageSection) usageSection.style.display = tokens > 0 ? "" : "none";

    const currentKey = window.userApiKey || (apiKeyInput ? apiKeyInput.value.trim() : "");
    if (homeKeyInput && homeKeyInput.value !== currentKey) homeKeyInput.value = currentKey;

    if (homeModelSelect) {
        const currentModel = window.userModel || (document.getElementById("modelSelect")?.value) || "deepseek-chat";
        if (homeModelSelect.value !== currentModel) homeModelSelect.value = currentModel;
    }
    if (homeThemeBtn && homeThemeLabel) {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        homeThemeBtn.innerHTML = isDark
            ? '<i class="bi bi-sun"></i> <span id="homeThemeLabel">亮色模式</span>'
            : '<i class="bi bi-moon-stars"></i> <span id="homeThemeLabel">暗色模式</span>';
    }
}

function initHomePage() {
    document.querySelectorAll(".home-quick-btn[data-page]").forEach(btn => {
        btn.addEventListener("click", () => window.navigateTo(btn.dataset.page));
    });
    const libBtn = document.getElementById("homeBtnOpenLib");
    if (libBtn) {
        libBtn.addEventListener("click", () => {
            const navItem = document.querySelector('[data-page="cases"]');
            if (navItem) navItem.click();
            setTimeout(() => {
                const libTrigger = document.getElementById("btnOpenLib");
                if (libTrigger) libTrigger.click();
            }, 100);
        });
    }

    const homeKeyInput = document.getElementById("homeApiKeyInput");
    const homeToggleKey = document.getElementById("homeBtnToggleKey");
    const homeTestKey = document.getElementById("homeBtnTestKey");
    const homeKeyResult = document.getElementById("homeKeyTestResult");
    const apiKeyInput = document.getElementById("apiKeyInput");

    if (homeKeyInput && apiKeyInput) {
        homeKeyInput.addEventListener("input", () => {
            const val = homeKeyInput.value.trim();
            window.userApiKey = val;
            apiKeyInput.value = val;
            try { localStorage.setItem("itg_apikey", val); } catch (_) {}
            updateApiWarnDot();
            if (homeKeyResult) { homeKeyResult.textContent = ""; homeKeyResult.className = "home-key-test-result"; }
        });
    }
    if (homeToggleKey) {
        homeToggleKey.addEventListener("click", () => {
            const isPass = homeKeyInput.type === "password";
            homeKeyInput.type = isPass ? "text" : "password";
            homeToggleKey.innerHTML = isPass ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
        });
    }
    if (homeTestKey) {
        homeTestKey.addEventListener("click", async () => {
            const key = homeKeyInput ? homeKeyInput.value.trim() : "";
            if (!key) {
                if (homeKeyResult) { homeKeyResult.textContent = "请先输入 API Key"; homeKeyResult.className = "home-key-test-result error"; }
                return;
            }
            homeTestKey.disabled = true;
            homeTestKey.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> 测试中...';
            if (homeKeyResult) { homeKeyResult.textContent = ""; homeKeyResult.className = "home-key-test-result"; }
            try {
                const resp = await fetch("/api/auth/test-key", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ api_key: key }),
                });
                const data = await resp.json();
                if (resp.ok && data.valid) {
                    if (homeKeyResult) {
                        homeKeyResult.textContent = "连接成功 (" + (data.model || "") + ")";
                        homeKeyResult.className = "home-key-test-result success";
                    }
                    saveUserSettings({ api_key: key });
                } else {
                    if (homeKeyResult) {
                        homeKeyResult.textContent = data.message || "验证失败";
                        homeKeyResult.className = "home-key-test-result error";
                    }
                }
            } catch(e) {
                if (homeKeyResult) { homeKeyResult.textContent = "网络错误"; homeKeyResult.className = "home-key-test-result error"; }
            }
            homeTestKey.disabled = false;
            homeTestKey.innerHTML = '<i class="bi bi-plugin"></i> 测试连接';
        });
    }

    const homeModelSelect = document.getElementById("homeModelSelect");
    const modelSelect = document.getElementById("modelSelect");
    if (homeModelSelect && modelSelect) {
        homeModelSelect.addEventListener("change", () => {
            modelSelect.value = homeModelSelect.value;
            window.userModel = "";
            try { localStorage.setItem("itg_model", homeModelSelect.value); } catch (_) {}
        });
    }

    const homeThemeBtn = document.getElementById("homeBtnTheme");
    if (homeThemeBtn) {
        homeThemeBtn.addEventListener("click", () => {
            const btn = document.getElementById("btnThemeToggle");
            if (btn) btn.click();
            setTimeout(refreshHomePage, 50);
        });
    }
}

function setupAutoSaveSettings() {
    let saveTimer;
    function debounceSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            const theme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
            const model = window.userModel || (document.getElementById("modelSelect")?.value) || "";
            const key = window.userApiKey || (document.getElementById("apiKeyInput")?.value.trim() || "");
            saveUserSettings({ theme, model, api_key: key });
        }, 2000);
    }
    const apiKeyInput = document.getElementById("apiKeyInput");
    const customModelInput = document.getElementById("customModelInput");
    const modelSelect = document.getElementById("modelSelect");
    const btnThemeToggle = document.getElementById("btnThemeToggle");
    if (apiKeyInput) apiKeyInput.addEventListener("input", debounceSave);
    if (customModelInput) customModelInput.addEventListener("input", debounceSave);
    if (modelSelect) modelSelect.addEventListener("change", debounceSave);
    if (btnThemeToggle) btnThemeToggle.addEventListener("click", debounceSave);
}

async function checkAuth() {
    const saved = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!saved) {
        updateAuthUI();
        if (typeof window.refreshHomePage === "function") window.refreshHomePage();
        showLoginOverlay();
        return;
    }
    authToken = saved;
    try {
        const resp = await fetch("/api/auth/me", { headers: getAuthHeaders() });
        if (resp.ok) {
            currentUser = await resp.json();
            window.currentUser = currentUser;
            if (currentUser && currentUser.id > 0) {
                hideLoginOverlay();
                await loadUserSettings();
                window.navigateTo("home");
                if (typeof window.refreshHomePage === "function") window.refreshHomePage();
            } else {
                showLoginOverlay();
            }
        } else {
            authToken = null;
            currentUser = null;
            window.currentUser = null;
            localStorage.removeItem(AUTH_TOKEN_KEY);
            showLoginOverlay();
        }
    } catch(e) {
        authToken = null;
        currentUser = null;
        window.currentUser = null;
        localStorage.removeItem(AUTH_TOKEN_KEY);
        showLoginOverlay();
    }
    updateAuthUI();
}

async function doLogin(username, password, isOverlay = false) {
    console.log("[Auth] doLogin called, username:", username, "isOverlay:", isOverlay);
    const toast = window.toast;
    const errEl = document.getElementById(isOverlay ? "olLoginError" : "authLoginError");
    try {
        const resp = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });
        const data = await resp.json();
        if (!resp.ok) {
            const msg = data.detail?.message || "登录失败";
            if (errEl) { errEl.textContent = msg; errEl.style.display = ""; }
            return false;
        }
        authToken = data.token;
        currentUser = data.user;
        window.currentUser = currentUser;
        localStorage.setItem(AUTH_TOKEN_KEY, authToken);
        updateAuthUI();
        hideLoginOverlay();
        try { const modal = bootstrap.Modal.getInstance(document.getElementById("authModal")); if (modal) modal.hide(); } catch (_) {}
        toast("登录成功，欢迎 " + currentUser.username, "success");
        await loadUserSettings();
        window.navigateTo("home");
        setTimeout(showSetupGuideIfNeeded, 800);
        return true;
    } catch(e) {
        if (errEl) { errEl.textContent = "网络错误: " + e.message; errEl.style.display = ""; }
        return false;
    }
}

async function loadCaptcha(prefix) {
    prefix = prefix || "ol";
    const qEl = document.getElementById(prefix + "CaptchaQuestion");
    const answerEl = document.getElementById(prefix + "CaptchaAnswer");
    if (!qEl) return;
    try {
        const resp = await fetch("/api/auth/captcha");
        if (!resp.ok) return;
        const data = await resp.json();
        window._captchaId = data.id;
        qEl.textContent = data.question;
        if (answerEl) answerEl.value = "";
    } catch (_) {
        qEl.textContent = "加载失败";
    }
}

async function doRegister(username, password, isOverlay = false) {
    const toast = window.toast;
    const errEl = document.getElementById(isOverlay ? "olRegError" : "authRegError");
    // Client-side pre-validation
    if (!/^[a-zA-Z一-鿿][a-zA-Z0-9_一-鿿]{1,29}$/.test(username)) {
        const msg = "用户名需以字母或中文开头，只能包含字母、数字、下划线";
        if (errEl) { errEl.textContent = msg; errEl.style.display = ""; }
        return false;
    }
    if (password.length < 8) {
        const msg = "密码至少8个字符";
        if (errEl) { errEl.textContent = msg; errEl.style.display = ""; }
        return false;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9!@#$%^&*()_+\[\]{};':"\\|,.<>\/?~`-]/.test(password)) {
        const msg = "密码必须包含字母和数字或特殊字符";
        if (errEl) { errEl.textContent = msg; errEl.style.display = ""; }
        return false;
    }
    // Gather captcha
    const captchaPrefix = isOverlay ? "ol" : "auth";
    const captchaId = window._captchaId || "";
    const captchaAnswer = parseInt(document.getElementById(captchaPrefix + "CaptchaAnswer")?.value || "") || 0;
    try {
        const resp = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, captcha_id: captchaId, captcha_answer: captchaAnswer }),
        });
        const data = await resp.json();
        if (!resp.ok) {
            const msg = data.detail?.message || "注册失败";
            if (errEl) { errEl.textContent = msg; errEl.style.display = ""; }
            loadCaptcha(captchaPrefix);  // Refresh captcha on error
            return false;
        }
        authToken = data.token;
        currentUser = data.user;
        window.currentUser = currentUser;
        localStorage.setItem(AUTH_TOKEN_KEY, authToken);
        updateAuthUI();
        hideLoginOverlay();
        try { const modal = bootstrap.Modal.getInstance(document.getElementById("authModal")); if (modal) modal.hide(); } catch (_) {}
        toast("注册成功，欢迎 " + currentUser.username, "success");
        await loadUserSettings();
        window.navigateTo("home");
        setTimeout(showSetupGuideIfNeeded, 800);
        return true;
    } catch(e) {
        if (errEl) { errEl.textContent = "网络错误: " + e.message; errEl.style.display = ""; }
        loadCaptcha(captchaPrefix);
        return false;
    }
}

async function doLogout() {
    if (!authToken) return;
    try {
        await fetch("/api/auth/logout", { method: "POST", headers: getAuthHeaders() });
    } catch(_) {}
    authToken = null;
    currentUser = null;
    window.currentUser = null;
    localStorage.removeItem(AUTH_TOKEN_KEY);
    updateAuthUI();
    showLoginOverlay();
    window.toast("已退出登录", "info");
}

// ---- Setup Guide ----
function showSetupGuide() {
    const el = document.getElementById("setupOverlay");
    if (el) el.style.display = "";
    const setupInput = document.getElementById("setupApiKeyInput");
    if (setupInput && window.userApiKey) setupInput.value = window.userApiKey;
    const setupModel = document.querySelector(`input[name="setupModel"][value="${window.userModel || (document.getElementById("modelSelect")?.value) || "deepseek-chat"}"]`);
    if (setupModel) setupModel.checked = true;
}

function hideSetupGuide() {
    const el = document.getElementById("setupOverlay");
    if (el) el.style.display = "none";
}

function showSetupGuideIfNeeded() {
    if (!currentUser || currentUser.id <= 0) return;
    const shownKey = "itg_setup_shown_" + currentUser.id;
    if (localStorage.getItem(shownKey)) return;
    localStorage.setItem(shownKey, "1");
    setTimeout(showSetupGuide, 600);
}

// ---- Auth header auto-attach ----
(function() {
    const origFetch = window.fetch;
    window.fetch = function(url, options) {
        if (typeof url === 'string' && url.startsWith('/api/')) {
            options = options || {};
            if (authToken) {
                options.headers = options.headers || {};
                options.headers['Authorization'] = 'Bearer ' + authToken;
            }
        }
        return origFetch.call(window, url, options);
    };
})();

function initAuth() {
    const toast = window.toast;
    const showConfirm = window.showConfirm;

    // Overlay tab switching
    document.querySelectorAll("#loginOverlay .auth-tabs-link").forEach(tab => {
        tab.addEventListener("click", () => switchOverlayMode(tab.dataset.amode));
    });

    // Auth modal tab switching
    document.querySelectorAll("#authModal .auth-tabs-link").forEach(tab => {
        tab.addEventListener("click", () => switchAuthMode(tab.dataset.amode));
    });

    // Overlay register button
    document.getElementById("btnOlRegister")?.addEventListener("click", async () => {
        const username = document.getElementById("olRegUsername").value;
        const password = document.getElementById("olRegPassword").value;
        const confirm = document.getElementById("olRegConfirm").value;
        const errEl = document.getElementById("olRegError");
        if (password !== confirm) {
            if (errEl) { errEl.textContent = "两次密码输入不一致"; errEl.style.display = ""; }
            return;
        }
        const btn = document.getElementById("btnOlRegister");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> 注册中...';
        await doRegister(username, password, true);
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-person-plus me-1"></i> 注册';
    });

    // Captcha refresh
    document.getElementById("btnOlRefreshCaptcha")?.addEventListener("click", () => loadCaptcha("ol"));
    document.getElementById("btnAuthRefreshCaptcha")?.addEventListener("click", () => loadCaptcha("auth"));

    // Sidebar auth button → modal
    document.getElementById("btnAuth")?.addEventListener("click", () => {
        switchAuthMode("login");
        const modal = new bootstrap.Modal(document.getElementById("authModal"));
        modal.show();
    });

    // Auth modal buttons
    document.getElementById("btnAuthLogin")?.addEventListener("click", async () => {
        const btn = document.getElementById("btnAuthLogin");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> 登录中...';
        await doLogin(
            document.getElementById("authLoginUsername").value,
            document.getElementById("authLoginPassword").value,
            false
        );
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i> 登录';
    });

    document.getElementById("btnAuthRegister")?.addEventListener("click", async () => {
        const username = document.getElementById("authRegUsername").value;
        const password = document.getElementById("authRegPassword").value;
        const confirm = document.getElementById("authRegConfirm").value;
        const errEl = document.getElementById("authRegError");
        if (password !== confirm) {
            if (errEl) { errEl.textContent = "两次密码输入不一致"; errEl.style.display = ""; }
            return;
        }
        const btn = document.getElementById("btnAuthRegister");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> 注册中...';
        await doRegister(username, password, false);
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-person-plus me-1"></i> 注册';
    });

    // Logout
    document.getElementById("btnLogout")?.addEventListener("click", async () => {
        if (await showConfirm("确定要退出登录吗？")) {
            await doLogout();
        }
    });

    // Enter key handlers
    document.getElementById("olLoginPassword")?.addEventListener("keydown", e => {
        if (e.key === "Enter") document.getElementById("btnOlLogin")?.click();
    });
    document.getElementById("olRegConfirm")?.addEventListener("keydown", e => {
        if (e.key === "Enter") document.getElementById("btnOlRegister")?.click();
    });
    document.getElementById("authLoginPassword")?.addEventListener("keydown", e => {
        if (e.key === "Enter") document.getElementById("btnAuthLogin")?.click();
    });
    document.getElementById("authRegConfirm")?.addEventListener("keydown", e => {
        if (e.key === "Enter") document.getElementById("btnAuthRegister")?.click();
    });

    // ---- Setup Guide events ----
    document.getElementById("btnSetupTestKey")?.addEventListener("click", async () => {
        const key = document.getElementById("setupApiKeyInput").value.trim();
        const resultEl = document.getElementById("setupTestResult");
        const btn = document.getElementById("btnSetupTestKey");
        if (!key) {
            resultEl.textContent = "请先输入 API Key";
            resultEl.className = "setup-test-result error";
            return;
        }
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> 测试中...';
        resultEl.textContent = "";
        try {
            const resp = await fetch("/api/auth/test-key", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ api_key: key }),
            });
            const data = await resp.json();
            if (resp.ok && data.valid) {
                resultEl.textContent = "Key 有效！(" + (data.model || "") + ")";
                resultEl.className = "setup-test-result success";
                window.userApiKey = key;
                const apiKeyInput = document.getElementById("apiKeyInput");
                if (apiKeyInput) apiKeyInput.value = key;
                localStorage.setItem("itg_apikey", key);
                saveUserSettings({ api_key: key });
                updateApiWarnDot();
            } else {
                resultEl.textContent = data.message || "Key 验证失败，请检查是否输入正确";
                resultEl.className = "setup-test-result error";
            }
        } catch(e) {
            resultEl.textContent = "网络错误: " + e.message;
            resultEl.className = "setup-test-result error";
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-plugin"></i> 测试连接';
    });

    document.getElementById("btnSetupToggleKey")?.addEventListener("click", () => {
        const input = document.getElementById("setupApiKeyInput");
        if (!input) return;
        input.type = input.type === "password" ? "text" : "password";
    });

    document.querySelectorAll(".setup-model").forEach(el => {
        el.addEventListener("click", () => {
            const radio = el.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
        });
    });

    document.getElementById("btnSetupDone")?.addEventListener("click", () => {
        const setupKey = document.getElementById("setupApiKeyInput").value.trim();
        const apiKeyInput = document.getElementById("apiKeyInput");
        if (setupKey) {
            window.userApiKey = setupKey;
            if (apiKeyInput) apiKeyInput.value = setupKey;
            localStorage.setItem("itg_apikey", setupKey);
            updateApiWarnDot();
        }
        const selectedModel = document.querySelector('input[name="setupModel"]:checked');
        const modelSelect = document.getElementById("modelSelect");
        if (selectedModel) {
            window.userModel = selectedModel.value;
            localStorage.setItem("itg_model", window.userModel);
            if (modelSelect) modelSelect.value = window.userModel;
        }
        hideSetupGuide();
        toast("配置已保存，可以开始使用了！", "success");
    });

    document.getElementById("btnSetupSkip")?.addEventListener("click", () => {
        hideSetupGuide();
        toast("你可以随时点击侧边栏底部的 ? 按钮重新打开引导", "info");
    });

    document.getElementById("btnSetupClose")?.addEventListener("click", hideSetupGuide);
    document.getElementById("btnSetupGuide")?.addEventListener("click", showSetupGuide);

    // Init home page & auto-save
    initHomePage();
    setupAutoSaveSettings();
}

// Exports
window.checkAuth = checkAuth;
window.showLoginOverlay = showLoginOverlay;
window.hideLoginOverlay = hideLoginOverlay;
window.updateAuthUI = updateAuthUI;
window.doLogin = doLogin;
window.doRegister = doRegister;
window.doLogout = doLogout;
window.refreshHomePage = refreshHomePage;
window.showSetupGuide = showSetupGuide;
window.switchOverlayMode = switchOverlayMode;
