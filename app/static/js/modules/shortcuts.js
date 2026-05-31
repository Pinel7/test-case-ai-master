// ====== Keyboard Shortcuts ======
// Dependencies: window.undo, window.redo, window.deleteSelected (exposed from app.js)

function initShortcuts() {
    const getFilterInput = () => document.getElementById("filterInput");

    document.addEventListener("keydown", function(e) {
        const tag = (e.target || {}).tagName || "";
        const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
        const ctrl = e.ctrlKey || e.metaKey;

        // Ctrl+Enter → Generate
        if (ctrl && e.key === "Enter") {
            e.preventDefault();
            const genBtn = document.getElementById("btnGenerate");
            if (genBtn && !genBtn.disabled) genBtn.click();
            return;
        }

        // Ctrl+S → Save to library
        if (ctrl && e.key === "s") {
            e.preventDefault();
            const saveBtn = document.getElementById("btnSaveToLib");
            if (saveBtn && saveBtn.style.display !== "none") saveBtn.click();
            return;
        }

        // Ctrl+Z → Undo (not in input)
        if (ctrl && !e.shiftKey && e.key === "z" && !isInput) {
            e.preventDefault();
            if (typeof window.undo === "function") window.undo();
            return;
        }

        // Ctrl+Y / Ctrl+Shift+Z → Redo
        if ((ctrl && e.key === "y") || (ctrl && e.shiftKey && e.key === "z")) {
            e.preventDefault();
            if (typeof window.redo === "function") window.redo();
            return;
        }

        // Delete → Delete selected
        if ((e.key === "Delete" || e.key === "Del") && !isInput) {
            const checked = document.querySelectorAll(".row-checkbox:checked");
            if (checked.length > 0) {
                e.preventDefault();
                if (typeof window.deleteSelected === "function") window.deleteSelected();
            }
            return;
        }
    });

    // / → Focus search
    document.addEventListener("keypress", function(e) {
        if (e.key === "/" && (e.target || {}).tagName !== "INPUT" && (e.target || {}).tagName !== "TEXTAREA") {
            e.preventDefault();
            const fi = getFilterInput();
            if (fi) fi.focus();
        }
        // ? → Shortcuts modal
        if (e.key === "?" && (e.target || {}).tagName !== "INPUT" && (e.target || {}).tagName !== "TEXTAREA" && (e.target || {}).tagName !== "SELECT" && !(e.target || {}).isContentEditable) {
            e.preventDefault();
            if (!window._shortcutsModal) {
                const el = document.getElementById("shortcutsModal");
                if (el) try { window._shortcutsModal = new bootstrap.Modal(el); } catch(_) {}
            }
            if (window._shortcutsModal) window._shortcutsModal.show();
        }
    });
}
