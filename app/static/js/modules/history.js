/* Generation History module — view, restore, delete past generations. */
(function () {
    "use strict";

    let currentHistory = [];

    function renderHistory() {
        const list = document.getElementById("historyList");
        const empty = document.getElementById("historyEmpty");
        if (!list || !empty) return;

        if (currentHistory.length === 0) {
            list.style.display = "none";
            empty.style.display = "";
            return;
        }

        empty.style.display = "none";
        list.style.display = "";

        let html = '<div class="history-items">';
        currentHistory.forEach(h => {
            const date = h.created_at ? h.created_at.replace("T", " ").substring(0, 19) : "";
            const preview = h.requirement_preview || "(空)";
            html += '<div class="history-item" data-id="' + h.id + '">';
            html += '<div class="history-item-main">';
            html += '<div class="history-item-preview">' + window.escHtml(preview) + '</div>';
            html += '<div class="history-item-meta">';
            html += '<span class="history-item-model">' + window.escHtml(h.model || "deepseek-chat") + '</span>';
            html += '<span class="history-item-count">' + (h.case_count || 0) + ' 条</span>';
            html += '<span class="history-item-date">' + window.escHtml(date) + '</span>';
            html += '</div></div>';
            html += '<div class="history-item-actions">';
            html += '<button class="btn btn-sm btn-accent history-restore" title="恢复到当前工作区"><i class="bi bi-arrow-counterclockwise"></i> 恢复</button>';
            html += '<button class="btn btn-sm btn-ghost history-delete" title="删除"><i class="bi bi-trash3"></i></button>';
            html += '</div></div>';
        });
        html += '</div>';
        list.innerHTML = html;

        // Event handlers
        list.querySelectorAll(".history-restore").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const item = e.target.closest(".history-item");
                const id = item.dataset.id;
                try {
                    const resp = await window.apiFetch("/api/history/" + id + "/restore", { method: "POST" });
                    if (!resp.ok) throw new Error((await resp.json()).detail?.message || "恢复失败");
                    const data = await resp.json();
                    if (data.test_cases && Array.isArray(data.test_cases)) {
                        // Restore to workspace
                        window.testCases = data.test_cases;
                        window.testCases.forEach((tc, i) => { tc.case_id = "TC-" + String(i + 1).padStart(3, "0"); });
                        // Set requirement text if available
                        const reqText = document.getElementById("requirementText");
                        if (reqText && data.requirement_text) reqText.value = data.requirement_text;
                        window.saveToStorage();
                        window.rerender();
                        window.toast("已恢复 " + data.test_cases.length + " 条用例", "success");
                        window.navigateTo("cases");
                    }
                } catch (err) {
                    window.toast("恢复失败：" + (err.message || err), "error");
                }
            });
        });
        list.querySelectorAll(".history-delete").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const item = e.target.closest(".history-item");
                const id = item.dataset.id;
                const confirmed = await new Promise(resolve => {
                    window.showConfirm("确定删除此条历史记录？", () => resolve(true), () => resolve(false));
                });
                if (!confirmed) return;
                try {
                    const resp = await window.apiFetch("/api/history/" + id, { method: "DELETE" });
                    if (!resp.ok) throw new Error("删除失败");
                    window.toast("已删除", "success");
                    await loadHistory();
                } catch (err) {
                    window.toast("删除失败：" + (err.message || err), "error");
                }
            });
        });
    }

    async function loadHistory() {
        try {
            const resp = await window.apiFetch("/api/history");
            if (!resp.ok) throw new Error("加载失败");
            const data = await resp.json();
            currentHistory = data.history || [];
        } catch (err) {
            currentHistory = [];
            window.toast("加载历史记录失败", "error");
        }
        renderHistory();
    }

    // Expose init
    window.initHistoryPage = function () {
        // Refresh button
        document.getElementById("btnHistoryRefresh")?.addEventListener("click", loadHistory);
        // Load on first visit
        loadHistory();
    };

})();
