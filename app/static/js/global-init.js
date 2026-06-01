/**
 * Global initializer for TestCaseAI — shared across all pages (workspace & tools).
 * Handles: sidebar, theme, auth UI enhancement, confirm/alert modals, notifications, contacts.
 * Loaded after shared.js and auth.js.
 */

document.addEventListener("DOMContentLoaded", () => {

    // ====== Confirm / Alert / Prompt Modal ======
    let _confirmResolve = null;
    let _promptResolve = null;
    let confirmModalBs = null;
    const confirmModalEl = document.getElementById("confirmModal");
    try {
        if (confirmModalEl && typeof bootstrap !== "undefined" && bootstrap.Modal) {
            confirmModalBs = new bootstrap.Modal(confirmModalEl, { backdrop: 'static', keyboard: false });
            confirmModalEl.addEventListener("hidden.bs.modal", () => {
                if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
                if (_promptResolve) { _promptResolve(null); _promptResolve = null; }
            });
            document.getElementById("confirmModalOk")?.addEventListener("click", () => {
                const input = document.getElementById("confirmModalInput");
                if (_promptResolve) {
                    const val = input.value;
                    _promptResolve(val); _promptResolve = null;
                    input.value = "";
                } else if (_confirmResolve) {
                    _confirmResolve(true); _confirmResolve = null;
                }
                confirmModalBs.hide();
            });
            document.getElementById("confirmModalCancel")?.addEventListener("click", () => {
                const input = document.getElementById("confirmModalInput");
                if (_promptResolve) {
                    _promptResolve(null); _promptResolve = null;
                    input.value = "";
                }
            });
        }
    } catch (_) {}

    window.showConfirm = function showConfirm(msg, title) {
        return new Promise((resolve) => {
            if (!confirmModalBs || !confirmModalEl) { resolve(confirm(msg)); return; }
            _confirmResolve = resolve;
            document.getElementById("confirmModalTitle").textContent = title || "确认";
            document.getElementById("confirmModalMessage").innerHTML = msg;
            document.getElementById("confirmModalInputWrap").style.display = "none";
            document.getElementById("confirmModalOk").style.display = "";
            document.getElementById("confirmModalCancel").style.display = "";
            confirmModalBs.show();
        });
    };

    window.showCustomDialog = function showCustomDialog(title, bodyHtml, buttons) {
        const modalEl = document.getElementById("customDialogModal");
        if (!modalEl) {
            const div = document.createElement("div");
            div.innerHTML = '<div class="modal fade" id="customDialogModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"></div><div class="modal-footer"></div></div></div></div>';
            document.body.appendChild(div.firstElementChild);
        }
        const el = document.getElementById("customDialogModal");
        el.querySelector(".modal-title").textContent = title;
        el.querySelector(".modal-body").innerHTML = bodyHtml;
        const footer = el.querySelector(".modal-footer");
        footer.innerHTML = "";
        (buttons || []).forEach(btn => {
            const b = document.createElement("button");
            b.className = "btn " + (btn.cls || "btn-secondary");
            b.textContent = btn.text;
            b.addEventListener("click", async () => {
                setBtnLoading(b, true);
                try { await btn.action(); } catch (_) {}
                setBtnLoading(b, false);
                const bs = bootstrap.Modal.getInstance(el); if (bs) bs.hide();
            });
            footer.appendChild(b);
        });
        const bsModal = new bootstrap.Modal(el);
        bsModal.show();
    };

    window.showAlert = function showAlert(msg, title) {
        return new Promise((resolve) => {
            if (!confirmModalBs || !confirmModalEl) { alert(msg); resolve(); return; }
            document.getElementById("confirmModalTitle").textContent = title || "提示";
            document.getElementById("confirmModalMessage").innerHTML = msg;
            document.getElementById("confirmModalInputWrap").style.display = "none";
            document.getElementById("confirmModalOk").style.display = "";
            document.getElementById("confirmModalCancel").style.display = "none";
            confirmModalBs.show();
            const handler = () => { resolve(); confirmModalEl.removeEventListener("hidden.bs.modal", handler); };
            confirmModalEl.addEventListener("hidden.bs.modal", handler);
        });
    };

    window.showPrompt = function showPrompt(msg, defaultVal, title) {
        return new Promise((resolve) => {
            if (!confirmModalBs || !confirmModalEl) { resolve(prompt(msg, defaultVal)); return; }
            _promptResolve = resolve;
            document.getElementById("confirmModalTitle").textContent = title || "输入";
            document.getElementById("confirmModalMessage").innerHTML = msg;
            const wrap = document.getElementById("confirmModalInputWrap");
            wrap.style.display = "";
            const input = document.getElementById("confirmModalInput");
            input.value = defaultVal || "";
            document.getElementById("confirmModalOk").style.display = "";
            document.getElementById("confirmModalCancel").style.display = "";
            confirmModalBs.show();
        });
    };

    // ====== Theme ======
    const STORAGE_THEME_KEY = "itg_theme";
    try {
        const savedTheme = localStorage.getItem(STORAGE_THEME_KEY);
        if (savedTheme === "dark") {
            document.documentElement.setAttribute("data-theme", "dark");
            const btn = document.getElementById("btnThemeToggle");
            if (btn) btn.innerHTML = '<i class="bi bi-sun"></i>';
        }
    } catch (_) {}

    document.getElementById("btnThemeToggle")?.addEventListener("click", () => {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const btn = document.getElementById("btnThemeToggle");
        if (isDark) {
            document.documentElement.removeAttribute("data-theme");
            if (btn) btn.innerHTML = '<i class="bi bi-moon-stars"></i>';
            try { localStorage.setItem(STORAGE_THEME_KEY, "light"); } catch (_) {}
        } else {
            document.documentElement.setAttribute("data-theme", "dark");
            if (btn) btn.innerHTML = '<i class="bi bi-sun"></i>';
            try { localStorage.setItem(STORAGE_THEME_KEY, "dark"); } catch (_) {}
        }
        // Notify auth module for auto-save
        if (typeof window._onThemeToggle === "function") window._onThemeToggle();
    });

    // ====== Sidebar collapse ======
    document.getElementById("btnCollapseSidebar")?.addEventListener("click", () => {
        document.getElementById("sidebar")?.classList.toggle("sidebar-collapsed");
    });

    // ====== Notifications ======
    let notifPollInterval = null;

    function stopNotifPolling() {
        if (notifPollInterval) { clearInterval(notifPollInterval); notifPollInterval = null; }
    }

    async function loadNotifications() {
        try {
            const resp = await fetch("/api/notifications", { headers: window.getAuthHeaders ? window.getAuthHeaders() : {} });
            if (!resp.ok) return;
            const data = await resp.json();
            renderNotifications(data.notifications || []);
            updateNotifBadge(data.unread_count || 0);
        } catch (_) {}
    }
    window.loadNotifications = loadNotifications;

    function renderNotifications(notifs) {
        const container = document.getElementById("notificationsList");
        if (!container) return;
        if (!notifs.length) {
            container.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-inbox" style="font-size:2rem;"></i><p class="mt-2 mb-0">暂无消息</p></div>';
            return;
        }
        container.innerHTML = '<div class="notif-list"></div>';
        const list = container.querySelector(".notif-list");
        notifs.forEach(n => {
            const isUnread = !n.is_read;
            const card = document.createElement("div");
            card.className = "notif-card" + (isUnread ? " notif-unread" : "");
            card.innerHTML = `
                <div class="notif-card-body">
                    <div class="notif-card-header">
                        ${isUnread ? '<span class="notif-dot"></span>' : ''}
                        <strong class="${isUnread ? 'notif-unread-text' : ''}">${escHtml(n.title || '')}</strong>
                        <small class="text-muted">${window.formatTime(n.created_at)}</small>
                    </div>
                    <div class="notif-card-msg">${escHtml(n.message || '')}</div>
                    ${n.status === 'pending' ? `
                    <div class="notif-card-actions mt-2">
                        <button class="btn btn-sm btn-primary notif-accept" data-id="${n.id}"><i class="bi bi-check-lg"></i> 接受</button>
                        <button class="btn btn-sm btn-outline-secondary notif-decline" data-id="${n.id}"><i class="bi bi-x-lg"></i> 拒绝</button>
                    </div>` : `
                    <div class="notif-card-status mt-1"><small class="text-muted">${n.status === 'accepted' ? '已接受' : n.status === 'declined' ? '已拒绝' : ''}</small></div>`}
                </div>
            `;
            card.querySelector(".notif-accept")?.addEventListener("click", async () => {
                try {
                    const data = await apiFetch(`/api/notifications/${n.id}/accept`, { method: "POST" });
                    toast(data.message || "已接受", "success");
                    loadNotifications();
                } catch (err) {
                    toast(err.message, "error");
                    loadNotifications();
                }
            });
            card.querySelector(".notif-decline")?.addEventListener("click", async () => {
                try {
                    const data = await apiFetch(`/api/notifications/${n.id}/decline`, { method: "POST" });
                    toast(data.message || "已拒绝", "info");
                    loadNotifications();
                } catch (err) {
                    toast(err.message, "error");
                    loadNotifications();
                }
            });
            list.appendChild(card);
        });
    }
    window.renderNotifications = renderNotifications;

    function updateNotifBadge(count) {
        const badge = document.getElementById("notifBadge");
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? "99+" : String(count);
                badge.style.display = "";
            } else {
                badge.style.display = "none";
            }
        }
        // Also update the sidebar nav badge
        const navBadge = document.getElementById("opsNavBadge");
        if (navBadge) {
            navBadge.textContent = count > 99 ? "99+" : String(count);
            navBadge.style.display = count > 0 ? "" : "none";
        }
        // Update tab badge if visible
        const tabBadge = document.getElementById("opsNotifTabBadge");
        if (tabBadge) {
            tabBadge.textContent = count > 99 ? "99+" : String(count);
            tabBadge.style.display = count > 0 ? "" : "none";
        }
    }

    window.updateNotifBadge = updateNotifBadge;

    // ====== Contacts ======

    let _allContacts = [];

    async function loadContacts() {
        const container = document.getElementById("contactsList");
        if (!container) return;
        try {
            const data = await apiFetch("/api/contacts", { headers: window.getAuthHeaders ? window.getAuthHeaders() : {} });
            _allContacts = data.contacts || [];
            renderContacts(_allContacts);
        } catch (_) {
            container.innerHTML = '<div class="text-center text-muted py-3">加载失败</div>';
        }
    }

    function renderContacts(contacts) {
        const container = document.getElementById("contactsList");
        if (!container) return;
        if (!contacts.length) {
            container.innerHTML = '<div class="text-center text-muted py-3">暂无联系人</div>';
            return;
        }
        container.innerHTML = '<div class="contact-list"></div>';
        const list = container.querySelector(".contact-list");
        contacts.forEach(c => {
            const el = document.createElement("div");
            el.className = "contact-item";
            el.innerHTML = `
                <div class="contact-avatar"><i class="bi bi-person-circle"></i></div>
                <div class="contact-info">
                    <strong>${escHtml(c.username)}</strong>
                    <small class="text-muted">${c.role === 'admin' ? '管理员' : '用户'}</small>
                </div>
                <button class="btn btn-ghost btn-sm contact-remove" data-user-id="${c.id}" title="删除联系人"><i class="bi bi-person-x"></i></button>
            `;
            el.querySelector(".contact-remove")?.addEventListener("click", async () => {
                if (!(await window.showConfirm(`确定删除联系人「${escHtml(c.username)}」？`))) return;
                try {
                    await apiFetch(`/api/contacts/${c.id}`, { method: "DELETE" });
                    toast("已删除联系人", "info");
                    loadContacts();
                } catch (err) {
                    toast(err.message, "error");
                }
            });
            list.appendChild(el);
        });
    }
    window.renderContacts = renderContacts;

    // Search contacts with real-time filter
    document.getElementById("contactSearchInput")?.addEventListener("input", function () {
        const q = this.value.trim().toLowerCase();
        if (!q) {
            renderContacts(_allContacts);
            return;
        }
        const filtered = _allContacts.filter(c => c.username.toLowerCase().includes(q));
        renderContacts(filtered);
    });

    // Add contact button
    document.getElementById("btnAddContact")?.addEventListener("click", async () => {
        const input = document.getElementById("contactSearchInput");
        const username = input ? input.value.trim() : "";
        if (!username) { toast("请输入用户名", "warning"); return; }
        try {
            const data = await apiFetch("/api/contacts/add", {
                method: "POST",
                body: JSON.stringify({ username }),
            });
            toast(data.message || "好友请求已发送", "success");
            input.value = "";
            loadNotifications();
        } catch (err) {
            toast(err.message, "error");
        }
    });

    // ====== Notification bell click ======
    document.getElementById("btnNotifications")?.addEventListener("click", async () => {
        // Mark all as read
        try { await fetch("/api/notifications/read", { method: "POST" }); } catch (_) {}
        updateNotifBadge(0);
        // Navigate to operations page
        window.location.hash = "notifications";
        if (typeof window.navigateTo === "function") window.navigateTo("operations");
    });

    // ====== Contacts button click ======
    document.getElementById("btnContacts")?.addEventListener("click", () => {
        window.location.hash = "contacts";
        if (typeof window.navigateTo === "function") window.navigateTo("operations");
    });

    // ====== Enhance auth UI (show/hide notif/contact buttons based on login) ======
    const _origUpdateAuthUI = window.updateAuthUI;
    window.updateAuthUI = function () {
        if (typeof _origUpdateAuthUI === "function") _origUpdateAuthUI();
        const notifBtn = document.getElementById("btnNotifications");
        const contactBtn = document.getElementById("btnContacts");
        const isLoggedIn = window.currentUser && window.currentUser.id > 0;
        if (notifBtn) notifBtn.style.display = isLoggedIn ? "" : "none";
        if (contactBtn) contactBtn.style.display = isLoggedIn ? "" : "none";
        if (isLoggedIn) {
            stopNotifPolling();
            loadNotifications();
            notifPollInterval = setInterval(loadNotifications, 30000);
        } else {
            stopNotifPolling();
            updateNotifBadge(0);
        }
    };

    // ====== Init notifications polling if already logged in ======
    if (window.currentUser && window.currentUser.id > 0) {
        stopNotifPolling();
        loadNotifications();
        notifPollInterval = setInterval(loadNotifications, 30000);
    }

    // ====== WebSocket connection for real-time notifications ======
    let ws = null;
    function connectWebSocket() {
        const token = localStorage.getItem("auth_token") || "";
        if (!token) return;
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const url = protocol + "//" + location.host + "/ws?token=" + encodeURIComponent(token);
        try {
            ws = new WebSocket(url);
            ws.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.type === "notification" && typeof loadNotifications === "function") {
                        loadNotifications();
                    }
                } catch (_) {}
            };
            ws.onclose = () => { setTimeout(connectWebSocket, 30000); };
            ws.onerror = () => { ws?.close(); };
        } catch (_) {}
    }
    // Connect WebSocket when logged in, reconnect after auth changes
    if (window.currentUser && window.currentUser.id > 0) {
        setTimeout(connectWebSocket, 500);
    }
    // Patch updateAuthUI to also manage WebSocket connection
    const __origUA = window.updateAuthUI;
    window.updateAuthUI = function () {
        if (typeof __origUA === "function") __origUA();
        if (ws) { try { ws.close(); } catch (_) {} ws = null; }
        if (window.currentUser && window.currentUser.id > 0) {
            setTimeout(connectWebSocket, 1000);
        }
    };

    // ====== Auth: also handle login overlay + setup guide ======
    // These buttons need event listeners regardless of auth.js being loaded
    document.getElementById("btnSetupGuide")?.addEventListener("click", () => {
        if (typeof window.showSetupGuide === "function") window.showSetupGuide();
    });
    document.getElementById("btnAuth")?.addEventListener("click", () => {
        if (typeof window.switchAuthMode === "function") window.switchAuthMode("login");
        const modal = document.getElementById("authModal");
        if (modal) { const bs = new bootstrap.Modal(modal); bs.show(); }
    });
    document.getElementById("btnLogout")?.addEventListener("click", async () => {
        if (await window.showConfirm("确定要退出登录吗？")) {
            if (typeof window.doLogout === "function") window.doLogout();
        }
    });

});
