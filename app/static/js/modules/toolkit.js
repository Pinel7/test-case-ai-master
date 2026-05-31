// ====== Toolkit: Encoding, Timestamp, Password/UUID Generator ======
// Dependencies: window.toast, window.escHtml

let encType = "base64";

function switchToolkitTab(tab) {
    document.querySelectorAll(".toolkit-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".toolkit-panel").forEach(p => p.classList.remove("active"));
    const tabEl = document.querySelector(`.toolkit-tab[data-ktab="${tab}"]`);
    const panel = document.getElementById(`ktab-${tab}`);
    if (tabEl) tabEl.classList.add("active");
    if (panel) panel.classList.add("active");
    if (tab === "timestamp") { setTimeout(updateTimestamp, 30); }
}

function updateTimestamp() {
    const tsInput = document.getElementById("tsInput");
    const tsInputType = document.getElementById("tsInputType");
    const val = tsInput ? tsInput.value.trim() : "";
    if (!val) {
        ["tsResultIso","tsResultFull","tsResultUtc","tsResultLocale"].forEach(id => {
            const el = document.getElementById(id); if (el) el.textContent = "—";
        });
        return;
    }
    let ts = parseFloat(val);
    if (isNaN(ts)) return;
    const mode = tsInputType ? tsInputType.value : "auto";
    if (mode === "ms" || (mode === "auto" && ts > 1e12)) ts = Math.floor(ts / 1000);
    const d = new Date(ts * 1000);
    if (isNaN(d.getTime())) return;
    setEl("tsResultIso", d.toISOString());
    setEl("tsResultFull", d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0") + " " + String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0") + ":" + String(d.getSeconds()).padStart(2,"0"));
    setEl("tsResultUtc", d.toUTCString());
    setEl("tsResultLocale", d.toLocaleString());
}

function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function updateDateToTs() {
    const tsDateInput = document.getElementById("tsDateInput");
    const val = tsDateInput ? tsDateInput.value : "";
    if (!val) { setEl("tsResultSec", "—"); setEl("tsResultMs", "—"); return; }
    const d = new Date(val);
    if (isNaN(d.getTime())) return;
    setEl("tsResultSec", String(Math.floor(d.getTime() / 1000)));
    setEl("tsResultMs", String(d.getTime()));
}

function calcPwStrength(pw) {
    let score = 0;
    if (pw.length >= 8) score++; if (pw.length >= 12) score++; if (pw.length >= 16) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    if (pw.length >= 20) score++;
    if (score <= 2) return { label: "弱", cls: "weak" };
    if (score <= 3) return { label: "中", cls: "medium" };
    if (score <= 5) return { label: "强", cls: "strong" };
    return { label: "非常强", cls: "very-strong" };
}

function generatePassword() {
    const toast = window.toast;
    const escHtml = window.escHtml;
    const genPwLen = document.getElementById("genPwLen");
    const len = parseInt(genPwLen ? genPwLen.value : 16);
    const upper = document.getElementById("genPwUpper")?.checked ?? true;
    const lower = document.getElementById("genPwLower")?.checked ?? true;
    const digit = document.getElementById("genPwDigit")?.checked ?? true;
    const sym = document.getElementById("genPwSym")?.checked ?? true;
    const noAmb = document.getElementById("genPwAmbiguous")?.checked ?? false;

    let chars = "";
    if (upper) chars += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (lower) chars += "abcdefghijklmnopqrstuvwxyz";
    if (digit) chars += "0123456789";
    if (sym) chars += "!@#$%^&*()_+-=[]{}|;:,.<>?";
    if (noAmb) chars = chars.replace(/[il1o0O]/g, "");

    if (!chars) { toast("请至少选择一种字符类型", "warning"); return; }

    const list = document.getElementById("genPwList");
    const countEl = document.getElementById("genPwCount");
    if (!list) return;

    const passwords = [];
    for (let i = 0; i < 5; i++) {
        let pw = "";
        for (let j = 0; j < len; j++) {
            pw += chars[Math.floor(Math.random() * chars.length)];
        }
        const strength = calcPwStrength(pw);
        passwords.push({ pw, strength });
    }

    if (countEl) countEl.textContent = "5 个";
    list.innerHTML = passwords.map((p, idx) =>
        `<div class="gen-pw-item"><span class="gen-pw-strength-dot ${p.strength.cls}"></span><span class="gen-pw-text">${escHtml(p.pw)}</span><span class="gen-strength ${p.strength.cls}" style="font-size:0.7rem;padding:1px 6px;">${p.strength.label}</span><button class="btn btn-ghost btn-xs gen-pw-copy" data-pw="${escHtml(p.pw)}"><i class="bi bi-clipboard"></i></button></div>`
    ).join("");

    list.querySelectorAll(".gen-pw-copy").forEach(btn => {
        btn.addEventListener("click", function() {
            navigator.clipboard.writeText(this.dataset.pw).then(() => toast("已复制", "success")).catch(() => {});
        });
    });

    const strengthEl = document.getElementById("genPwStrength");
    if (strengthEl && passwords[0]) {
        const s = passwords[0].strength;
        strengthEl.textContent = "强度: " + s.label;
        strengthEl.className = "gen-strength " + s.cls;
    }
}

