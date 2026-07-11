/* ============================================================
   文章管理后台
   - 缓存层（加载 _posts 正文，供搜索/标签）
   - 多 model tab（每文件独立 model，保留撤销/光标）
   - 文件名+正文搜索、标签分类、Ctrl+P、右键菜单
   ============================================================ */

// ===== 配置（改仓库时改这里）=====
const CONFIG = {
  owner: "renguifeng",
  repo: "renguifeng.github.io",
  branch: "master",
  workerUrl: "https://soft-thunder-ce76.mailtoguifeng.workers.dev",
};
const DIRS = [
  { path: "_posts",  label: "_posts · 文章" },
  { path: "_drafts", label: "_drafts · 草稿" },
];
const API = "https://api.github.com";
const TOKEN_KEY = "gh_editor_token";
const WIDTH_KEY = "editor_sidebar_width";
const MONACO_CDN = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs";

// ===== 工具 =====
const $ = (id) => document.getElementById(id);
const getToken = () => localStorage.getItem(TOKEN_KEY);
function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64decode(b64) { return decodeURIComponent(escape(atob((b64 || "").replace(/\n/g, "")))); }
function pad(n) { return String(n).padStart(2, "0"); }
function debounce(fn, ms) {
  let t;
  return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function toast(msg, type) {
  const el = $("toast");
  el.textContent = msg;
  el.className = "toast" + (type ? " " + type : "");
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 3000);
}

