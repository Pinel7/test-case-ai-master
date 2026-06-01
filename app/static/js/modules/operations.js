/**
 * Operations Center (操作中心) module.
 * 4 tabs: 通知 / 联系人 / 我共享的 / 共享库
 * Accept share with folder picker + rename, share to contact with set picker.
 */

(function () {
    "use strict";

    let _allNotifs = [];
    let _allContacts = [];

    // Track current notif being accepted
    let _acceptingNotifId = null;

    // ====== Tab switching ======
    function switchOpsTab(tab) {
        document.querySelectorAll(".ops-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".ops-panel").forEach(p => p.classList.remove("active"));
        const tabEl = document.querySelector(`.ops-tab[data-ops-tab="${tab}"]`);
        if (tabEl) tabEl.classList.add("active");
        const panel = document.getElementById(`ops-panel-${tab}`);
        if (panel) panel.classList.add("active");
        // Lazy-load on tab switch
        if (tab === "contacts") loadOpsContacts();
        if (tab === "outgoing") loadOpsOutgoing();
        if (tab === "shared") loadOpsSharedLib();
    }

    // ====== Notifications Tab ======
    async function loadOpsNotifications() {
        try {
            const data = await window.apiFetch("/api/notifications");
            _allNotifs = (data && data.notifications) || [];
            if (typeof window.updateNotifBadge === "function") {
                window.updateNotifBadge(data && data.unread_count ? data.unread_count : 0);
            }
        } catch (_) {
            _allNotifs = [];
        }
        renderOpsNotifications();
    }

    function renderOpsNotifications() {
        const container = document.getElementById("opsNotifList");
        const countEl = document.getElementById("opsNotifCount");
        if (!container) return;

        if (!_allNotifs.length) {
            container.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-inbox" style="font-size:2rem;"></i><p class="mt-2 mb-0">暂无消息</p></div>';
            if (countEl) countEl.textContent = "";
            return;
        }

        const pending = _allNotifs.filter(n => n.status === "pending").length;
        if (countEl) countEl.textContent = `共 ${_allNotifs.length} 条，${pending} 条待处理`;

        container.innerHTML = '<div class="notif-list"></div>';
        const list = container.querySelector(".notif-list");

        _allNotifs.forEach(n => {
            const isUnread = !n.is_read;
            const card = document.createElement("div");
            card.className = "d-flex align-items-start gap-2 p-3 border-bottom notif-item" + (isUnread ? " notif-unread" : "");
            card.style.transition = "background 0.15s";

            let html = '<div class="d-flex flex-column flex-grow-1 min-w-0">';
            html += '<div class="d-flex align-items-center gap-2">';
            if (isUnread) html += '<span class="notif-dot"></span>';
            const typeLabel = n.type === "friend_request" ? "好友请求" : "共享请求";
            html += '<span class="badge bg-secondary me-1" style="font-size:0.7rem;">' + typeLabel + '</span>';
            html += '<small class="text-muted flex-shrink-0">' + window.formatTime(n.created_at) + '</small>';
            html += '</div>';
            html += '<div class="mt-1"><strong>' + window.escHtml(n.message || '') + '</strong></div>';

            if (n.status === "pending") {
                html += '<div class="mt-2 d-flex gap-2">';
                html += '<button class="btn btn-sm btn-primary ops-notif-accept" data-id="' + n.id + '"><i class="bi bi-check-lg"></i> 接受</button>';
                html += '<button class="btn btn-sm btn-outline-secondary ops-notif-decline" data-id="' + n.id + '"><i class="bi bi-x-lg"></i> 拒绝</button>';
                html += '</div>';
            } else {
                const statusMap = { accepted: "已接受", declined: "已拒绝" };
                html += '<div class="mt-1"><small class="text-muted">' + (statusMap[n.status] || n.status) + '</small></div>';
            }

            html += '</div>';
            card.innerHTML = html;
            list.appendChild(card);

            // Accept handler
            card.querySelector(".ops-notif-accept")?.addEventListener("click", () => {
                if (n.type === "friend_request") {
                    doAcceptFriend(n.id);
                } else {
                    showAcceptShareDialog(n);
                }
            });

            // Decline handler
            card.querySelector(".ops-notif-decline")?.addEventListener("click", () => {
                doDeclineNotif(n.id);
            });
        });
    }

    async function doAcceptFriend(notifId) {
        try {
            const data = await window.apiFetch("/api/notifications/" + notifId + "/accept", { method: "POST" });
            window.toast((data && data.message) || "已接受好友请求", "success");
            loadOpsNotifications();
        } catch (err) {
            window.toast(err.message || "操作失败", "error");
            loadOpsNotifications();
        }
    }

    async function doDeclineNotif(notifId) {
        try {
            const data = await window.apiFetch("/api/notifications/" + notifId + "/decline", { method: "POST" });
            window.toast((data && data.message) || "已拒绝", "info");
            loadOpsNotifications();
        } catch (err) {
            window.toast(err.message || "操作失败", "error");
            loadOpsNotifications();
        }
    }

    // ====== Accept Share Dialog ======
    function showAcceptShareDialog(notif) {
        // Pre-fill name from set_name or message
        let defaultName = notif.set_name || "";
        if (defaultName && !defaultName.includes("来自共享")) {
            defaultName += " (来自共享)";
        }
        if (!defaultName) {
            // Extract from message: "用户名 分享了「集合名」给你"
            const m = (notif.message || "").match(/「(.+?)」/);
            defaultName = m ? m[1] + " (来自共享)" : "共享用例集";
        }

        const nameInput = document.getElementById("acceptShareName");
        const folderTree = document.getElementById("acceptShareFolderTree");
        const confirmBtn = document.getElementById("btnAcceptShareConfirm");

        if (!nameInput || !folderTree || !confirmBtn) return;

        nameInput.value = defaultName;
        _acceptingNotifId = notif.id;

        // Load folder tree
        loadAcceptFolderTree();

        // Show modal
        const modalEl = document.getElementById("acceptShareModal");
        if (!modalEl) return;
        let modal = bootstrap.Modal.getInstance(modalEl);
        if (!modal) modal = new bootstrap.Modal(modalEl);
        modal.show();
    }

    async function loadAcceptFolderTree() {
        const container = document.getElementById("acceptShareFolderTree");
        if (!container) return;
        container.innerHTML = '<div class="text-muted small p-2">加载中...</div>';

        // Track selected folder
        window._acceptShareFolderId = null;

        try {
            const data = await window.apiFetch("/api/library/folders");
            const folders = (data && data.folders) || [];

            let html = '<div class="tree-item selected" data-folder-id="" style="padding-left:8px;">';
            html += '<i class="bi bi-folder"></i><span class="tree-label">根目录（未分类）</span></div>';

            // Build tree hierarchy
            const map = {};
            folders.forEach(f => { map[f.id] = { ...f, children: [] }; });
            const roots = [];
            folders.forEach(f => {
                if (f.parent_id && map[f.parent_id]) map[f.parent_id].children.push(map[f.id]);
                else roots.push(map[f.id]);
            });

            function renderNodes(nodes, depth) {
                return nodes.map(n => {
                    const pad = 8 + depth * 14;
                    return '<div class="tree-item" data-folder-id="' + n.id + '" style="padding-left:' + pad + 'px;">' +
                        '<i class="bi bi-folder"></i><span class="tree-label">' + window.escHtml(n.name) + '</span></div>' +
                        (n.children.length ? renderNodes(n.children, depth + 1) : '');
                }).join('');
            }
            html += renderNodes(roots, 0);
            container.innerHTML = html;

            // Click handler
            container.querySelectorAll(".tree-item").forEach(el => {
                el.addEventListener("click", function () {
                    container.querySelectorAll(".tree-item.selected").forEach(e => e.classList.remove("selected"));
                    this.classList.add("selected");
                    window._acceptShareFolderId = this.dataset.folderId || null;
                });
            });
        } catch (e) {
            container.innerHTML = '<div class="text-danger small p-2">加载文件夹失败</div>';
        }
    }

    // ====== Contacts Tab ======
    async function loadOpsContacts() {
        try {
            const data = await window.apiFetch("/api/contacts");
            _allContacts = (data && data.contacts) || [];
        } catch (_) {
            _allContacts = [];
        }
        renderOpsContacts();
    }

    function renderOpsContacts(filtered) {
        const container = document.getElementById("opsContactList");
        if (!container) return;
        const items = filtered || _allContacts;

        if (!items.length) {
            container.innerHTML = '<div class="text-center text-muted py-3"><i class="bi bi-people" style="font-size:1.5rem;"></i><p class="mt-1 mb-0">暂无联系人</p></div>';
            return;
        }

        container.innerHTML = '<div class="contact-list"></div>';
        const list = container.querySelector(".contact-list");

        items.forEach(c => {
            const el = document.createElement("div");
            el.className = "d-flex align-items-center gap-2 p-2 border-bottom contact-item";
            el.innerHTML = '<div class="contact-avatar" style="font-size:1.3rem;"><i class="bi bi-person-circle"></i></div>' +
                '<div class="flex-grow-1"><strong>' + window.escHtml(c.username) + '</strong>' +
                '<small class="text-muted ms-2">' + (c.role === 'admin' ? '管理员' : '用户') + '</small></div>' +
                '<button class="btn btn-ghost btn-sm ops-contact-share me-1" data-user-id="' + c.id + '" data-username="' + window.escHtml(c.username) + '" title="共享用例集"><i class="bi bi-share"></i></button>' +
                '<button class="btn btn-ghost btn-sm ops-contact-remove" data-user-id="' + c.id + '" title="删除联系人"><i class="bi bi-person-x"></i></button>';
            el.querySelector(".ops-contact-share")?.addEventListener("click", function () {
                showShareToContact({ id: parseInt(this.dataset.userId), username: this.dataset.username });
            });
            el.querySelector(".ops-contact-remove")?.addEventListener("click", async function () {
                const uid = this.dataset.userId;
                if (!(await window.showConfirm("确定删除联系人？"))) return;
                try {
                    await window.apiFetch("/api/contacts/" + uid, { method: "DELETE" });
                    window.toast("已删除联系人", "info");
                    loadOpsContacts();
                } catch (err) {
                    window.toast(err.message || "删除失败", "error");
                }
            });
            list.appendChild(el);
        });
    }

    // ====== Shared Library Tab ======
    async function loadOpsSharedLib() {
        const container = document.getElementById("opsSharedList");
        if (!container) return;

        const accepted = _allNotifs.filter(n => n.type === "share_request" && n.status === "accepted");

        if (!accepted.length) {
            container.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-inbox" style="font-size:2rem;"></i><p class="mt-2 mb-0">暂无已接受的共享记录</p></div>';
            return;
        }

        let html = '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>集合名称</th><th>来自</th><th>接受时间</th></tr></thead><tbody>';
        accepted.forEach(n => {
            const name = n.set_name || "未知";
            const fromMatch = (n.message || "").match(/^(.+?) 分享/);
            const from = fromMatch ? fromMatch[1] : "未知用户";
            const time = window.formatTime(n.created_at);
            html += '<tr><td>' + window.escHtml(name) + '</td><td>' + window.escHtml(from) + '</td><td>' + window.escHtml(time) + '</td></tr>';
        });
        html += '</tbody></table></div>';
        container.innerHTML = html;
    }

    // ====== Outgoing Shares Tab ======
    async function loadOpsOutgoing() {
        const container = document.getElementById("opsOutgoingList");
        if (!container) return;
        try {
            const data = await window.apiFetch("/api/shared/outgoing");
            renderOpsOutgoing((data && data.shares) || []);
        } catch (_) {
            container.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-share" style="font-size:2rem;"></i><p class="mt-2 mb-0">加载失败</p></div>';
        }
    }

    function renderOpsOutgoing(shares) {
        const container = document.getElementById("opsOutgoingList");
        const countEl = document.getElementById("opsOutgoingCount");
        if (!container) return;

        if (!shares.length) {
            container.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-share" style="font-size:2rem;"></i><p class="mt-2 mb-0">暂无共享记录</p></div>';
            if (countEl) countEl.textContent = "";
            return;
        }

        const pending = shares.filter(s => s.status === "pending").length;
        if (countEl) countEl.textContent = `共 ${shares.length} 条，${pending} 条待接受`;

        container.innerHTML = '<div class="ops-outgoing-list"></div>';
        const list = container.querySelector(".ops-outgoing-list");

        shares.forEach(s => {
            const el = document.createElement("div");
            el.className = "d-flex align-items-center gap-2 p-2 border-bottom ops-outgoing-item";

            const statusMap = { pending: "待接受", accepted: "已接受", declined: "已拒绝" };
            const statusBadge = s.status === "pending"
                ? '<span class="badge bg-warning text-dark">待接受</span>'
                : s.status === "accepted"
                    ? '<span class="badge bg-success">已接受</span>'
                    : '<span class="badge bg-secondary">已拒绝</span>';

            el.innerHTML = '<div class="flex-grow-1 min-w-0">' +
                '<div class="fw-bold text-truncate">' + window.escHtml(s.set_name || "未知") + '</div>' +
                '<small class="text-muted">共享给 ' + window.escHtml(s.to_username) +
                ' · ' + window.formatTime(s.created_at) + '</small></div>' +
                '<div>' + statusBadge + '</div>';

            if (s.status === "pending") {
                const cancelBtn = document.createElement("button");
                cancelBtn.className = "btn btn-sm btn-outline-danger ms-1";
                cancelBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
                cancelBtn.title = "取消共享";
                cancelBtn.addEventListener("click", async () => {
                    if (!(await window.showConfirm("确定取消共享「" + window.escHtml(s.set_name) + "」？"))) return;
                    try {
                        const d = await window.apiFetch("/api/shared/outgoing/" + s.id, { method: "DELETE" });
                        window.toast(d.message || "已取消", "info");
                        loadOpsOutgoing();
                    } catch (err) {
                        window.toast(err.message || "操作失败", "error");
                        loadOpsOutgoing();
                    }
                });
                el.querySelector("div:last-child")?.after(cancelBtn);
            }

            list.appendChild(el);
        });
    }

    // ====== Share to Contact ======
    function showShareToContact(contact) {
        const nameEl = document.getElementById("shareToContactName");
        const folderList = document.getElementById("shareFolderList");
        const folderLoading = document.getElementById("shareFolderLoading");
        const folderPath = document.getElementById("shareFolderPath");
        const setList = document.getElementById("shareSetList");
        const setLoading = document.getElementById("shareSetLoading");
        const setEmpty = document.getElementById("shareSetEmpty");
        const confirmBtn = document.getElementById("btnShareToContact");
        if (!folderList || !folderLoading || !folderPath || !setList || !setLoading || !setEmpty || !confirmBtn) return;

        nameEl.textContent = window.escHtml(contact.username);
        confirmBtn.disabled = true;
        confirmBtn.dataset.contactUsername = contact.username;
        confirmBtn.dataset.selectedSetId = "";
        confirmBtn.dataset.selectedSetName = "";

        let folders = [];
        let currentFolderId = null;
        let currentFolderName = "根目录";

        // ---- Load folders ----
        (async () => {
            try {
                const data = await window.apiFetch("/api/library/folders");
                folders = (data && data.folders) || [];

                // Build folder tree HTML
                const map = {};
                folders.forEach(f => { map[f.id] = { ...f, children: [] }; });
                const roots = [];
                folders.forEach(f => {
                    if (f.parent_id && map[f.parent_id]) map[f.parent_id].children.push(map[f.id]);
                    else roots.push(map[f.id]);
                });

                function renderNode(node, depth) {
                    return '<div class="share-folder-item" data-folder-id="' + node.id +
                        '" style="padding-left:' + (8 + depth * 14) + 'px;cursor:pointer;">' +
                        '<i class="bi bi-folder text-warning me-1"></i>' +
                        '<span class="small">' + window.escHtml(node.name) + '</span></div>';
                }

                function renderTree(nodes, depth) {
                    let html = '';
                    nodes.forEach(n => {
                        html += renderNode(n, depth);
                        if (n.children.length) html += renderTree(n.children, depth + 1);
                    });
                    return html;
                }

                let html = '<div class="share-folder-item share-folder-root" data-folder-id="" style="cursor:pointer;">' +
                    '<i class="bi bi-folder text-warning me-1"></i>' +
                    '<span class="small">根目录</span></div>';
                html += renderTree(roots, 1);
                folderList.innerHTML = html;
                folderLoading.style.display = "none";

                // Click handler for folder items (delegated)
                folderList.querySelectorAll(".share-folder-item").forEach(el => {
                    el.addEventListener("click", function () {
                        folderList.querySelectorAll(".share-folder-item").forEach(x => x.classList.remove("selected"));
                        this.classList.add("selected");
                        currentFolderId = this.dataset.folderId || null;
                        const f = folders.find(x => x.id == currentFolderId);
                        currentFolderName = f ? f.name : "根目录";
                        folderPath.textContent = "当前：/ " + currentFolderName;
                        loadSetsForFolder(currentFolderId);
                    });
                });

                // Auto-load root sets
                folderPath.textContent = "当前：/ 根目录";
                loadSetsForFolder(null);

            } catch (_) {
                folderLoading.textContent = "加载失败";
            }
        })();

        // ---- Load sets for a folder ----
        function loadSetsForFolder(folderId) {
            setList.innerHTML = "";
            setLoading.style.display = "";
            setEmpty.style.display = "none";
            confirmBtn.disabled = true;

            (async () => {
                try {
                    const params = "?limit=0" + (folderId !== null && folderId !== "" ? "&folder_id=" + folderId : "");
                    const data = await window.apiFetch("/api/library/list" + params);
                    const allSets = (data && data.sets) || [];
                    const ownSets = allSets.filter(s => s.owned === true);

                    setLoading.style.display = "none";
                    if (!ownSets.length) {
                        setEmpty.style.display = "";
                        return;
                    }

                    ownSets.forEach(s => {
                        const item = document.createElement("div");
                        item.className = "share-set-item d-flex align-items-center gap-2 p-2 border-bottom";
                        item.style.cursor = "pointer";
                        item.dataset.setId = s.id;
                        item.dataset.setName = s.name;
                        item.innerHTML = '<i class="bi bi-collection"></i>' +
                            '<div class="flex-grow-1"><strong>' + window.escHtml(s.name) + '</strong>' +
                            '<small class="text-muted ms-2">' + (s.case_count || 0) + ' 条</small></div>' +
                            '<div class="share-set-check"><i class="bi bi-circle"></i></div>';
                        item.addEventListener("click", function () {
                            setList.querySelectorAll(".share-set-item").forEach(el => el.classList.remove("selected"));
                            setList.querySelectorAll(".share-set-check i").forEach(el => el.className = "bi bi-circle");
                            this.classList.add("selected");
                            this.querySelector(".share-set-check i").className = "bi bi-check-circle-fill text-primary";
                            confirmBtn.disabled = false;
                            confirmBtn.dataset.selectedSetId = this.dataset.setId;
                            confirmBtn.dataset.selectedSetName = this.dataset.setName;
                        });
                        setList.appendChild(item);
                    });
                } catch (_) {
                    setLoading.style.display = "none";
                    setEmpty.textContent = "加载失败";
                    setEmpty.style.display = "";
                }
            })();
        }

        // Show modal
        const modalEl = document.getElementById("shareToContactModal");
        if (!modalEl) return;
        let modal = bootstrap.Modal.getInstance(modalEl);
        if (!modal) modal = new bootstrap.Modal(modalEl);
        modal.show();
    }

    // ====== Init ======
    window.initOperationsPage = function () {
        const page = document.getElementById("page-operations");
        if (!page || !page.classList.contains("active")) return;

        // Tab click handlers (bind once)
        if (!page.dataset.opsInited) {
            page.dataset.opsInited = "1";

            document.querySelectorAll(".ops-tab").forEach(tab => {
                tab.addEventListener("click", () => {
                    switchOpsTab(tab.dataset.opsTab);
                    // Update hash
                    window.location.hash = tab.dataset.opsTab;
                });
            });

            // Accept share confirm button
            document.getElementById("btnAcceptShareConfirm")?.addEventListener("click", async () => {
                const name = document.getElementById("acceptShareName")?.value.trim();
                if (!name) { window.toast("请输入名称", "warning"); return; }
                const folderId = window._acceptShareFolderId || null;
                try {
                    const data = await window.apiFetch("/api/notifications/" + _acceptingNotifId + "/accept", {
                        method: "POST",
                        body: JSON.stringify({ name: name, folder_id: folderId ? parseInt(folderId) : null }),
                    });
                    window.toast((data && data.message) || "已接受共享", "success");
                    bootstrap.Modal.getInstance(document.getElementById("acceptShareModal"))?.hide();
                    loadOpsNotifications();
                } catch (err) {
                    window.toast(err.message || "保存失败", "error");
                }
            });

            // Add contact button
            document.getElementById("opsBtnAddContact")?.addEventListener("click", async () => {
                const input = document.getElementById("opsContactSearch");
                const username = input ? input.value.trim() : "";
                if (!username) { window.toast("请输入用户名", "warning"); return; }
                try {
                    const data = await window.apiFetch("/api/contacts/add", {
                        method: "POST",
                        body: JSON.stringify({ username }),
                    });
                    window.toast((data && data.message) || "好友请求已发送", "success");
                    input.value = "";
                    loadOpsNotifications();
                } catch (err) {
                    window.toast(err.message || "操作失败", "error");
                }
            });

            // Share to contact confirm button
            document.getElementById("btnShareToContact")?.addEventListener("click", async function () {
                const setId = this.dataset.selectedSetId;
                const username = this.dataset.contactUsername;
                const setName = this.dataset.selectedSetName || "";
                if (!setId || !username) { window.toast("请选择一个用例集", "warning"); return; }
                try {
                    const data = await window.apiFetch("/api/library/" + setId + "/share", {
                        method: "POST",
                        body: JSON.stringify({ username: username }),
                    });
                    window.toast(data.message || "共享请求已发送", "success");
                    bootstrap.Modal.getInstance(document.getElementById("shareToContactModal"))?.hide();
                    loadOpsNotifications();
                } catch (err) {
                    window.toast(err.message || "共享失败", "error");
                }
            });

            // Contact search filter
            document.getElementById("opsContactSearch")?.addEventListener("input", function () {
                const q = this.value.trim().toLowerCase();
                if (!q) { renderOpsContacts(); return; }
                const filtered = _allContacts.filter(c => c.username.toLowerCase().includes(q));
                renderOpsContacts(filtered);
            });
        }

        // Determine tab from hash or default
        const hash = window.location.hash.replace("#", "");
        const validTabs = ["notifications", "contacts", "outgoing", "shared"];
        const tab = validTabs.includes(hash) ? hash : "notifications";
        switchOpsTab(tab);

        // Load data
        loadOpsNotifications();
        // contacts/shared are lazy-loaded on tab switch
    };

})();
