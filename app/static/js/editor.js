/**
 * Online File Editor — TXT / XLSX / DOCX
 * Depends on: CodeMirror (global), XLSX (global), mammoth (global), Quill (global), docx (global)
 */
(function () {
    "use strict";

    // ---- DOM refs ----
    const el = {
        container: document.getElementById("editorContainer"),
        tabs: document.getElementById("editorTabs"),
        emptyState: document.getElementById("editorEmptyState"),
        fileInput: document.getElementById("fileInput"),
        btnOpen: document.getElementById("btnEditorOpen"),
        btnNew: document.getElementById("btnEditorNew"),
        btnSave: document.getElementById("btnEditorSave"),
        btnSaveAs: document.getElementById("btnEditorSaveAs"),
        btnClose: document.getElementById("btnEditorClose"),
    };

    // ---- State ----
    const state = {
        files: [],       // {id, name, type, content, dirty, _workbook, _sheetName, _data}
        activeIndex: -1,
        nextId: 0,
        cmEditor: null,  // CodeMirror instance
        quill: null,     // Quill instance
    };

    // ---- Helpers ----
    function escHtml(s) {
        const d = document.createElement("div");
        d.textContent = String(s ?? "");
        return d.innerHTML;
    }

    function getFileType(name) {
        const ext = name.split(".").pop().toLowerCase();
        if (ext === "xlsx" || ext === "xls") return "xlsx";
        if (ext === "docx") return "docx";
        return "txt";
    }

    function getLangMode(name) {
        const ext = name.split(".").pop().toLowerCase();
        const map = {
            js: "javascript", ts: "javascript", jsx: "javascript",
            py: "python",
            xml: "xml", html: "htmlmixed", htm: "htmlmixed",
            css: "css", scss: "css", less: "css",
            sql: "sql",
            md: "markdown", markdown: "markdown",
            json: "javascript",
        };
        return map[ext] || null;
    }

    function setButtonsEnabled(on) {
        el.btnSave.disabled = !on;
        el.btnSaveAs.disabled = !on;
        el.btnClose.disabled = !on;
    }

    // ---- Destroy current editor ----
    function destroyEditor() {
        if (state._luckyActive) {
            try { luckysheet.destroy(); } catch (e) { /* ignore */ }
            state._luckyActive = false;
        }
        if (state.cmEditor) {
            const wrapper = state.cmEditor.getWrapperElement();
            if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
            state.cmEditor = null;
        }
        if (state.quill) {
            state.quill = null;
        }
        el.container.innerHTML = "";
    }

    function showEmptyState(show) {
        el.emptyState.style.display = show ? "" : "none";
    }

    // ---- Tab rendering ----
    function renderTabs() {
        let html = "";
        state.files.forEach((f, i) => {
            const active = i === state.activeIndex ? " active" : "";
            const dirty = f.dirty ? " dirty" : "";
            const icon = f.type === "xlsx" ? "bi-file-earmark-excel" : f.type === "docx" ? "bi-file-earmark-word" : "bi-file-earmark-text";
            html += `<div class="editor-tab${active}${dirty}" data-index="${i}">
                <i class="bi ${icon}"></i>${escHtml(f.name)}
                <span class="tab-close" data-close="${i}">&times;</span>
            </div>`;
        });
        el.tabs.innerHTML = html;

        // Tab click: switch
        el.tabs.querySelectorAll(".editor-tab").forEach(tab => {
            tab.addEventListener("click", e => {
                if (e.target.classList.contains("tab-close")) return;
                switchTab(parseInt(tab.dataset.index));
            });
        });
        // Close button click
        el.tabs.querySelectorAll(".tab-close").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                closeTab(parseInt(btn.dataset.close));
            });
        });
    }

    // ---- Tab switching ----
    function switchTab(index) {
        if (index < 0 || index >= state.files.length) return;
        if (index === state.activeIndex) return;

        destroyEditor();
        state.activeIndex = index;

        const file = state.files[index];
        showEmptyState(false);

        if (file.type === "txt") {
            initTextEditor(file.content || "");
        } else if (file.type === "xlsx") {
            initXlsxEditorFromData(file._data || [], file._sheetName || "Sheet1");
        } else if (file.type === "docx") {
            initDocxEditorFromHtml(file.content || "");
        }

        renderTabs();
        setButtonsEnabled(true);
    }

    async function closeTab(index) {
        if (index < 0 || index >= state.files.length) return;
        const file = state.files[index];

        if (file.dirty) {
            const ok = await showConfirm(`"${file.name}" 已被修改，是否保存？`, "保存确认");
            if (ok) {
                saveFile(index);
            }
        }

        // Remove file from state
        state.files.splice(index, 1);

        // Determine new active index
        if (state.files.length === 0) {
            destroyEditor();
            state.activeIndex = -1;
            showEmptyState(true);
            setButtonsEnabled(false);
            renderTabs();
            return;
        }

        if (state.activeIndex >= state.files.length) {
            state.activeIndex = state.files.length - 1;
        } else if (state.activeIndex > index) {
            state.activeIndex--;
        }

        // If we closed the active tab, switch to new active
        if (index === state.activeIndex || state.activeIndex < 0) {
            state.activeIndex = Math.min(index, state.files.length - 1);
        }

        renderTabs();
        switchTab(state.activeIndex);
    }

    // ---- File opening ----
    function openFile(file) {
        const type = getFileType(file.name);
        const id = state.nextId++;
        const record = { id, name: file.name, type, content: "", dirty: false, _data: null, _sheetName: null };

        state.files.push(record);
        const index = state.files.length - 1;

        // Read file
        const reader = new FileReader();

        if (type === "txt") {
            reader.onload = function () {
                record.content = reader.result;
                state.files[index] = record;
                switchToNewTab(index);
            };
            reader.readAsText(file, "UTF-8");
        } else if (type === "xlsx") {
            if (file.size > 10 * 1024 * 1024) {
                showAlert("文件较大（>10MB），加载可能较慢。", "提示");
            }
            reader.onload = async function () {
                try {
                    const wb = XLSX.read(new Uint8Array(reader.result), { type: "array" });
                    const sheetName = wb.SheetNames[0] || "Sheet1";
                    const ws = wb.Sheets[sheetName];
                    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
                    record._workbook = wb;
                    record._sheetName = sheetName;
                    record._data = data;
                    record.content = ""; // not used for xlsx
                    state.files[index] = record;
                    switchToNewTab(index);
                } catch (err) {
                    await showAlert("无法解析 Excel 文件：" + err.message, "错误");
                    state.files.splice(index, 1);
                }
            };
            reader.readAsArrayBuffer(file);
        } else if (type === "docx") {
            if (file.size > 10 * 1024 * 1024) {
                showAlert("文件较大（>10MB），加载可能较慢。", "提示");
            }
            reader.onload = function () {
                mammoth.convertToHtml({ arrayBuffer: reader.result })
                    .then(function (result) {
                        let html = result.value;
                        // Strip excessive empty paragraphs
                        html = html.replace(/<p><br\s*\/?><\/p>/gi, "<p>&nbsp;</p>");
                        record.content = html;
                        state.files[index] = record;
                        switchToNewTab(index);
                    })
                    .catch(async function (err) {
                        await showAlert("无法解析 Word 文件：" + err.message, "错误");
                        state.files.splice(index, 1);
                    });
            };
            reader.readAsArrayBuffer(file);
        }
    }

    function switchToNewTab(index) {
        destroyEditor();
        state.activeIndex = index;
        showEmptyState(false);
        const file = state.files[index];

        if (file.type === "txt") {
            initTextEditor(file.content || "");
        } else if (file.type === "xlsx") {
            initXlsxEditorFromData(file._data || [], file._sheetName || "Sheet1");
        } else if (file.type === "docx") {
            initDocxEditorFromHtml(file.content || "");
        }

        renderTabs();
        setButtonsEnabled(true);
    }

    // ---- New file ----
    async function newFile() {
        var type = await showPrompt("新建文件类型：<br><small>txt - 文本文件<br>xlsx - Excel 表格<br>docx - Word 文档</small>", "txt", "新建文件");
        if (!type) return;
        type = type.toLowerCase().trim();
        if (["txt", "xlsx", "docx"].indexOf(type) === -1) {
            await showAlert("不支持的文件类型。请输入 txt / xlsx / docx", "错误");
            return;
        }

        var nameMap = { txt: "新建文档.txt", xlsx: "新建表格.xlsx", docx: "新建文档.docx" };
        var name = nameMap[type] || "新建文件.txt";
        var id = state.nextId++;

        var record = {
            id: id, name: name, type: type, content: "", dirty: false,
            _data: type === "xlsx" ? [[""]] : null,
            _sheetName: "Sheet1",
        };
        state.files.push(record);
        switchToNewTab(state.files.length - 1);
    }

    // ---- Text Editor (CodeMirror) ----
    function initTextEditor(content) {
        showEmptyState(false);
        const wrapper = document.createElement("div");
        wrapper.className = "cm-editor-wrap";
        el.container.appendChild(wrapper);

        const mode = getLangMode(state.files[state.activeIndex].name);
        state.cmEditor = CodeMirror(wrapper, {
            value: content,
            mode: mode || "",
            theme: "monokai",
            lineNumbers: true,
            indentUnit: 4,
            tabSize: 4,
            lineWrapping: true,
            autofocus: true,
        });

        state.cmEditor.on("change", function () {
            const idx = state.activeIndex;
            if (idx >= 0 && idx < state.files.length) {
                state.files[idx].dirty = true;
                renderTabs();
            }
        });
    }

    // ---- XLSX Editor (Luckysheet) ----
    function aoaToLuckyData(data, sheetName) {
        // Convert SheetJS 2D array to Luckysheet celldata format
        var celldata = [];
        for (var r = 0; r < data.length; r++) {
            var row = Array.isArray(data[r]) ? data[r] : [];
            for (var c = 0; c < row.length; c++) {
                var val = row[c];
                if (val !== undefined && val !== null && val !== "") {
                    celldata.push({
                        r: r,
                        c: c,
                        v: { v: String(val), ct: { fa: "General", t: "g" } }
                    });
                }
            }
        }
        return [{ name: sheetName || "Sheet1", celldata: celldata }];
    }

    function initXlsxEditorFromData(data, sheetName) {
        showEmptyState(false);

        // Destroy any existing Luckysheet instance first
        if (state._luckyActive) {
            try { luckysheet.destroy(); } catch (e) { /* ignore */ }
            state._luckyActive = false;
        }

        // If Luckysheet is not available, fall back to simple table
        if (typeof luckysheet === "undefined") {
            console.warn("Luckysheet not loaded, using fallback table editor.");
            initFallbackXlsxTable(data);
            return;
        }

        var containerId = "luckysheet-" + Date.now();
        var h = Math.max(el.container.clientHeight, 520);
        el.container.innerHTML = '<div id="' + containerId + '" class="luckysheet-wrap" style="height:' + h + 'px;"></div>';

        var luckyData = aoaToLuckyData(data.length > 0 ? data : [[""]], sheetName);

        var options = {
            container: containerId,
            title: sheetName || "Sheet1",
            lang: "zh",
            allowUpdate: true,
            forceCalculation: false,
            showtoolbar: true,
            showinfobar: true,
            showsheetbar: true,
            data: luckyData,
            hook: {
                cellUpdate: function () { markCurrentFileDirty(); },
                rangeUpdate: function () { markCurrentFileDirty(); },
                sheetChange: function () { markCurrentFileDirty(); },
                workbookCreateAfter: function () { markCurrentFileDirty(); },
            },
        };

        setTimeout(function () {
            try {
                luckysheet.create(options);
                state._luckyActive = true;
            } catch (err) {
                console.error("Luckysheet init error:", err);
                // Fall back to simple table editor
                el.container.innerHTML = "";
                initFallbackXlsxTable(data);
            }
        }, 100);
    }

    // ---- Fallback XLSX table (when Luckysheet is unavailable) ----
    function initFallbackXlsxTable(data) {
        state._luckyActive = false;
        var rows = (data && data.length > 0) ? data : [[""]];
        var maxCols = Math.max.apply(null, rows.map(function (r) { return (Array.isArray(r) ? r : []).length; })) || 1;

        var html = '<div class="xlsx-wrap"><table class="xlsx-table"><tbody>';
        for (var r = 0; r < rows.length; r++) {
            html += "<tr>";
            var row = Array.isArray(rows[r]) ? rows[r] : [];
            for (var c = 0; c < maxCols; c++) {
                var val = row[c] !== undefined && row[c] !== null ? String(row[c]) : "";
                html += '<td contenteditable="true" data-r="' + r + '" data-c="' + c + '">' + escHtml(val) + "</td>";
            }
            html += "</tr>";
        }
        html += "</tbody></table></div>";
        el.container.innerHTML = html;

        el.container.querySelectorAll(".xlsx-table td").forEach(function (td) {
            td.addEventListener("input", function () { markCurrentFileDirty(); });
        });
    }

    function markCurrentFileDirty() {
        var idx = state.activeIndex;
        if (idx >= 0 && idx < state.files.length) {
            state.files[idx].dirty = true;
            renderTabs();
        }
    }

    function luckyDataToXlsxBlob() {
        var allData = luckysheet.getAllSheets();
        var wb = XLSX.utils.book_new();

        for (var i = 0; i < allData.length; i++) {
            var sheet = allData[i];
            var celldata = sheet.data || [];
            // Find dimensions
            var maxR = 0, maxC = 0;
            for (var j = 0; j < celldata.length; j++) {
                var cell = celldata[j];
                if (cell.r > maxR) maxR = cell.r;
                if (cell.c > maxC) maxC = cell.c;
            }
            // Build 2D array
            var rows = [];
            for (var r = 0; r <= maxR; r++) {
                rows[r] = [];
                for (var c = 0; c <= maxC; c++) {
                    rows[r][c] = "";
                }
            }
            for (var k = 0; k < celldata.length; k++) {
                var cell = celldata[k];
                var v = cell.v;
                if (v !== undefined && v !== null) {
                    var cellVal = (typeof v === "object") ? (v.v !== undefined ? v.v : (v.m || "")) : v;
                    rows[cell.r][cell.c] = cellVal;
                }
            }
            var ws = XLSX.utils.aoa_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, sheet.name || ("Sheet" + (i + 1)));
        }

        var out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
        return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    }

    function collectXlsxData() {
        // Fallback: extract raw cell data (no longer used for save, kept for compatibility)
        var allData = luckysheet.getAllSheets();
        var result = [];
        if (allData.length > 0) {
            var celldata = allData[0].data || [];
            var maxR = 0;
            for (var i = 0; i < celldata.length; i++) {
                if (celldata[i].r > maxR) maxR = celldata[i].r;
            }
            for (var r = 0; r <= maxR; r++) result.push([]);
            for (var j = 0; j < celldata.length; j++) {
                var cell = celldata[j];
                var v = cell.v;
                var val = (typeof v === "object") ? (v.v !== undefined ? v.v : (v.m || "")) : (v || "");
                if (!result[cell.r]) result[cell.r] = [];
                result[cell.r][cell.c] = val;
            }
        }
        return result.length > 0 ? result : [[""]];
    }

    function saveXlsx(index) {
        return luckyDataToXlsxBlob();
    }

    // ---- DOCX Editor ----
    function initDocxEditorFromHtml(html) {
        showEmptyState(false);

        const wrap = document.createElement("div");
        wrap.className = "quill-editor-wrap";
        wrap.innerHTML = '<div id="quill-editor" style="flex:1;"></div>';
        el.container.appendChild(wrap);

        state.quill = new Quill("#quill-editor", {
            theme: "snow",
            modules: {
                toolbar: [
                    [{ header: [1, 2, 3, false] }],
                    ["bold", "italic", "underline", "strike"],
                    [{ list: "ordered" }, { list: "bullet" }],
                    ["clean"],
                ],
            },
            placeholder: "编辑文档内容...",
        });

        // Set content via clipboard to avoid Quill parsing issues
        state.quill.clipboard.dangerouslyPasteHTML(html || "<p>&nbsp;</p>");

        state.quill.on("text-change", function () {
            const idx = state.activeIndex;
            if (idx >= 0 && idx < state.files.length) {
                state.files[idx].dirty = true;
                renderTabs();
            }
        });
    }

    async function saveDocxAsync(index) {
        var html = "";
        if (state.quill) {
            html = state.quill.root.innerHTML;
        } else {
            html = state.files[index].content || "<p>&nbsp;</p>";
        }

        // Build docx from HTML using the docx library
        var children = [];

        // Simple HTML-to-docx conversion
        var temp = document.createElement("div");
        temp.innerHTML = html;

        function processNode(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                var text = node.textContent || "";
                if (text.trim()) {
                    return new docx.TextRun({ text: text });
                }
                return null;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return null;

            var tag = node.tagName.toLowerCase();
            var runs = [];
            node.childNodes.forEach(function (child) {
                var r = processNode(child);
                if (r) {
                    if (Array.isArray(r)) {
                        runs = runs.concat(r);
                    } else {
                        runs.push(r);
                    }
                }
            });

            if (tag === "strong" || tag === "b") {
                return runs.map(function (r) {
                    r.bold = true;
                    return r;
                });
            }
            if (tag === "em" || tag === "i") {
                return runs.map(function (r) {
                    r.italics = true;
                    return r;
                });
            }
            if (tag === "u") {
                return runs.map(function (r) {
                    r.underline = { type: "single" };
                    return r;
                });
            }

            if (tag === "h1") {
                children.push(new docx.Paragraph({
                    heading: docx.HeadingLevel.HEADING_1,
                    children: runs.length > 0 ? runs : [new docx.TextRun({ text: node.textContent || "" })],
                }));
                return null;
            }
            if (tag === "h2") {
                children.push(new docx.Paragraph({
                    heading: docx.HeadingLevel.HEADING_2,
                    children: runs.length > 0 ? runs : [new docx.TextRun({ text: node.textContent || "" })],
                }));
                return null;
            }
            if (tag === "h3") {
                children.push(new docx.Paragraph({
                    heading: docx.HeadingLevel.HEADING_3,
                    children: runs.length > 0 ? runs : [new docx.TextRun({ text: node.textContent || "" })],
                }));
                return null;
            }
            if (tag === "li") {
                children.push(new docx.Paragraph({
                    bullet: { level: 0 },
                    children: runs.length > 0 ? runs : [new docx.TextRun({ text: node.textContent || "" })],
                }));
                return null;
            }
            if (tag === "p" || tag === "div" || tag === "span" || tag === "br") {
                if (runs.length > 0 || (node.textContent && node.textContent.trim())) {
                    children.push(new docx.Paragraph({
                        children: runs.length > 0 ? runs : [new docx.TextRun({ text: node.textContent || "" })],
                    }));
                }
                return null;
            }
            return runs;
        }

        Array.from(temp.childNodes).forEach(processNode);

        if (children.length === 0) {
            children.push(new docx.Paragraph({
                children: [new docx.TextRun({ text: html.replace(/<[^>]+>/g, "") || " " })],
            }));
        }

        var doc = new docx.Document({
            sections: [{ children: children }],
        });

        return docx.Packer.toBlob(doc);
    }

    // ---- Save / Save As ----
    async function saveFile(index) {
        if (index < 0 || index >= state.files.length) return;
        var file = state.files[index];
        var blob;

        try {
            if (file.type === "txt") {
                var text = state.cmEditor ? state.cmEditor.getValue() : file.content;
                blob = new Blob([text], { type: "text/plain;charset=utf-8" });
            } else if (file.type === "xlsx") {
                blob = saveXlsx(index);
            } else if (file.type === "docx") {
                blob = await saveDocxAsync(index);
            }
        } catch (err) {
            await showAlert("导出失败：" + (err.message || err), "错误");
            return;
        }

        file.dirty = false;
        state.files[index] = file;
        renderTabs();
        downloadBlob(blob, file.name);
    }

    async function saveAsFile(index) {
        if (index < 0 || index >= state.files.length) return;
        var file = state.files[index];
        var newName = await showPrompt("输入文件名：", file.name, "另存为");
        if (!newName) return;

        // Ensure correct extension
        var ext = file.name.split(".").pop().toLowerCase();
        if (newName.indexOf(".") === -1) newName += "." + ext;

        var origName = file.name;
        file.name = newName;
        state.files[index] = file;
        renderTabs();
        saveFile(index);
        // Restore original name
        state.files[index].name = origName;
        renderTabs();
    }

    function downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        // Delay removal to ensure the browser starts the download
        setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 200);
    }

    // ---- Drag and drop ----
    (function initDragDrop() {
        var container = el.container;
        if (!container) return;

        container.addEventListener("dragover", function (e) {
            e.preventDefault();
            e.stopPropagation();
            container.classList.add("drag-over");
        });

        container.addEventListener("dragleave", function (e) {
            e.preventDefault();
            e.stopPropagation();
            container.classList.remove("drag-over");
        });

        container.addEventListener("drop", function (e) {
            e.preventDefault();
            e.stopPropagation();
            container.classList.remove("drag-over");
            var files = e.dataTransfer.files;
            for (var i = 0; i < files.length; i++) {
                var f = files[i];
                var ext = f.name.split(".").pop().toLowerCase();
                if (["txt", "xlsx", "xls", "docx"].indexOf(ext) !== -1) {
                    openFile(f);
                }
            }
        });
    })();

    // ---- Event bindings ----
    el.btnOpen.addEventListener("click", function () {
        el.fileInput.click();
    });

    el.btnNew.addEventListener("click", function () {
        newFile();
    });

    el.fileInput.addEventListener("change", function (e) {
        var files = Array.from(e.target.files);
        files.forEach(function (f) { return openFile(f); });
        e.target.value = ""; // Allow reopening the same file
    });

    el.btnSave.addEventListener("click", function () {
        if (state.activeIndex >= 0) saveFile(state.activeIndex);
    });

    el.btnSaveAs.addEventListener("click", function () {
        if (state.activeIndex >= 0) saveAsFile(state.activeIndex);
    });

    el.btnClose.addEventListener("click", function () {
        if (state.activeIndex >= 0) closeTab(state.activeIndex);
    });

    // Keyboard shortcut: Ctrl+S to save
    document.addEventListener("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            // Only intercept when editor page is active
            var editorPage = document.getElementById("page-editor");
            if (editorPage && editorPage.classList.contains("active") && state.activeIndex >= 0) {
                e.preventDefault();
                saveFile(state.activeIndex);
            }
        }
    });

})();