// ===== GitHub Contents API =====
async function gh(path, method, body) {
  const opts = {
    method: method || "GET",
    headers: { Authorization: "Bearer " + getToken(), Accept: "application/vnd.github+json" },
  };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const url = API + "/repos/" + CONFIG.owner + "/" + CONFIG.repo + "/contents/" + path + "?ref=" + CONFIG.branch;
  const res = await fetch(url, opts);
  if (res.status === 404) return null;
  if (!res.ok) {
    let msg = "HTTP " + res.status;
    try { const e = await res.json(); msg = e.message || msg; } catch (_) {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}
async function listDir(dir) {
  const data = await gh(dir);
  if (!Array.isArray(data)) return [];
  return data.filter((f) => f.type === "file" && f.name.endsWith(".md")).sort((a, b) => b.name.localeCompare(a.name));
}
async function getFile(path) {
  const data = await gh(path);
  if (!data || data.type !== "file") return null;
  return { path: data.path, sha: data.sha, content: b64decode(data.content) };
}
async function saveFile(path, content, sha, message) {
  const body = { message: message, content: b64encode(content), branch: CONFIG.branch };
  if (sha) body.sha = sha;
  return gh(path, "PUT", body);
}
async function deleteFile(path, sha, message) {
  return gh(path, "DELETE", { message: message, sha: sha, branch: CONFIG.branch });
}
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { title: "", tags: [] };
  const fm = m[1];
  const title = (fm.match(/^title:\s*"?(.*?)"?\s*$/m) || [])[1] || "";
  const tagsLine = (fm.match(/^tags:\s*\[(.*)\]/m) || [])[1] || "";
  const tags = tagsLine.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  return { title: title, tags: tags };
}

// ===== 缓存层（搜索/标签用）=====
const fileCache = new Map(); // path -> {path, name, sha, content, title, tags}
let cacheStatus = "idle";    // idle | loading | ready
async function loadCache() {
  if (cacheStatus !== "idle") return;
  cacheStatus = "loading";
  if (!searchQuery && currentView === "tags") renderSidebar();
  try {
    const files = await listDir("_posts");
    const entries = await Promise.all(
      files.map((f) => getFile(f.path).then((d) => (d ? { meta: f, data: d } : null)))
    );
    fileCache.clear();
    entries.filter(Boolean).forEach(({ meta, data }) => {
      const fm = parseFrontmatter(data.content);
      fileCache.set(data.path, {
        path: data.path, name: meta.name, sha: data.sha,
        content: data.content, title: fm.title, tags: fm.tags,
      });
    });
    cacheStatus = "ready";
  } catch (e) {
    cacheStatus = "idle";
    console.warn("缓存加载失败", e);
  }
  if (!searchQuery) renderSidebar();
}

// ===== Tab 层（多 model）=====
let editor = null;
let emptyModel = null;
let openTabs = [];               // [{path, name, sha, model, dirty, viewState, isNew}]
let activePath = null;
let untitledSeq = 0;

function findTab(path) { return openTabs.find((t) => t.path === path); }
function activeTab() { return openTabs.find((t) => t.path === activePath); }

function setTabDirty(tab, d) {
  if (tab.dirty === d) return;
  tab.dirty = d;
  refreshTabBar();
}

async function openFile(path) {
  if (!editor) { toast("编辑器加载中，稍候", "error"); return; }
  const existing = findTab(path);
  if (existing) { switchTab(path); return; }
  try {
    const f = await getFile(path);
    if (!f) return;
    const model = monaco.editor.createModel(f.content, "markdown");
    const tab = { path: f.path, name: f.path.split("/").pop(), sha: f.sha, model: model, dirty: false, viewState: null, isNew: false };
    model.onDidChangeContent(() => setTabDirty(tab, true));
    model.updateOptions({ tabSize: 2 });
    openTabs.push(tab);
    switchTab(f.path);
    refreshTabBar();
  } catch (e) {
    toast("打开失败：" + e.message, "error");
  }
}

function switchTab(path) {
  const tab = findTab(path);
  if (!tab || !editor) return;
  const cur = activeTab();
  if (cur) cur.viewState = editor.saveViewState();
  activePath = path;
  editor.setModel(tab.model);
  if (tab.viewState) editor.restoreViewState(tab.viewState);
  editor.focus();
  refreshTabBar();
  setActiveInTree();
}

function closeTab(path, force) {
  const idx = openTabs.findIndex((t) => t.path === path);
  if (idx < 0) return;
  const tab = openTabs[idx];
  if (tab.dirty && !force) {
    if (!window.confirm('"' + tab.name + '" 有未保存修改，确认关闭？')) return;
  }
  if (tab.model) tab.model.dispose();
  openTabs.splice(idx, 1);
  if (activePath === path) {
    const next = openTabs[idx] || openTabs[idx - 1] || null;
    if (next) switchTab(next.path);
    else {
      activePath = null;
      if (editor) editor.setModel(emptyModel);
      refreshTabBar();
    }
  } else {
    refreshTabBar();
  }
}
function closeOthers(path) { openTabs.filter((t) => t.path !== path).map((t) => t.path).forEach((p) => closeTab(p, false)); }
function closeAll() { openTabs.map((t) => t.path).forEach((p) => closeTab(p, false)); }
function closeSaved() { openTabs.filter((t) => !t.dirty).map((t) => t.path).forEach((p) => closeTab(p, true)); }

function newFile() {
  if (!editor) { toast("编辑器加载中，稍候", "error"); return; }
  const id = "untitled:" + (++untitledSeq);
  const now = new Date();
  const ts = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + " " +
    pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds()) + " +0800";
  const template = "---\n" + 'title: ""\n' + "date: " + ts + "\n" + "tags: []\n" + "---\n\n";
  const model = monaco.editor.createModel(template, "markdown");
  const tab = { path: id, name: "新建文章.md", sha: null, model: model, dirty: true, viewState: null, isNew: true };
  model.onDidChangeContent(() => setTabDirty(tab, true));
  model.updateOptions({ tabSize: 2 });
  openTabs.push(tab);
  switchTab(id);
  refreshTabBar();
  editor.focus();
  editor.setPosition({ lineNumber: 2, column: 9 });
}

function newSlug() {
  const now = new Date();
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) +
    "-" + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
}

