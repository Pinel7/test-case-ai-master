/* ==========================================================================
 * TestForge — Main Application Module
 *
 * Sections:
 *   1. DOM refs & state          ~line 2
 *   2. Theme toggle              ~line 280
 *   3. Sidebar navigation        ~line 296
 *   4. API settings              ~line 380
 *   5. Event bindings            ~line 413
 *   6. Dependency search         ~line 680
 *   7. Generate / Stream         ~line 920
 *   8. Polish                    ~line 1084
 *   9. Field chips               ~line 1226
 *   10. Detail modal             ~line 1274
 *   11. Table data sync          ~line 1325
 *   12. Row operations           ~line 1348
 *   13. Batch operations         ~line 1467
 *   14. Import                   ~line 1756
 *   15. Templates                ~line 1986
 *   16. Persistence              ~line 2097
 *   17. Filter                   ~line 2535
 *   18. Card view                ~line 2724
 *   19. Tag cloud                ~line 2812
 * ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // ---- DOM refs ----
        const requirementText = document.getElementById("requirementText");
        const charCounter = document.getElementById("charCounter");
    const modelSelect = document.getElementById("modelSelect");
    const btnGenerate = document.getElementById("btnGenerate");
    const btnClear = document.getElementById("btnClear");
    const btnSample = document.getElementById("btnSample");
    const btnPolish = document.getElementById("btnPolish");
    const btnPolishedUse = document.getElementById("btnPolishedUse");
    const btnCopyPolished = document.getElementById("btnCopyPolished");
    const btnRetry = document.getElementById("btnRetry");
    const btnDismissError = document.getElementById("btnDismissError");
    const btnAddRow = document.getElementById("btnAddRow");
    const btnDeleteSelected = document.getElementById("btnDeleteSelected");
    const btnDuplicate = document.getElementById("btnDuplicate");
    const btnSaveDetail = document.getElementById("btnSaveDetail");
    const btnImport = document.getElementById("btnImport");
    const btnTemplate = document.getElementById("btnTemplate");
    const btnBatchClear = document.getElementById("btnBatchClear");
    const batchBar = document.getElementById("batchBar");
    const batchCount = document.getElementById("batchCount");
    const templateMenu = document.getElementById("templateMenu");
    const importFileInput = document.getElementById("importFileInput");
    const filterInput = document.getElementById("filterInput");
    const loadingArea = document.getElementById("loadingArea");
    const loadingMessage = document.getElementById("loadingMessage");
    const errorArea = document.getElementById("errorArea");
    const errorMessage = document.getElementById("errorMessage");
    const resultsArea = document.getElementById("resultsArea");
    const tableHead = document.getElementById("tableHead");
    const tableBody = document.getElementById("tableBody");
    const caseCount = document.getElementById("caseCount");
    const selectedCount = document.getElementById("selectedCount");
    const polishResult = document.getElementById("polishResult");
    const polishNewLen = document.getElementById("polishNewLen");
    const polishBadge = document.getElementById("polishBadge");
    const polishActions = document.getElementById("polishActions");

    const btnApiSettings = document.getElementById("btnApiSettings");
    const apiSettingsPanel = document.getElementById("apiSettingsPanel");
    const apiKeyInput = document.getElementById("apiKeyInput");
    const apiBaseUrlInput = document.getElementById("apiBaseUrlInput");
    const customModelInput = document.getElementById("customModelInput");
    const btnToggleApiKey = document.getElementById("btnToggleApiKey");
    const tokenCounter = document.getElementById("tokenCounter");
    const tokenTotal = document.getElementById("tokenTotal");

    // ---- View toggle & filter refs ----
    const filterPriority = document.getElementById("filterPriority");
    const filterReview = document.getElementById("filterReview");
    const filterExec = document.getElementById("filterExec");
    const tagCloud = document.getElementById("tagCloud");
    const cardView = document.getElementById("cardView");
    const tableView = document.getElementById("tableView");

    // ---- State ----
    let testCases = [];
    let selectedFields = [...DEFAULT_TABLE_FIELDS];

    function getActiveFields() {
        return selectedFields.map(key => FIELD_BY_KEY[key]).filter(Boolean);
    }

    let currentDetailIndex = -1;
    let polishedText = "";
    let originalTextForDiff = "";
    let detailModal = null;
    let undoStack = [];
    let undoPos = -1;
    let undoMeta = []; // [{time, count}] parallel to undoStack
    let showingDiff = false;
    let userApiKey = "";
    let userApiBaseUrl = "";
    let userModel = "";
    let sessionTokens = 0;

    // ---- View & filter state ----
    let currentView = "list"; // "list" or "card"
    let activeTag = "";

    function pushUndo() {
        while (undoStack.length > undoPos + 1) { undoStack.pop(); undoMeta.pop(); }
        undoStack.push(JSON.parse(JSON.stringify(testCases)));
        undoMeta.push({ time: Date.now(), count: testCases.length });
        if (undoStack.length > UNDO_MAX) { undoStack.shift(); undoMeta.shift(); } else { undoPos++; }
    }

    function undo() {
        if (undoPos <= 0) { toast("没有更早的撤销记录", "warning"); return; }
        undoPos--;
        testCases = JSON.parse(JSON.stringify(undoStack[undoPos]));
        saveToStorage();
        renderTable();
        window.updateExportInfo();
        updateBatchBar();
        toast("已撤销", "success");
    }

    function redo() {
        if (undoPos >= undoStack.length - 1) { toast("没有可恢复的操作", "warning"); return; }
        undoPos++;
        testCases = JSON.parse(JSON.stringify(undoStack[undoPos]));
        saveToStorage();
        renderTable();
        window.updateExportInfo();
        updateBatchBar();
        toast("已恢复", "success");
    }

    function showVersionHistory() {
        if (undoStack.length <= 1) { toast("没有历史版本", "warning"); return; }
        const currentCases = JSON.parse(JSON.stringify(testCases));
        let html = '<div style="max-height:400px;overflow-y:auto;">';
        let hasPrev = false;
        for (let i = undoStack.length - 1; i >= 0; i--) {
            const meta = undoMeta[i];
            if (!meta) continue;
            const ts = new Date(meta.time);
            const timeStr = ts.toLocaleString("zh-CN");
            const isCurrent = i === undoPos;
            const prev = i > 0 ? undoStack[i - 1] : null;
            let diffHtml = "";
            if (prev) {
                const cur = undoStack[i];
                if (cur.length !== prev.length) {
                    diffHtml += `<span style="color:var(--color-accent);">${cur.length > prev.length ? "+" + (cur.length - prev.length) + " 新增" : prev.length - cur.length + " 删除"}</span> `;
                }
                // Count modifications by comparing JSON
                let mods = 0;
                for (let j = 0; j < Math.min(cur.length, prev.length); j++) {
                    if (JSON.stringify(cur[j]) !== JSON.stringify(prev[j])) mods++;
                }
                if (mods > 0) diffHtml += `<span style="color:#f59e0b;">${mods} 条修改</span>`;
            }
            const diffStr = diffHtml || "初始版本";
            html += `<div style="padding:8px 12px;border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:8px;${isCurrent ? 'background:var(--color-accent-light);border-radius:4px;' : ''}">
                <span style="flex:1;font-size:0.85rem;">${timeStr}</span>
                <span style="font-size:0.78rem;color:var(--color-text-secondary);">${meta.count} 条</span>
                <span style="font-size:0.72rem;color:var(--color-text-secondary);">${diffStr}</span>
                ${!isCurrent ? `<button class="btn btn-ghost btn-xs version-compare-btn" data-idx="${i}" style="flex-shrink:0;">对比当前</button>` : '<span style="font-size:0.7rem;color:var(--color-accent);font-weight:600;">当前版本</span>'}
            </div>`;
        }
        html += '</div>';

        const container = document.createElement("div");
        container.innerHTML = html;
        container.querySelectorAll(".version-compare-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.dataset.idx);
                const oldCases = undoStack[idx];
                // Show diff modal
                const added = oldCases.filter((_, i) => !currentCases.some(cc => cc.case_id === oldCases[i].case_id));
                const removed = currentCases.filter((_, i) => !oldCases.some(oc => oc.case_id === currentCases[i].case_id));
                const modified = oldCases.filter(oc => {
                    const match = currentCases.find(cc => cc.case_id === oc.case_id);
                    return match && JSON.stringify(oc) !== JSON.stringify(match);
                });
                let detailHtml = `<div style="padding:8px 0;"><strong>与版本 ${new Date(undoMeta[idx].time).toLocaleString("zh-CN")} 的差异</strong></div>`;
                if (added.length) detailHtml += `<div style="padding:4px 0;color:#10b981;">+ ${added.length} 条新增</div>`;
                if (removed.length) detailHtml += `<div style="padding:4px 0;color:#ef4444;">- ${removed.length} 条删除</div>`;
                if (modified.length) detailHtml += `<div style="padding:4px 0;color:#f59e0b;">~ ${modified.length} 条修改</div>`;
                if (!added.length && !removed.length && !modified.length) detailHtml += '<div style="padding:8px 0;color:var(--color-text-secondary);">无差异</div>';

                if (modified.length > 0) {
                    detailHtml += '<div style="margin-top:8px;font-size:0.78rem;">';
                    modified.forEach(oc => {
                        const match = currentCases.find(cc => cc.case_id === oc.case_id);
                        if (!match) return;
                        const changedFields = [];
                        for (const key of [...new Set([...Object.keys(oc), ...Object.keys(match)])]) {
                            if (JSON.stringify(oc[key]) !== JSON.stringify(match[key])) changedFields.push(key);
                        }
                        detailHtml += `<div style="padding:4px 0;border-bottom:1px solid var(--color-border);">${escHtml(oc.case_id || "")}: 修改 ${changedFields.join(", ")}</div>`;
                    });
                    detailHtml += '</div>';
                }

                const restoreBtn = document.createElement("button");
                restoreBtn.className = "btn btn-accent btn-sm mt-2";
                restoreBtn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i> 恢复到此版本';
                restoreBtn.addEventListener("click", () => {
                    const targetData = JSON.parse(JSON.stringify(undoStack[idx]));
                    pushUndo();
                    testCases = targetData;
                    saveToStorage();
                    rerender();
                    window.updateExportInfo();
                    closeConfirmModal();
                    toast("已恢复历史版本", "success");
                });

                showConfirmCustom(detailHtml, restoreBtn);
            });
        });

        showConfirmCustom(html, null);
    }

    // Helper: show a modal with custom content and optional footer button
    function showConfirmCustom(htmlContent, footerEl) {
        const modalEl = confirmModalEl;
        if (!modalEl) return;
        const body = modalEl.querySelector(".modal-body");
        const footer = modalEl.querySelector(".modal-footer");
        if (body) body.innerHTML = htmlContent;
        if (footer) {
            footer.innerHTML = "";
            if (footerEl) footer.appendChild(footerEl);
            const closeBtn = document.createElement("button");
            closeBtn.className = "btn btn-ghost btn-sm";
            closeBtn.textContent = "关闭";
            closeBtn.addEventListener("click", closeConfirmModal);
            footer.appendChild(closeBtn);
        }
        if (!confirmModalBs) confirmModalBs = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
        confirmModalBs.show();
    }

    function closeConfirmModal() {
        if (confirmModalBs) confirmModalBs.hide();
    }

    // ---- Init ----
    (function init() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                testCases = JSON.parse(saved);
                if (testCases.length > 0) { pushUndo(); resultsArea.style.display = ""; renderTable(); }
            }
            const savedReq = localStorage.getItem(STORAGE_REQ_KEY);
            if (savedReq) {
                requirementText.value = savedReq;
                requirementText.dispatchEvent(new Event("input"));
            }
            const savedModel = localStorage.getItem("itg_model");
            if (savedModel) modelSelect.value = savedModel;
            const savedFields = localStorage.getItem(STORAGE_FIELDS_KEY);
            if (savedFields) selectedFields = JSON.parse(savedFields);
            const savedApiKey = localStorage.getItem("itg_apikey");
            if (savedApiKey) { userApiKey = savedApiKey; if (apiKeyInput) apiKeyInput.value = savedApiKey; }
            const savedUserModel = localStorage.getItem("itg_usermodel");
            if (savedUserModel) { userModel = savedUserModel; if (customModelInput) customModelInput.value = savedUserModel; }
            const savedBaseUrl = localStorage.getItem("itg_apibaseurl");
            if (savedBaseUrl) { userApiBaseUrl = savedBaseUrl; if (apiBaseUrlInput) apiBaseUrlInput.value = savedBaseUrl; }
            const savedTokens = localStorage.getItem("itg_tokens");
            if (savedTokens) { sessionTokens = parseInt(savedTokens) || 0; updateTokenCounter(); }
            // Session recovery check: if testCases is empty but recovery backup exists
            if (testCases.length === 0) {
                const recovery = hasRecoveryData();
                if (recovery && recovery.count > 0) {
                    setTimeout(() => {
                        showCustomDialog("恢复未保存的会话", `
                            <p>检测到上次退出时未保存的测试用例数据：</p>
                            <p><strong>${recovery.count}</strong> 条用例 · 保存于 ${new Date(recovery.savedAt).toLocaleString("zh-CN")}</p>
                            <p class="text-muted small">恢复后请及时导出或保存到用例库。</p>
                        `, [
                            { text: "丢弃", cls: "btn-secondary", action: () => { try { localStorage.removeItem(STORAGE_RECOVERY_KEY); } catch(_) {} } },
                            { text: "恢复数据", cls: "btn-primary", action: () => { restoreFromRecovery(); toast(`已恢复 ${recovery.count} 条用例`, "success"); } },
                        ]);
                    }, 500);
                }
            }
        } catch (_) {}
        try {
            if (undoStack.length === 0) pushUndo();
            renderFieldChips();
            window.updateExportInfo();
            window.renderExportFields();
            renderTemplates();
        } catch (_) {}
    })();

    // Refresh home page after restoring localStorage values
    try { if (typeof window.refreshHomePage === "function") window.refreshHomePage(); } catch (_) {}

    try { detailModal = new bootstrap.Modal(document.getElementById("detailModal")); } catch (_) { detailModal = null; }
    ensureDatalists();

    // ---- Markdown Preview Toggle ----
    (function() {
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
    })();

    // ---- Sidebar navigation ----
    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", (e) => { e.preventDefault(); navigateTo(item.dataset.page); });
    });

    function navigateTo(page) {
        document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

        const current = document.querySelector(".content-page.active");
        const nextPage = document.getElementById(`page-${page}`);
        if (!nextPage || current === nextPage) return;

        const navItem = document.querySelector(`[data-page="${page}"]`);
        if (navItem) navItem.classList.add("active");

        // Exit current page with animation
        if (current) {
            current.classList.remove("active");
            current.classList.add("page-exit");
            setTimeout(() => current.classList.remove("page-exit"), 250);
        }

        // Enter next page — CSS animation fires automatically on .active
        nextPage.classList.add("active");

        if (page === "export") { window.updateExportInfo(); window.renderExportFields(); }
        if (page === "home") refreshHomePage();
        if (page === "cases" && testCases.length > 0) {
            resultsArea.style.display = "";
            renderTable();
        }
    }

    // ---- API Settings ----
    if (btnApiSettings) {
        btnApiSettings.addEventListener("click", () => {
            apiSettingsPanel.style.display = apiSettingsPanel.style.display === "none" ? "block" : "none";
        });
    }
    if (btnToggleApiKey) {
        btnToggleApiKey.addEventListener("click", () => {
            const isPass = apiKeyInput.type === "password";
            apiKeyInput.type = isPass ? "text" : "password";
            btnToggleApiKey.innerHTML = isPass ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
        });
    }
    if (apiKeyInput) {
        apiKeyInput.addEventListener("input", () => {
            userApiKey = apiKeyInput.value.trim();
            try { localStorage.setItem("itg_apikey", userApiKey); } catch (_) {}
            updateApiWarnDot();
        });
    }
    if (apiBaseUrlInput) {
        apiBaseUrlInput.addEventListener("input", () => {
            userApiBaseUrl = apiBaseUrlInput.value.trim();
            try { localStorage.setItem("itg_apibaseurl", userApiBaseUrl); } catch (_) {}
        });
    }

    function updateApiWarnDot() {
        const dot = document.getElementById("apiWarnDot");
        if (!dot) return;
        dot.style.display = userApiKey ? "none" : "";
    }

    // On first load, if no key is configured, auto-open the settings panel
    if (!userApiKey) {
        setTimeout(() => {
            if (apiSettingsPanel) apiSettingsPanel.style.display = "block";
            updateApiWarnDot();
        }, 800);
    } else {
        updateApiWarnDot();
    }
    if (customModelInput) {
        customModelInput.addEventListener("input", () => {
            userModel = customModelInput.value.trim();
            try { localStorage.setItem("itg_usermodel", userModel); } catch (_) {}
        });
    }

    function updateTokenCounter() {
        if (!tokenCounter || !tokenTotal) return;
        tokenTotal.textContent = sessionTokens.toLocaleString();
        tokenCounter.style.display = sessionTokens > 0 ? "" : "none";
    }

    function addTokens(inputTokens, outputTokens) {
        sessionTokens += (inputTokens || 0) + (outputTokens || 0);
        try { localStorage.setItem("itg_tokens", String(sessionTokens)); } catch (_) {}
        updateTokenCounter();
    }

    // ---- Event bindings ----
    let _reqDebounce;
    requirementText.addEventListener("input", () => {
        const len = requirementText.value.length;
        charCounter.textContent = `${len.toLocaleString()} / 150,000 字符`;
        charCounter.className = len > 145000 ? "text-muted danger" : len > 120000 ? "text-muted warning" : "text-muted";
        clearTimeout(_reqDebounce);
        _reqDebounce = setTimeout(() => {
            localStorage.setItem(STORAGE_REQ_KEY, requirementText.value);
            const dot = document.getElementById("autoSaveDot");
            if (dot) { dot.style.opacity = "1"; setTimeout(() => { if (dot) dot.style.opacity = "0"; }, 1500); }
        }, 500);
    });
    if (requirementText.value) localStorage.setItem(STORAGE_REQ_KEY, requirementText.value);

    // Input mode toggle
    document.querySelectorAll(".input-mode-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".input-mode-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const mode = btn.dataset.mode;
            const splitPanel = document.querySelector(".split-panel");
            const structPanel = document.getElementById("structuredInputPanel");
            if (mode === "free") {
                if (splitPanel) splitPanel.style.display = "";
                if (structPanel) structPanel.style.display = "none";
            } else {
                if (splitPanel) splitPanel.style.display = "none";
                if (structPanel) structPanel.style.display = "";
            }
        });
    });

    btnClear.addEventListener("click", async () => {
        if (testCases.length > 0) {
            const ok = await showConfirm("清空输入将丢弃当前测试用例，确定继续？");
            if (!ok) return;
        }
        requirementText.value = "";
        polishedText = "";
        originalTextForDiff = "";
        charCounter.textContent = "0 / 150,000 字符";
        charCounter.className = "text-muted";
        testCases = [];
        undoStack = [];
        undoPos = -1;
        pushUndo();
        clearStorage();
        resetPolishPanel();
        window.updateExportInfo();
        hideResults();
    });

    btnSample.addEventListener("click", async () => {
        if (requirementText.value.trim()) {
            const ok = await showConfirm("加载示例将覆盖当前内容，确定继续？");
            if (!ok) return;
        }
        requirementText.value = SAMPLE_REQUIREMENT;
        requirementText.dispatchEvent(new Event("input"));
    });

    btnGenerate.addEventListener("click", submitRequirement);
    btnRetry.addEventListener("click", submitRequirement);
    btnDismissError.addEventListener("click", hideError);

    // Case count select: toggle custom input
    const caseCountSelectEl = document.getElementById("caseCountSelect");
    const caseCountCustomEl = document.getElementById("caseCountCustom");
    if (caseCountSelectEl && caseCountCustomEl) {
        caseCountSelectEl.addEventListener("change", () => {
            if (caseCountSelectEl.value === "-1") {
                caseCountCustomEl.style.display = "";
                caseCountCustomEl.focus();
            } else {
                caseCountCustomEl.style.display = "none";
            }
        });
    }

    btnPolish.addEventListener("click", polishRequirement);
    btnPolishedUse.addEventListener("click", usePolished);
    btnCopyPolished.addEventListener("click", copyPolished);

    // Outline generation buttons
    document.getElementById("btnGenerateOutline")?.addEventListener("click", callGenerateOutline);
    document.getElementById("btnConfirmOutline")?.addEventListener("click", () => {
        const panel = document.getElementById("outlinePanel");
        if (panel) panel.style.display = "none";
        const outlineText = buildOutlineText();
        if (outlineText) {
            requirementText.value = outlineText + "\n\n" + requirementText.value;
            requirementText.dispatchEvent(new Event("input"));
        }
        // Switch to free-text mode so submitRequirement reads the combined text
        const freeBtn = document.querySelector('.input-mode-btn[data-mode="free"]');
        if (freeBtn) freeBtn.click();
        submitRequirement();
    });
    document.getElementById("btnDiscardOutline")?.addEventListener("click", () => {
        const panel = document.getElementById("outlinePanel");
        if (panel) panel.style.display = "none";
        _outlineData = null;
        const content = document.getElementById("outlineContent");
        if (content) content.innerHTML = "";
    });

    document.getElementById("btnSelectAll")?.addEventListener("click", () => setAllFieldChips(true));
    document.getElementById("btnDeselectAll")?.addEventListener("click", () => setAllFieldChips(false));

    // Export button listeners are in modules/export.js (initExport)


    btnAddRow.addEventListener("click", addRow);
    btnDeleteSelected.addEventListener("click", () => deleteSelected());
    if (btnDuplicate) btnDuplicate.addEventListener("click", duplicateSelected);
    btnSaveDetail.addEventListener("click", saveDetail);
    document.getElementById("btnVersionHistory")?.addEventListener("click", showVersionHistory);
    filterInput.addEventListener("input", debouncedRerender);
    if (btnImport) btnImport.addEventListener("click", () => { window.setImportToLibFolderId(null); importFileInput.click(); });
    if (importFileInput) importFileInput.addEventListener("change", handleImport);
    if (btnTemplate) btnTemplate.addEventListener("click", toggleTemplateMenu);
    if (btnBatchClear) btnBatchClear.addEventListener("click", clearBatchSelection);
    document.getElementById("btnBatchExport")?.addEventListener("click", () => {
        const selected = getSelectedCases();
        if (selected.length === 0) { toast("请先选择用例", "warning"); return; }
        window.doBatchExport(selected);
    });
    document.getElementById("btnBatchDelete")?.addEventListener("click", async () => {
        const selected = getSelectedCases();
        if (selected.length === 0) { toast("请先选择用例", "warning"); return; }
        const ok = await showConfirm(`确定删除选中的 ${selected.length} 条用例？`);
        if (!ok) return;
        pushUndo();
        const indices = new Set(selected.map(tc => testCases.indexOf(tc)));
        testCases = testCases.filter((_, i) => !indices.has(i));
        testCases.forEach((tc, i) => { tc.case_id = `TC-${String(i + 1).padStart(3, "0")}`; });
        saveToStorage();
        rerender();
        window.updateExportInfo();
        batchBar.classList.remove("active");
        toast(`已删除 ${selected.length} 条`, "success");
    });
    // ---- Batch: Save selected to Library ----
    document.getElementById("btnBatchSaveLib")?.addEventListener("click", async () => {
        const selected = getSelectedCases();
        if (selected.length === 0) { toast("请先选择用例", "warning"); return; }
        const name = await showPrompt("保存到用例库，输入集合名称：", `批量保存 ${selected.length} 条`, "保存到用例库");
        if (!name || !name.trim()) return;
        try {
            const resp = await fetch("/api/library/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), test_cases: selected, requirement_text: "" }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail?.message || "保存失败");
            toast(`已保存 ${selected.length} 条到用例库`, "success");
            if (typeof loadLibraryContent === "function") loadLibraryContent(null);
        } catch (err) {
            toast("保存失败：" + (err.message || err), "error");
        }
    });
    // ---- Batch: Duplicate selected ----
    document.getElementById("btnBatchDuplicate")?.addEventListener("click", () => {
        const selected = getSelectedCases();
        if (selected.length === 0) { toast("请先选择用例", "warning"); return; }
        pushUndo();
        const indices = selected.map(tc => testCases.indexOf(tc));
        const toInsert = [];
        // Iterate in reverse so insertion indexes stay valid
        for (let i = testCases.length - 1; i >= 0; i--) {
            if (indices.includes(i)) {
                const dup = JSON.parse(JSON.stringify(testCases[i]));
                toInsert.push({ index: i + 1, item: dup });
            }
        }
        toInsert.sort((a, b) => b.index - a.index);
        for (const { index, item } of toInsert) {
            testCases.splice(index, 0, item);
        }
        testCases.forEach((tc, i) => { tc.case_id = `TC-${String(i + 1).padStart(3, "0")}`; });
        saveToStorage();
        rerender();
        toast(`已复制 ${selected.length} 条`, "success");
    });

    // View toggle
    document.querySelectorAll("#viewToggle .btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#viewToggle .btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentView = btn.dataset.view;
            if (currentView === "card") { tableView.style.display = "none"; cardView.style.display = ""; renderCardView(); }
            else { tableView.style.display = ""; cardView.style.display = "none"; }
        });
    });
    buildBatchBar();
    let dependencyModal = null;
    try { dependencyModal = new bootstrap.Modal(document.getElementById("dependencyModal")); } catch (_) {}
    // Library button listeners are in modules/library.js (initLibrary)

    modelSelect.addEventListener("change", () => {
        localStorage.setItem("itg_model", modelSelect.value);
    });

    // ---- Dependency Search ----
    let depTargetIndex = -1;
    let depLibState = { mode: "folders", currentFolderId: null, currentFolderName: "", currentSetId: null, currentSetName: "" };
    const depSearchInput = document.getElementById("depSearchInput");
    if (depSearchInput) {
        depSearchInput.addEventListener("input", () => filterDependencyList(depSearchInput.value));
    }

    // Dep tab switching
    document.querySelectorAll("#depTabs .dep-tabs-link").forEach(tab => {
        tab.addEventListener("click", function (e) {
            e.preventDefault();
            document.querySelectorAll("#depTabs .dep-tabs-link").forEach(t => t.classList.remove("active"));
            this.classList.add("active");
            const tabName = this.dataset.tab;
            document.getElementById("depTabCurrent").style.display = tabName === "current" ? "" : "none";
            document.getElementById("depTabLibrary").style.display = tabName === "library" ? "" : "none";
            if (tabName === "library") {
                loadDepLibraryTree();
            }
        });
    });

    function openDependencySearch(index) {
        depTargetIndex = index;
        if (depSearchInput) depSearchInput.value = "";
        renderDepResults("");
        // Reset to current tab
        document.querySelectorAll("#depTabs .dep-tabs-link").forEach(t => t.classList.remove("active"));
        const curTab = document.querySelector("#depTabs .nav-link[data-tab='current']");
        if (curTab) curTab.classList.add("active");
        document.getElementById("depTabCurrent").style.display = "";
        document.getElementById("depTabLibrary").style.display = "none";
        depLibState = { mode: "folders", currentFolderId: null, currentFolderName: "", currentSetId: null, currentSetName: "" };
        if (dependencyModal) dependencyModal.show();
    }

    function filterDependencyList(query) {
        const q = (query || "").toLowerCase();
        const results = testCases.filter((tc, i) => i !== depTargetIndex && (
            tc.case_id.toLowerCase().includes(q) ||
            tc.title.toLowerCase().includes(q) ||
            tc.module.toLowerCase().includes(q)
        ));
        renderDepResults(q, results);
    }

    function renderDepResults(query, results) {
        const container = document.getElementById("depSearchResults");
        if (!container) return;

        if (results === undefined) {
            const q = query || "";
            results = testCases.filter((tc, i) => i !== depTargetIndex && (
                !q || tc.case_id.toLowerCase().includes(q) || tc.title.toLowerCase().includes(q) || tc.module.toLowerCase().includes(q)
            ));
        }

        if (results.length === 0) {
            container.innerHTML = '<div class="empty-state empty-state-sm"><i class="bi bi-inbox empty-state-icon"></i><p class="empty-state-desc">无匹配用例</p></div>';
            return;
        }
        let html = "";
        results.forEach((tc) => {
            const globalIdx = testCases.indexOf(tc);
            html += `<div class="dep-result-item" data-idx="${globalIdx}">
                <span class="dep-result-badge">${escHtml(tc.case_id)}</span>
                <span class="dep-result-title">${escHtml(tc.title)}</span>
                <span class="dep-result-module">${escHtml(tc.module)}</span>
            </div>`;
        });
        container.innerHTML = html;
        container.querySelectorAll(".dep-result-item").forEach(item => {
            item.addEventListener("click", () => selectDependency(parseInt(item.dataset.idx)));
        });
    }

    function selectDependency(sourceIndex) {
        const dep = testCases[sourceIndex];
        const ref = `依赖 [${dep.case_id}] ${dep.title}：需先执行该用例并通过`;
        if (depTargetIndex === -1) {
            applyBatchDep(ref);
        } else {
            pushUndo();
            const tc = testCases[depTargetIndex];
            tc.preconditions = tc.preconditions ? tc.preconditions + "\n" + ref : ref;
            saveToStorage();
            renderTable();
            if (dependencyModal) dependencyModal.hide();
            toast(`已添加前置依赖 [${dep.case_id}]`, "success");
        }
    }

    // ---- Dependency: Library browsing ----
    async function loadDepLibraryTree() {
        const treeEl = document.getElementById("depLibFolderTree");
        if (!treeEl) return;
        treeEl.innerHTML = '<div class="text-muted small p-2">加载中...</div>';
        try {
            const resp = await fetch("/api/library/folders");
            const data = await resp.json();
            const folders = data.folders || [];
            renderDepFolderTree(treeEl, folders, depLibState.currentFolderId);
        } catch (e) {
            treeEl.innerHTML = '<div class="text-danger small p-2">加载失败</div>';
        }
    }

    function renderDepFolderTree(container, folders, selectedId) {
        let html = "";
        // Root node
        html += `<div class="dep-lib-set-item" data-folder-id="" style="margin-bottom:2px;">
            <i class="bi bi-folder set-icon"></i>
            <div class="set-info"><strong>根目录</strong></div>
        </div>`;
        // Build tree and render
        const map = {};
        folders.forEach(f => { map[f.id] = { ...f, children: [] }; });
        const roots = [];
        folders.forEach(f => {
            if (f.parent_id && map[f.parent_id]) map[f.parent_id].children.push(map[f.id]);
            else roots.push(map[f.id]);
        });
        function renderNodes(nodes, depth) {
            let h = "";
            nodes.forEach(n => {
                h += `<div class="tree-item${n.id === selectedId ? " selected" : ""}" data-folder-id="${n.id}" style="padding-left:${8 + depth * 14}px;">
                    <i class="bi bi-folder"></i>
                    <span class="tree-label">${escHtml(n.name)}</span>
                    <button class="dep-select-folder" data-folder-id="${n.id}" data-folder-name="${escHtml(n.name)}" title="选择整个模块作为依赖"><i class="bi bi-link-45deg"></i></button>
                </div>`;
                if (n.children.length) h += renderNodes(n.children, depth + 1);
            });
            return h;
        }
        html += renderNodes(roots, 0);
        container.innerHTML = html;
        // Click handlers — navigate into folder
        container.querySelectorAll("[data-folder-id]").forEach(el => {
            el.addEventListener("click", (e) => {
                if (e.target.closest(".dep-select-folder")) return;
                const fid = el.dataset.folderId;
                depLibState.currentFolderId = fid || null;
                depLibState.currentFolderName = fid ? el.querySelector(".tree-label").textContent : "根目录";
                depLibState.mode = "folders";
                loadDepFolderCases(fid);
                // Update selection
                container.querySelectorAll(".tree-item.selected, .dep-lib-set-item.selected").forEach(e => e.classList.remove("selected"));
                el.classList.add("selected");
            });
        });
        // Click handlers — select folder as dependency
        container.querySelectorAll(".dep-select-folder").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                selectFolderDependency(btn.dataset.folderId, btn.dataset.folderName);
            });
        });
    }

    async function selectFolderDependency(folderId, folderName) {
        try {
            const resp = await fetch("/api/library/folders");
            const data = await resp.json();
            const folders = data.folders || [];
            const map = {};
            folders.forEach(f => { map[f.id] = f; });
            const parts = [folderName];
            let cur = map[parseInt(folderId)];
            while (cur && cur.parent_id) { cur = map[cur.parent_id]; if (cur) parts.unshift(cur.name); }
            const path = parts.join("/");

            const ref = "依赖 [" + path + "] 模块全部用例：需先执行该模块下所有用例并通过";
            if (depTargetIndex === -1) {
                applyBatchDep(ref);
            } else {
                pushUndo();
                const tc = testCases[depTargetIndex];
                tc.preconditions = tc.preconditions ? tc.preconditions + "\n" + ref : ref;
                saveToStorage();
                renderTable();
                if (dependencyModal) dependencyModal.hide();
                toast("已添加模块依赖 [" + folderName + "]", "success");
            }
        } catch (_) {
            toast("获取模块信息失败", "warning");
        }
    }

    async function loadDepFolderCases(folderId) {
        const resultsEl = document.getElementById("depLibResults");
        const breadcrumb = document.getElementById("depLibBreadcrumb");
        if (!resultsEl) return;
        resultsEl.innerHTML = '<div class="text-muted small p-2">加载中...</div>';
        if (breadcrumb) breadcrumb.innerHTML = "";
        try {
            let url = `/api/library/list`;
            if (folderId) url += `?folder_id=${folderId}`;
            const resp = await fetch(url);
            const data = await resp.json();
            const sets = data.sets || [];
            depLibState.mode = "folders";
            depLibState.currentSetId = null;
            if (breadcrumb) {
                const folderLabel = depLibState.currentFolderName || "用例库";
                breadcrumb.innerHTML = '<span class="dep-breadcrumb-link">' + escHtml(folderLabel) + '</span>';
            }
            if (sets.length === 0) {
                resultsEl.innerHTML = '<div class="empty-state empty-state-sm"><p class="empty-state-desc">此文件夹下无集合</p></div>';
                return;
            }
            let html = "";
            sets.forEach(s => {
                html += `<div class="dep-lib-set-item" data-set-id="${s.id}" style="margin-bottom:4px;">
                    <i class="bi bi-file-earmark-text set-icon"></i>
                    <div class="set-info"><strong>${escHtml(s.name)}</strong><small>${s.case_count} 条</small></div>
                    <button class="dep-select-set" data-set-id="${s.id}" data-set-name="${escHtml(s.name)}" title="选择整个集合作为依赖"><i class="bi bi-link-45deg"></i></button>
                </div>`;
            });
            resultsEl.innerHTML = html;
            resultsEl.querySelectorAll("[data-set-id]").forEach(el => {
                el.addEventListener("click", (e) => {
                    if (e.target.closest(".dep-select-set")) return;
                    depLibState.currentSetId = parseInt(el.dataset.setId);
                    depLibState.currentSetName = el.querySelector("strong").textContent;
                    depLibState.mode = "cases";
                    loadDepSetCases(el.dataset.setId);
                });
            });
            // Click handlers — select set as dependency
            resultsEl.querySelectorAll(".dep-select-set").forEach(btn => {
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    selectSetDependency(btn.dataset.setId, btn.dataset.setName);
                });
            });
        } catch (e) {
            resultsEl.innerHTML = '<div class="text-danger small p-2">加载失败</div>';
        }
    }

    async function loadDepSetCases(setId) {
        const resultsEl = document.getElementById("depLibResults");
        const breadcrumb = document.getElementById("depLibBreadcrumb");
        if (!resultsEl) return;
        resultsEl.innerHTML = '<div class="text-muted small p-2">加载中...</div>';
        try {
            const resp = await fetch(`/api/library/${setId}`);
            const data = await resp.json();
            const cases = data.test_cases || [];
            const setName = data.name || depLibState.currentSetName;
            if (breadcrumb) {
                breadcrumb.innerHTML = `<button class="dep-lib-back" id="depLibBackBtn"><i class="bi bi-arrow-left"></i> 返回集合列表</button>
                    <span class="dep-breadcrumb-link">${escHtml(setName)}</span>
                    <button class="dep-select-set-breadcrumb" id="depSelectSetBtn" title="选择整个集合作为依赖"><i class="bi bi-link-45deg"></i> 引用整个集合</button>`;
                const backBtn = document.getElementById("depLibBackBtn");
                if (backBtn) backBtn.addEventListener("click", () => {
                    depLibState.mode = "folders";
                    loadDepFolderCases(depLibState.currentFolderId);
                });
                const selBtn = document.getElementById("depSelectSetBtn");
                if (selBtn) selBtn.addEventListener("click", () => selectSetDependency(setId, setName));
            }
            if (cases.length === 0) {
                resultsEl.innerHTML = '<div class="empty-state empty-state-sm"><p class="empty-state-desc">此集合无用例</p></div>';
                return;
            }
            let html = "";
            cases.forEach((tc, i) => {
                html += `<div class="dep-result-item" data-case-idx="${i}">
                    <span class="dep-result-badge">${escHtml(tc.case_id || "")}</span>
                    <span class="dep-result-title">${escHtml(tc.title || "")}</span>
                    <span class="dep-result-module">${escHtml(tc.module || "")}</span>
                </div>`;
            });
            resultsEl.innerHTML = html;
            resultsEl.querySelectorAll(".dep-result-item").forEach(item => {
                item.addEventListener("click", () => {
                    selectLibraryDependency(setName, cases[parseInt(item.dataset.caseIdx)]);
                });
            });
        } catch (e) {
            resultsEl.innerHTML = '<div class="text-danger small p-2">加载失败</div>';
        }
    }

    function selectLibraryDependency(setName, depCase) {
        const ref = `依赖 [${setName}/${depCase.case_id || "?"}] ${depCase.title || "未命名"}：需先执行该用例并通过`;
        if (depTargetIndex === -1) {
            applyBatchDep(ref);
        } else {
            pushUndo();
            const tc = testCases[depTargetIndex];
            tc.preconditions = tc.preconditions ? tc.preconditions + "\n" + ref : ref;
            saveToStorage();
            renderTable();
            if (dependencyModal) dependencyModal.hide();
            toast(`已添加前置依赖 [${depCase.case_id || "?"}]`, "success");
        }
    }

    async function selectSetDependency(setId, setName) {
        try {
            const resp = await fetch(`/api/library/${setId}`);
            const data = await resp.json();
            const cases = data.test_cases || [];
            const ref = `依赖 [${setName}] 全部用例（共${cases.length}条）：需先执行该集合中所有用例并通过`;
            if (depTargetIndex === -1) {
                applyBatchDep(ref);
            } else {
                pushUndo();
                const tc = testCases[depTargetIndex];
                tc.preconditions = tc.preconditions ? tc.preconditions + "\n" + ref : ref;
                saveToStorage();
                renderTable();
                if (dependencyModal) dependencyModal.hide();
                toast(`已添加集合依赖 [${setName}]`, "success");
            }
        } catch (_) {
            toast("获取集合信息失败", "warning");
        }
    }

    // Close template / batch menus when clicking outside
    document.addEventListener("click", (e) => {
        if (templateMenu && btnTemplate && !btnTemplate.contains(e.target) && !templateMenu.contains(e.target)) {
            templateMenu.classList.remove("show");
        }
        // Close all batch dropdown menus when clicking outside
        if (!e.target.closest(".batch-drop")) {
            document.querySelectorAll(".batch-bar .batch-menu.show").forEach(m => m.classList.remove("show"));
        }
    });

    // ---- Core: Generate ----
    let _genAbortController = null;
    let _genElapsedTimer = null;

    function startElapsedTimer() {
        const el = document.getElementById("loadingElapsed");
        if (!el) return;
        const start = Date.now();
        if (_genElapsedTimer) clearInterval(_genElapsedTimer);
        _genElapsedTimer = setInterval(() => {
            const sec = Math.floor((Date.now() - start) / 1000);
            const min = Math.floor(sec / 60);
            el.textContent = min > 0 ? `已等待 ${min}m${sec % 60}s` : `已等待 ${sec}s`;
        }, 1000);
    }

    function stopElapsedTimer() {
        if (_genElapsedTimer) { clearInterval(_genElapsedTimer); _genElapsedTimer = null; }
    }

    // ---- Outline generation ----
    let _outlineData = null;

    function renderOutline(outline) {
        const container = document.getElementById("outlineContent");
        if (!container) return;
        if (!outline || outline.length === 0) {
            container.innerHTML = '<p class="text-muted">未生成测试要点，请重试。</p>';
            return;
        }
        let html = "";
        outline.forEach(section => {
            html += '<div class="outline-section"><h4 class="outline-module"><i class="bi bi-box"></i> ' + escHtml(section.module || "未命名模块") + '</h4><ul>';
            (section.test_ideas || []).forEach(idea => {
                html += '<li>' + escHtml(idea) + '</li>';
            });
            html += '</ul></div>';
        });
        container.innerHTML = html;
    }

    function buildOutlineText() {
        if (!_outlineData) return "";
        return _outlineData.map(s =>
            "### " + (s.module || "未命名模块") + "\n" + (s.test_ideas || []).map(t => "- " + t).join("\n")
        ).join("\n\n");
    }

    async function callGenerateOutline() {
        const inputMode = document.querySelector(".input-mode-btn.active")?.dataset?.mode || "free";
        let text;
        if (inputMode === "structured") {
            text = buildStructuredRequirement();
        } else {
            text = requirementText.value.trim();
        }
        if (!text) { toast("请先输入需求", "warning"); return; }

        const outlinePanel = document.getElementById("outlinePanel");
        const outlineContent = document.getElementById("outlineContent");
        if (outlinePanel) outlinePanel.style.display = "";
        if (outlineContent) outlineContent.innerHTML = '<div class="text-center text-muted py-3"><div class="spinner mb-2"></div><p>正在生成测试要点...</p></div>';

        try {
            const data = await window.apiFetch("/api/generate/outline", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requirement_text: text,
                    model: document.getElementById("modelSelect")?.value || "deepseek-chat",
                    api_key: window.userApiKey || undefined,
                    api_base_url: window.userApiBaseUrl || undefined,
                }),
            });
            _outlineData = data.outline || [];
            if (data.usage) {
                const u = data.usage;
                addTokens(u.input_tokens, u.output_tokens);
                const costStr = u.cost ? ` (≈$${u.cost.toFixed(4)})` : "";
                toast(`测试要点生成完成，消耗 ${u.input_tokens.toLocaleString()} 输入 + ${u.output_tokens.toLocaleString()} 输出 tokens${costStr}`, "success");
            }
            renderOutline(_outlineData);
        } catch (err) {
            if (outlineContent) outlineContent.innerHTML = '<div class="admin-error">生成失败: ' + escHtml(err.message) + '</div>';
            toast("生成测试要点失败: " + err.message, "error");
        }
    }

    function buildStructuredRequirement() {
        const parts = [];
        const module = document.getElementById("siModule")?.value.trim();
        const desc = document.getElementById("siDescription")?.value.trim();
        const rules = document.getElementById("siInputRules")?.value.trim();
        const expected = document.getElementById("siExpected")?.value.trim();
        const edges = document.getElementById("siEdgeCases")?.value.trim();
        if (module) parts.push("## 模块\n" + module);
        if (desc) parts.push("## 功能描述\n" + desc);
        if (rules) parts.push("## 输入字段与规则\n" + rules);
        if (expected) parts.push("## 预期行为\n" + expected);
        if (edges) parts.push("## 边界与异常场景\n" + edges);
        return parts.join("\n\n");
    }

    async function submitRequirement() {
        const inputMode = document.querySelector(".input-mode-btn.active")?.dataset?.mode || "free";
        let text;
        if (inputMode === "structured") {
            text = buildStructuredRequirement();
            if (!text) { showError("请填写结构化输入字段"); return; }
        } else {
            text = requirementText.value.trim();
            if (!text) { showError("请先在「需求编辑」页面粘贴需求文档。"); return; }
        }
        if (text.length > 150000) { showError("文档过长（超过150,000字符）。"); return; }

        hideError();
        hideResults();
        navigateTo("cases");

        // Reset elapsed time
        const elapsedEl = document.getElementById("loadingElapsed");
        if (elapsedEl) elapsedEl.textContent = "已等待 0s";

        showLoading();
        startElapsedTimer();
        localStorage.setItem(STORAGE_REQ_KEY, text);

        const caseCountEl = document.getElementById("caseCountSelect");
        let caseCount = 10;
        if (caseCountEl) {
            if (caseCountEl.value === "-1") {
                const customEl = document.getElementById("caseCountCustom");
                caseCount = customEl ? parseInt(customEl.value) || 10 : 10;
            } else {
                caseCount = parseInt(caseCountEl.value) || 0;
            }
        }
        // If user didn't set a count, default to 10 (but 0 = auto)
        if (!caseCount || caseCount < 0) caseCount = 10;

        const effectiveModel = userModel || modelSelect.value;
        const effectiveKey = userApiKey || null;

        // Create abort controller for cancellation
        _genAbortController = new AbortController();
        const signal = _genAbortController.signal;

        // Enable cancel button
        let cancelBtn = document.getElementById("btnCancelGenerate");
        if (cancelBtn) cancelBtn.style.display = "";

        try {
            const resp = await fetch("/api/generate/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requirement_text: text,
                    model: effectiveModel,
                    api_key: effectiveKey || undefined,
                    api_base_url: userApiBaseUrl || undefined,
                    fields: selectedFields.length < ALL_FIELD_KEYS.length ? selectedFields : null,
                    case_count: caseCount,
                }),
                signal,
            });
            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.detail?.message || `请求失败 (${resp.status})`);
            }
            if (!resp.body) throw new Error("浏览器不支持流式读取");

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let streamDone = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done && !buffer) break;
                if (value) buffer += decoder.decode(value, { stream: true });
                if (done) { streamDone = true; }
                // Process complete SSE events
                let idx;
                while ((idx = buffer.indexOf("\n")) !== -1) {
                    const line = buffer.slice(0, idx).trim();
                    buffer = buffer.slice(idx + 1);
                    if (line.startsWith("data: ")) {
                        try {
                            const evt = JSON.parse(line.slice(6));
                            if (evt.type === "status") {
                                loadingMessage.textContent = evt.message || "处理中...";
                            } else if (evt.type === "complete") {
                                testCases = evt.test_cases || [];
                                pushUndo();
                                renderTable();
                                saveToStorage();
                                window.updateExportInfo();
                                hideLoading();
                                stopElapsedTimer();
                                resultsArea.style.display = "";
                                if (evt.usage) {
                                    const u = evt.usage;
                                    addTokens(u.input_tokens, u.output_tokens);
                                    const costStr = u.cost ? ` (≈$${u.cost.toFixed(4)})` : "";
                                    toast(`消耗 ${u.input_tokens.toLocaleString()} 输入 + ${u.output_tokens.toLocaleString()} 输出 tokens${costStr}（${u.model}）`, "success");
                                }
                                if (evt.warnings && evt.warnings.length > 0) {
                                    evt.warnings.forEach(w => toast(w, "warning"));
                                }
                                // Auto-save to history
                                try {
                                    const historyText = text;
                                    if (historyText && testCases.length > 0) {
                                        fetch("/api/history", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                                requirement_text: historyText,
                                                test_cases: testCases,
                                                model: effectiveModel,
                                                tokens_prompt: evt.usage?.input_tokens || 0,
                                                tokens_completion: evt.usage?.output_tokens || 0,
                                                cost: evt.usage?.cost || 0,
                                            }),
                                        }).catch(() => {});
                                    }
                                } catch (_) {}
                            } else if (evt.type === "error") {
                                throw new Error(evt.message || "生成失败");
                            }
                        } catch (e) {
                            throw e;
                        }
                    }
                    if (streamDone && !buffer) break;
                }
                if (streamDone) break;
            }
        } catch (err) {
            if (err.name === "AbortError") {
                toast("已取消生成", "warning");
            } else {
                showError(err.message || "生成失败。");
            }
        } finally {
            hideLoading();
            stopElapsedTimer();
            _genAbortController = null;
            if (cancelBtn) cancelBtn.style.display = "none";
        }
    }

    // Cancel button
    document.getElementById("btnCancelGenerate")?.addEventListener("click", () => {
        if (_genAbortController) {
            _genAbortController.abort();
        }
    });

    // ---- Polish ----
    function resetPolishPanel() {
        polishResult.innerHTML = "点击上方 <strong>AI 润色</strong> 按钮，AI 将把原始文档整理为格式清晰、条理分明的结构化需求文档。";
        polishNewLen.textContent = "";
        polishBadge.style.display = "none";
        polishActions.style.display = "none";
        btnPolishedUse.style.display = "none";
        showingDiff = false;
        // Remove diff toggle if exists
        const existingDiffBar = document.querySelector(".diff-toggle-bar");
        if (existingDiffBar) existingDiffBar.remove();
    }

    function computeDiff(original, polished) {
        const origWords = original.split(/(\s+)/);
        const polWords = polished.split(/(\s+)/);
        // Simple LCS-based word diff
        const m = origWords.length, n = polWords.length;
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (origWords[i - 1] === polWords[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
                else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
        // Backtrack
        const result = [];
        let i = m, j = n;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && origWords[i - 1] === polWords[j - 1]) {
                result.unshift({ type: "same", text: origWords[i - 1] });
                i--; j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                result.unshift({ type: "add", text: polWords[j - 1] });
                j--;
            } else {
                result.unshift({ type: "del", text: origWords[i - 1] });
                i--;
            }
        }
        return result;
    }

    function renderDiff(original, polished) {
        const diff = computeDiff(original, polished);
        let html = "";
        for (const part of diff) {
            if (part.type === "add") html += '<span class="diff-add">' + escHtml(part.text) + '</span>';
            else if (part.type === "del") html += '<span class="diff-del">' + escHtml(part.text) + '</span>';
            else html += escHtml(part.text);
        }
        return html;
    }

    function toggleDiff() {
        showingDiff = !showingDiff;
        const btnDiff = document.getElementById("btnToggleDiff");
        if (showingDiff) {
            polishResult.innerHTML = renderDiff(originalTextForDiff, polishedText);
            polishNewLen.textContent = "差异对比视图";
            if (btnDiff) btnDiff.innerHTML = '<i class="bi bi-file-text"></i> 原文';
        } else {
            polishResult.textContent = polishedText;
            polishNewLen.textContent = `${polishedText.length.toLocaleString()} 字符`;
            if (btnDiff) btnDiff.innerHTML = '<i class="bi bi-columns-gap"></i> 差异';
        }
    }

    async function polishRequirement() {
        const text = requirementText.value.trim();
        if (!text) { showError("请先粘贴需求文档内容。"); return; }

        setBtnLoading(btnPolish, true);
        originalTextForDiff = text;
        polishedText = "";
        showingDiff = false;
        polishResult.textContent = "正在润色，请稍候...";
        polishBadge.style.display = "none";
        polishActions.style.display = "none";
        btnPolishedUse.style.display = "none";
        polishNewLen.textContent = "";
        // Remove existing diff toggle
        const existingDiffBar = document.querySelector(".diff-toggle-bar");
        if (existingDiffBar) existingDiffBar.remove();

        const effectiveModel = userModel || modelSelect.value;
        const effectiveKey = userApiKey || null;

        try {
            const resp = await fetchWithRetry("/api/polish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requirement_text: text, model: effectiveModel, api_key: effectiveKey || undefined, api_base_url: userApiBaseUrl || undefined }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail?.message || "润色失败");

            const data = await resp.json();
            polishedText = data.polished_text;
            if (data.usage) {
                addTokens(data.usage.input_tokens, data.usage.output_tokens);
                const u = data.usage;
                toast(`润色消耗 ${u.input_tokens.toLocaleString()} 输入 + ${u.output_tokens.toLocaleString()} 输出 tokens`, "success");
            }
            polishResult.textContent = polishedText;
            polishNewLen.textContent = `${polishedText.length.toLocaleString()} 字符`;
            polishBadge.style.display = "";
            polishActions.style.display = "";
            btnPolishedUse.style.display = "";
            // Add diff toggle button
            const diffBar = document.createElement("div");
            diffBar.className = "diff-toggle-bar";
            diffBar.innerHTML = '<button class="btn btn-ghost btn-sm" id="btnToggleDiff"><i class="bi bi-columns-gap"></i> 差异</button>';
            polishActions.parentNode.insertBefore(diffBar, polishActions);
            document.getElementById("btnToggleDiff").addEventListener("click", toggleDiff);
        } catch (err) {
            polishResult.textContent = "润色失败：" + err.message;
        } finally {
            setBtnLoading(btnPolish, false);
        }
    }

    function usePolished() {
        if (!polishedText) return;
        requirementText.value = polishedText;
        requirementText.dispatchEvent(new Event("input"));
        polishedText = "";
        originalTextForDiff = "";
        btnPolishedUse.style.display = "none";
        polishBadge.textContent = "已采用";
        resetPolishPanel();
        navigateTo("cases");
    }

    function copyPolished() {
        if (!polishedText) return;
        navigator.clipboard.writeText(polishedText).then(() => {
            const orig = btnCopyPolished.innerHTML;
            btnCopyPolished.innerHTML = '<i class="bi bi-check"></i> 已复制';
            setTimeout(() => { btnCopyPolished.innerHTML = orig; }, 2000);
        }).catch(() => {});
    }

    // ---- Field Chips ----
    function renderFieldChips() {
        const container = document.getElementById("fieldChips");
        if (!container) return;
        let html = "";
        for (const f of FIELD_DEFS) {
            const sel = selectedFields.includes(f.key) ? " selected" : "";
            html += `<span class="field-chip${sel}" data-field="${f.key}">${f.label}</span>`;
        }
        container.innerHTML = html;
        container.querySelectorAll(".field-chip").forEach(chip => {
            chip.addEventListener("click", () => {
                chip.classList.toggle("selected");
                updateSelectedCount();
                applyFieldsSelection();
            });
        });
        updateSelectedCount();
    }

    function updateSelectedCount() {
        const chips = document.querySelectorAll("#fieldChips .field-chip.selected");
        if (document.getElementById("selectedCount")) document.getElementById("selectedCount").textContent = chips.length;
    }

    function applyFieldsSelection() {
        const chips = document.querySelectorAll("#fieldChips .field-chip.selected");
        selectedFields = [];
        chips.forEach(chip => { selectedFields.push(chip.dataset.field); });
        if (selectedFields.length === 0) {
            selectedFields = [...DEFAULT_TABLE_FIELDS];
            renderFieldChips();
            return;
        }
        localStorage.setItem(STORAGE_FIELDS_KEY, JSON.stringify(selectedFields));
        if (testCases.length > 0) renderTable();
    }

    function setAllFieldChips(select) {
        document.querySelectorAll("#fieldChips .field-chip").forEach(chip => {
            if (select) chip.classList.add("selected"); else chip.classList.remove("selected");
        });
        updateSelectedCount();
        applyFieldsSelection();
    }

    // ---- Field Presets (removed — using selectedFields) ----
    // ---- Render Table (defined below in new feature section) ----

    // ---- Detail Modal ----
    function openDetailModal(index) {
        currentDetailIndex = index;
        const tc = testCases[index];
        if (!tc) return;

        let html = '<div class="row">';
        for (const f of FIELD_DEFS) {
            const key = f.key;
            const fieldType = f.type;
            const fieldOptions = f.options || null;
            const val = escHtml(String(tc[key] || ""));
            html += `<div class="col-md-6 mb-3"><label class="form-label">${f.label}</label>`;
            if (fieldType === "select") {
                html += `<select class="form-select" data-detail-field="${key}">`;
                for (const opt of (fieldOptions || []))
                    html += `<option value="${opt}" ${tc[key] === opt ? "selected" : ""}>${opt}</option>`;
                html += `</select>`;
            } else if (fieldType === "combo") {
                html += `<input type="text" class="form-control" data-detail-field="${key}" value="${val}" list="dl_${key}">`;
            } else if (fieldType === "textarea") {
                html += `<textarea class="form-control" data-detail-field="${key}" rows="3">${val}</textarea>`;
                if (key === "preconditions") {
                    html += `<button class="btn btn-ghost btn-sm mt-1 btn-dep-find" data-dep-idx="${index}" type="button"><i class="bi bi-link-45deg"></i> 查找前置用例</button>`;
                }
            } else {
                html += `<input type="text" class="form-control" data-detail-field="${key}" value="${val}">`;
            }
            html += `</div>`;
        }
        html += '</div>';
        document.getElementById("detailModalBody").innerHTML = html;
        detailModal.show();
        // Bind dependency search buttons inside the detail modal
        document.querySelectorAll(".btn-dep-find").forEach(btn => {
            btn.addEventListener("click", function (e) {
                e.stopPropagation();
                openDependencySearch(parseInt(this.dataset.depIdx));
            });
        });
    }

    function saveDetail() {
        if (currentDetailIndex < 0 || currentDetailIndex >= testCases.length) { detailModal.hide(); return; }
        pushUndo();
        const tc = { ...testCases[currentDetailIndex] };
        document.querySelectorAll("[data-detail-field]").forEach(el => { tc[el.dataset.detailField] = el.value; });
        testCases[currentDetailIndex] = tc;
        saveToStorage();
        renderTable();
        detailModal.hide();
    }

    // ---- Table data sync ----
    function syncTableData() {
        const domRows = tableBody.querySelectorAll("tr[data-index]");
        const rows = [];
        domRows.forEach(tr => {
            const row = {};
            tr.querySelectorAll("[data-field]").forEach(el => { row[el.dataset.field] = el.value; });
            rows.push(row);
        });
        let changed = false;
        for (let i = 0; i < rows.length; i++) {
            const idx = parseInt(domRows[i]?.dataset.index);
            if (idx >= 0 && idx < testCases.length) {
                for (const key of getActiveFields().map(f => f.key)) {
                        if (!changed) { pushUndo(); changed = true; }
                        testCases[idx][key] = rows[i][key];
                }
            }
        }
        saveToStorage();
    }

    // ---- Row ops ----
    function newTestCase(idx) {
        const tc = { case_id: `TC-${String(idx + 1).padStart(3, "0")}` };
        for (const f of FIELD_DEFS) {
            if (tc[f.key] !== undefined) continue;
            if (f.type === "select" && f.options) tc[f.key] = f.options[0];
            else if (f.key === "priority") tc[f.key] = "P2";
            else if (f.key === "category") tc[f.key] = "功能测试";
            else if (f.key === "test_method") tc[f.key] = "手工测试";
            else if (f.key === "test_level") tc[f.key] = "系统测试";
            else tc[f.key] = "";
        }
        return tc;
    }

    function addRow() {
        pushUndo();
        testCases.push(newTestCase(testCases.length));
        saveToStorage();
        window.updateExportInfo();
        renderTable();
        const lastInput = tableBody.querySelector("tr[data-index]:last-child input[data-field]");
        if (lastInput) lastInput.focus();
        toast("已添加新用例", "success");
    }

    async function deleteSelected() {
        const visibleRows = tableBody.querySelectorAll("tr[data-index]:not([style*='display: none'])");
        const checked = Array.from(visibleRows).map(tr => tr.querySelector(".row-checkbox")).filter(cb => cb && cb.checked);
        if (checked.length === 0) { showError("请先选择要删除的用例。"); return; }
        const ok = await showConfirm(`确定删除选中的 ${checked.length} 个测试用例？`);
        if (!ok) return;

        pushUndo();
        const indices = checked.map(cb => parseInt(cb.dataset.index)).sort((a, b) => b - a);
        for (const idx of indices) testCases.splice(idx, 1);
        testCases.forEach((tc, i) => { tc.case_id = `TC-${String(i + 1).padStart(3, "0")}`; });
        saveToStorage();
        window.updateExportInfo();
        renderTable();
        updateBatchBar();
        toast(`已删除 ${indices.length} 条用例`, "success");
    }

    function duplicateSelected() {
        const visibleRows = tableBody.querySelectorAll("tr[data-index]:not([style*='display: none'])");
        const checked = Array.from(visibleRows).map(tr => tr.querySelector(".row-checkbox")).filter(cb => cb && cb.checked);
        if (checked.length === 0) { showError("请先选择要复制的用例。"); return; }

        pushUndo();
        const indices = checked.map(cb => parseInt(cb.dataset.index)).sort((a, b) => a - b);
        const copies = indices.map(i => {
            const copy = JSON.parse(JSON.stringify(testCases[i]));
            return copy;
        });
        for (const copy of copies) {
            testCases.push(copy);
        }
        testCases.forEach((tc, i) => { tc.case_id = `TC-${String(i + 1).padStart(3, "0")}`; });
        saveToStorage();
        window.updateExportInfo();
        renderTable();
        toast(`已复制 ${copies.length} 条用例`, "success");
    }

    function toggleSelectAll() {
        const cb = document.getElementById("selectAll");
        if (!cb) return;
        document.querySelectorAll(".row-checkbox").forEach(rc => {
            rc.checked = cb.checked;
            const row = rc.closest("tr") || rc.closest(".card-item");
            if (row) row.classList.toggle("selected", cb.checked);
        });
        updateBatchBar();
    }

    function getSelectedCases() {
        const indices = [];
        document.querySelectorAll(".row-checkbox:checked").forEach(cb => {
            const idx = parseInt(cb.dataset.index);
            if (!isNaN(idx) && testCases[idx]) indices.push(idx);
        });
        return [...new Set(indices)].sort((a, b) => a - b).map(i => testCases[i]);
    }

    // doBatchExport moved to modules/export.js

    function updateSelectAllState() {
        const cb = document.getElementById("selectAll");
        if (!cb) return;
        const all = document.querySelectorAll(".row-checkbox");
        const checked = document.querySelectorAll(".row-checkbox:checked");
        cb.checked = all.length > 0 && checked.length === all.length;
        cb.indeterminate = checked.length > 0 && checked.length < all.length;
    }

    // ---- Batch operations (floating bottom bar) ----
    function buildBatchBar() {
        // Build dropdown menus for each field category
        const drops = {
            batchDropPriority: { key: "priority", options: BATCH_FIELD_OPTIONS.priority },
            batchDropCategory: { key: "category", options: BATCH_FIELD_OPTIONS.category },
            batchDropMethod: { key: "test_method", options: BATCH_FIELD_OPTIONS.test_method },
            batchDropLevel: { key: "test_level", options: BATCH_FIELD_OPTIONS.test_level },
            batchDropReview: { key: "review_status", options: BATCH_FIELD_OPTIONS.review_status },
            batchDropExec: { key: "execution_status", options: BATCH_FIELD_OPTIONS.execution_status },
        };
        Object.entries(drops).forEach(([dropId, cfg]) => {
            const drop = document.getElementById(dropId);
            if (!drop) return;
            const menu = drop.querySelector(".batch-menu");
            if (!menu) return;
            let html = "";
            cfg.options.forEach(opt => {
                html += '<button class="batch-menu-item" data-field="' + cfg.key + '" data-value="' + escHtml(opt) + '">' + escHtml(opt) + '</button>';
            });
            menu.innerHTML = html;
            menu.querySelectorAll(".batch-menu-item").forEach(item => {
                item.addEventListener("click", function () {
                    applyBatch(this.dataset.field, this.dataset.value);
                    menu.classList.remove("show");
                });
            });
            const btn = drop.querySelector(".batch-menu-btn");
            if (btn) btn.addEventListener("click", (e) => {
                e.stopPropagation();
                // Close all other batch menus
                document.querySelectorAll(".batch-bar .batch-menu.show").forEach(m => { if (m !== menu) m.classList.remove("show"); });
                menu.classList.toggle("show");
            });
        });

        // Batch dependency button
        const btnDep = document.getElementById("btnBatchDep");
        if (btnDep) btnDep.addEventListener("click", () => {
            // Close all menus
            document.querySelectorAll(".batch-bar .batch-menu.show").forEach(m => m.classList.remove("show"));
            openBatchDependencySearch();
        });

        // Batch edit menu (append / replace / fill)
        const batchEditDrop = document.getElementById("batchDropEdit");
        if (batchEditDrop) {
            const editMenu = document.getElementById("batchEditMenu");
            const editBtn = batchEditDrop.querySelector(".batch-menu-btn");
            if (editBtn && editMenu) {
                editBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    document.querySelectorAll(".batch-bar .batch-menu.show").forEach(m => { if (m !== editMenu) m.classList.remove("show"); });
                    editMenu.classList.toggle("show");
                });
            }
            editMenu.querySelectorAll(".batch-menu-item").forEach(item => {
                item.addEventListener("click", function() {
                    editMenu.classList.remove("show");
                    const action = this.dataset.action;
                    if (action === "append") showBatchAppendDialog();
                    else if (action === "replace") showBatchReplaceDialog();
                    else if (action === "fill") showBatchFillDialog();
                    else if (action === "clear") showBatchClearDialog();
                });
            });
        }
    }

    function updateBatchBar() {
        if (!batchBar || !batchCount) return;
        const checked = document.querySelectorAll(".row-checkbox:checked");
        const count = checked.length;
        if (count > 0) {
            batchBar.classList.add("active");
            batchCount.textContent = count;
        } else {
            batchBar.classList.remove("active");
            document.querySelectorAll(".batch-bar .batch-menu.show").forEach(m => m.classList.remove("show"));
        }
    }

    function getCheckedIndices() {
        const fromTable = tableBody ? tableBody.querySelectorAll(".row-checkbox:checked") : [];
        const fromCards = cardView ? cardView.querySelectorAll(".row-checkbox:checked") : [];
        return Array.from(fromTable).concat(Array.from(fromCards)).map(cb => parseInt(cb.dataset.index)).filter(i => i >= 0 && i < testCases.length);
    }

    function openBatchDependencySearch() {
        const indices = getCheckedIndices();
        if (indices.length === 0) { showError("请先选择用例。"); return; }
        depTargetIndex = -1; // -1 = batch mode
        // Store checked indices for batch apply
        depBatchIndices = indices;
        if (depSearchInput) depSearchInput.value = "";
        renderDepResults("");
        // Reset to current tab
        document.querySelectorAll("#depTabs .dep-tabs-link").forEach(t => t.classList.remove("active"));
        const curTab = document.querySelector("#depTabs .dep-tabs-link[data-tab='current']");
        if (curTab) curTab.classList.add("active");
        document.getElementById("depTabCurrent").style.display = "";
        document.getElementById("depTabLibrary").style.display = "none";
        depLibState = { mode: "folders", currentFolderId: null, currentFolderName: "", currentSetId: null, currentSetName: "" };
        if (dependencyModal) dependencyModal.show();
    }

    let depBatchIndices = [];

    function applyBatchDep(ref) {
        pushUndo();
        const count = depBatchIndices.length;
        depBatchIndices.forEach(idx => {
            const tc = testCases[idx];
            tc.preconditions = tc.preconditions ? tc.preconditions + "\n" + ref : ref;
        });
        saveToStorage();
        renderTable();
        updateBatchBar();
        if (dependencyModal) dependencyModal.hide();
        depBatchIndices = [];
        toast("已为 " + count + " 条用例设置依赖", "success");
    }

    function applyBatch(field, value) {
        const indices = getCheckedIndices();
        if (indices.length === 0) return;

        pushUndo();
        indices.forEach(idx => { testCases[idx][field] = value; });
        saveToStorage();
        renderTable();
        updateBatchBar();
        toast(`已将 ${indices.length} 条用例的 ${FIELD_BY_KEY[field]?.label || field} 修改为 ${value}`, "success");
    }

    // ---- Batch Edit: Append / Replace / Fill ----
    function showBatchAppendDialog() {
        const indices = getCheckedIndices();
        if (indices.length === 0) { toast("请先选择用例", "warning"); return; }
        const fields = FIELD_DEFS.filter(f => ["text", "textarea", "combo"].includes(f.type)).map(f => f.key);
        showBatchEditForm("追加内容", fields, [
            { id: "beAppendText", label: "要追加的文本", type: "text", required: true }
        ], (data) => {
            applyBatchAppend(indices, data.field, data.beAppendText);
        });
    }

    function showBatchReplaceDialog() {
        const indices = getCheckedIndices();
        if (indices.length === 0) { toast("请先选择用例", "warning"); return; }
        const fields = FIELD_DEFS.filter(f => ["text", "textarea", "combo"].includes(f.type)).map(f => f.key);
        showBatchEditForm("查找替换", fields, [
            { id: "beFind", label: "查找内容", type: "text", required: true },
            { id: "beReplace", label: "替换为", type: "text", required: false }
        ], (data) => {
            applyBatchReplace(indices, data.field, data.beFind, data.beReplace);
        });
    }

    function showBatchFillDialog() {
        const indices = getCheckedIndices();
        if (indices.length === 0) { toast("请先选择用例", "warning"); return; }
        const fields = FIELD_DEFS.filter(f => ["text", "combo"].includes(f.type)).map(f => f.key);
        showBatchEditForm("填充序号", fields, [
            { id: "bePrefix", label: "前缀", type: "text", required: false, placeholder: "如 TC-" },
            { id: "beStart", label: "起始数字", type: "number", required: true, value: "1" },
            { id: "bePad", label: "位数 (0=不补零)", type: "number", required: false, value: "0" }
        ], (data) => {
            applyBatchFill(indices, data.field, data.bePrefix, parseInt(data.beStart) || 1, parseInt(data.bePad) || 0);
        });
    }

    function showBatchClearDialog() {
        const indices = getCheckedIndices();
        if (indices.length === 0) { toast("请先选择用例", "warning"); return; }
        const clearable = FIELD_DEFS.filter(f => f.key !== "case_id" && f.key !== "title").map(f => f.key);
        showBatchEditForm("清除字段", clearable, [
            { id: "confirm", label: "", type: "text", required: false, placeholder: "将清空所选用例的该字段", value: "" }
        ], (data) => {
            pushUndo();
            for (const i of indices) {
                testCases[i][data.field] = FIELD_DEFS.find(f => f.key === data.field)?.type === "select" && FIELD_BY_KEY[data.field]?.options ? FIELD_BY_KEY[data.field].options[0] : "";
            }
            saveToStorage();
            rerender();
            toast(`已清除 ${indices.length} 条用例的「${FIELD_BY_KEY[data.field]?.label || data.field}」`, "success");
        });
        // Hide the useless extra field
        const extra = document.querySelector(".batch-edit-overlay .be-confirm");
        if (extra) extra.closest(".mb-3")?.style.setProperty("display", "none");
    }

    function showBatchEditForm(title, fieldOptions, extraFields, onConfirm) {
        // Remove existing overlay if any
        const old = document.querySelector(".batch-edit-overlay");
        if (old) old.remove();

        const overlay = document.createElement("div");
        overlay.className = "batch-edit-overlay";
        let html = `<div class="batch-edit-dialog"><h6>${escHtml(title)}</h6>`;
        html += `<div class="mb-3"><label class="form-label">目标字段</label><select class="form-select be-field-select">`;
        fieldOptions.forEach(k => {
            const label = FIELD_BY_KEY[k]?.label || k;
            html += `<option value="${k}">${escHtml(label)}</option>`;
        });
        html += `</select></div>`;
        extraFields.forEach(f => {
            const val = f.value || "";
            const ph = f.placeholder || "";
            html += `<div class="mb-3"><label class="form-label">${escHtml(f.label)}</label>`;
            if (f.type === "text") {
                html += `<input type="text" class="form-control be-${f.id}" value="${escHtml(val)}" placeholder="${escHtml(ph)}">`;
            } else if (f.type === "number") {
                html += `<input type="number" class="form-control be-${f.id}" value="${val}">`;
            }
            html += `</div>`;
        });
        html += `<div class="footer-actions">
            <button class="btn btn-ghost be-cancel">取消</button>
            <button class="btn btn-accent be-confirm"><i class="bi bi-check-lg"></i> 确认</button>
        </div></div>`;
        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        overlay.querySelector(".be-cancel").addEventListener("click", () => overlay.remove());
        overlay.querySelector(".be-confirm").addEventListener("click", () => {
            const field = overlay.querySelector(".be-field-select").value;
            const data = { field };
            extraFields.forEach(f => {
                const el = overlay.querySelector(`.be-${f.id}`);
                data[f.id] = el ? el.value : "";
            });
            // Validate required fields
            for (const f of extraFields) {
                if (f.required && !data[f.id].trim()) {
                    toast(`请填写「${f.label}」`, "warning");
                    return;
                }
            }
            overlay.remove();
            onConfirm(data);
        });
        overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    }

    function applyBatchAppend(indices, field, text) {
        pushUndo();
        indices.forEach(idx => {
            const old = testCases[idx][field] || "";
            testCases[idx][field] = old + text;
        });
        saveToStorage();
        rerender();
        toast(`已向 ${indices.length} 条用例的「${FIELD_BY_KEY[field]?.label || field}」追加内容`, "success");
    }

    function applyBatchReplace(indices, field, find, replace) {
        pushUndo();
        indices.forEach(idx => {
            const val = testCases[idx][field] || "";
            testCases[idx][field] = val.split(find).join(replace);
        });
        saveToStorage();
        rerender();
        toast(`已在 ${indices.length} 条用例中替换「${find}」→「${replace || "(空)"}」`, "success");
    }

    function applyBatchFill(indices, field, prefix, start, pad) {
        pushUndo();
        indices.forEach((idx, i) => {
            const num = start + i;
            const padded = pad > 0 ? String(num).padStart(pad, "0") : String(num);
            testCases[idx][field] = (prefix || "") + padded;
        });
        saveToStorage();
        rerender();
        toast(`已为 ${indices.length} 条用例填充「${FIELD_BY_KEY[field]?.label || field}」序号`, "success");
    }

    function clearBatchSelection() {
        document.querySelectorAll(".row-checkbox").forEach(cb => {
            cb.checked = false;
            const row = cb.closest("tr") || cb.closest(".card-item");
            if (row) row.classList.remove("selected");
        });
        updateSelectAllState();
        updateBatchBar();
    }

    // ---- Import ----
    async function handleImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        const ext = file.name.split(".").pop().toLowerCase();
        if (!["csv", "xlsx", "xls", "json"].includes(ext)) {
            await showAlert("仅支持 .csv / .xlsx / .xls / .json 文件");
            e.target.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = async function () {
            try {
                let rows = [];
                if (ext === "csv") {
                    const text = reader.result;
                    rows = parseCSV(text);
                } else if (ext === "json") {
                    const text = reader.result;
                    const parsed = JSON.parse(text);
                    if (!Array.isArray(parsed)) throw new Error("JSON 文件应包含一个对象数组");
                    // Convert array of objects to 2D array (header + rows)
                    if (parsed.length === 0) throw new Error("JSON 数组为空");
                    const headers = Object.keys(parsed[0]);
                    rows = [headers];
                    parsed.forEach(obj => {
                        rows.push(headers.map(h => String(obj[h] ?? "")));
                    });
                } else {
                    const wb = XLSX.read(new Uint8Array(reader.result), { type: "array" });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
                }

                if (rows.length < 2) { await showAlert("文件没有数据行。"); return; }
                showImportModal(rows);
            } catch (err) {
                await showAlert("解析文件失败：" + err.message);
            }
            e.target.value = "";
        };

        if (ext === "csv") reader.readAsText(file, "UTF-8");
        else reader.readAsArrayBuffer(file);
    }

    function parseCSV(text) {
        const rows = [];
        let row = [];
        let cell = "";
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (i + 1 < text.length && text[i + 1] === '"') { cell += '"'; i++; }
                    else inQuotes = false;
                } else cell += ch;
            } else {
                if (ch === '"') inQuotes = true;
                else if (ch === "," || ch === "\t") { row.push(cell.trim()); cell = ""; }
                else if (ch === "\n" || ch === "\r") {
                    if (ch === "\r" && i + 1 < text.length && text[i + 1] === "\n") i++;
                    if (cell || row.length > 0) { row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
                } else cell += ch;
            }
        }
        if (cell || row.length > 0) { row.push(cell.trim()); rows.push(row); }
        return rows;
    }

    function showImportModal(rows) {
        const headerRow = rows[0].map(h => String(h || "").trim());
        const dataRows = rows.slice(1).filter(r => r.some(c => String(c || "").trim() !== ""));
        const isLibraryImport = window.getImportToLibFolderId() !== null;

        let html = '<div class="row mb-3"><div class="col-12">';
        html += '<p class="mb-2">检测到 <strong>' + dataRows.length + '</strong> 行数据。请映射列：</p>';
        html += '<table class="table table-sm table-bordered"><thead><tr>';
        html += '<th>文件列</th><th>→ 映射到</th></tr></thead><tbody>';

        const fieldLabels = FIELD_DEFS.map(f => ({ key: f.key, label: f.label }));
        for (let c = 0; c < headerRow.length; c++) {
            const headerVal = escHtml(headerRow[c] || `列${c + 1}`);
            const autoMatch = fieldLabels.find(f => f.label === headerRow[c] || f.key === headerRow[c]);
            html += '<tr><td>' + headerVal + '</td><td><select class="form-select form-select-sm import-map" data-col="' + c + '">';
            html += '<option value="">— 跳过 —</option>';
            for (const f of fieldLabels) {
                const sel = (autoMatch && autoMatch.key === f.key) ? " selected" : "";
                html += '<option value="' + f.key + '"' + sel + '>' + f.label + '</option>';
            }
            html += '</select></td></tr>';
        }
        html += '</tbody></table></div></div>';

        if (isLibraryImport) {
            html += '<div class="d-flex gap-2">';
            html += '<button class="btn btn-accent btn-sm" id="btnImportToLibNow"><i class="bi bi-archive"></i> 导入到用例库</button>';
            html += '<button class="btn btn-outline btn-sm" data-bs-dismiss="modal">取消</button>';
            html += '</div>';
        } else {
            html += '<div class="d-flex gap-2">';
            html += '<button class="btn btn-outline btn-sm" id="btnImportAppend">追加到现有用例</button>';
            html += '<button class="btn btn-accent btn-sm" id="btnImportReplace">替换现有用例</button>';
            html += '</div>';
        }

        const modalBody = document.getElementById("detailModalBody");
        modalBody.innerHTML = html;
        document.querySelector("#detailModal .modal-title").textContent = isLibraryImport ? "导入到用例库" : "导入测试用例";
        document.getElementById("btnSaveDetail").style.display = "none";

        if (isLibraryImport) {
            detailModal.show();
            // Override z-index after Bootstrap sets it, so import dialog sits above library modal
            const detailEl = document.getElementById("detailModal");
            detailEl.addEventListener("shown.bs.modal", function boostZ() {
                detailEl.style.zIndex = "1065";
                const backdrops = document.querySelectorAll(".modal-backdrop");
                if (backdrops.length > 0) {
                    backdrops[backdrops.length - 1].style.zIndex = "1060";
                }
            }, { once: true });
            document.getElementById("btnImportToLibNow").addEventListener("click", () => doImportToLibrary(dataRows, headerRow));
        } else {
            detailModal.show();
            document.getElementById("btnImportAppend").addEventListener("click", () => doImport(dataRows, headerRow, false));
            document.getElementById("btnImportReplace").addEventListener("click", () => doImport(dataRows, headerRow, true));
        }

        const modalEl = document.getElementById("detailModal");
        modalEl.addEventListener("hidden.bs.modal", () => {
            document.getElementById("btnSaveDetail").style.display = "";
            document.querySelector("#detailModal .modal-title").textContent = "编辑测试用例";
            if (isLibraryImport) {
                window.setImportToLibFolderId(null);
                // Restore normal z-index
                modalEl.style.zIndex = "";
            }
        }, { once: true });
    }

    async function doImportToLibrary(dataRows, headerRow) {
        const mapping = {};
        document.querySelectorAll(".import-map").forEach(sel => {
            if (sel.value) mapping[parseInt(sel.dataset.col)] = sel.value;
        });
        const mappedKeys = Object.values(mapping);
        if (mappedKeys.length === 0) { await showAlert("请至少映射一列。"); return; }

        const imported = [];
        for (const row of dataRows) {
            const tc = {};
            for (const f of FIELD_DEFS) {
                if (f.type === "select" && f.options) tc[f.key] = f.options[0];
                else tc[f.key] = "";
            }
            for (const [col, key] of Object.entries(mapping)) {
                tc[key] = String(row[parseInt(col)] || "").trim();
            }
            // Assign sequential IDs
            tc.case_id = "TC-" + String(imported.length + 1).padStart(3, "0");
            imported.push(tc);
        }

        const fid = window.getImportToLibFolderId();
        window.setImportToLibFolderId(null);
        const name = "导入 " + new Date().toLocaleDateString("zh-CN") + " " + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

        const btn = document.getElementById("btnImportToLibNow");
        setBtnLoading(btn, true);
        try {
            const resp = await fetch("/api/library/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name, test_cases: imported, requirement_text: "", folder_id: fid }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail?.message || "保存失败");
            window.setImportToLibFolderId(null);
            detailModal.hide();
            toast("已导入 " + imported.length + " 条用例到用例库", "success");
            loadLibraryContent(fid);
        } catch (err) {
            await showAlert("导入到用例库失败：" + (err.message || err));
        } finally {
            setBtnLoading(btn, false);
        }
    }

    async function doImport(dataRows, headerRow, replace) {
        const mapping = {};
        document.querySelectorAll(".import-map").forEach(sel => {
            if (sel.value) mapping[parseInt(sel.dataset.col)] = sel.value;
        });

        const mappedKeys = Object.values(mapping);
        if (mappedKeys.length === 0) { await showAlert("请至少映射一列。"); return; }

        pushUndo();
        const imported = [];
        for (const row of dataRows) {
            const tc = {};
            for (const f of FIELD_DEFS) {
                if (f.type === "select" && f.options) tc[f.key] = f.options[0];
                else tc[f.key] = "";
            }
            for (const [col, key] of Object.entries(mapping)) {
                tc[key] = String(row[parseInt(col)] || "").trim();
            }
            imported.push(tc);
        }

        if (replace) {
            testCases = imported;
        } else {
            const startIdx = testCases.length;
            testCases = testCases.concat(imported);
        }
        testCases.forEach((tc, i) => { tc.case_id = `TC-${String(i + 1).padStart(3, "0")}`; });

        saveToStorage();
        window.updateExportInfo();
        resultsArea.style.display = "";
        renderTable();
        detailModal.hide();
        toast(`成功导入 ${imported.length} 条用例`, "success");
        navigateTo("cases");
    }

    // ---- Templates ----
    function renderTemplates() {
        if (!templateMenu) return;
        let html = "";
        TEMPLATES.forEach((tpl, i) => {
            html += `<button class="template-menu-item" data-tpl="${i}"><i class="bi ${tpl.icon}"></i> ${tpl.name}<small>${tpl.desc}</small></button>`;
        });
        templateMenu.innerHTML = html;
        templateMenu.querySelectorAll(".template-menu-item").forEach(item => {
            item.addEventListener("click", () => {
                insertTemplate(parseInt(item.dataset.tpl));
                templateMenu.classList.remove("show");
            });
        });
    }

    function toggleTemplateMenu(e) {
        e.stopPropagation();
        if (!templateMenu) return;
        templateMenu.classList.toggle("show");
    }

    function insertTemplate(index) {
        const tpl = TEMPLATES[index];
        if (!tpl) return;
        pushUndo();
        const generated = generateTemplateCases(tpl.name);
        const startIdx = testCases.length;
        for (const tc of generated) {
            tc.case_id = `TC-${String(testCases.length + 1).padStart(3, "0")}`;
            testCases.push(tc);
        }
        saveToStorage();
        window.updateExportInfo();
        resultsArea.style.display = "";
        renderTable();
        navigateTo("cases");
        toast(`已插入「${tpl.name}」模板 (${generated.length} 条)`, "success");
    }

    function generateTemplateCases(name) {
        const ts = Date.now();
        switch (name) {
            case "登录功能":
                return [
                    { ...baseTC(), case_id: "", module: "用户登录", title: "正确账号密码登录成功", priority: "P0", category: "Positive", preconditions: "已注册账号", steps: "1. 打开登录页\n2. 输入正确用户名\n3. 输入正确密码\n4. 点击登录", expected_result: "登录成功，跳转至首页", test_method: "手工测试", test_level: "系统测试", keywords: "登录,正向" },
                    { ...baseTC(), case_id: "", module: "用户登录", title: "错误密码登录失败", priority: "P0", category: "Negative", preconditions: "已注册账号", steps: "1. 打开登录页\n2. 输入正确用户名\n3. 输入错误密码\n4. 点击登录", expected_result: "提示'用户名或密码错误'，停留在登录页", test_method: "手工测试", test_level: "系统测试", keywords: "登录,反向" },
                    { ...baseTC(), case_id: "", module: "用户登录", title: "空用户名登录校验", priority: "P2", preconditions: "", steps: "1. 打开登录页\n2. 用户名为空\n3. 输入密码\n4. 点击登录", expected_result: "提示'请输入用户名'", category: "Negative", test_method: "手工测试", test_level: "系统测试", keywords: "登录,边界" },
                    { ...baseTC(), case_id: "", module: "用户登录", title: "密码连续错误5次锁定账户", priority: "P1", preconditions: "已注册账号", steps: "1. 连续5次输入错误密码\n2. 第6次尝试登录", expected_result: "提示'账户已锁定30分钟'，拒绝登录", category: "Negative", test_method: "手工测试", test_level: "系统测试", keywords: "登录,安全" },
                    { ...baseTC(), case_id: "", module: "用户登录", title: "记住密码功能", priority: "P2", preconditions: "", steps: "1. 输入正确账号密码\n2. 勾选'记住密码'\n3. 登录成功\n4. 关闭浏览器\n5. 重新打开登录页", expected_result: "自动填充账号密码，有效期7天", category: "功能测试", test_method: "手工测试", test_level: "系统测试", keywords: "登录,记住密码" },
                ];
            case "CRUD 操作":
                return [
                    { ...baseTC(), case_id: "", module: "数据管理", title: "新增记录成功", priority: "P0", preconditions: "有新增权限", steps: "1. 打开列表页\n2. 点击'新增'\n3. 填写必填字段\n4. 点击'保存'", expected_result: "列表刷新，显示新增记录", category: "Positive", test_method: "手工测试", test_level: "系统测试", keywords: "CRUD,新增" },
                    { ...baseTC(), case_id: "", module: "数据管理", title: "编辑记录成功", priority: "P0", preconditions: "存在至少一条记录", steps: "1. 点击某条记录的'编辑'\n2. 修改字段\n3. 点击'保存'", expected_result: "记录内容更新", category: "Positive", test_method: "手工测试", test_level: "系统测试", keywords: "CRUD,编辑" },
                    { ...baseTC(), case_id: "", module: "数据管理", title: "删除记录确认", priority: "P1", preconditions: "存在至少一条记录", steps: "1. 点击某条记录的'删除'\n2. 确认删除对话框点击'确定'", expected_result: "记录被移除，列表刷新", category: "功能测试", test_method: "手工测试", test_level: "系统测试", keywords: "CRUD,删除" },
                    { ...baseTC(), case_id: "", module: "数据管理", title: "查看记录详情", priority: "P2", preconditions: "存在至少一条记录", steps: "1. 点击某条记录的'详情'\n2. 查看详情页信息", expected_result: "显示完整字段信息，只读", category: "功能测试", test_method: "手工测试", test_level: "系统测试", keywords: "CRUD,查看" },
                ];
            case "表单验证":
                return [
                    { ...baseTC(), case_id: "", module: "表单验证", title: "必填字段为空提交失败", priority: "P1", preconditions: "打开表单页", steps: "1. 不填写任何必填项\n2. 点击提交", expected_result: "必填字段标记红色，提示'此项为必填'，不提交", category: "Negative", test_method: "手工测试", test_level: "系统测试", keywords: "表单,必填校验" },
                    { ...baseTC(), case_id: "", module: "表单验证", title: "字段格式校验", priority: "P2", preconditions: "打开表单页", steps: "1. 输入错误格式（如邮箱不含@）\n2. 点击提交", expected_result: "提示'请输入正确格式'，阻止提交", category: "Negative", test_method: "手工测试", test_level: "系统测试", keywords: "表单,格式校验" },
                    { ...baseTC(), case_id: "", module: "表单验证", title: "字段长度边界值测试", priority: "P2", preconditions: "打开表单页", steps: "1. 输入最小长度字符\n2. 输入刚好超过最大长度字符\n3. 分别提交", expected_result: "最小长度允许提交，超长提示截断或报错", category: "Boundary", test_method: "手工测试", test_level: "系统测试", keywords: "表单,边界值" },
                ];
            case "文件上传":
                return [
                    { ...baseTC(), case_id: "", module: "文件上传", title: "上传合法类型文件成功", priority: "P1", preconditions: "", steps: "1. 点击上传按钮\n2. 选择支持的文件类型\n3. 确认上传", expected_result: "文件上传成功，显示文件名和大小", category: "Positive", test_method: "手工测试", test_level: "系统测试", keywords: "上传,正向" },
                    { ...baseTC(), case_id: "", module: "文件上传", title: "上传超大小文件被拒绝", priority: "P2", preconditions: "", steps: "1. 点击上传按钮\n2. 选择超过最大限制的文件\n3. 确认上传", expected_result: "提示'文件大小超出限制'，阻止上传", category: "Negative", test_method: "手工测试", test_level: "系统测试", keywords: "上传,大小限制" },
                ];
            case "搜索筛选":
                return [
                    { ...baseTC(), case_id: "", module: "搜索筛选", title: "关键词搜索", priority: "P1", preconditions: "列表有数据", steps: "1. 在搜索框输入关键词\n2. 点击搜索", expected_result: "列表过滤，仅显示包含关键词的记录", category: "功能测试", test_method: "手工测试", test_level: "系统测试", keywords: "搜索,关键词" },
                    { ...baseTC(), case_id: "", module: "搜索筛选", title: "多条件组合筛选", priority: "P2", preconditions: "列表有数据", steps: "1. 选择多个筛选条件\n2. 点击查询", expected_result: "列表显示同时满足所有条件的记录", category: "功能测试", test_method: "手工测试", test_level: "系统测试", keywords: "搜索,组合筛选" },
                    { ...baseTC(), case_id: "", module: "搜索筛选", title: "搜索无结果展示", priority: "P3", preconditions: "", steps: "1. 输入不存在的关键词\n2. 点击搜索", expected_result: "列表为空，显示'暂无数据'", category: "功能测试", test_method: "手工测试", test_level: "系统测试", keywords: "搜索,空结果" },
                ];
            case "权限控制":
                return [
                    { ...baseTC(), case_id: "", module: "权限控制", title: "有权限用户可访问页面", priority: "P0", preconditions: "已登录，拥有该页面权限", steps: "1. 登录系统\n2. 访问受保护页面", expected_result: "页面正常显示", category: "Positive", test_method: "手工测试", test_level: "系统测试", keywords: "权限,正向" },
                    { ...baseTC(), case_id: "", module: "权限控制", title: "无权限用户被拒绝", priority: "P1", preconditions: "已登录，不拥有该页面权限", steps: "1. 登录系统\n2. 直接访问受限URL", expected_result: "显示403无权限页面或重定向到首页", category: "Negative", test_method: "手工测试", test_level: "系统测试", keywords: "权限,反向" },
                    { ...baseTC(), case_id: "", module: "权限控制", title: "未登录用户重定向到登录页", priority: "P1", preconditions: "未登录", steps: "1. 直接访问内部页面URL", expected_result: "重定向到登录页", category: "Negative", test_method: "手工测试", test_level: "系统测试", keywords: "权限,未登录" },
                ];
            case "API 接口":
                return [
                    { ...baseTC(), case_id: "", module: "API接口", title: "GET请求返回正确数据", priority: "P0", preconditions: "服务运行中", steps: "1. 发送GET请求到 /api/resource\n2. 检查响应", expected_result: "HTTP 200，返回JSON格式数据列表", category: "Positive", test_method: "自动化测试", test_level: "接口测试", keywords: "API,GET" },
                    { ...baseTC(), case_id: "", module: "API接口", title: "POST请求创建资源成功", priority: "P0", preconditions: "", steps: "1. 发送POST请求到 /api/resource\n2. 携带合法JSON body", expected_result: "HTTP 201，返回创建的资源对象", category: "Positive", test_method: "自动化测试", test_level: "接口测试", keywords: "API,POST" },
                    { ...baseTC(), case_id: "", module: "API接口", title: "请求缺少必填参数返回400", priority: "P1", preconditions: "", steps: "1. 发送POST请求缺少必填字段", expected_result: "HTTP 400，错误信息指明缺失字段", category: "Negative", test_method: "自动化测试", test_level: "接口测试", keywords: "API,参数校验" },
                    { ...baseTC(), case_id: "", module: "API接口", title: "请求超时处理", priority: "P2", preconditions: "", steps: "1. 发送请求，服务端延迟响应超过timeout", expected_result: "客户端超时提示，不阻塞其他请求", category: "性能测试", test_method: "自动化测试", test_level: "接口测试", keywords: "API,超时" },
                ];
            case "数据导出":
                return [
                    { ...baseTC(), case_id: "", module: "数据导出", title: "导出Excel成功", priority: "P1", preconditions: "列表有数据", steps: "1. 点击'导出Excel'\n2. 等待下载", expected_result: "生成.xlsx文件，内容与列表一致", category: "功能测试", test_method: "手工测试", test_level: "系统测试", keywords: "导出,Excel" },
                    { ...baseTC(), case_id: "", module: "数据导出", title: "按筛选条件导出", priority: "P2", preconditions: "列表有数据", steps: "1. 先设置筛选条件\n2. 点击导出", expected_result: "导出文件仅包含符合筛选条件的记录", category: "功能测试", test_method: "手工测试", test_level: "系统测试", keywords: "导出,筛选" },
                ];
            default:
                return [];
        }
    }

    function baseTC() {
        const tc = {};
        for (const f of FIELD_DEFS) {
            if (f.type === "select" && f.options) tc[f.key] = f.options[0];
            else if (f.key === "priority") tc[f.key] = "P2";
            else if (f.key === "category") tc[f.key] = "功能测试";
            else if (f.key === "test_method") tc[f.key] = "手工测试";
            else if (f.key === "test_level") tc[f.key] = "系统测试";
            else tc[f.key] = "";
        }
        return tc;
    }

    // Export functions moved to modules/export.js (updateExportInfo, renderExportFields, doExport, doBatchExport)

    // ---- Persistence ----
    let _autoSaveTimer = null;
    function saveToStorage() {
        try {
            const data = JSON.stringify(testCases);
            localStorage.setItem(STORAGE_KEY, data);
            // Debounced recovery backup (save 2s after last change)
            if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
            _autoSaveTimer = setTimeout(() => {
                try {
                    localStorage.setItem(STORAGE_RECOVERY_KEY, JSON.stringify({
                        data: testCases,
                        savedAt: new Date().toISOString(),
                        count: testCases.length,
                    }));
                } catch (_) {}
                _autoSaveTimer = null;
            }, 2000);
        } catch (_) {}
    }
    function clearStorage() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(STORAGE_REQ_KEY);
            localStorage.removeItem(STORAGE_RECOVERY_KEY);
        } catch (_) {}
    }
    function hasRecoveryData() {
        try {
            const raw = localStorage.getItem(STORAGE_RECOVERY_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) return parsed;
            return null;
        } catch { return null; }
    }
    function restoreFromRecovery() {
        const saved = hasRecoveryData();
        if (!saved) return false;
        testCases = saved.data;
        saveToStorage();
        pushUndo();
        resultsArea.style.display = "";
        renderTable();
        return true;
    }

    // Library functions moved to modules/library.js (initLibrary with callbacks)
    // ---- Helpers ----
    function ensureDatalists() {
        const container = document.getElementById("datalistContainer");
        if (!container) return;
        let html = "";
        for (const f of FIELD_DEFS) {
            if (f.type === "combo" && f.options)
                html += `<datalist id="dl_${f.key}">${f.options.map(o => `<option value="${o}">`).join("")}</datalist>`;
        }
        container.innerHTML = html;
    }

    let _progressTimer = null;
    const PROGRESS_MSGS = [
        "正在分析需求文档结构...",
        "正在提取关键业务场景...",
        "正在设计测试用例...",
        "正在优化测试覆盖度...",
        "即将完成，请稍候..."
    ];

    function showLoading() {
        loadingArea.style.display = "";
        setBtnLoading(btnGenerate, true);
        let idx = 0;
        loadingMessage.textContent = PROGRESS_MSGS[0];
        _progressTimer = setInterval(() => {
            idx = (idx + 1) % PROGRESS_MSGS.length;
            loadingMessage.textContent = PROGRESS_MSGS[idx];
        }, 5000);
    }
    function hideLoading() {
        loadingArea.style.display = "none";
        setBtnLoading(btnGenerate, false);
        if (_progressTimer) { clearInterval(_progressTimer); _progressTimer = null; }
    }
    function showError(msg) {
        errorMessage.textContent = msg;
        errorArea.style.display = "";
    }
    function hideError() {
        errorArea.style.display = "none";
    }
    function hideResults() {
        if (resultsArea) resultsArea.style.display = "none";
    }
    // ---- Custom Modal System (replaces alert/confirm/prompt) ----
    let _confirmResolve = null;
    let _promptResolve = null;
    const confirmModalEl = document.getElementById("confirmModal");
    let confirmModalBs = null;
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
        } else {
            console.warn("confirmModal element or bootstrap.Modal not available");
        }
    } catch (e) {
        console.error("Failed to init confirm modal:", e);
    }

    function showConfirm(msg, title) {
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
    }
    window.showConfirm = showConfirm;

    function showCustomDialog(title, bodyHtml, buttons) {
        const modalEl = document.getElementById("customDialogModal");
        if (!modalEl) {
            // Create modal on the fly
            const div = document.createElement("div");
            div.innerHTML = `<div class="modal fade" id="customDialogModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"></div><div class="modal-footer"></div></div></div></div>`;
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
    }

    function showAlert(msg, title) {
        return new Promise((resolve) => {
            if (!confirmModalBs || !confirmModalEl) { alert(msg); resolve(); return; }
            document.getElementById("confirmModalTitle").textContent = title || "提示";
            document.getElementById("confirmModalMessage").innerHTML = msg;
            document.getElementById("confirmModalInputWrap").style.display = "none";
            document.getElementById("confirmModalOk").style.display = "";
            document.getElementById("confirmModalCancel").style.display = "none";
            const hideHandler = () => { resolve(); confirmModalEl.removeEventListener("hidden.bs.modal", hideHandler); };
            confirmModalEl.addEventListener("hidden.bs.modal", hideHandler);
            confirmModalBs.show();
        });
    }
    window.showAlert = showAlert;

    function showPrompt(msg, defaultValue, title) {
        return new Promise((resolve) => {
            if (!confirmModalBs || !confirmModalEl) { resolve(prompt(msg, defaultValue)); return; }
            _promptResolve = resolve;
            document.getElementById("confirmModalTitle").textContent = title || "输入";
            document.getElementById("confirmModalMessage").innerHTML = msg;
            document.getElementById("confirmModalInputWrap").style.display = "";
            const input = document.getElementById("confirmModalInput");
            input.value = defaultValue || "";
            input.placeholder = "";
            document.getElementById("confirmModalOk").style.display = "";
            document.getElementById("confirmModalCancel").style.display = "";
            setTimeout(() => input.focus(), 100);
            confirmModalBs.show();
        });
    }
    window.showPrompt = showPrompt;

    // ---- Filter functions ----
    function applyFilters() {
        const q = filterInput.value.trim().toLowerCase();
        const pVal = filterPriority.value;
        const rVal = filterReview.value;
        const eVal = filterExec.value;
        const tagVal = activeTag;

        const filtered = testCases.filter((tc, idx) => {
            // Text search
            if (q) {
                const text = ALL_FIELD_KEYS.map(k => String(tc[k] || "").toLowerCase()).join(" ");
                if (!text.includes(q)) return false;
            }
            if (pVal && tc.priority !== pVal) return false;
            if (rVal && tc.review_status !== rVal) return false;
            if (eVal && tc.execution_status !== eVal) return false;
            if (tagVal) {
                const tags = (tc.tags || "").split(",").map(t => t.trim()).filter(Boolean);
                if (!tags.includes(tagVal)) return false;
            }
            return true;
        });
        return filtered;
    }

    function renderTable() {
        if (!tableBody || !tableHead) return;
        // Preserve scroll position
        const scrollTop = tableView ? tableView.scrollTop : 0;
        // Preserve selected checkboxes
        const selectedIndices = new Set();
        tableBody.querySelectorAll(".row-checkbox:checked").forEach(cb => selectedIndices.add(parseInt(cb.dataset.index)));

        tableBody.innerHTML = "";
        tableHead.innerHTML = "";
        caseCount.textContent = testCases.length;
        if (btnSaveToLib) btnSaveToLib.style.display = testCases.length > 0 ? "" : "none";
        window.updateExportInfo();

        if (testCases.length === 0) {
            const fCount = getActiveFields().length;
            const colSpan = (fCount || 1) + 3;
            tableHead.innerHTML = "<tr><th></th><th>#</th><th colspan='" + (colSpan - 2) + "'>测试用例</th></tr>";
            tableBody.innerHTML = `<tr><td colspan="${colSpan}" class="empty-table-msg">
                <i class="bi bi-inbox" style="font-size:2rem;"></i><p>暂无测试用例。</p></td></tr>`;
            if (cardView) cardView.innerHTML = '<div class="empty-state card-view-empty"><i class="bi bi-inbox empty-state-icon"></i><p class="empty-state-desc">暂无测试用例。</p></div>';
            return;
        }

        const filtered = applyFilters();
        const activeFlds = getActiveFields();
        let headerHtml = '<tr><th style="width:30px;"><input type="checkbox" id="selectAll" title="全选"></th><th style="width:40px;">#</th>';
        for (const fd of activeFlds) {
            headerHtml += `<th>${escHtml(fd.label)}</th>`;
        }
        headerHtml += '<th style="width:80px;">详情</th></tr>';
        tableHead.innerHTML = headerHtml;

        const newSelectAll = document.getElementById("selectAll");
        if (newSelectAll) newSelectAll.addEventListener("change", toggleSelectAll);

        const filterIndices = new Set();
        filtered.forEach(tc => filterIndices.add(testCases.indexOf(tc)));

        testCases.forEach((tc, index) => {
            if (!filterIndices.has(index)) return;
            const tr = document.createElement("tr");
            tr.dataset.index = index;
            tr.draggable = true;
            let cells = `<td><input type="checkbox" class="row-checkbox" data-index="${index}"></td><td class="drag-handle"><i class="bi bi-grip-vertical"></i> ${index + 1}</td>`;

            for (const fd of activeFlds) {
                const key = fd.key;
                const stdField = fd.predefined ? FIELD_BY_KEY[key] : null;
                const fieldType = stdField ? stdField.type : fd.type;
                const fieldOptions = stdField ? (stdField.options || null) : (fd.options || null);
                const val = escHtml(String(tc[key] || ""));

                if (key === "review_status") {
                    const statusLabels = { draft: "草稿", pending_review: "待评审", approved: "已通过", needs_changes: "需修改" };
                    const opts = Object.entries(statusLabels).map(([v, l]) =>
                        `<option value="${v}" ${tc[key] === v ? "selected" : ""}>${l}</option>`
                    ).join("");
                    cells += `<td><select data-field="${key}" data-index="${index}" class="rv-select">${opts}</select></td>`;
                } else if (key === "execution_status") {
                    const execLabels = { not_executed: "未执行", pass: "通过", fail: "失败", blocked: "阻塞" };
                    const opts = Object.entries(execLabels).map(([v, l]) =>
                        `<option value="${v}" ${tc[key] === v ? "selected" : ""}>${l}</option>`
                    ).join("");
                    cells += `<td><select data-field="${key}" data-index="${index}" class="exec-select">${opts}</select></td>`;
                } else if (key === "tags") {
                    cells += `<td><input type="text" value="${val}" data-field="${key}" data-index="${index}" class="tag-input" placeholder="逗号分隔"></td>`;
                } else if (fieldType === "select") {
                    const opts = (fieldOptions || []).map(o =>
                        `<option value="${o}" ${tc[key] === o ? "selected" : ""}>${o}</option>`
                    ).join("");
                    cells += `<td><select data-field="${key}" data-index="${index}">${opts}</select></td>`;
                } else if (fieldType === "combo") {
                    cells += `<td><input type="text" value="${val}" data-field="${key}" data-index="${index}" list="dl_${key}"></td>`;
                } else {
                    cells += `<td><input type="text" value="${val}" data-field="${key}" data-index="${index}"></td>`;
                }
            }
            cells += `<td><button class="btn btn-dep-link btn-sm btn-dep-find" data-dep-idx="${index}" title="查找前置用例"><i class="bi bi-link-45deg"></i></button><button class="btn btn-outline-primary btn-sm btn-detail" data-index="${index}" title="编辑"><i class="bi bi-pencil-square"></i></button></td>`;
            tr.innerHTML = cells;
            tableBody.appendChild(tr);
        });

        // Drag & drop
        let dragSrcIdx = -1;
        tableBody.querySelectorAll("tr[data-index]").forEach(tr => {
            tr.addEventListener("dragstart", e => {
                dragSrcIdx = parseInt(tr.dataset.index);
                e.dataTransfer.effectAllowed = "move";
                tr.classList.add("dragging");
            });
            tr.addEventListener("dragend", () => {
                tr.classList.remove("dragging");
                document.querySelectorAll("tr.drag-over").forEach(t => t.classList.remove("drag-over"));
            });
            tr.addEventListener("dragover", e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                tr.classList.add("drag-over");
            });
            tr.addEventListener("dragleave", () => tr.classList.remove("drag-over"));
            tr.addEventListener("drop", e => {
                e.preventDefault();
                tr.classList.remove("drag-over");
                const targetIdx = parseInt(tr.dataset.index);
                if (dragSrcIdx === targetIdx || dragSrcIdx < 0) return;
                pushUndo();
                const item = testCases.splice(dragSrcIdx, 1)[0];
                testCases.splice(targetIdx, 0, item);
                testCases.forEach((tc, i) => { tc.case_id = `TC-${String(i + 1).padStart(3, "0")}`; });
                saveToStorage();
                rerender();
            });
        });

        tableBody.querySelectorAll(".row-checkbox").forEach(cb => {
            cb.addEventListener("change", () => { updateSelectAllState(); updateBatchBar(); });
        });
        tableBody.querySelectorAll(".btn-dep-find").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                openDependencySearch(parseInt(btn.dataset.depIdx));
            });
        });
        tableBody.querySelectorAll(".btn-detail").forEach(btn => {
            btn.addEventListener("click", e => {
                openDetailModal(parseInt(e.target.closest("button").dataset.index));
            });
        });
        tableBody.querySelectorAll("tr").forEach(tr => {
            tr.addEventListener("click", e => {
                if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "BUTTON" || e.target.tagName === "I") return;
                const cb = tr.querySelector(".row-checkbox");
                if (cb) { cb.checked = !cb.checked; updateSelectAllState(); updateBatchBar(); tr.classList.toggle("selected", cb.checked); }
            });
        });
        tableBody.querySelectorAll("input[data-field], select[data-field]").forEach(el => {
            el.addEventListener("change", () => { syncTableData(); });
        });
        // Restore scroll position
        if (tableView) setTimeout(() => { tableView.scrollTop = scrollTop; }, 0);
        // Restore checkbox selection
        if (selectedIndices.size > 0) {
            tableBody.querySelectorAll(".row-checkbox").forEach(cb => {
                if (selectedIndices.has(parseInt(cb.dataset.index))) {
                    cb.checked = true;
                    cb.closest("tr")?.classList.add("selected");
                }
            });
        }
        updateSelectAllState();
        updateBatchBar();
        renderTagCloud();
        updateReport();
    }

    let _rerenderTimer = null;
    function debouncedRerender() {
        if (_rerenderTimer) clearTimeout(_rerenderTimer);
        _rerenderTimer = setTimeout(() => { _rerenderTimer = null; rerender(); }, 200);
    }
    function rerender() {
        renderTable();
        if (currentView === "card") renderCardView();
    }

    // ---- Card View ----
    function renderCardView() {
        if (!cardView) return;
        const filtered = applyFilters();
        const filterIndices = new Set();
        filtered.forEach(tc => filterIndices.add(testCases.indexOf(tc)));

        let html = "";
        testCases.forEach((tc, idx) => {
            if (!filterIndices.has(idx)) return;
            const tagList = (tc.tags || "").split(",").map(t => t.trim()).filter(Boolean);
            const tagsHtml = tagList.map(t => `<span class="tag-badge">${escHtml(t)}</span>`).join("");
            const pClass = "priority-" + (tc.priority || "P2").toLowerCase();
            const revLabels = { draft: "草稿", pending_review: "待评审", approved: "已通过", needs_changes: "需修改" };
            const execLabels = { not_executed: "未执行", pass: "通过", fail: "失败", blocked: "阻塞" };
            html += `<div class="card-item" draggable="true" data-index="${idx}">
                <div class="card-item-header">
                    <input type="checkbox" class="row-checkbox" data-index="${idx}">
                    <span class="card-item-id ${pClass}">${escHtml(tc.case_id || "")}</span>
                    <span class="rv-badge rv-${tc.review_status || 'draft'}">${revLabels[tc.review_status] || tc.review_status}</span>
                    <span class="exec-badge exec-${tc.execution_status || 'not_executed'}">${execLabels[tc.execution_status] || tc.execution_status}</span>
                </div>
                <div class="card-item-title">${escHtml(tc.title || "")}</div>
                <div class="card-item-meta">
                    <span class="card-item-module">${escHtml(tc.module || "")}</span>
                    <span class="card-item-priority ${pClass}">${tc.priority || "P2"}</span>
                </div>
                <div class="card-item-tags">${tagsHtml}</div>
                <div class="card-item-actions">
                    <button class="btn btn-dep-link btn-sm btn-dep-find" data-dep-idx="${idx}" title="查找前置用例"><i class="bi bi-link-45deg"></i></button>
                    <button class="btn btn-outline-primary btn-sm btn-detail" data-index="${idx}" title="编辑"><i class="bi bi-pencil-square"></i></button>
                </div>
            </div>`;
        });
        if (!html) {
            html = '<div class="empty-state card-view-empty"><i class="bi bi-inbox empty-state-icon"></i><p class="empty-state-desc">无匹配用例</p></div>';
        }
        cardView.innerHTML = html;

        // Card item events
        cardView.querySelectorAll(".row-checkbox").forEach(cb => {
            cb.addEventListener("change", () => { updateSelectAllState(); updateBatchBar(); });
        });
        cardView.querySelectorAll(".btn-dep-find").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                openDependencySearch(parseInt(btn.dataset.depIdx));
            });
        });
        cardView.querySelectorAll(".btn-detail").forEach(btn => {
            btn.addEventListener("click", e => {
                openDetailModal(parseInt(e.target.closest("button").dataset.index));
            });
        });

        // Card drag & drop
        let dragCardIdx = -1;
        cardView.querySelectorAll(".card-item").forEach(card => {
            card.addEventListener("dragstart", e => {
                dragCardIdx = parseInt(card.dataset.index);
                e.dataTransfer.effectAllowed = "move";
                card.classList.add("dragging");
            });
            card.addEventListener("dragend", () => {
                card.classList.remove("dragging");
                document.querySelectorAll(".card-item.drag-over").forEach(c => c.classList.remove("drag-over"));
            });
            card.addEventListener("dragover", e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                card.classList.add("drag-over");
            });
            card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
            card.addEventListener("drop", e => {
                e.preventDefault();
                card.classList.remove("drag-over");
                const targetIdx = parseInt(card.dataset.index);
                if (dragCardIdx === targetIdx || dragCardIdx < 0) return;
                pushUndo();
                const item = testCases.splice(dragCardIdx, 1)[0];
                testCases.splice(targetIdx, 0, item);
                testCases.forEach((tc, i) => { tc.case_id = `TC-${String(i + 1).padStart(3, "0")}`; });
                saveToStorage();
                rerender();
            });
        });
    }

    // ---- Tag Cloud ----
    function renderTagCloud() {
        if (!tagCloud) return;
        const tagSet = new Set();
        testCases.forEach(tc => {
            (tc.tags || "").split(",").map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t));
        });
        const tags = Array.from(tagSet).sort();
        if (tags.length === 0) { tagCloud.style.display = "none"; return; }
        tagCloud.style.display = "";
        let html = '<span class="tag-cloud-label">标签筛选：</span>';
        html += `<span class="tag-cloud-item ${activeTag === '' ? 'active' : ''}" data-tag="">全部</span>`;
        tags.forEach(t => {
            html += `<span class="tag-cloud-item ${activeTag === t ? 'active' : ''}" data-tag="${escHtml(t)}">${escHtml(t)}</span>`;
        });
        tagCloud.innerHTML = html;
        tagCloud.querySelectorAll(".tag-cloud-item").forEach(el => {
            el.addEventListener("click", () => {
                activeTag = el.dataset.tag;
                renderTagCloud();
                rerender();
            });
        });
    }

    // ---- Filter event bindings ----
    if (filterInput) filterInput.addEventListener("input", debouncedRerender);
    if (filterPriority) filterPriority.addEventListener("change", () => rerender());
    if (filterReview) filterReview.addEventListener("change", () => rerender());
    if (filterExec) filterExec.addEventListener("change", () => rerender());


    // ---- Regression analysis ----
    let _regressionModules = [];
    let _regressionSelected = new Set();

    async function loadRegressionModules() {
        const container = document.getElementById("regressionModules");
        const noLib = document.getElementById("regressionNoLib");
        const stepModules = document.getElementById("regressionStepModules");
        const stepResults = document.getElementById("regressionStepResults");
        if (!container) return;

        try {
            const data = await window.apiFetch("/api/regression/modules");
            _regressionModules = data.modules || [];

            if (_regressionModules.length === 0) {
                if (stepModules) stepModules.style.display = "none";
                if (stepResults) stepResults.style.display = "none";
                if (noLib) noLib.style.display = "";
                return;
            }

            if (noLib) noLib.style.display = "none";
            if (stepModules) stepModules.style.display = "";

            let html = "";
            _regressionModules.forEach(m => {
                const checked = _regressionSelected.has(m) ? "checked" : "";
                html += '<label class="regression-module-item' + (checked ? ' selected' : '') + '">';
                html += '<input type="checkbox" value="' + window.escHtml(m) + '" ' + checked + '>';
                html += window.escHtml(m) + '</label>';
            });
            container.innerHTML = html;

            container.querySelectorAll("input[type=checkbox]").forEach(cb => {
                cb.addEventListener("change", () => {
                    const label = cb.closest(".regression-module-item");
                    if (cb.checked) {
                        _regressionSelected.add(cb.value);
                        if (label) label.classList.add("selected");
                    } else {
                        _regressionSelected.delete(cb.value);
                        if (label) label.classList.remove("selected");
                    }
                    document.getElementById("btnRegressionAnalyze").disabled = _regressionSelected.size === 0;
                });
            });

            document.getElementById("btnRegressionAnalyze").disabled = _regressionSelected.size === 0;
        } catch (err) {
            container.innerHTML = '<div class="text-center text-muted py-3">加载失败</div>';
        }
    }

    async function doRegressionAnalyze() {
        if (_regressionSelected.size === 0) return;
        const btn = document.getElementById("btnRegressionAnalyze");
        const body = document.getElementById("regressionResultsBody");
        const stepResults = document.getElementById("regressionStepResults");
        if (!body || !stepResults) return;

        setBtnLoading(btn, true);
        stepResults.style.display = "none";

        try {
            const data = await window.apiFetch("/api/regression/analyze", {
                method: "POST",
                body: JSON.stringify({ modules: Array.from(_regressionSelected) }),
            });

            const summary = data.summary || {};
            const groups = summary.groups || {};

            let html = '<div class="regression-summary">';
            html += '<div class="regression-summary-grid">';

            const total = summary.total || 0;
            html += '<div class="regression-stat total"><div class="regression-stat-value">' + total + '</div><div class="regression-stat-label">总计用例数</div></div>';

            const priorityOrder = ["P0", "P1", "P2", "P3"];
            const priorityLabels = { "P0": "P0 - 阻塞", "P1": "P1 - 重要", "P2": "P2 - 边界", "P3": "P3 - 优化" };
            priorityOrder.forEach(p => {
                const count = groups[p] || 0;
                if (count > 0) {
                    html += '<div class="regression-stat ' + p.toLowerCase() + '"><div class="regression-stat-value">' + count + '</div><div class="regression-stat-label">' + (priorityLabels[p] || p) + '</div></div>';
                }
            });

            html += '<div class="regression-stat"><div class="regression-stat-value">' + (summary.estimated_hours || 0) + 'h</div><div class="regression-stat-label">预估执行时间</div></div>';
            html += '</div></div>';

            // Set list
            const sets = data.sets || [];
            if (sets.length > 0) {
                html += '<div class="regression-set-list"><strong class="d-block mb-2">涉及用例集 (' + sets.length + ' 个)</strong>';
                sets.forEach(s => {
                    html += '<div class="regression-set-item"><span class="set-name">' + window.escHtml(s.set_name) + '</span><span class="set-count">' + s.count + ' 条</span></div>';
                });
                html += '</div>';
            }

            // Export button
            html += '<div class="mt-3"><button class="btn btn-accent btn-sm" id="btnRegressionExport"><i class="bi bi-download"></i> 导出回归用例清单</button></div>';

            body.innerHTML = html;
            stepResults.style.display = "";

            document.getElementById("btnRegressionExport")?.addEventListener("click", () => exportRegressionCases(data.sets || []));
        } catch (err) {
            body.innerHTML = '<div class="alert alert-error">分析失败：' + (err.message || err) + '</div>';
            stepResults.style.display = "";
        } finally {
            setBtnLoading(btn, false);
        }
    }

    function exportRegressionCases(sets) {
        const allCases = [];
        sets.forEach(s => {
            (s.cases || []).forEach(c => {
                allCases.push({
                    case_id: c.case_id || "TC-???",
                    module: c.module || "",
                    title: c.title || "",
                    priority: c.priority || "P3",
                    preconditions: c.preconditions || "",
                    steps: c.steps || "",
                    expected: c.expected || "",
                });
            });
        });
        if (allCases.length === 0) { showError("没有可导出的用例"); return; }

        // Temporarily set testCases for export
        const saved = window.testCases;
        window.testCases = allCases;
        document.querySelector('[data-page="export"]')?.click();
        setTimeout(() => {
            window.testCases = saved;
        }, 100);
    }

    window.initRegressionPage = function () {
        _regressionSelected.clear();
        loadRegressionModules();

        document.getElementById("btnRegressionRefresh")?.addEventListener("click", loadRegressionModules);
        document.getElementById("btnRegressionSelectAll")?.addEventListener("click", () => {
            _regressionModules.forEach(m => _regressionSelected.add(m));
            loadRegressionModules();
            document.getElementById("btnRegressionAnalyze").disabled = false;
        });
        document.getElementById("btnRegressionDeselectAll")?.addEventListener("click", () => {
            _regressionSelected.clear();
            loadRegressionModules();
            document.getElementById("btnRegressionAnalyze").disabled = true;
        });
        document.getElementById("btnRegressionAnalyze")?.addEventListener("click", doRegressionAnalyze);
    };


    // ---- Navigate to: consolidated hook for all pages —
    const origNav = navigateTo;
    navigateTo = function(page) {
        origNav(page);
        if (page === "report" && typeof window.updateReport === "function") window.updateReport();
        if (page === "sql") {
            setTimeout(() => {
                if (typeof window.initSqlCm === "function") window.initSqlCm();
                if (!window.schemaLoaded && typeof window.loadSqlSchema === "function") { window.loadSqlSchema(); window.schemaLoaded = true; }
                if (window._sqlCm) window._sqlCm.refresh();
            }, 50);
        }
        if (page === "bugreport" && typeof window.refreshBugList === "function") window.refreshBugList();
        if (page === "history" && typeof window.initHistoryPage === "function") window.initHistoryPage();
        if (page === "regression" && typeof window.initRegressionPage === "function") window.initRegressionPage();
        if (page === "operations" && typeof window.initOperationsPage === "function") window.initOperationsPage();
        if (page === "admin" && typeof window.initAdminPage === "function") window.initAdminPage();
        if (page === "toolkit") { if (typeof window.switchToolkitTab === "function") window.switchToolkitTab("encoding"); if (typeof window.updateTimestamp === "function") window.updateTimestamp(); }
    };

    // ====== BUG CRUD ====== (moved to modules/bugs.js)


    // Expose shared utilities for feature modules (loaded after app.js)
    // Wrap window exports in try block to avoid HAL-9000 crash on any single failure
    try {
        window.showCustomDialog = showCustomDialog;
        window.getTestCases = () => testCases;
        window.openDetailModal = openDetailModal;
        Object.defineProperty(window, 'userApiKey', { get: () => userApiKey, set: v => { userApiKey = v; } });
        Object.defineProperty(window, 'userApiBaseUrl', { get: () => userApiBaseUrl, set: v => { userApiBaseUrl = v; } });
        Object.defineProperty(window, 'userModel', { get: () => userModel, set: v => { userModel = v; } });
        window.navigateTo = navigateTo;
        window.undo = undo;
        window.redo = redo;
        window.deleteSelected = deleteSelected;
        Object.defineProperty(window, 'sessionTokens', { get: () => sessionTokens });
        window.updateApiWarnDot = updateApiWarnDot;
        window.rerender = rerender;
        window.saveToStorage = saveToStorage;
    } catch(e) { console.error('window exports:', e); }

    // Init extracted modules (window exports already set)
    // Each init is try-catched so one failure doesn't block the rest
    try { if (typeof initBugPage === "function") initBugPage(); } catch(e) { console.error("initBugPage:", e); }
    try { if (typeof initJsonTools === "function") initJsonTools(); } catch(e) { console.error("initJsonTools:", e); }
    try { if (typeof initToolkit === "function") initToolkit(); } catch(e) { console.error("initToolkit:", e); }
    try { if (typeof initRegexTester === "function") initRegexTester(); } catch(e) { console.error("initRegexTester:", e); }
    try { if (typeof initSqlTool === "function") initSqlTool(); } catch(e) { console.error("initSqlTool:", e); }
    try { if (typeof initEnvManager === "function") initEnvManager(); } catch(e) { console.error("initEnvManager:", e); }
    try { if (typeof initReport === "function") initReport(); } catch(e) { console.error("initReport:", e); }
    try { if (typeof initRtm === "function") initRtm(); } catch(e) { console.error("initRtm:", e); }
    try { if (typeof initApiTest === "function") initApiTest(); } catch(e) { console.error("initApiTest:", e); }
    try { if (typeof initScriptGen === "function") initScriptGen(); } catch(e) { console.error("initScriptGen:", e); }
    try { if (typeof initAuth === "function") initAuth(); } catch(e) { console.error("initAuth:", e); }
    try { if (typeof initShortcuts === "function") initShortcuts(); } catch(e) { console.error("initShortcuts:", e); }

    // Init export module (button listeners)
    if (typeof window.initExport === "function") window.initExport();

    // Init library module (load/save library, folder tree, sharing)
    if (typeof window.initLibrary === "function") window.initLibrary({
        onAppendTestCases: (cases, data) => {
            pushUndo();
            testCases = testCases.concat(cases);
            testCases.forEach((tc, i) => { tc.case_id = "TC-" + String(i + 1).padStart(3, "0"); });
            saveToStorage();
            window.updateExportInfo();
            resultsArea.style.display = "";
            renderTable();
            navigateTo("cases");
            toast("已追加«" + data.name + "»(" + cases.length + " 条)", "success");
        },
        onReplaceTestCases: (cases, data) => {
            pushUndo();
            testCases = cases;
            testCases.forEach(function (tc, i) { tc.case_id = "TC-" + String(i + 1).padStart(3, "0"); });
            if (data.requirement_text) {
                var reqEl = document.getElementById("requirementText");
                if (reqEl && !reqEl.value.trim()) {
                    reqEl.value = data.requirement_text;
                    reqEl.dispatchEvent(new Event("input"));
                }
            }
            saveToStorage();
            window.updateExportInfo();
            resultsArea.style.display = "";
            renderTable();
            navigateTo("cases");
            toast("已加载«" + data.name + "»(" + cases.length + " 条)", "success");
        },
    });

    // Check auth on load
    try { if (typeof checkAuth === "function") checkAuth(); } catch(e) { console.error("checkAuth:", e); }

});

const SAMPLE_REQUIREMENT = `# 用户注册与登录功能需求

## 1. 用户注册
用户可以通过手机号或邮箱进行注册。

### 1.1 手机号注册
- 用户输入11位手机号码
- 点击"获取验证码"按钮，系统向该手机号发送6位数字验证码
- 验证码有效期为60秒，60秒后可重新获取
- 同一手机号每天最多获取5次验证码
- 用户输入验证码后，设置8-20位密码（必须包含字母和数字）
- 确认密码需与密码一致
- 点击"注册"按钮完成注册
- 注册成功后自动跳转到首页

### 1.2 邮箱注册
- 用户输入邮箱地址
- 系统发送验证链接到邮箱，链接有效期为24小时
- 用户点击链接后设置密码（要求同手机号注册）

## 2. 用户登录
- 输入手机号/邮箱 + 密码
- 密码错误超过5次，账户锁定30分钟
- 锁定期间提示剩余锁定时间
- 支持"记住密码"功能（有效期7天）
- 登录成功后跳转到首页

## 3. 密码重置
- 已注册用户可通过手机号/邮箱重置密码
- 验证身份后设置新密码
- 新密码不能与最近3次使用过的密码相同`;
