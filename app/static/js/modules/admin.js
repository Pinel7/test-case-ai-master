/** Admin panel — server management dashboard. v2 */

(function () {

  let _inited = false;

  function switchAdminTab(tab) {
    document.querySelectorAll("[data-admin-tab]").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".admin-panel").forEach(p => p.classList.remove("active"));
    const tabEl = document.querySelector(`[data-admin-tab="${tab}"]`);
    if (tabEl) tabEl.classList.add("active");
    const panel = document.getElementById(`admin-panel-${tab}`);
    if (panel) panel.classList.add("active");
    // Lazy-load data
    if (tab === "overview") loadAdminOverview();
    if (tab === "users") loadAdminUsers();
    if (tab === "logs") loadAdminLogs();
    if (tab === "prompts") loadAdminPrompts();
    if (tab === "specs") loadAdminSpecs();
  }

  function escHtml(str) {
    if (!str) return "";
    const d = document.createElement("div");
    d.textContent = String(str);
    return d.innerHTML;
  }

  function formatSize(bytes) {
    if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
    if (bytes > 1024) return (bytes / 1024).toFixed(1) + " KB";
    return bytes + " B";
  }

  function showLoading(panel) {
    panel.innerHTML = '<div class="admin-loading"><div class="spinner"></div><p style="margin-top:8px;color:var(--color-text-secondary);">加载中...</p></div>';
  }

  // ====== Overview tab ======
  async function loadAdminOverview() {
    const panel = document.getElementById("admin-panel-overview");
    if (!panel) return;
    showLoading(panel);
    try {
      const data = await window.apiFetch("/api/admin/stats", { headers: window.getAuthHeaders() });
      const c = data.counts || {};
      const sizes = data.db_sizes || {};
      panel.innerHTML = `
        <div class="admin-stat-row">
          <div class="admin-stat-card"><div class="admin-stat-val">${escHtml(data.uptime)}</div><div class="admin-stat-lbl">运行时间</div></div>
          <div class="admin-stat-card"><div class="admin-stat-val">${c.users || 0}</div><div class="admin-stat-lbl">注册用户</div></div>
          <div class="admin-stat-card"><div class="admin-stat-val">${c.case_sets || 0}</div><div class="admin-stat-lbl">用例集</div></div>
          <div class="admin-stat-card"><div class="admin-stat-val">${c.bugs || 0}</div><div class="admin-stat-lbl">Bug</div></div>
          <div class="admin-stat-card"><div class="admin-stat-val">${c.notifications || 0}</div><div class="admin-stat-lbl">通知</div></div>
        </div>
        <div class="admin-section-title">数据库存储</div>
        <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>数据库</th><th>大小</th><th>记录</th></tr></thead>
          <tbody>
            <tr><td>auth.db</td><td>${formatSize(sizes.auth_db || 0)}</td><td>${c.users || 0} 用户 / ${c.sessions || 0} 会话</td></tr>
            <tr><td>library.db</td><td>${formatSize(sizes.library_db || 0)}</td><td>${c.case_sets || 0} 用例集 / ${c.bugs || 0} Bug / ${c.notifications || 0} 通知</td></tr>
            <tr><td>test_data.db</td><td>${formatSize(sizes.test_data_db || 0)}</td><td>SQL 查询数据</td></tr>
          </tbody>
        </table>
        </div>
      `;
    } catch (e) {
      panel.innerHTML = `<div class="admin-error">加载失败: ${escHtml(e.message)}</div>`;
    }
  }

  // ====== Users tab ======
  async function loadAdminUsers() {
    const panel = document.getElementById("admin-panel-users");
    if (!panel) return;
    showLoading(panel);
    try {
      const data = await window.apiFetch("/api/admin/users", { headers: window.getAuthHeaders() });
      const users = data.users || [];
      let rows = "";
      for (const u of users) {
        rows += `<tr>
          <td>${u.id}</td>
          <td><strong>${escHtml(u.username)}</strong> ${u.role === "admin" ? '<span class="admin-badge">管理员</span>' : ""}</td>
          <td>${u.case_count || 0}</td>
          <td>${u.history_count || 0}</td>
          <td>${u.session_count || 0}</td>
          <td style="font-size:0.85rem;color:var(--color-text-secondary)">${u.created_at ? escHtml(u.created_at) : "—"}</td>
          <td style="font-size:0.85rem;color:var(--color-text-secondary)">${u.last_login ? escHtml(u.last_login) : "—"}</td>
        </tr>`;
      }
      panel.innerHTML = `
        <p style="color:var(--color-text-secondary);margin-bottom:12px;">共 <strong>${users.length}</strong> 个注册用户</p>
        <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>ID</th><th>用户名</th><th>用例集</th><th>生成记录</th><th>活跃会话</th><th>注册时间</th><th>最后登录</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#666;">暂无用户</td></tr>'}</tbody>
        </table>
        </div>
      `;
    } catch (e) {
      panel.innerHTML = `<div class="admin-error">加载失败: ${escHtml(e.message)}</div>`;
    }
  }

  // ====== Logs tab ======
  async function loadAdminLogs() {
    const panel = document.getElementById("admin-panel-logs");
    if (!panel) return;
    showLoading(panel);
    try {
      const data = await window.apiFetch("/api/admin/logs", { headers: window.getAuthHeaders() });
      const logs = data.logs || [];
      let items = "";
      const actionLabels = {
        register: "注册", login: "登录", generate: "生成用例", share: "共享",
        export: "导出", delete: "删除", update: "更新",
      };
      for (const log of logs) {
        const label = actionLabels[log.action] || log.action;
        const time = window.formatTime ? window.formatTime(log.created_at) : log.created_at;
        items += `<div class="admin-log-item">
          <span class="admin-log-action admin-log-action-${log.action}">${escHtml(label)}</span>
          <span class="admin-log-user">${escHtml(log.username || "—")}</span>
          <span class="admin-log-detail">${escHtml(log.detail || "")}</span>
          <span class="admin-log-time">${escHtml(time)}</span>
        </div>`;
      }
      panel.innerHTML = items || '<p style="color:var(--color-text-secondary);text-align:center;padding:2rem 0;">暂无操作记录</p>';
    } catch (e) {
      panel.innerHTML = `<div class="admin-error">加载失败: ${escHtml(e.message)}</div>`;
    }
  }

  // ====== Prompt Management tab ======
  let _promptsData = [];
  let _selectedPromptId = null;

  function renderPromptList(prompts) {
    const panel = document.getElementById("admin-panel-prompts");
    if (!panel) return;
    const selectedId = _selectedPromptId;

    let cards = '<div class="prompt-list">';
    for (const p of prompts) {
      const active = selectedId === p.id ? ' active' : '';
      const statusDot = p.is_active ? '<span style="color:#059669;">●</span> 已启用' : '<span style="color:#999;">○</span> 已停用';
      cards += `<div class="prompt-card${active}" data-prompt-id="${p.id}">
        <div class="prompt-card-label">${escHtml(p.label || p.name)} <span style="font-weight:400;color:var(--color-text-secondary);font-size:0.8rem;">(${escHtml(p.name)})</span></div>
        <div class="prompt-card-status">${statusDot}</div>
      </div>`;
    }
    cards += '</div><div id="promptEditorArea" class="prompt-editor"></div>';
    panel.innerHTML = cards;

    // Bind click
    panel.querySelectorAll(".prompt-card").forEach(card => {
      card.addEventListener("click", () => {
        const id = parseInt(card.dataset.promptId);
        selectPrompt(id);
      });
    });
  }

  function selectPrompt(id) {
    _selectedPromptId = id;
    // Update active state on cards
    const panel = document.getElementById("admin-panel-prompts");
    panel.querySelectorAll(".prompt-card").forEach(c => c.classList.remove("active"));
    const card = panel.querySelector(`.prompt-card[data-prompt-id="${id}"]`);
    if (card) card.classList.add("active");

    const p = _promptsData.find(x => x.id === id);
    if (!p) return;

    const area = document.getElementById("promptEditorArea");
    if (!area) return;

    const isDefault = p.prompt_text === "__USE_DEFAULT__";
    const desc = escHtml(p.description || "");
    area.innerHTML = `
      <div class="prompt-info">${desc} ${isDefault ? '<span style="color:var(--color-text-secondary);">（当前使用代码默认提示词）</span>' : '<span style="color:#059669;">（已自定义）</span>'}</div>
      <textarea id="promptEditorText" spellcheck="false">${escHtml(p.prompt_text)}</textarea>
      <div class="prompt-toolbar">
        <button class="btn btn-accent btn-sm" id="btnSavePrompt"><i class="bi bi-check-lg"></i> 保存</button>
        <button class="btn btn-ghost btn-sm" id="btnResetPrompt"><i class="bi bi-arrow-counterclockwise"></i> 恢复默认</button>
        <label style="margin-left:auto;font-size:0.8rem;display:flex;align-items:center;gap:4px;cursor:pointer;">
          <input type="checkbox" id="chkPromptActive" ${p.is_active ? 'checked' : ''}> 启用
        </label>
      </div>
    `;

    document.getElementById("btnSavePrompt")?.addEventListener("click", () => savePrompt(id));
    document.getElementById("btnResetPrompt")?.addEventListener("click", () => resetPrompt(id));
  }

  async function loadAdminPrompts() {
    const panel = document.getElementById("admin-panel-prompts");
    if (!panel) return;
    showLoading(panel);
    try {
      const data = await window.apiFetch("/api/admin/prompts", { headers: window.getAuthHeaders() });
      _promptsData = data.prompts || [];
      if (_promptsData.length > 0 && !_selectedPromptId) {
        _selectedPromptId = _promptsData[0].id;
      }
      renderPromptList(_promptsData);
      if (_selectedPromptId) selectPrompt(_selectedPromptId);
    } catch (e) {
      panel.innerHTML = `<div class="admin-error">加载失败: ${escHtml(e.message)}</div>`;
    }
  }

  async function savePrompt(id) {
    const textarea = document.getElementById("promptEditorText");
    const chk = document.getElementById("chkPromptActive");
    if (!textarea) return;
    const text = textarea.value.trim();
    if (!text) { alert("提示词内容不能为空"); return; }

    const p = _promptsData.find(x => x.id === id);
    try {
      await window.apiFetch(`/api/admin/prompts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
        body: JSON.stringify({
          prompt_text: text,
          label: p?.label || "",
          description: p?.description || "",
          is_active: chk ? (chk.checked ? 1 : 0) : 1,
        }),
      });
      toast("提示词已保存", "success");
      // Reload list
      _selectedPromptId = id;
      loadAdminPrompts();
    } catch (e) {
      alert("保存失败: " + e.message);
    }
  }

  async function resetPrompt(id) {
    if (!confirm("确定恢复为代码默认提示词？自定义内容将丢失。")) return;
    try {
      await window.apiFetch(`/api/admin/prompts/${id}/reset`, {
        method: "POST",
        headers: window.getAuthHeaders(),
      });
      toast("已恢复默认", "success");
      _selectedPromptId = id;
      loadAdminPrompts();
    } catch (e) {
      alert("恢复失败: " + e.message);
    }
  }

  // ====== Specifications tab ======
  let _specsData = [];
  let _editingSpecId = null;

  async function loadAdminSpecs() {
    const panel = document.getElementById("admin-panel-specs");
    if (!panel) return;
    showLoading(panel);
    try {
      const data = await window.apiFetch("/api/admin/specs", { headers: window.getAuthHeaders() });
      _specsData = data.specs || [];
      renderSpecList();
    } catch (e) {
      panel.innerHTML = '<div class="admin-error">加载失败: ' + escHtml(e.message) + '</div>';
    }
  }

  function renderSpecList() {
    const panel = document.getElementById("admin-panel-specs");
    if (!panel) return;

    // Toolbar
    let html = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">';
    html += '<button class="btn btn-accent btn-sm" id="btnNewSpec"><i class="bi bi-plus-lg"></i> 新建规范</button>';
    html += '</div>';

    if (_specsData.length === 0) {
      html += '<p style="color:var(--color-text-secondary);text-align:center;padding:2rem 0;">暂无测试规范，点击上方按钮新建。</p>';
      panel.innerHTML = html;
      document.getElementById("btnNewSpec")?.addEventListener("click", () => openSpecEditor(null));
      return;
    }

    html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>';
    html += '<th>名称</th><th>匹配关键词</th><th>状态</th><th>更新时间</th><th>操作</th>';
    html += '</tr></thead><tbody>';
    for (const s of _specsData) {
      const activeLabel = s.is_active ? '<span style="color:#059669;">启用</span>' : '<span style="color:#999;">停用</span>';
      html += '<tr>';
      html += '<td><strong>' + escHtml(s.name) + '</strong></td>';
      html += '<td style="font-size:0.85rem;">' + escHtml(s.module_keywords || "—") + '</td>';
      html += '<td>' + activeLabel + '</td>';
      html += '<td style="font-size:0.85rem;color:var(--color-text-secondary)">' + escHtml(s.updated_at || "—") + '</td>';
      html += '<td style="white-space:nowrap;">';
      html += '<button class="btn btn-ghost btn-xs spec-edit" data-id="' + s.id + '"><i class="bi bi-pencil"></i></button> ';
      html += '<button class="btn btn-ghost btn-xs spec-delete" data-id="' + s.id + '" style="color:#dc3545;"><i class="bi bi-trash"></i></button>';
      html += '</td></tr>';
    }
    html += '</tbody></table></div>';
    panel.innerHTML = html;

    // Bind events
    document.getElementById("btnNewSpec")?.addEventListener("click", () => openSpecEditor(null));
    panel.querySelectorAll(".spec-edit").forEach(btn => {
      btn.addEventListener("click", () => openSpecEditor(parseInt(btn.dataset.id)));
    });
    panel.querySelectorAll(".spec-delete").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("确定删除该规范？")) return;
        try {
          await window.apiFetch("/api/admin/specs/" + btn.dataset.id, { method: "DELETE", headers: window.getAuthHeaders() });
          toast("已删除", "success");
          loadAdminSpecs();
        } catch (e) { alert("删除失败: " + e.message); }
      });
    });
  }

  function openSpecEditor(specId) {
    _editingSpecId = specId;
    const spec = specId ? _specsData.find(s => s.id === specId) : null;
    const isNew = !spec;

    const panel = document.getElementById("admin-panel-specs");
    if (!panel) return;

    // Build form overlay
    const formHtml = '<div class="spec-editor-overlay" style="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">' +
      '<div class="spec-editor" style="background:var(--color-bg-primary);border-radius:12px;padding:24px;width:700px;max-width:90vw;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
      '<h4 style="margin-bottom:16px;">' + (isNew ? "新建测试规范" : "编辑测试规范") + '</h4>' +
      '<div class="mb-3"><label class="form-label">规范名称</label>' +
      '<input type="text" id="specEditorName" class="form-control" placeholder="如：登录模块测试规范" value="' + escHtml(spec ? spec.name : "") + '"></div>' +
      '<div class="mb-3"><label class="form-label">匹配关键词 <small class="text-muted">(逗号分隔)</small></label>' +
      '<input type="text" id="specEditorKeywords" class="form-control" placeholder="如：登录,注册,认证,密码" value="' + escHtml(spec ? spec.module_keywords : "") + '"></div>' +
      (isNew ? '' : '<div class="mb-3"><label class="form-check-label"><input type="checkbox" id="specEditorActive" ' + (spec.is_active ? "checked" : "") + '> 启用</label></div>') +
      '<div class="mb-3"><label class="form-label">规范内容</label>' +
      '<textarea id="specEditorContent" class="form-control" rows="15" style="font-family:monospace;font-size:0.85rem;white-space:pre-wrap;">' + escHtml(spec ? spec.content : "") + '</textarea></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
      '<button class="btn btn-ghost" id="btnSpecCancel">取消</button>' +
      '<button class="btn btn-accent" id="btnSpecSave"><i class="bi bi-check-lg"></i> 保存</button></div></div></div>';

    const overlay = document.createElement("div");
    overlay.id = "specEditorOverlay";
    overlay.innerHTML = formHtml;
    document.body.appendChild(overlay);

    document.getElementById("btnSpecCancel")?.addEventListener("click", closeSpecEditor);
    document.getElementById("btnSpecSave")?.addEventListener("click", () => saveSpec());
    // Close on overlay click
    overlay.addEventListener("click", e => { if (e.target === overlay) closeSpecEditor(); });
  }

  function closeSpecEditor() {
    const el = document.getElementById("specEditorOverlay");
    if (el) { el.remove(); }
  }

  async function saveSpec() {
    const name = document.getElementById("specEditorName")?.value.trim();
    if (!name) { alert("请输入规范名称"); return; }
    const keywords = document.getElementById("specEditorKeywords")?.value.trim() || "";
    const content = document.getElementById("specEditorContent")?.value.trim();
    if (!content) { alert("请输入规范内容"); return; }
    const isActive = document.getElementById("specEditorActive")?.checked ? 1 : 1;

    try {
      if (_editingSpecId) {
        await window.apiFetch("/api/admin/specs/" + _editingSpecId, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
          body: JSON.stringify({ name, module_keywords: keywords, content, is_active: isActive }),
        });
        toast("规范已更新", "success");
      } else {
        await window.apiFetch("/api/admin/specs", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
          body: JSON.stringify({ name, module_keywords: keywords, content }),
        });
        toast("规范已创建", "success");
      }
      closeSpecEditor();
      loadAdminSpecs();
    } catch (e) {
      alert("保存失败: " + e.message);
    }
  }

  // ====== Maintenance tab ======
  function initMaintenanceTab() {
    const panel = document.getElementById("admin-panel-maintenance");
    if (!panel) return;

    // Get token from localStorage
    const token = localStorage.getItem("itg_auth_token");
    if (!token) {
      panel.innerHTML = '<div class="admin-error">请先登录</div>';
      return;
    }

    const resultDiv = panel.querySelector("#adminMaintResult");

    panel.querySelector("#adminBtnBackup")?.addEventListener("click", async function () {
      try {
        const resp = await fetch("/admin/backup", {
          headers: { "Authorization": "Bearer " + token }
        });
        if (!resp.ok) throw new Error("下载失败");
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "testcase-ai-backup_" + new Date().toISOString().slice(0, 19).replace(/[:-]/g, "").replace("T", "_") + ".tar.gz";
        a.click();
        URL.revokeObjectURL(url);
        if (resultDiv) resultDiv.innerHTML = '<span class="text-success">✓ 备份下载完成</span>';
      } catch (e) {
        if (resultDiv) resultDiv.innerHTML = '<span class="text-danger">✗ ' + escHtml(e.message) + '</span>';
      }
    });

    panel.querySelector("#adminBtnClearSessions")?.addEventListener("click", async function () {
      if (!confirm("确定清理过期会话？不影响当前在线用户。")) return;
      try {
        const data = await window.apiFetch("/admin/clear-sessions", { method: "POST", headers: window.getAuthHeaders() });
        if (resultDiv) resultDiv.innerHTML = '<span class="text-success">✓ ' + escHtml(data.message) + '</span>';
      } catch (e) {
        if (resultDiv) resultDiv.innerHTML = '<span class="text-danger">✗ ' + escHtml(e.message) + '</span>';
      }
    });
  }

  // ====== Init ======
  function initAdminPage() {
    const page = document.getElementById("page-admin");
    if (!page || !page.classList.contains("active")) return;
    if (_inited) {
      // Re-load active tab data
      const activeTab = document.querySelector("[data-admin-tab].active");
      if (activeTab) switchAdminTab(activeTab.dataset.adminTab);
      return;
    }
    _inited = true;

    // Bind tab clicks
    document.querySelectorAll("[data-admin-tab]").forEach(tab => {
      tab.addEventListener("click", () => {
        switchAdminTab(tab.dataset.adminTab);
        window.location.hash = "admin-" + tab.dataset.adminTab;
      });
    });

    // Read hash for initial tab
    const hash = window.location.hash.replace("#admin-", "");
    const initialTab = hash && document.querySelector(`[data-admin-tab="${hash}"]`) ? hash : "overview";
    switchAdminTab(initialTab);

    // Init maintenance tab actions
    initMaintenanceTab();
  }

  window.initAdminPage = initAdminPage;

})();
