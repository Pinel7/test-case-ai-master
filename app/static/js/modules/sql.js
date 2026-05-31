// ====== SQL Query Tool & CSV Import ======
// Dependencies: window.toast, window.escHtml, window.showConfirm

var sqlCmInitialized = false;  // var = on window for cross-module access
var schemaLoaded = false;      // used by navigateTo in app.js

function initSqlCm() {
    if (sqlCmInitialized) return;
    const el = document.getElementById("sqlEditor");
    if (!el || typeof CodeMirror === "undefined") return;
    try {
        window._sqlCm = CodeMirror.fromTextArea(el, {
            mode: "text/x-sql",
            theme: document.documentElement.getAttribute("data-theme") === "dark" ? "monokai" : "default",
            lineNumbers: true,
            indentWithTabs: true,
            smartIndent: true,
            lineWrapping: true,
            extraKeys: { "Ctrl-Enter": doSqlQuery, "Cmd-Enter": doSqlQuery },
        });
        new MutationObserver(() => {
            const th = document.documentElement.getAttribute("data-theme") === "dark" ? "monokai" : "default";
            if (window._sqlCm) window._sqlCm.setOption("theme", th);
        }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        sqlCmInitialized = true;
    } catch(e) {}
}

function getSqlText() { return window._sqlCm ? window._sqlCm.getValue() : (document.getElementById("sqlEditor")?.value || ""); }
function setSqlText(val) { if (window._sqlCm) { window._sqlCm.setValue(val); } else if (document.getElementById("sqlEditor")) { document.getElementById("sqlEditor").value = val; } }

async function doSqlQuery() {
    const toast = window.toast;
    const escHtml = window.escHtml;
    const sql = getSqlText().trim();
    if (!sql) { toast("请输入 SQL 语句", "warning"); return; }
    const panel = document.getElementById("sqlResultsPanel");
    const errPanel = document.getElementById("sqlErrorPanel");
    const errMsg = document.getElementById("sqlErrorMessage");
    const status = document.getElementById("sqlStatus");
    const btn = document.getElementById("btnSqlExecute");
    if (panel) panel.style.display = "none";
    if (errPanel) errPanel.style.display = "none";
    if (status) status.textContent = "执行中...";
    if (btn) btn.disabled = true;
    try {
        const resp = await fetch("/api/query", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sql }),
        });
        const data = await resp.json();
        if (data.error) {
            if (errMsg) errMsg.textContent = data.error;
            if (errPanel) errPanel.style.display = "";
            if (status) status.textContent = "错误";
        } else {
            const cnt = document.getElementById("sqlResultCount");
            const et = document.getElementById("sqlExecTime");
            const head = document.getElementById("sqlResultsHead");
            const body = document.getElementById("sqlResultsBody");
            if (cnt) cnt.textContent = data.row_count;
            if (et) et.textContent = data.execution_time_ms + " ms";
            if (data.columns.length > 0 && head && body) {
                head.innerHTML = "<tr>" + data.columns.map(c => "<th>" + escHtml(c) + "</th>").join("") + "</tr>";
                body.innerHTML = data.rows.map(row =>
                    "<tr>" + row.map(cell => "<td title=\"" + escHtml(String(cell ?? "")) + "\">" + escHtml(String(cell ?? "NULL")) + "</td>").join("") + "</tr>"
                ).join("") || '<tr><td colspan="' + data.columns.length + '" style="text-align:center;color:var(--color-text-secondary);">(结果为空)</td></tr>';
            } else if (body) {
                head.innerHTML = "";
                body.innerHTML = '<tr><td style="text-align:center;color:var(--color-text-secondary);">查询执行成功（无返回列）</td></tr>';
            }
            if (panel) panel.style.display = "";
            if (status) status.textContent = "完成";
        }
    } catch(e) {
        if (errMsg) errMsg.textContent = "请求失败: " + e.message;
        if (errPanel) errPanel.style.display = "";
        if (status) status.textContent = "错误";
    } finally { if (btn) btn.disabled = false; }
}