function generateUUID() {
    const toast = window.toast;
    const escHtml = window.escHtml;
    const count = parseInt(document.getElementById("genUuidCount")?.value || "5");
    const format = document.getElementById("genUuidFormat")?.value || "lower";
    const list = document.getElementById("genUuidList");
    const countLabel = document.getElementById("genUuidCountLabel");
    if (!list) return;

    const uuids = [];
    for (let i = 0; i < count; i++) {
        let uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
        });
        if (format === "upper") uuid = uuid.toUpperCase();
        if (format === "nobraces") uuid = uuid.replace(/-/g, "").toLowerCase();
        uuids.push(uuid);
    }

    if (countLabel) countLabel.textContent = count + " 个";

    if (count === 1) {
        list.innerHTML = uuids.map(u =>
            `<div class="gen-pw-item"><span class="gen-pw-text" style="font-family:'SF Mono',monospace;">${escHtml(u)}</span><button class="btn btn-ghost btn-xs gen-pw-copy" data-pw="${escHtml(u)}"><i class="bi bi-clipboard"></i></button></div>`
        ).join("");
    } else {
        list.innerHTML = `<div class="mb-2"><button class="btn btn-ghost btn-xs" id="btnUuidCopyAll"><i class="bi bi-copy"></i> 复制全部</button></div>` +
            uuids.map(u =>
                `<div class="gen-pw-item"><span class="gen-pw-text" style="font-family:'SF Mono',monospace;">${escHtml(u)}</span><button class="btn btn-ghost btn-xs gen-pw-copy" data-pw="${escHtml(u)}"><i class="bi bi-clipboard"></i></button></div>`
            ).join("");

        document.getElementById("btnUuidCopyAll")?.addEventListener("click", () => {
            navigator.clipboard.writeText(uuids.join("\n")).then(() => toast("已复制全部", "success")).catch(() => {});
        });
    }

    list.querySelectorAll(".gen-pw-copy").forEach(btn => {
        btn.addEventListener("click", function() {
            navigator.clipboard.writeText(this.dataset.pw).then(() => toast("已复制", "success")).catch(() => {});
        });
    });
}

