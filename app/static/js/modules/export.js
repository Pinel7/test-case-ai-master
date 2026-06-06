/**
 * Export module for TestForge
 * Extracted from app.js for maintainability.
 * Dependencies: window.getTestCases, window.escHtml, window.toast, window.setBtnLoading, FIELD_DEFS
 */

(function () {
    // ---- Helpers (persist export field checkbox selection) ----
    const EXPORT_FIELDS_KEY = "itg_export_fields";

    function _getExportFieldSelection() {
        try {
            const raw = localStorage.getItem(EXPORT_FIELDS_KEY);
            if (raw) return new Set(JSON.parse(raw));
        } catch (_) { }
        return new Set(FIELD_DEFS.map(f => f.key));
    }

    function _persistExportFieldSelection() {
        const checked = document.querySelectorAll(".export-field-cb:checked");
        const keys = Array.from(checked).map(cb => cb.value);
        localStorage.setItem(EXPORT_FIELDS_KEY, JSON.stringify(keys));
    }

    function _updateExportFieldsCount() {
        const el = document.getElementById("exportFieldsCount");
        if (el) {
            el.textContent = document.querySelectorAll(".export-field-cb:checked").length;
        }
    }

    // ---- Public API ----

    function updateExportInfo() {
        const testCases = window.getTestCases();
        const caseCount = document.getElementById("exportCaseCount");
        const fname = document.getElementById("exportFilename");
        if (caseCount) caseCount.textContent = testCases.length;
        if (fname) {
            const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            fname.value = `test_cases_${ts}`;
        }
    }

    function renderExportFields() {
        const grid = document.getElementById("exportFieldsGrid");
        if (!grid) return;
        const saved = _getExportFieldSelection();
        const escHtml = window.escHtml;
        let html = "";
        for (const f of FIELD_DEFS) {
            const checked = saved.has(f.key) ? "checked" : "";
            html += `<div class="form-check">
                <input class="form-check-input export-field-cb" type="checkbox" value="${f.key}" id="expf_${f.key}" ${checked}>
                <label class="form-check-label" for="expf_${f.key}">${escHtml(f.label)}</label>
            </div>`;
        }
        grid.innerHTML = html;
        _updateExportFieldsCount();
        grid.querySelectorAll(".export-field-cb").forEach(cb => {
            cb.addEventListener("change", () => {
                _persistExportFieldSelection();
                _updateExportFieldsCount();
            });
        });
    }

    async function doExport(format) {
        const testCases = window.getTestCases();
        const toast = window.toast;
        const setBtnLoading = window.setBtnLoading;
        if (testCases.length === 0) {
            toast("没有可导出的测试用例。", "warning");
            return;
        }

        const exportFilename = document.getElementById("exportFilename");
        const btnExportXLSX = document.getElementById("btnExportXLSX");
        const btnExportCSV = document.getElementById("btnExportCSV");

        let filename = exportFilename.value.trim() || `test_cases_${Date.now()}`;
        const ext = format === "xlsx" ? ".xlsx" : ".csv";
        if (!filename.endsWith(ext)) filename += ext;

        const exportBtn = format === "xlsx" ? btnExportXLSX : btnExportCSV;
        setBtnLoading(exportBtn, true);

        try {
            const resp = await fetch(`/api/export/${format}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ test_cases: testCases, filename: filename }),
            });
            if (!resp.ok) throw new Error("导出失败");

            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast("导出成功", "success");
        } catch (err) {
            toast(err.message || "导出失败", "error");
        } finally {
            setBtnLoading(exportBtn, false);
        }
    }

    async function doBatchExport(selected) {
        const toast = window.toast;
        const setBtnLoading = window.setBtnLoading;
        const btn = document.getElementById("btnBatchExport");
        setBtnLoading(btn, true);
        const filename = `selected_cases_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.xlsx`;
        try {
            const resp = await fetch("/api/export/xlsx", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ test_cases: selected, filename }),
            });
            if (!resp.ok) throw new Error("导出失败");
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast(`已导出 ${selected.length} 条用例`, "success");
        } catch (err) {
            toast(err.message, "error");
        } finally {
            setBtnLoading(btn, false);
        }
    }

    // ---- Init ----
    function initExport() {
        document.getElementById("btnExportXLSX")?.addEventListener("click", () => doExport("xlsx"));
        document.getElementById("btnExportCSV")?.addEventListener("click", () => doExport("csv"));
        document.getElementById("btnExportJSON")?.addEventListener("click", () => {
            const testCases = window.getTestCases();
            const toast = window.toast;
            if (testCases.length === 0) { toast("没有可导出的用例", "warning"); return; }
            const blob = new Blob([JSON.stringify(testCases, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "test_cases_backup_" + new Date().toISOString().slice(0, 10) + ".json";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast("JSON 备份已下载", "success");
        });
    }

    window.updateExportInfo = updateExportInfo;
    window.renderExportFields = renderExportFields;
    window.doExport = doExport;
    window.doBatchExport = doBatchExport;
    window.initExport = initExport;
})();