async function saveCurrent() {
  const tab = activeTab();
  if (!tab) { toast("没有打开的文件", "error"); return; }
  const content = tab.model.getValue();
  if (!content.trim()) { toast("内容为空", "error"); return; }

  const isNew = tab.isNew;
  let path, message;
  if (isNew) {
    path = "_posts/" + newSlug() + ".md";
    message = "新建文章";
  } else {
    path = tab.path;
    message = "更新 " + tab.name;
  }

  const btn = $("save-btn");
  btn.disabled = true;
  btn.textContent = "保存中…";
  try {
    const sha = isNew ? undefined : tab.sha;
    const res = await saveFile(path, content, sha, message);
    const oldPath = tab.path;
    tab.path = path;
    tab.sha = res.content.sha;
    tab.name = path.split("/").pop();
    tab.isNew = false;
    setTabDirty(tab, false);
    if (activePath === oldPath) activePath = path;
    // 更新缓存
    const fm = parseFrontmatter(content);
    fileCache.set(path, { path: path, name: tab.name, sha: tab.sha, content: content, title: fm.title, tags: fm.tags });
    refreshTabBar();
    renderSidebar();
    toast("已保存 ✓ 约 1 分钟后网站更新", "success");
  } catch (e) {
    if (e.status === 401) toast("登录已过期，请重新登录", "error");
    else if (e.status === 409 || e.status === 422)
      toast(isNew ? "文件名已存在，稍等几秒重试" : "文件已被改动，重新打开后再试", "error");
    else toast("保存失败：" + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "保存";
  }
}

async function removeFile(path, name, sha) {
  if (!window.confirm('确认删除 "' + name + '"？\n\n此操作不可撤销，文件会从仓库移除。')) return;
  try {
    await deleteFile(path, sha, "删除 " + name);
    toast("已删除 " + name, "success");
    if (findTab(path)) closeTab(path, true);
    fileCache.delete(path);
    renderSidebar();
  } catch (e) {
    if (e.status === 401) toast("登录已过期，请重新登录", "error");
    else toast("删除失败：" + e.message, "error");
  }
}

// ===== Monaco =====
function initMonaco() {
  require.config({ paths: { vs: MONACO_CDN } });
  require(["vs/editor/editor.main"], function () {
    emptyModel = monaco.editor.createModel("", "markdown");
    editor = monaco.editor.create($("editor"), {
      model: emptyModel,
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
      lineNumbers: "on",
      wordWrap: "on",
      scrollBeyondLastLine: false,
      padding: { top: 12 },
      tabSize: 2,
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCurrent);
    refreshTabBar();
  });
}

// ===== UI：tab 栏 =====
function refreshTabBar() {
  const bar = $("tab-bar");
  bar.innerHTML = "";
  if (openTabs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tab-bar-empty";
    empty.textContent = "未打开文件 — 左栏点文件，或点右上 + 新建";
    bar.appendChild(empty);
    return;
  }
  openTabs.forEach((tab) => {
    const el = document.createElement("div");
    el.className = "tab" + (activePath === tab.path ? " active" : "") + (tab.dirty ? " dirty" : "");
    const name = document.createElement("span");
    name.className = "tab-name";
    name.textContent = tab.name;
    el.appendChild(name);
    const close = document.createElement("button");
    close.className = "tab-close";
    close.title = "关闭";
    close.textContent = "×";
    close.addEventListener("click", (e) => { e.stopPropagation(); closeTab(tab.path); });
    el.appendChild(close);
    el.addEventListener("click", () => switchTab(tab.path));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      switchTab(tab.path);
      showTabContextMenu(e.clientX, e.clientY, tab);
    });
    bar.appendChild(el);
  });
}

// ===== 右键菜单 =====
function showTabContextMenu(x, y, tab) {
  showContextMenu(x, y, [
    { label: "关闭", action: () => closeTab(tab.path) },
    { label: "关闭其他", action: () => closeOthers(tab.path) },
    { label: "关闭全部", action: closeAll },
    { hr: true },
    { label: "关闭已保存的", action: closeSaved },
  ]);
}
function showContextMenu(x, y, items) {
  const menu = $("context-menu");
  menu.innerHTML = "";
  items.forEach((it) => {
    if (it.hr) { menu.appendChild(document.createElement("hr")); return; }
    const btn = document.createElement("button");
    btn.textContent = it.label;
    if (it.disabled) btn.disabled = true;
    btn.addEventListener("click", () => { hideContextMenu(); it.action(); });
    menu.appendChild(btn);
  });
  // 防溢出屏幕
  menu.classList.remove("hidden");
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = left + "px";
  menu.style.top = top + "px";
}
function hideContextMenu() { $("context-menu").classList.add("hidden"); }

// ===== 左栏渲染 =====
let currentView = "files"; // files | tags
let searchQuery = "";

function renderSidebar() {
  if (searchQuery) { renderSearchResults(searchQuery); return; }
  if (currentView === "tags") renderTagsView();
  else renderFileTree();
}

async function renderFileTree() {
  const c = $("sidebar-content");
  c.innerHTML = '<div class="tree-loading">加载中…</div>';
  try {
    const results = await Promise.all(DIRS.map((d) => listDir(d.path).catch(() => [])));
    c.innerHTML = "";
    DIRS.forEach((d, i) => c.appendChild(buildFileGroup(d.label, results[i])));
    setActiveInTree();
  } catch (e) {
    c.innerHTML = '<div class="tree-loading">加载失败：' + escapeHtml(e.message) + "</div>";
    if (e.status === 401) toast("登录已过期，请重新登录", "error");
  }
}

