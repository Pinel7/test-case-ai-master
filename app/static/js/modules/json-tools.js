// ====== JSON / XML Formatter, Diff & Test Data Generator ======
// Dependencies: window.toast, window.escHtml, window.showAlert

function formatJson(str, compact) {
    try {
        const parsed = JSON.parse(str);
        return compact ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2);
    } catch(e) {
        throw new Error("JSON 解析失败: " + e.message);
    }
}

function formatXml(str, compact) {
    try {
        if (compact) {
            return str.trim().replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
        }
        const tokens = str.trim().split(/(<[^>]*>)/).filter(t => t.length > 0);
        const INDENT = "  ";
        let result = "", indent = 0;
        for (const token of tokens) {
            if (!token.startsWith("<")) {
                const text = token.trim();
                if (!text) continue;
                result += "\n" + INDENT.repeat(indent) + text;
                continue;
            }
            if (token.startsWith("<!--") || token.startsWith("<?") || token.startsWith("<!") || token.startsWith("<![CDATA[")) {
                result += "\n" + INDENT.repeat(indent) + token;
                continue;
            }
            if (token.endsWith("/>")) {
                result += "\n" + INDENT.repeat(indent) + token;
                continue;
            }
            if (token.startsWith("</")) {
                indent--;
                result += "\n" + INDENT.repeat(Math.max(0, indent)) + token;
                continue;
            }
            result += (result ? "\n" : "") + INDENT.repeat(indent) + token;
            indent++;
        }
        return result.trim();
    } catch(e) {
        throw new Error("XML 格式化失败: " + e.message);
    }
}

function syntaxHighlightJson(obj) {
    const json = JSON.stringify(obj, null, 2);
    return json.replace(/("(?:\\.|[^"\\])*")\s*:/g, '<span class="json-key">$1</span>:')
        .replace(/:(\s*)("(?:\\.|[^"\\])*")/g, ':<span class="json-string">$1$2</span>')
        .replace(/:(\s*)(\d+\.?\d*)/g, ':<span class="json-number">$1$2</span>')
        .replace(/:(\s*)(true|false|null)/g, ':<span class="json-bool">$1$2</span>');
}
// Expose for cross-module use (apitest.js)
window.syntaxHighlightJson = syntaxHighlightJson;

// ---- Test Data Generator data ----
const SURNAMES = "王李张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段漕钱汤尹黎易常武乔贺赖龚文";
const GIVEN = "伟芳娜秀英敏静丽强磊洋艳勇军杰娟涛明超秀兰霞平刚桂英文华飞玉梅建斌海燕志玲萍清珍红鑫";
const EMAIL_DOMAINS = ["qq.com", "163.com", "gmail.com", "outlook.com", "sina.com", "foxmail.com", "example.com"];

