// ====== Regex Tester ======
// Dependencies: window.escHtml

function initRegexTester() {
    const escHtml = window.escHtml;
    const patternInput = document.getElementById("regexPattern");
    const testText = document.getElementById("regexTestText");
    const matchCount = document.getElementById("regexMatchCount");
    const groupCount = document.getElementById("regexGroupCount");
    const errorEl = document.getElementById("regexError");
    const highlightBox = document.getElementById("regexHighlightBox");
    const groupsContainer = document.getElementById("regexCaptureGroups");
    const groupsBody = document.getElementById("regexGroupsBody");
    const flagCheckboxes = document.querySelectorAll("#page-regex .regex-flag input");
    if (!patternInput) return;

    function getFlags() {
        let flags = "";
        flagCheckboxes.forEach(cb => { if (cb.checked) flags += cb.dataset.flag; });
        return flags;
    }

    function runRegex() {
        const pattern = patternInput.value;
        const text = testText.value;
        errorEl.textContent = "";
        matchCount.textContent = "0";
        groupCount.textContent = "0";
        groupsContainer.style.display = "none";
        if (!pattern || !text) {
            highlightBox.innerHTML = text ? escHtml(text) : "";
            return;
        }
        let regex;
        try { regex = new RegExp(pattern, getFlags()); }
        catch (e) {
            errorEl.textContent = "正则语法错误: " + e.message;
            highlightBox.innerHTML = escHtml(text);
            return;
        }
        const globalFlags = getFlags().includes("g") ? getFlags() : getFlags() + "g";
        const globalRe = new RegExp(pattern, globalFlags);
        const matches = [];
        let m;
        while ((m = globalRe.exec(text)) !== null) {
            matches.push(m);
            if (!globalRe.global) break;
        }
        matchCount.textContent = matches.length;
        if (matches.length === 0) {
            highlightBox.innerHTML = escHtml(text);
            return;
        }
        let lastIdx = 0, hlHtml = "";
        matches.forEach(match => {
            if (match.index > lastIdx) hlHtml += escHtml(text.slice(lastIdx, match.index));
            hlHtml += '<span class="regex-hl">' + escHtml(match[0]) + '</span>';
            lastIdx = match.index + match[0].length;
        });
        if (lastIdx < text.length) hlHtml += escHtml(text.slice(lastIdx));
        highlightBox.innerHTML = hlHtml;
        if (matches.length > 0 && matches[0].length > 1) {
            groupsContainer.style.display = "";
            groupCount.textContent = String(matches[0].length - 1);
            let tableHtml = '<table class="regex-group-table"><thead><tr><th>#</th><th>值</th></tr></thead><tbody>';
            const showMatches = matches.slice(0, 3);
            showMatches.forEach((match, mi) => {
                for (let i = 1; i < match.length; i++) {
                    tableHtml += `<tr><td>$${i} (匹配 ${mi + 1})</td><td>${escHtml(match[i] || "(空)")}</td></tr>`;
                }
            });
            if (matches.length > 3) {
                tableHtml += `<tr><td colspan="2" style="color:var(--color-text-secondary);font-style:italic;">... 还有 ${matches.length - 3} 个匹配</td></tr>`;
            }
            tableHtml += "</tbody></table>";
            groupsBody.innerHTML = tableHtml;
        }
    }

    let regexDebounce;
    function scheduleRegex() { clearTimeout(regexDebounce); regexDebounce = setTimeout(runRegex, 200); }

    patternInput.addEventListener("input", scheduleRegex);
    testText.addEventListener("input", scheduleRegex);
    flagCheckboxes.forEach(cb => cb.addEventListener("change", scheduleRegex));
    document.getElementById("btnRegexClear")?.addEventListener("click", () => {
        patternInput.value = ""; testText.value = ""; scheduleRegex();
    });

    const COMMON_PATTERNS = [
        { pattern: "\\d+", desc: "数字" },
        { pattern: "\\w+", desc: "单词" },
        { pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", desc: "邮箱地址" },
        { pattern: "https?://[\\w./?=&%-]+", desc: "URL 链接" },
        { pattern: "1[3-9]\\d{9}", desc: "手机号" },
        { pattern: "\\d{17}[\\dXx]", desc: "身份证号" },
        { pattern: "(\\d{1,3}\\.){3}\\d{1,3}", desc: "IP 地址 (IPv4)" },
        { pattern: "\\d{4}-\\d{2}-\\d{2}", desc: "日期 YYYY-MM-DD" },
    ];
    const commonBody = document.getElementById("regexCommonBody");
    if (commonBody) {
        commonBody.innerHTML = COMMON_PATTERNS.map(p =>
            `<button class="regex-common-btn" data-pattern="${escHtml(p.pattern)}"><code>/${escHtml(p.pattern)}/</code> <small>${escHtml(p.desc)}</small></button>`
        ).join("");
        commonBody.querySelectorAll(".regex-common-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                patternInput.value = btn.dataset.pattern; scheduleRegex(); patternInput.focus();
            });
        });
    }
}