function buildFileGroup(label, files) {
  const wrap = document.createElement("div");
  wrap.className = "tree-group";
  const h = document.createElement("div");
  h.className = "tree-group-header";
  h.textContent = label + "  (" + files.length + ")";
  h.addEventListener("click", () => wrap.classList.toggle("collapsed"));
  wrap.appendChild(h);
  const ul = document.createElement("ul");
  ul.className = "tree-files";
  if (!files.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "（空）";
    ul.appendChild(li);
  }
  files.forEach((f) => {
    const li = document.createElement("li");
    li.dataset.path = f.path;
    li.dataset.sha = f.sha;
    if (activePath === f.path) li.classList.add("active");
    li.addEventListener("click", (e) => {
      if (e.target.classList.contains("del-btn")) return;
      openFile(f.path);
    });
    const name = document.createElement("span");
    name.className = "fname";
    name.textContent = f.name.replace(/\.md$/, "");
    li.appendChild(name);
    const del = document.createElement("button");
    del.className = "del-btn";
    del.title = "删除";
    del.textContent = "×";
    del.addEventListener("click", (e) => { e.stopPropagation(); removeFile(f.path, f.name, f.sha); });
    li.appendChild(del);
    ul.appendChild(li);
  });
  wrap.appendChild(ul);
  return wrap;
}

function setActiveInTree() {
  document.querySelectorAll(".tree-files li[data-path]").forEach((li) => {
    li.classList.toggle("active", li.dataset.path === activePath);
  });
}

