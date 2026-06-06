/**
 * Library CRUD module for TestForge
 * Extracted from app.js for maintainability.
 * Dependencies: window.getTestCases, window.escHtml, window.toast, window.setBtnLoading,
 *   window.showConfirm, window.showPrompt, window.showCustomDialog, window.getAuthHeaders,
 *   window.apiFetch, FIELD_DEFS
 * Init: app.js calls window.initLibrary({ callbacks })
 */

(function () {
    // ---- Module state ----
    let _cb = {};
    let _currentLibFolderId = null;
    let _libPageOffset = 0;
    let _libSelectedSets = new Set();
    let _moveSetTargetId = null;
    let _importToLibFolderId = null;
    const _LIB_PAGE_SIZE = 20;

    // ---- Modal instances ----
    let _libraryModal = null;
    let _saveToLibModal = null;
    let _moveSetModal = null;

    // ======================================================================
    //  Save to Library
    // ======================================================================

    async function showSaveToLibModal() {
        const testCases = window.getTestCases();
        if (testCases.length === 0) { window.toast("没有可保存的用例。", "warning"); return; }
        document.getElementById("saveToLibName").value = "测试用例集 " + new Date().toLocaleDateString("zh-CN");
        const sel = document.getElementById("saveToLibFolder");
        sel.innerHTML = '<option value="">根目录（未分类）</option>';
        try {
            const resp = await fetch("/api/library/folders");
            const data = await resp.json();
            const folders = data.folders || [];
            const map = {};
            folders.forEach(f => { map[f.id] = { ...f, children: [] }; });
            const roots = [];
            folders.forEach(f => {
                if (f.parent_id && map[f.parent_id]) map[f.parent_id].children.push(map[f.id]);
                else roots.push(map[f.id]);
            });
            function addOptions(nodes, depth) {
                nodes.forEach(n => {
                    const indent = "  ".repeat(depth);
                    sel.innerHTML += `<option value="${n.id}">${indent}${window.escHtml(n.name)}</option>`;
                    if (n.children.length) addOptions(n.children, depth + 1);
                });
            }
            addOptions(roots, 0);
        } catch (_) { }
        if (_saveToLibModal) _saveToLibModal.show();
    }

    async function doSaveToLibrary() {
        const testCases = window.getTestCases();
        const name = document.getElementById("saveToLibName").value.trim();
        if (!name) { window.toast("请输入名称", "warning"); return; }
        const folderIdSel = document.getElementById("saveToLibFolder");
        const folderId = folderIdSel.value ? parseInt(folderIdSel.value) : null;
        const reqText = document.getElementById("requirementText")?.value || "";
        const btn = document.getElementById("btnSaveToLibConfirm");
        window.setBtnLoading(btn, true);
        try {
            const resp = await fetch("/api/library/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, test_cases: testCases, requirement_text: reqText, folder_id: folderId }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail?.message || "保存失败");
            if (_saveToLibModal) _saveToLibModal.hide();
            window.toast("已保存到用例库", "success");
        } catch (err) {
            window.toast("保存到库失败：" + (err.message || err), "error");
        } finally {
            window.setBtnLoading(btn, false);
        }
    }

    // ======================================================================
    //  Library Tree (folders)
    // ======================================================================

    function openLibrary() {
        if (!_libraryModal) return;
        refreshLibraryTree();
        loadLibraryContent(null);
        _libraryModal.show();
    }

    async function refreshLibraryTree() {
        const btn = document.getElementById("btnRefreshLibTree");
        if (btn) btn.disabled = true;
        try {
            const resp = await fetch("/api/library/folders");
            const data = await resp.json();
            renderLibraryTree(data.folders || [], _currentLibFolderId);
        } catch (_) {
            document.getElementById("libraryTree").innerHTML = '<div class="text-muted small p-2">加载失败</div>';
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function renderLibraryTree(folders, selectedId) {
        const treeEl = document.getElementById("libraryTree");
        if (!treeEl) return;

        const map = {};
        folders.forEach(f => { map[f.id] = { ...f, children: [] }; });
        const roots = [];
        folders.forEach(f => {
            if (f.parent_id && map[f.parent_id]) map[f.parent_id].children.push(map[f.id]);
            else roots.push(map[f.id]);
        });

        function renderNode(node, depth) {
            const hasChildren = node.children.length > 0;
            const isSelected = node.id === selectedId;
            return `<li class="tree-list-item">
                <div class="tree-item${isSelected ? " selected" : ""}" data-folder-id="${node.id}" style="padding-left:${4 + depth * 16}px;">
                    <span class="tree-toggle${hasChildren ? "" : " tree-toggle-placeholder"}">
                        ${hasChildren ? '<i class="bi bi-chevron-down"></i>' : ""}
                    </span>
                    <i class="bi bi-folder"></i>
                    <span class="tree-label">${window.escHtml(node.name)}</span>
                    <button class="tree-link" data-action="rename" data-fid="${node.id}" title="重命名"><i class="bi bi-pencil"></i></button>
                    <button class="tree-link danger" data-action="delete" data-fid="${node.id}" title="删除"><i class="bi bi-trash"></i></button>
                </div>
                ${hasChildren ? `<ul class="tree-list">${node.children.map(c => renderNode(c, depth + 1)).join("")}</ul>` : ""}
            </li>`;
        }

        let html = '<ul class="tree-list">';
        html += `<li class="tree-list-item">
            <div class="tree-item tree-item-root${selectedId === null ? " selected" : ""}" data-folder-id="">
                <span class="tree-toggle tree-toggle-placeholder"></span>
                <i class="bi bi-folder"></i>
                <span class="tree-label">根目录</span>
            </div>
        </li>`;
        roots.forEach(r => { html += renderNode(r, 1); });
        html += '</ul>';
        treeEl.innerHTML = html;

        treeEl.querySelectorAll(".tree-item[data-folder-id]").forEach(item => {
            item.addEventListener("click", function (e) {
                if (e.target.closest(".tree-link")) return;
                const fid = this.dataset.folderId;
                const id = fid === "" ? null : (fid ? parseInt(fid) : null);
                _currentLibFolderId = id;
                loadLibraryContent(id);
                treeEl.querySelectorAll(".tree-item.selected").forEach(el => el.classList.remove("selected"));
                this.classList.add("selected");
            });
        });
        treeEl.querySelectorAll(".tree-toggle:not(.tree-toggle-placeholder)").forEach(toggle => {
            toggle.addEventListener("click", function (e) {
                e.stopPropagation();
                this.classList.toggle("collapsed");
                const ul = this.closest(".tree-list-item").querySelector(":scope > .tree-list");
                if (ul) ul.style.display = ul.style.display === "none" ? "" : "none";
            });
        });
        treeEl.querySelectorAll("[data-action='rename']").forEach(btn => {
            btn.addEventListener("click", async function (e) {
                e.stopPropagation();
                const fid = parseInt(this.dataset.fid);
                const treeItem = this.closest(".tree-item");
                const label = treeItem.querySelector(".tree-label");
                const oldName = label.textContent;
                label.contentEditable = "true";
                label.classList.add("editing");
                label.focus();
                const sel = window.getSelection();
                sel.selectAllChildren(label);
                sel.collapseToEnd();
                async function finish() {
                    label.contentEditable = "false";
                    label.classList.remove("editing");
                    const newName = label.textContent.trim();
                    if (newName && newName !== oldName) {
                        try {
                            await fetch(`/api/library/folders/${fid}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ name: newName }),
                            });
                            window.toast("已重命名", "success");
                        } catch (_) { label.textContent = oldName; }
                    } else { label.textContent = oldName; }
                }
                label.addEventListener("blur", finish, { once: true });
                label.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); finish(); } });
            });
        });
        treeEl.querySelectorAll("[data-action='delete']").forEach(btn => {
            btn.addEventListener("click", async function (e) {
                e.stopPropagation();
                const fid = parseInt(this.dataset.fid);
                const name = this.closest(".tree-item").querySelector(".tree-label").textContent;
                if (!(await window.showConfirm(`确定删除文件夹「${name}」？<br>子文件夹将一并删除，集合将移至根目录。`))) return;
                btn.disabled = true;
                try {
                    await fetch(`/api/library/folders/${fid}`, { method: "DELETE" });
                    window.toast("已删除文件夹", "success");
                    refreshLibraryTree();
                    loadLibraryContent(_currentLibFolderId);
                } catch (_) {
                    window.toast("删除失败", "warning");
                    btn.disabled = false;
                }
            });
        });
    }

    async function createFolder(parentId) {
        const name = await window.showPrompt("请输入文件夹名称：", "", "新建文件夹");
        if (!name || !name.trim()) return;
        const btn = document.getElementById("btnNewFolder");
        window.setBtnLoading(btn, true);
        try {
            await fetch("/api/library/folders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), parent_id: parentId || null }),
            });
            window.toast("文件夹已创建", "success");
            refreshLibraryTree();
        } catch (_) {
            window.toast("创建失败", "warning");
        } finally {
            window.setBtnLoading(btn, false);
        }
    }

    // ======================================================================
    //  Move Set
    // ======================================================================

    async function showMoveModal(setId) {
        _moveSetTargetId = setId;
        const sel = document.getElementById("moveSetFolder");
        sel.innerHTML = '<option value="">根目录（未分类）</option>';
        try {
            const resp = await fetch("/api/library/folders");
            const data = await resp.json();
            const folders = data.folders || [];
            const map = {}; folders.forEach(f => { map[f.id] = { ...f, children: [] }; });
            const roots = []; folders.forEach(f => { if (f.parent_id && map[f.parent_id]) map[f.parent_id].children.push(map[f.id]); else roots.push(map[f.id]); });
            function addOptions(nodes, depth) {
                nodes.forEach(n => {
                    sel.innerHTML += `<option value="${n.id}">${"  ".repeat(depth)}${window.escHtml(n.name)}</option>`;
                    if (n.children.length) addOptions(n.children, depth + 1);
                });
            }
            addOptions(roots, 0);
        } catch (_) { }
        if (_moveSetModal) _moveSetModal.show();
    }

    async function doMoveSet() {
        const ids = _moveSetTargetId ? [_moveSetTargetId] : Array.from(_libSelectedSets);
        if (ids.length === 0) return;
        const sel = document.getElementById("moveSetFolder");
        const folderId = sel.value ? parseInt(sel.value) : null;
        const btn = document.getElementById("btnMoveSetConfirm");
        window.setBtnLoading(btn, true);
        let ok = 0;
        for (const id of ids) {
            try {
                const resp = await fetch(`/api/library/${id}/move`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ folder_id: folderId }),
                });
                if (resp.ok) ok++;
            } catch (_) { }
        }
        window.setBtnLoading(btn, false);
        if (_moveSetModal) _moveSetModal.hide();
        _moveSetTargetId = null;
        _libSelectedSets.clear();
        updateLibBatchUI();
        window.toast(`已移动 ${ok} 个集合`, "success");
        loadLibraryContent(_currentLibFolderId);
    }

    // ======================================================================
    //  Share
    // ======================================================================

    function showShareModal(setId) {
        let contacts = [];
        fetch("/api/contacts", { headers: window.getAuthHeaders() })
            .then(r => r.ok ? r.json() : { contacts: [] })
            .then(d => { contacts = d.contacts || []; showShareDialog(); })
            .catch(() => showShareDialog());
        function showShareDialog() {
            let html = '<div class="text-start">';
            html += '<p class="mb-2">选择联系人，或直接输入用户名：</p>';
            if (contacts.length > 0) {
                html += '<div class="mb-2 d-flex flex-wrap gap-1" id="shareContactList">';
                for (const c of contacts) {
                    html += '<span class="btn btn-sm btn-outline-primary contact-pick" data-username="' + window.escHtml(c.username) + '" style="cursor:pointer">' + window.escHtml(c.username) + '</span>';
                }
                html += '</div>';
            }
            html += '<div class="input-group"><span class="input-group-text"><i class="bi bi-person"></i></span>';
            html += '<input type="text" id="shareUsernameInput" class="form-control" placeholder="输入用户名"></div>';
            html += '</div>';

            window.showCustomDialog("共享用例集", html, [
                { text: "取消", cls: "btn-secondary", action: () => { } },
                { text: "发送共享请求", cls: "btn-primary", action: doShare },
            ]);
            setTimeout(() => {
                document.querySelectorAll("#shareContactList .contact-pick").forEach(el => {
                    el.addEventListener("click", () => {
                        const input = document.getElementById("shareUsernameInput");
                        if (input) input.value = el.dataset.username;
                    });
                });
            }, 50);
        }
        async function doShare() {
            const input = document.getElementById("shareUsernameInput");
            const name = input ? input.value.trim() : "";
            if (!name) { window.toast("请输入或选择用户名", "warning"); return; }
            try {
                const resp = await fetch("/api/library/" + setId + "/share", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
                    body: JSON.stringify({ username: name }),
                });
                if (!resp.ok) {
                    const err = await resp.json();
                    const msg = typeof err.detail?.message === "string" ? err.detail.message
                        : typeof err.detail === "string" ? err.detail
                            : "共享失败";
                    throw new Error(msg);
                }
                const data = await resp.json();
                window.toast(data.message || "共享请求已发送", "success");
                loadLibraryContent(_currentLibFolderId);
            } catch (err) {
                window.toast("共享失败：" + (err.message || err), "danger");
            }
        }
    }

    // ======================================================================
    //  Create / Import
    // ======================================================================

    async function createEmptySet(folderId) {
        const name = await window.showPrompt("新建用例集名称：", "用例集 " + new Date().toLocaleDateString("zh-CN"), "新建用例集");
        if (!name || !name.trim()) return;
        const btn = document.getElementById("btnNewLibSet");
        if (btn) btn.disabled = true;
        try {
            await fetch("/api/library/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), test_cases: [], requirement_text: "", folder_id: folderId }),
            });
            window.toast("已创建空用例集", "success");
            loadLibraryContent(folderId);
        } catch (_) {
            window.toast("创建失败", "warning");
            if (btn) btn.disabled = false;
        }
    }

    function importToFolder(folderId) {
        _importToLibFolderId = folderId;
        const input = document.getElementById("importFileInput");
        if (input) input.click();
    }

    // ======================================================================
    //  Batch operations
    // ======================================================================

    function updateLibBatchUI() {
        const count = _libSelectedSets.size;
        const bar = document.getElementById("libBatchBar");
        const cnt = document.getElementById("libBatchCount");
        if (!bar) return;
        if (count > 0) {
            bar.style.display = "flex";
            if (cnt) cnt.textContent = count;
        } else {
            bar.style.display = "none";
        }
    }

    async function batchMoveSets() {
        if (_libSelectedSets.size === 0) return;
        const sel = document.getElementById("moveSetFolder");
        sel.innerHTML = '<option value="">根目录（未分类）</option>';
        try {
            const resp = await fetch("/api/library/folders");
            const data = await resp.json();
            const folders = data.folders || [];
            const map = {}; folders.forEach(f => { map[f.id] = { ...f, children: [] }; });
            const roots = []; folders.forEach(f => { if (f.parent_id && map[f.parent_id]) map[f.parent_id].children.push(map[f.id]); else roots.push(map[f.id]); });
            function addOptions(nodes, depth) {
                nodes.forEach(n => {
                    sel.innerHTML += `<option value="${n.id}">${"  ".repeat(depth)}${window.escHtml(n.name)}</option>`;
                    if (n.children.length) addOptions(n.children, depth + 1);
                });
            }
            addOptions(roots, 0);
        } catch (_) { }
        _moveSetTargetId = null;
        if (_moveSetModal) _moveSetModal.show();
    }

    async function batchDeleteSets() {
        if (_libSelectedSets.size === 0) return;
        if (!(await window.showConfirm(`确定删除选中的 ${_libSelectedSets.size} 个集合？此操作不可恢复。`))) return;
        const btn = document.getElementById("btnLibBatchDelete");
        if (btn) btn.disabled = true;
        let ok = 0;
        for (const id of _libSelectedSets) {
            try {
                await fetch(`/api/library/${id}`, { method: "DELETE" });
                ok++;
            } catch (_) { }
        }
        _libSelectedSets.clear();
        updateLibBatchUI();
        window.toast(`已删除 ${ok} 个集合`, "success");
        loadLibraryContent(_currentLibFolderId);
    }

    function toggleLibSelectAll(checked) {
        const pane = document.getElementById("libraryContentPane");
        if (!pane) return;
        pane.querySelectorAll(".lib-checkbox").forEach(cb => {
            cb.checked = checked;
            const id = parseInt(cb.dataset.id);
            if (checked) _libSelectedSets.add(id);
            else _libSelectedSets.delete(id);
        });
        updateLibBatchUI();
    }

    function toggleLibItem(id, checked) {
        if (checked) _libSelectedSets.add(id);
        else _libSelectedSets.delete(id);
        updateLibBatchUI();
    }

    // ======================================================================
    //  Load Library Content (main content pane rendering)
    // ======================================================================

    async function loadLibraryContent(folderId) {
        const pane = document.getElementById("libraryContentPane");
        if (!pane) return;
        _libSelectedSets.clear();
        updateLibBatchUI();
        const sqEl = document.getElementById("libSearchInput");
        const q = sqEl ? sqEl.value.trim() : "";
        const statusFilterEl = document.getElementById("libStatusFilter");
        const statusVal = statusFilterEl ? statusFilterEl.value : "";

        pane.innerHTML = '<div class="text-center text-muted py-4"><div class="spinner mb-2"></div><p>加载中...</p></div>';

        const folderName = folderId ? "当前文件夹" : "根目录";
        let toolbar = '<div class="lib-content-header">';
        toolbar += '<i class="bi bi-folder2-open"></i>';
        toolbar += '<span class="folder-name">' + window.escHtml(folderName) + '</span>';
        toolbar += '<span class="folder-badge" id="libSetCount">-</span>';
        toolbar += '<div class="ms-auto d-flex gap-2">';
        toolbar += '<input type="search" class="form-control form-control-sm lib-search-input" id="libSearchInput" placeholder="搜索用例集..." value="' + window.escHtml(q) + '">';
        toolbar += '<select class="form-select form-select-sm" id="libStatusFilter" style="width:auto;"><option value="">全部状态</option><option value="draft">草稿</option><option value="pending">待审核</option><option value="approved">已通过</option><option value="rejected">已驳回</option></select>';
        toolbar += '<button class="btn btn-ghost btn-sm" id="btnNewLibSet"><i class="bi bi-plus-lg"></i> 新建用例集</button>';
        toolbar += '<button class="btn btn-ghost btn-sm" id="btnImportToLib"><i class="bi bi-upload"></i> 导入</button>';
        toolbar += '</div></div>';
        toolbar += '<div class="lib-batch-bar" id="libBatchBar" style="display:none;">';
        toolbar += '<span class="lib-batch-count" id="libBatchCount">0</span> 项已选';
        toolbar += '<button class="btn btn-ghost btn-sm ms-2" id="btnLibBatchMove"><i class="bi bi-arrow-right-square"></i> 批量移动</button>';
        toolbar += '<button class="btn btn-ghost btn-sm text-danger" id="btnLibBatchDelete"><i class="bi bi-trash"></i> 批量删除</button>';
        toolbar += '<button class="btn btn-ghost btn-sm" id="btnLibBatchClear">取消选择</button>';
        toolbar += '</div>';

        function navigateToFolder(fid, name) {
            _libPageOffset = 0;
            const treeEl = document.getElementById("libraryTree");
            if (treeEl) {
                treeEl.querySelectorAll(".tree-item.selected").forEach(el => el.classList.remove("selected"));
                const target = treeEl.querySelector(`.tree-item[data-folder-id="${fid === null ? "" : fid}"]`);
                if (target) target.classList.add("selected");
            }
            _currentLibFolderId = fid;
            loadLibraryContent(fid);
        }

        try {
            let setsUrl = `/api/library/list`;
            const params = [];
            if (folderId !== null && folderId !== undefined) params.push(`folder_id=${folderId}`);
            if (q) params.push(`q=${encodeURIComponent(q)}`);
            if (statusVal) params.push(`status=${statusVal}`);
            params.push(`limit=${_LIB_PAGE_SIZE}`, `offset=${_libPageOffset}`);
            if (params.length) setsUrl += '?' + params.join('&');
            const [setsResp, foldersResp] = await Promise.all([
                fetch(setsUrl),
                fetch("/api/library/folders")
            ]);
            if (!setsResp.ok) throw new Error("加载失败");
            const setsData = await setsResp.json();
            const allFolders = foldersResp.ok ? (await foldersResp.json()).folders || [] : [];
            const sets = setsData.sets || [];

            const sharedCount = sets.filter(s => s.shared_by && !s.owned).length;
            const badge = document.getElementById("libSharedBadge");
            if (badge) {
                badge.textContent = sharedCount > 0 ? sharedCount : "";
                badge.style.display = sharedCount > 0 ? "" : "none";
            }

            const childFolders = allFolders.filter(f =>
                folderId === null || folderId === undefined
                    ? (f.parent_id === null || f.parent_id === undefined)
                    : f.parent_id === folderId
            );

            let body = '';
            if (childFolders.length > 0) {
                body += '<div class="lib-subfolders">';
                childFolders.forEach(f => {
                    body += `<div class="lib-subfolder" data-folder-id="${f.id}" data-folder-name="${window.escHtml(f.name)}">`;
                    body += '<div class="lib-subfolder-icon"><i class="bi bi-folder"></i></div>';
                    body += '<div class="lib-subfolder-name">' + window.escHtml(f.name) + '</div>';
                    body += '<i class="bi bi-chevron-right lib-subfolder-arrow"></i>';
                    body += '</div>';
                });
                body += '</div>';
            }

            if (sets.length === 0 && childFolders.length === 0) {
                body += '<div class="empty-state empty-state-sm"><i class="bi bi-inbox empty-state-icon"></i><p class="empty-state-desc">此文件夹下无内容</p></div>';
            } else if (sets.length > 0) {
                body += '<div class="lib-list">';
                body += '<div class="lib-list-header"><label class="lib-check-label"><input type="checkbox" id="libSelectAll"> 全选</label></div>';
                sets.forEach(s => {
                    const isShared = s.shared_by && !s.owned;
                    body += '<div class="lib-item' + (isShared ? ' lib-item-shared' : '') + '" data-id="' + s.id + '">';
                    body += '<label class="lib-check-wrap" onclick="event.stopPropagation()"><input type="checkbox" class="lib-checkbox" data-id="' + s.id + '"></label>';
                    body += '<div class="lib-item-icon"><i class="bi ' + (isShared ? 'bi-share' : 'bi-file-earmark-text') + '"></i></div>';
                    const statusLabels = { draft: "草稿", pending: "待审核", approved: "已通过", rejected: "已驳回" };
                    const statusHtml = s.status && statusLabels[s.status] ? '<span class="lib-status-badge status-' + s.status + '">' + statusLabels[s.status] + '</span>' : '';
                    body += '<div class="lib-item-info"><strong>' + window.escHtml(s.name) + ' ' + statusHtml + '</strong><small>' + (isShared ? window.escHtml('来自 ' + s.shared_by) : window.escHtml(s.updated_at || "")) + '</small></div>';
                    body += '<span class="lib-item-badge">' + s.case_count + ' 条</span>';
                    body += '<div class="lib-item-actions">';
                    if (isShared) {
                        body += '<button class="lib-load" data-id="' + s.id + '" title="加载"><i class="bi bi-box-arrow-down"></i></button>';
                        body += '<button class="danger lib-delete" data-id="' + s.id + '" title="移除"><i class="bi bi-trash"></i></button>';
                    } else {
                        body += '<button class="lib-load" data-id="' + s.id + '" title="加载"><i class="bi bi-box-arrow-down"></i></button>';
                        if (s.status === "pending") {
                            body += '<button class="lib-approve" data-id="' + s.id + '" title="通过"><i class="bi bi-check-circle"></i></button>';
                            body += '<button class="lib-reject" data-id="' + s.id + '" title="驳回"><i class="bi bi-x-circle"></i></button>';
                        }
                        body += '<button class="lib-share" data-id="' + s.id + '" title="共享"><i class="bi bi-share"></i></button>';
                        body += '<button class="lib-move" data-id="' + s.id + '" title="移动到..."><i class="bi bi-arrow-right-square"></i></button>';
                        body += '<button class="danger lib-delete" data-id="' + s.id + '" title="删除"><i class="bi bi-trash"></i></button>';
                    }
                    body += '</div></div>';
                });
                body += '</div>';
            }
            pane.innerHTML = toolbar + body;

            const total = setsData.total || 0;
            if (total > _LIB_PAGE_SIZE) {
                const totalPages = Math.ceil(total / _LIB_PAGE_SIZE);
                const currentPage = Math.floor(_libPageOffset / _LIB_PAGE_SIZE) + 1;
                const paginationHtml = `
                <div class="pagination-bar mt-2 d-flex align-items-center justify-content-between px-2 py-1">
                    <small class="text-muted">共 ${total} 个集合</small>
                    <div class="d-flex align-items-center gap-2">
                        <button class="btn btn-ghost btn-sm ${_libPageOffset <= 0 ? 'disabled' : ''}" id="btnLibPrevPage" ${_libPageOffset <= 0 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i> 上一页</button>
                        <small class="text-muted">第 ${currentPage}/${totalPages} 页</small>
                        <button class="btn btn-ghost btn-sm ${_libPageOffset + _LIB_PAGE_SIZE >= total ? 'disabled' : ''}" id="btnLibNextPage" ${_libPageOffset + _LIB_PAGE_SIZE >= total ? 'disabled' : ''}>下一页 <i class="bi bi-chevron-right"></i></button>
                    </div>
                </div>`;
                pane.insertAdjacentHTML('beforeend', paginationHtml);
                document.getElementById("btnLibPrevPage")?.addEventListener("click", () => {
                    _libPageOffset = Math.max(0, _libPageOffset - _LIB_PAGE_SIZE);
                    loadLibraryContent(folderId);
                });
                document.getElementById("btnLibNextPage")?.addEventListener("click", () => {
                    _libPageOffset += _LIB_PAGE_SIZE;
                    loadLibraryContent(folderId);
                });
            } else {
                _libPageOffset = 0;
            }

            const setCount = sets.length;
            const folderCount = childFolders.length;
            const label = [];
            if (folderCount > 0) label.push(folderCount + " 个子目录");
            if (setCount > 0) label.push(setCount + " 个集合");
            document.getElementById("libSetCount").textContent = label.length > 0 ? label.join("、") : "空";

            pane.querySelectorAll(".lib-subfolder").forEach(el => {
                el.addEventListener("click", () => {
                    const fid = parseInt(el.dataset.folderId);
                    const fname = el.dataset.folderName;
                    navigateToFolder(fid, fname);
                });
            });

            const libBatchMove = document.getElementById("btnLibBatchMove");
            const libBatchDelete = document.getElementById("btnLibBatchDelete");
            const libBatchClear = document.getElementById("btnLibBatchClear");
            if (libBatchMove) libBatchMove.addEventListener("click", batchMoveSets);
            if (libBatchDelete) libBatchDelete.addEventListener("click", batchDeleteSets);
            if (libBatchClear) libBatchClear.addEventListener("click", () => { _libSelectedSets.clear(); pane.querySelectorAll(".lib-checkbox").forEach(cb => cb.checked = false); updateLibBatchUI(); });

            const btnNewLibSet = document.getElementById("btnNewLibSet");
            const btnImportToLib = document.getElementById("btnImportToLib");
            if (btnNewLibSet) btnNewLibSet.addEventListener("click", () => createEmptySet(folderId));
            if (btnImportToLib) btnImportToLib.addEventListener("click", () => importToFolder(folderId));

            const statusFilter = document.getElementById("libStatusFilter");
            if (statusFilter) {
                statusFilter.addEventListener("change", () => {
                    _libPageOffset = 0;
                    loadLibraryContent(folderId);
                });
            }

            const searchInput = document.getElementById("libSearchInput");
            if (searchInput) {
                let searchTimer;
                searchInput.addEventListener("input", () => {
                    clearTimeout(searchTimer);
                    searchTimer = setTimeout(() => {
                        _libPageOffset = 0;
                        loadLibraryContent(folderId);
                    }, 300);
                });
            }

            const selectAll = document.getElementById("libSelectAll");
            if (selectAll) selectAll.addEventListener("change", () => toggleLibSelectAll(selectAll.checked));

            pane.querySelectorAll(".lib-checkbox").forEach(cb => {
                cb.addEventListener("change", () => toggleLibItem(parseInt(cb.dataset.id), cb.checked));
            });

            pane.querySelectorAll(".lib-item").forEach(item => {
                item.addEventListener("click", e => {
                    if (e.target.closest("button") || e.target.closest("input") || e.target.closest("label")) return;
                    loadFromLibrary(parseInt(item.dataset.id));
                });
            });
            pane.querySelectorAll(".lib-load").forEach(btn => {
                btn.addEventListener("click", e => { e.stopPropagation(); loadFromLibrary(parseInt(btn.dataset.id), btn); });
            });
            pane.querySelectorAll(".lib-share").forEach(btn => {
                btn.addEventListener("click", e => { e.stopPropagation(); showShareModal(parseInt(btn.dataset.id)); });
            });
            pane.querySelectorAll(".lib-move").forEach(btn => {
                btn.addEventListener("click", e => { e.stopPropagation(); showMoveModal(parseInt(btn.dataset.id)); });
            });
            pane.querySelectorAll(".lib-delete").forEach(btn => {
                btn.addEventListener("click", e => { e.stopPropagation(); deleteFromLibrary(parseInt(btn.dataset.id), btn); });
            });
            pane.querySelectorAll(".lib-approve").forEach(btn => {
                btn.addEventListener("click", async e => {
                    e.stopPropagation();
                    try {
                        await window.apiFetch("/api/library/" + btn.dataset.id + "/status", { method: "PUT", body: JSON.stringify({ status: "approved" }), headers: window.getAuthHeaders() });
                        window.toast("已通过", "success");
                        loadLibraryContent(folderId);
                    } catch (err) { window.toast(err.message, "error"); }
                });
            });
            pane.querySelectorAll(".lib-reject").forEach(btn => {
                btn.addEventListener("click", async e => {
                    e.stopPropagation();
                    try {
                        await window.apiFetch("/api/library/" + btn.dataset.id + "/status", { method: "PUT", body: JSON.stringify({ status: "rejected" }), headers: window.getAuthHeaders() });
                        window.toast("已驳回", "info");
                        loadLibraryContent(folderId);
                    } catch (err) { window.toast(err.message, "error"); }
                });
            });
        } catch (err) {
            pane.innerHTML = toolbar + '<div class="empty-state empty-state-sm"><i class="bi bi-exclamation-triangle empty-state-icon"></i><p class="empty-state-desc">加载失败：' + window.escHtml(err.message || err) + '</p></div>';
        }
    }

    // ======================================================================
    //  Load from Library (into workspace)
    // ======================================================================

    async function loadFromLibrary(id, btn) {
        if (btn) btn.disabled = true;
        try {
            const resp = await fetch("/api/library/" + id);
            if (!resp.ok) throw new Error((await resp.json()).detail?.message || "加载失败");
            const data = await resp.json();
            const cases = data.test_cases || [];

            if (cases.length === 0) { window.toast("该集合内无用例", "warning"); if (btn) btn.disabled = false; return; }
            if (btn) btn.disabled = false;

            const currentCases = window.getTestCases();
            if (currentCases.length === 0) {
                applyLibraryLoad(cases, data);
                return;
            }

            const loadModal = new bootstrap.Modal(document.getElementById("loadFromLibModal"));
            const modalBody = document.getElementById("loadFromLibModalBody");
            const modalFooter = document.getElementById("loadFromLibModalFooter");
            const modalTitle = document.getElementById("loadFromLibModalTitle");

            function showChoice() {
                modalTitle.textContent = "从用例库加载";
                modalBody.innerHTML = '<div class="load-lib-icon"><i class="bi bi-box-arrow-down"></i></div>'
                    + '<div class="load-lib-set-name">' + window.escHtml(data.name) + '</div>'
                    + '<div class="load-lib-meta">该集合包含 <strong>' + cases.length + '</strong> 条用例</div>'
                    + '<div class="load-lib-warning"><i class="bi bi-exclamation-circle me-1"></i>当前已有 <strong>' + currentCases.length + '</strong> 条未保存用例，请选择加载方式</div>';
                modalFooter.innerHTML = '<button type="button" class="btn btn-load-cancel" data-bs-dismiss="modal">取消</button>'
                    + '<button type="button" class="btn btn-load-append" id="btnLoadAppend"><i class="bi bi-plus-circle"></i> 追加到末尾</button>'
                    + '<button type="button" class="btn btn-load-replace" id="btnLoadReplace"><i class="bi bi-arrow-repeat"></i> 覆盖现有</button>';

                document.getElementById("btnLoadReplace").addEventListener("click", () => showConfirm("replace"));
                document.getElementById("btnLoadAppend").addEventListener("click", () => showConfirm("append"));
            }

            function showConfirm(mode) {
                if (mode === "replace") {
                    modalTitle.textContent = "确认覆盖";
                    modalBody.innerHTML = '<div class="load-lib-icon warning"><i class="bi bi-exclamation-triangle"></i></div>'
                        + '<div class="load-lib-confirm-text">将<strong>丢弃</strong>当前全部 <strong>' + currentCases.length + '</strong> 条用例，<br>替换为库中「' + window.escHtml(data.name) + '」的 <strong>' + cases.length + '</strong> 条用例。</div>'
                        + '<div class="load-lib-confirm-hint">此操作不可撤销</div>';
                    modalFooter.innerHTML = '<button type="button" class="btn btn-load-cancel" id="btnLoadBack"><i class="bi bi-arrow-left"></i> 返回</button>'
                        + '<button type="button" class="btn btn-load-replace" id="btnLoadConfirm"><i class="bi bi-arrow-repeat"></i> 确认覆盖</button>';
                } else {
                    modalTitle.textContent = "确认追加";
                    modalBody.innerHTML = '<div class="load-lib-icon"><i class="bi bi-plus-circle"></i></div>'
                        + '<div class="load-lib-confirm-text">将在当前 <strong>' + currentCases.length + '</strong> 条用例末尾<br>追加库中「' + window.escHtml(data.name) + '」的 <strong>' + cases.length + '</strong> 条用例。</div>';
                    modalFooter.innerHTML = '<button type="button" class="btn btn-load-cancel" id="btnLoadBack"><i class="bi bi-arrow-left"></i> 返回</button>'
                        + '<button type="button" class="btn btn-load-append" id="btnLoadConfirm"><i class="bi bi-check-lg"></i> 确认追加</button>';
                }
                document.getElementById("btnLoadBack").addEventListener("click", showChoice);
                document.getElementById("btnLoadConfirm").addEventListener("click", () => {
                    loadModal.hide();
                    if (mode === "append") {
                        if (typeof _cb.onAppendTestCases === "function") {
                            _cb.onAppendTestCases(cases, data);
                        }
                        if (_libraryModal) _libraryModal.hide();
                    } else {
                        applyLibraryLoad(cases, data);
                    }
                });
            }

            showChoice();
            loadModal.show();
        } catch (err) {
            if (btn) btn.disabled = false;
            window.toast("加载用例失败：" + (err.message || err), "error");
        }
    }

    function applyLibraryLoad(cases, data) {
        if (typeof _cb.onReplaceTestCases === "function") {
            _cb.onReplaceTestCases(cases, data);
        }
        if (_libraryModal) _libraryModal.hide();
    }

    async function deleteFromLibrary(id, btn) {
        if (!(await window.showConfirm("确定从用例库中删除此条目？此操作不可恢复。"))) return;
        if (btn) btn.disabled = true;
        try {
            const resp = await fetch("/api/library/" + id, { method: "DELETE" });
            if (!resp.ok) throw new Error((await resp.json()).detail?.message || "删除失败");
            window.toast("已删除", "success");
            loadLibraryContent(_currentLibFolderId);
        } catch (err) {
            window.toast("删除失败：" + (err.message || err), "error");
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ======================================================================
    //  Init
    // ======================================================================

    function initLibrary(callbacks) {
        _cb = callbacks || {};

        try { _libraryModal = new bootstrap.Modal(document.getElementById("libraryModal")); } catch (_) { }
        try { _saveToLibModal = new bootstrap.Modal(document.getElementById("saveToLibModal")); } catch (_) { }
        try { _moveSetModal = new bootstrap.Modal(document.getElementById("moveSetModal")); } catch (_) { }

        const libModalEl = document.getElementById("libraryModal");
        if (libModalEl) {
            libModalEl.addEventListener("hidden.bs.modal", () => {
                const badge = document.getElementById("libSharedBadge");
                if (badge) badge.style.display = "none";
            });
        }

        document.getElementById("btnSaveToLib")?.addEventListener("click", showSaveToLibModal);
        document.getElementById("btnOpenLib")?.addEventListener("click", openLibrary);
        document.getElementById("btnNewFolder")?.addEventListener("click", () => createFolder(null));
        document.getElementById("btnRefreshLibTree")?.addEventListener("click", refreshLibraryTree);
        document.getElementById("btnSaveToLibConfirm")?.addEventListener("click", doSaveToLibrary);
        document.getElementById("btnMoveSetConfirm")?.addEventListener("click", doMoveSet);
    }

    // ---- Public API ----
    window.initLibrary = initLibrary;
    window.openLibrary = openLibrary;
    window.refreshLibraryTree = refreshLibraryTree;
    window.loadLibraryContent = loadLibraryContent;
    window.createEmptySet = createEmptySet;
    window.importToFolder = importToFolder;
    window.loadFromLibrary = loadFromLibrary;
    window.getImportToLibFolderId = function () { return _importToLibFolderId; };
    window.setImportToLibFolderId = function (v) { _importToLibFolderId = v; };

})();