function initToolkit() {
    const toast = window.toast;
    const escHtml = window.escHtml;

    // Tab switching
    document.querySelectorAll(".toolkit-tab").forEach(tab => {
        tab.addEventListener("click", () => switchToolkitTab(tab.dataset.ktab));
    });

    // Encoding
    const encInput = document.getElementById("encInput");
    const encOutput = document.getElementById("encOutput");
    const encOutputInfo = document.getElementById("encOutputInfo");

    function updateEncButtons() {
        document.querySelectorAll(".encoding-type").forEach(b => b.classList.toggle("active", b.dataset.enc === encType));
    }

    function doEncode() {
        const text = encInput ? encInput.value : "";
        if (!text) { if (encOutput) encOutput.value = ""; if (encOutputInfo) encOutputInfo.textContent = ""; return; }
        let result = "", info = "";
        try {
            switch (encType) {
                case "base64":
                    result = btoa(unescape(encodeURIComponent(text)));
                    info = "Base64 编码";
                    break;
                case "url":
                    result = encodeURIComponent(text);
                    info = "URL 编码";
                    break;
                case "html":
                    result = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
                    info = "HTML 实体编码";
                    break;
                case "unicode":
                    result = Array.from(text).map(c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")).join("");
                    info = "Unicode 转义";
                    break;
            }
        } catch(e) { result = "错误: " + e.message; info = "转换失败"; }
        if (encOutput) encOutput.value = result;
        if (encOutputInfo) encOutputInfo.textContent = info + " · " + result.length + " 字符";
    }

    function doDecode() {
        const text = encInput ? encInput.value : "";
        if (!text) { if (encOutput) encOutput.value = ""; if (encOutputInfo) encOutputInfo.textContent = ""; return; }
        let result = "", info = "";
        try {
            switch (encType) {
                case "base64":
                    result = decodeURIComponent(escape(atob(text)));
                    info = "Base64 解码";
                    break;
                case "url":
                    result = decodeURIComponent(text);
                    info = "URL 解码";
                    break;
                case "html":
                    const ta = document.createElement("textarea");
                    ta.innerHTML = text;
                    result = ta.value;
                    info = "HTML 实体解码";
                    break;
                case "unicode":
                    result = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
                    info = "Unicode 解码";
                    break;
            }
        } catch(e) { result = "错误: " + e.message; info = "转换失败"; }
        if (encOutput) encOutput.value = result;
        if (encOutputInfo) encOutputInfo.textContent = info + " · " + result.length + " 字符";
    }

    document.querySelectorAll(".encoding-type").forEach(btn => {
        btn.addEventListener("click", () => { encType = btn.dataset.enc; updateEncButtons(); });
    });
    document.getElementById("btnEncEncode")?.addEventListener("click", doEncode);
    document.getElementById("btnEncDecode")?.addEventListener("click", doDecode);
    document.getElementById("btnEncClear")?.addEventListener("click", () => { if (encInput) encInput.value = ""; if (encOutput) encOutput.value = ""; if (encOutputInfo) encOutputInfo.textContent = ""; });
    document.getElementById("btnEncSwap")?.addEventListener("click", () => {
        if (!encInput || !encOutput) return;
        const tmp = encInput.value; encInput.value = encOutput.value; encOutput.value = tmp;
    });

    // ---- Timestamp ----
    const tsInput = document.getElementById("tsInput");
    const tsDateInput = document.getElementById("tsDateInput");
    const tsInputType = document.getElementById("tsInputType");

    tsInput?.addEventListener("input", updateTimestamp);
    tsInputType?.addEventListener("change", updateTimestamp);
    tsDateInput?.addEventListener("input", updateDateToTs);
    document.getElementById("btnTsNow")?.addEventListener("click", () => {
        const now = Math.floor(Date.now() / 1000);
        if (tsInput) tsInput.value = String(now);
        updateTimestamp();
    });
    document.querySelectorAll(".ts-copy-btn").forEach(btn => {
        btn.addEventListener("click", function() {
            const targetId = this.dataset.target;
            const el = document.getElementById(targetId);
            if (el && el.textContent && el.textContent !== "—") {
                navigator.clipboard.writeText(el.textContent).then(() => toast("已复制", "success")).catch(() => {});
            }
        });
    });
    if (tsDateInput) {
        const now = new Date();
        tsDateInput.value = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0") + "T" + String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0");
        updateDateToTs();
    }

    // ---- Password / UUID Generator ----
    document.querySelectorAll(".gen-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".gen-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".gen-tab-content").forEach(c => c.classList.remove("active"));
            tab.classList.add("active");
            const content = document.getElementById("gen" + tab.dataset.chtab.charAt(0).toUpperCase() + tab.dataset.chtab.slice(1));
            if (content) content.classList.add("active");
        });
    });

    const genPwLen = document.getElementById("genPwLen");
    const genPwLenVal = document.getElementById("genPwLenVal");
    genPwLen?.addEventListener("input", () => { if (genPwLenVal) genPwLenVal.textContent = genPwLen.value; });

    document.getElementById("btnGenPw")?.addEventListener("click", generatePassword);
    document.getElementById("btnGenUuid")?.addEventListener("click", generateUUID);
}