function renderTagsView() {
  const c = $("sidebar-content");
  if (cacheStatus !== "ready") {
    c.innerHTML = '<div class="tree-loading">索引中… 正在加载文章内容</div>';
    return;
  }
  const tagMap = new Map();
  fileCache.forEach((e) => {
    e.tags.forEach((t) => {
      if (!tagMap.has(t)) tagMap.set(t, []);
      tagMap.get(t).push(e);
    });
  });
  const tags = Array.from(tagMap.keys()).sort();
  c.innerHTML = "";
  if (tags.length === 0) {
    c.innerHTML = '<div class="tree-loading">还没有带标签的文章</div>';
    return;
  }
  tags.forEach((tag) => {
    const entries = tagMap.get(tag);
    const wrap = document.createElement("div");
    wrap.className = "tag-group";
    const h = document.createElement("div");
    h.className = "tag-group-header";
    h.textContent = tag;
    const cnt = document.createElement("span");
    cnt.className = "count";
    cnt.textContent = "(" + entries.length + ")";
    h.appendChild(cnt);
    h.addEventListener("click", () => wrap.classList.toggle("collapsed"));
    wrap.appendChild(h);
    const ul = document.createElement("ul");
    ul.className = "tag-files";
    entries.forEach((e) => {
      const li = document.createElement("li");
      li.textContent = e.title || e.name.replace(/\.md$/, "");
      li.title = e.path;
      li.addEventListener("click", () => openFile(e.path));
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    c.appendChild(wrap);
  });
}

function renderSearchResults(query) {
  const c = $("sidebar-content");
  const q = query.toLowerCase();
  c.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "search-results";
  const header = document.createElement("div");
  header.className = "sr-header";

  if (cacheStatus !== "ready") {
    header.textContent = "索引中… 请稍候再搜";
    wrap.appendChild(header);
    c.appendChild(wrap);
    return;
  }

  const results = [];
  fileCache.forEach((e) => {
    const inName = e.name.toLowerCase().indexOf(q) >= 0 || (e.title && e.title.toLowerCase().indexOf(q) >= 0);
    const inContent = e.content.toLowerCase().indexOf(q) >= 0;
    if (inName || inContent) results.push({ entry: e, inContent: inContent });
  });

  header.textContent = "找到 " + results.length + " 篇";
  wrap.appendChild(header);

  results.forEach((r) => {
    const e = r.entry;
    const item = document.createElement("div");
    item.style.padding = "6px 12px";
    item.style.cursor = "pointer";
    const name = document.createElement("div");
    name.className = "sr-name";
    name.innerHTML = highlight(e.title || e.name.replace(/\.md$/, ""), q);
    item.appendChild(name);
    if (r.inContent) {
      const prev = document.createElement("div");
      prev.className = "sr-preview";
      const idx = e.content.toLowerCase().indexOf(q);
      const start = Math.max(0, idx - 20);
      const snippet = e.content.substring(start, idx + query.length + 30).replace(/\n+/g, " ").trim();
      prev.innerHTML = "…" + highlight(snippet, q) + "…";
      item.appendChild(prev);
    }
    item.addEventListener("mouseenter", () => { item.style.background = "#2a2d2e"; });
    item.addEventListener("mouseleave", () => { item.style.background = ""; });
    item.addEventListener("click", () => openFile(e.path));
    wrap.appendChild(item);
  });
  c.appendChild(wrap);
}

function highlight(text, q) {
  if (!q) return escapeHtml(text);
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) return escapeHtml(text);
  return escapeHtml(text.substring(0, idx)) + "<mark>" + escapeHtml(text.substring(idx, idx + q.length)) + "</mark>" + escapeHtml(text.substring(idx + q.length));
}

// ===== 视图/搜索 =====
function switchView(name) {
  currentView = name;
  $("view-files-btn").classList.toggle("active", name === "files");
  $("view-tags-btn").classList.toggle("active", name === "tags");
  renderSidebar();
}
const onSearchInput = debounce(function () {
  searchQuery = $("search-input").value.trim();
  renderSidebar();
}, 150);

// ===== 登录视图 =====
function showLogin() {
  $("login-view").classList.remove("hidden");
  $("app-view").classList.add("hidden");
}
function showApp() {
  $("login-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");
  if (!editor) initMonaco();
  initResizer();
  renderFileTree();
  loadCache();
}
function logout() {
  openTabs.forEach((t) => { if (t.model) t.model.dispose(); });
  openTabs = [];
  activePath = null;
  fileCache.clear();
  cacheStatus = "idle";
  searchQuery = "";
  if ($("search-input")) $("search-input").value = "";
  localStorage.removeItem(TOKEN_KEY);
  if (editor && emptyModel) editor.setModel(emptyModel);
  refreshTabBar();
  showLogin();
  toast("已登出");
}

// ===== 可拖拽侧边栏 =====
function initResizer() {
  if (initResizer._done) return;
  initResizer._done = true;
  const resizer = $("resizer");
  const sidebar = $("sidebar");
  const saved = parseInt(localStorage.getItem(WIDTH_KEY), 10);
  if (saved && saved >= 140 && saved <= 600) sidebar.style.width = saved + "px";
  let dragging = false, startX = 0, startW = 0;
  resizer.addEventListener("mousedown", (e) => {
    dragging = true; startX = e.clientX; startW = sidebar.offsetWidth;
    resizer.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    sidebar.style.width = Math.max(140, Math.min(600, startW + e.clientX - startX)) + "px";
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    localStorage.setItem(WIDTH_KEY, String(sidebar.offsetWidth));
  });
}

// ===== OAuth 握手 =====
function login() {
  window.addEventListener("message", onAuthMessage);
  window.open(CONFIG.workerUrl + "/auth/github", "github-oauth", "width=640,height=760");
}
function onAuthMessage(e) {
  const d = e.data;
  if (d === "authorizing:github") { e.source.postMessage("login", e.origin); return; }
  if (typeof d === "string" && d.indexOf("authorization:github:success:") === 0) {
    try {
      const data = JSON.parse(d.slice("authorization:github:success:".length));
      if (!data.token) throw new Error("无 token");
      localStorage.setItem(TOKEN_KEY, data.token);
      window.removeEventListener("message", onAuthMessage);
      showApp();
      toast("登录成功", "success");
    } catch (err) {
      toast("登录失败：解析 token 出错", "error");
    }
  }
}

// ===== 初始化 =====
function init() {
  $("login-btn").addEventListener("click", login);
  $("new-btn").addEventListener("click", newFile);
  $("save-btn").addEventListener("click", saveCurrent);
  $("logout-btn").addEventListener("click", logout);
  $("search-input").addEventListener("input", onSearchInput);
  $("view-files-btn").addEventListener("click", () => switchView("files"));
  $("view-tags-btn").addEventListener("click", () => switchView("tags"));
  // Ctrl+P 聚焦搜索（拦截浏览器打印）
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P") && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const s = $("search-input");
      s.focus();
      s.select();
    }
  });
  // 右键菜单外部关闭
  document.addEventListener("click", hideContextMenu);
  document.addEventListener("scroll", hideContextMenu, true);
  if (getToken()) showApp();
  else showLogin();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