async function loadSqlSchema() {
    const escHtml = window.escHtml;
    const showConfirm = window.showConfirm;
    const treeEl = document.getElementById("sqlSchemaTree");
    if (!treeEl) return;
    treeEl.innerHTML = '<div class="text-muted small">加载中...</div>';
    try {
        const resp = await fetch("/api/query/schema");
        const data = await resp.json();
        const tables = data.tables || [];
        if (tables.length === 0) { treeEl.innerHTML = '<div class="text-muted small">无表</div>'; return; }
        let html = "";
        const demoTables = ["users","orders","products"];
        tables.forEach(tbl => {
            const isDemo = demoTables.includes(tbl.name);
            const delBtn = isDemo ? "" : ` <span class="sql-del-table" title="删除此表" data-table="${escHtml(tbl.name)}"><i class="bi bi-x-circle"></i></span>`;
            html += `<div class="sql-schema-table"><div class="sql-schema-table-name" data-table="${escHtml(tbl.name)}"><i class="bi bi-chevron-right"></i> ${escHtml(tbl.name)}${delBtn}</div><div class="sql-schema-columns" style="display:none;">`;
            tbl.columns.forEach(col => { html += `<div><code>${escHtml(col.name)}</code> ${escHtml(col.type || "TEXT")}</div>`; });
            html += `</div></div>`;
        });
        treeEl.innerHTML = html;
        treeEl.querySelectorAll(".sql-schema-table-name").forEach(el => {
            el.addEventListener("click", () => {
                const cols = el.nextElementSibling;
                const icon = el.querySelector("i");
                if (cols.style.display === "none") { cols.style.display = ""; icon.className = "bi bi-chevron-down"; }
                else { cols.style.display = "none"; icon.className = "bi bi-chevron-right"; }
            });
            el.addEventListener("dblclick", () => {
                setSqlText("SELECT * FROM " + el.dataset.table + " LIMIT 100;");
                if (window._sqlCm) { window._sqlCm.focus(); window._sqlCm.execCommand("selectAll"); }
            });
        });
        treeEl.querySelectorAll(".sql-del-table").forEach(el => {
            el.addEventListener("click", async (e) => {
                e.stopPropagation();
                const tbl = el.dataset.table;
                if (!tbl) return;
                const ok = await showConfirm(`确定删除表 "${tbl}" 吗？数据将不可恢复。`);
                if (!ok) return;
                try {
                    const r = await fetch("/api/query/tables/" + encodeURIComponent(tbl), { method: "DELETE" });
                    const d = await r.json();
                    toast(d.message || "已删除", d.success === false ? "danger" : "success");
                    loadSqlSchema();
                } catch(e) { toast("删除失败: " + e.message, "danger"); }
            });
        });
    } catch(e) { treeEl.innerHTML = '<div class="text-danger small">加载失败</div>'; }
}

function initSqlTool() {
    const toast = window.toast;
    const showConfirm = window.showConfirm;

    document.getElementById("btnSqlExecute")?.addEventListener("click", doSqlQuery);
    document.getElementById("btnSqlClear")?.addEventListener("click", () => {
        setSqlText(""); const p = document.getElementById("sqlResultsPanel"); const ep = document.getElementById("sqlErrorPanel"); const s = document.getElementById("sqlStatus");
        if (p) p.style.display = "none"; if (ep) ep.style.display = "none"; if (s) s.textContent = "";
    });
    document.getElementById("btnSqlRefreshSchema")?.addEventListener("click", loadSqlSchema);

    // CSV Import
    document.getElementById("btnSqlImport")?.addEventListener("click", () => {
        const modal = new bootstrap.Modal(document.getElementById("csvImportModal"));
        modal.show();
    });
    document.getElementById("csvFileInput")?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById("csvTextInput").value = ev.target.result;
        };
        reader.readAsText(file);
    });
    document.getElementById("btnCsvImport")?.addEventListener("click", async () => {
        const tableName = document.getElementById("csvTableName").value.trim();
        const csvContent = document.getElementById("csvTextInput").value.trim();
        const statusEl = document.getElementById("csvImportStatus");
        if (!tableName) { toast("请输入表名", "warning"); return; }
        if (!csvContent) { toast("请选择 CSV 文件或粘贴 CSV 内容", "warning"); return; }
        statusEl.style.display = "none";
        const btn = document.getElementById("btnCsvImport");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 导入中...';
        try {
            const resp = await fetch("/api/query/import-csv", {
                method: "POST", headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ table_name: tableName, csv_content: csvContent }),
            });
            const data = await resp.json();
            statusEl.style.display = "";
            if (data.success) {
                statusEl.className = "small text-success";
                statusEl.textContent = data.message;
                toast(data.message, "success");
                loadSqlSchema();
                document.getElementById("csvTableName").value = "";
                document.getElementById("csvTextInput").value = "";
                document.getElementById("csvFileInput").value = "";
                setTimeout(() => bootstrap.Modal.getInstance(document.getElementById("csvImportModal"))?.hide(), 800);
            } else {
                statusEl.className = "small text-danger";
                statusEl.textContent = data.message;
                toast(data.message, "danger");
            }
        } catch(e) {
            statusEl.style.display = "";
            statusEl.className = "small text-danger";
            statusEl.textContent = "导入请求失败: " + e.message;
            toast("导入失败: " + e.message, "danger");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-upload"></i> 导入';
        }
    });
}