function genMobile() {
    const prefixes = ["13", "15", "17", "18", "19", "14"];
    const pre = prefixes[Math.floor(Math.random() * prefixes.length)];
    let num = pre;
    for (let i = 0; i < 9; i++) num += Math.floor(Math.random() * 10);
    return num;
}
function genEmail() {
    const len = 5 + Math.floor(Math.random() * 8);
    let name = "";
    for (let i = 0; i < len; i++) name += String.fromCharCode(97 + Math.floor(Math.random() * 26));
    const domain = EMAIL_DOMAINS[Math.floor(Math.random() * EMAIL_DOMAINS.length)];
    return name + "@" + domain;
}
function genName() {
    const sur = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
    const givenLen = Math.random() > 0.4 ? 2 : 1;
    let given = "";
    for (let i = 0; i < givenLen; i++) given += GIVEN[Math.floor(Math.random() * GIVEN.length)];
    return sur + given;
}
function genIdCard() {
    const areas = ["110101", "310101", "440101", "330101", "420101", "510101", "320101"];
    const area = areas[Math.floor(Math.random() * areas.length)];
    const y = 1950 + Math.floor(Math.random() * 70);
    const m = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
    const d = String(1 + Math.floor(Math.random() * 28)).padStart(2, "0");
    const seq = String(Math.floor(Math.random() * 999)).padStart(3, "0");
    const base = area + y + m + d + seq;
    const ws = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    let sum = 0;
    for (let i = 0; i < 17; i++) sum += parseInt(base[i]) * ws[i];
    const cs = "10X98765432";
    return base + cs[sum % 11];
}
function genBankCard() {
    const bins = ["622202", "622848", "955880", "621700", "622262", "621559", "622188"];
    const bin = bins[Math.floor(Math.random() * bins.length)];
    let card = bin;
    for (let i = 0; i < 9; i++) card += Math.floor(Math.random() * 10);
    let sum = 0;
    const digits = card.split("").map(Number);
    for (let i = digits.length - 1; i >= 0; i--) {
        let d = digits[i];
        if ((digits.length - i) % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
    }
    const check = (10 - (sum % 10)) % 10;
    return card + check;
}
function genIp() {
    return Array.from({length: 4}, () => Math.floor(Math.random() * 256)).join(".");
}
function genUrl() {
    const protos = ["https", "http"];
    const proto = protos[Math.floor(Math.random() * protos.length)];
    const domains = ["example", "test", "demo", "api", "dev", "prod"];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const tlds = [".com", ".cn", ".org", ".net", ".io"];
    const tld = tlds[Math.floor(Math.random() * tlds.length)];
    const path = Math.random() > 0.5 ? "/" + ["api", "v1", "users", "data", "test"][Math.floor(Math.random() * 5)] : "";
    return `${proto}://${domain}${tld}${path}`;
}

const DATA_GEN_FUNCS = {
    mobile: genMobile, email: genEmail, name: genName,
    idcard: genIdCard, bankcard: genBankCard, ip: genIp, url: genUrl,
};
const DATA_GEN_LABELS = {
    mobile: "手机号", email: "邮箱", name: "姓名",
    idcard: "身份证号", bankcard: "银行卡号", ip: "IP 地址", url: "URL",
};

function initJsonTools() {
    const toast = window.toast;
    const escHtml = window.escHtml;
    const showAlert = window.showAlert;

    // ---- Tab switching ----
    document.querySelectorAll(".fm-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".fm-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".fm-panel").forEach(p => p.classList.remove("active"));
            tab.classList.add("active");
            const panel = document.getElementById("fmPanel" + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1));
            if (panel) panel.classList.add("active");
        });
    });

    // JSON format
    document.getElementById("btnFmJsonFormat")?.addEventListener("click", () => {
        const input = document.getElementById("fmJsonInput").value.trim();
        if (!input) return;
        try { document.getElementById("fmJsonOutput").value = formatJson(input, false); }
        catch(e) { showAlert(e.message); }
    });
    document.getElementById("btnFmJsonCompact")?.addEventListener("click", () => {
        const input = document.getElementById("fmJsonInput").value.trim();
        if (!input) return;
        try { document.getElementById("fmJsonOutput").value = formatJson(input, true); }
        catch(e) { showAlert(e.message); }
    });
    document.getElementById("btnFmJsonValidate")?.addEventListener("click", () => {
        const input = document.getElementById("fmJsonInput").value.trim();
        if (!input) return;
        try { JSON.parse(input); toast("JSON 格式有效 ✓", "success"); }
        catch(e) { showAlert("JSON 格式无效: " + e.message); }
    });
    document.getElementById("btnFmJsonCopy")?.addEventListener("click", () => {
        const val = document.getElementById("fmJsonOutput").value;
        if (!val) return;
        navigator.clipboard.writeText(val).then(() => toast("已复制", "success")).catch(() => {});
    });

    // XML format
    document.getElementById("btnFmXmlFormat")?.addEventListener("click", () => {
        const input = document.getElementById("fmXmlInput").value.trim();
        if (!input) return;
        try { document.getElementById("fmXmlOutput").value = formatXml(input, false); }
        catch(e) { showAlert(e.message); }
    });
    document.getElementById("btnFmXmlCompact")?.addEventListener("click", () => {
        const input = document.getElementById("fmXmlInput").value.trim();
        if (!input) return;
        try { document.getElementById("fmXmlOutput").value = formatXml(input, true); }
        catch(e) { showAlert(e.message); }
    });
    document.getElementById("btnFmXmlCopy")?.addEventListener("click", () => {
        const val = document.getElementById("fmXmlOutput").value;
        if (!val) return;
        navigator.clipboard.writeText(val).then(() => toast("已复制", "success")).catch(() => {});
    });

    // Diff
    document.getElementById("btnFmDiffGo")?.addEventListener("click", () => {
        const left = document.getElementById("fmDiffLeft").value;
        const right = document.getElementById("fmDiffRight").value;
        const out = document.getElementById("fmDiffOutput");
        if (!left && !right) { out.innerHTML = '<p class="text-muted">请在两侧输入内容。</p>'; return; }
        const linesL = left.split("\n");
        const linesR = right.split("\n");
        const maxLen = Math.max(linesL.length, linesR.length);
        let html = '<table class="diff-table"><thead><tr><th style="width:50%;">旧</th><th style="width:50%;">新</th></tr></thead><tbody>';
        for (let i = 0; i < maxLen; i++) {
            const l = linesL[i] !== undefined ? linesL[i] : "";
            const r = linesR[i] !== undefined ? linesR[i] : "";
            let cls = "";
            if (l !== r) {
                if (l && r) { cls = "diff-change"; }
                else if (l && !r) { cls = "diff-del"; }
                else if (!l && r) { cls = "diff-add"; }
            }
            html += `<tr class="${cls}"><td>${escHtml(l)}</td><td>${escHtml(r)}</td></tr>`;
        }
        html += "</tbody></table>";
        out.innerHTML = html;
    });
    document.getElementById("btnFmDiffClear")?.addEventListener("click", () => {
        document.getElementById("fmDiffLeft").value = "";
        document.getElementById("fmDiffRight").value = "";
        document.getElementById("fmDiffOutput").innerHTML = '<p class="text-muted">请在两侧输入内容。</p>';
    });

    // ---- Test Data Generator ----
    const btnDataGen = document.getElementById("btnDataGen");
    const dataGenModal = document.getElementById("dataGenModal");
    let dataGenBs = null;
    if (dataGenModal) try { dataGenBs = new bootstrap.Modal(dataGenModal); } catch(_) {}

    if (btnDataGen && dataGenBs) {
        btnDataGen.addEventListener("click", () => dataGenBs.show());
    }

    document.getElementById("btnDataGenGo")?.addEventListener("click", function() {
        const type = document.getElementById("dataGenType").value;
        const count = parseInt(document.getElementById("dataGenCount").value) || 10;
        const fn = DATA_GEN_FUNCS[type];
        if (!fn) return;
        const results = [];
        for (let i = 0; i < count; i++) results.push(fn());
        document.getElementById("dataGenResult").value = results.join("\n");
        document.getElementById("dataGenCountLabel").textContent = `（共 ${results.length} 条）`;
    });

    document.getElementById("btnDataGenCopy")?.addEventListener("click", async function() {
        const text = document.getElementById("dataGenResult").value;
        if (!text) { await showAlert("请先生成数据。"); return; }
        try {
            await navigator.clipboard.writeText(text);
            toast("已复制到剪贴板", "success");
        } catch (_) {
            const ta = document.getElementById("dataGenResult");
            ta.select(); document.execCommand("copy");
            toast("已复制", "success");
        }
    });
}
