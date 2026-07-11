/* ============================================================
   编辑器后台 · 应用逻辑
   - OAuth 握手（复用 Cloudflare Worker）
   - GitHub Contents API：列 / 读 / 改 / 删 文件
   - Monaco 编辑器 + 可拖拽侧边栏 + Ctrl+S + 未保存标记
   ============================================================ */

// ===== 配置（改仓库时改这里）=====
const CONFIG = {
  owner: "renguifeng",
  repo: "renguifeng.github.io",
  branch: "master",
  workerUrl: "https://soft-thunder-ce76.mailtoguifeng.workers.dev",
};
// 左侧文件列表显示哪些目录
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

function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(b64) {
  return decodeURIComponent(escape(atob((b64 || "").replace(/\n/g, ""))));
}
function pad(n) {
  return String(n).padStart(2, "0");
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
    headers: {
      Authorization: "Bearer " + getToken(),
      Accept: "application/vnd.github+json",
    },
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
    try {
      const e = await res.json();
      msg = e.message || msg;
    } catch (_) {}
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
  return data
    .filter((f) => f.type === "file" && f.name.endsWith(".md"))
    .sort((a, b) => b.name.localeCompare(a.name));
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

// ===== 状态 =====
let editor = null;
let currentFile = null; // { path, sha, name } 或 null（新建未保存）
let dirty = false;      // 编辑器是否有未保存改动
let tabName = "未打开文件";
let suppressDirty = false; // 加载内容时临时关闭 dirty 标记

// ===== Monaco =====
function initMonaco() {
  require.config({ paths: { vs: MONACO_CDN } });
  require(["vs/editor/editor.main"], function () {
    editor = monaco.editor.create($("editor"), {
      value: "",
      language: "markdown",
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
    editor.onDidChangeModelContent(function () {
      if (!suppressDirty) setDirty(true);
    });
    // Ctrl+S / Cmd+S 保存
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCurrent);
  });
}

// ===== tab + dirty =====
function setDirty(d) {
  dirty = d;
  refreshTab();
}
function setTabName(name) {
  tabName = name || "未打开文件";
  refreshTab();
}
function refreshTab() {
  $("active-tab").querySelector(".tab-name").textContent = (dirty ? "● " : "") + tabName;
}

// 切换/新建/打开前检查未保存
function confirmDiscard() {
  if (!dirty) return true;
  return window.confirm("当前文件有未保存的修改，放弃并切换？");
}

// ===== UI =====
function showLogin() {
  $("login-view").classList.remove("hidden");
  $("app-view").classList.add("hidden");
}

function showApp() {
  $("login-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");
  if (!editor) initMonaco();
  initResizer();
  refreshTree();
}

async function refreshTree() {
  const container = $("file-tree");
  container.innerHTML = '<div class="tree-loading">加载中…</div>';
  try {
    const results = await Promise.all(DIRS.map((d) => listDir(d.path).catch(() => [])));
    container.innerHTML = "";
    DIRS.forEach((d, i) => container.appendChild(buildGroup(d.label, results[i])));
    setActiveInTree();
  } catch (e) {
    container.innerHTML = '<div class="tree-loading">加载失败：' + e.message + "</div>";
    if (e.status === 401) toast("登录已过期，请重新登录", "error");
  }
}

function buildGroup(label, files) {
  const wrap = document.createElement("div");
  wrap.className = "tree-group";
  const h = document.createElement("div");
  h.className = "tree-group-header";
  h.textContent = label + "  (" + files.length + ")";
  h.addEventListener("click", () => wrap.classList.toggle("collapsed"));
  wrap.appendChild(h);

  const ul = document.createElement("ul");
  ul.className = "tree-files";
  if (files.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "（空）";
    ul.appendChild(li);
  }
  files.forEach((f) => {
    const li = document.createElement("li");
    li.dataset.path = f.path;
    li.dataset.sha = f.sha;
    li.addEventListener("click", (e) => {
      if (e.target.classList.contains("del-btn")) return; // 点删除不触发打开
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
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      removeFile(f.path, f.name, f.sha);
    });
    li.appendChild(del);
    ul.appendChild(li);
  });
  wrap.appendChild(ul);
  return wrap;
}

function setActiveInTree() {
  const cur = currentFile && currentFile.path;
  document.querySelectorAll(".tree-files li").forEach((li) => {
    li.classList.toggle("active", li.dataset.path === cur);
  });
}

async function openFile(path) {
  if (!confirmDiscard()) return;
  try {
    const f = await getFile(path);
    if (!f) return;
    currentFile = { path: f.path, sha: f.sha, name: f.path.split("/").pop() };
    suppressDirty = true;
    editor.setValue(f.content);
    suppressDirty = false;
    setDirty(false);
    setTabName(currentFile.name);
    setActiveInTree();
  } catch (e) {
    toast("打开失败：" + e.message, "error");
  }
}

function newFile() {
  if (!confirmDiscard()) return;
  const now = new Date();
  const ts =
    now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + " " +
    pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds()) + " +0800";
  const template =
    "---\n" +
    'title: ""\n' +
    "date: " + ts + "\n" +
    "tags: []\n" +
    "---\n\n";
  currentFile = null;
  suppressDirty = true;
  editor.setValue(template);
  suppressDirty = false;
  setDirty(true); // 预填模板视为未保存，切走会提醒
  setTabName("新建文章.md");
  setActiveInTree();
  editor.focus();
  editor.setPosition({ lineNumber: 2, column: 9 });
}

function newSlug() {
  // 精确到秒，避免短时间新建重名
  const now = new Date();
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) +
    "-" + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
}

async function removeFile(path, name, sha) {
  if (!window.confirm('确认删除 "' + name + '"？\n\n此操作不可撤销，文件会从仓库移除。')) return;
  try {
    await deleteFile(path, sha, "删除 " + name);
    toast("已删除 " + name, "success");
    if (currentFile && currentFile.path === path) {
      currentFile = null;
      suppressDirty = true;
      editor.setValue("");
      suppressDirty = false;
      setDirty(false);
      setTabName("未打开文件");
    }
    refreshTree();
  } catch (e) {
    if (e.status === 401) toast("登录已过期，请重新登录", "error");
    else toast("删除失败：" + e.message, "error");
  }
}

async function saveCurrent() {
  if (!editor) return;
  const content = editor.getValue();
  if (!content.trim()) {
    toast("内容为空", "error");
    return;
  }

  const isNew = !currentFile;
  let path, message;
  if (currentFile) {
    path = currentFile.path;
    message = "更新 " + currentFile.name;
  } else {
    path = "_posts/" + newSlug() + ".md";
    message = "新建文章";
  }

  const btn = $("save-btn");
  btn.disabled = true;
  btn.textContent = "保存中…";
  try {
    const sha = currentFile ? currentFile.sha : undefined;
    const res = await saveFile(path, content, sha, message);
    currentFile = { path: path, sha: res.content.sha, name: path.split("/").pop() };
    setTabName(currentFile.name);
    setDirty(false);
    toast("已保存 ✓ 约 1 分钟后网站更新", "success");
    refreshTree();
  } catch (e) {
    if (e.status === 401) {
      toast("登录已过期，请重新登录", "error");
    } else if (e.status === 409 || e.status === 422) {
      // 区分新建冲突 vs 更新冲突
      toast(isNew ? "文件名已存在，稍等几秒重试" : "文件已被改动，重新打开后再试", "error");
    } else {
      toast("保存失败：" + e.message, "error");
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "保存";
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  currentFile = null;
  if (editor) {
    suppressDirty = true;
    editor.setValue("");
    suppressDirty = false;
  }
  setDirty(false);
  setTabName("未打开文件");
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

  let dragging = false;
  let startX = 0;
  let startW = 0;

  resizer.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    resizer.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const w = startW + (e.clientX - startX);
    sidebar.style.width = Math.max(140, Math.min(600, w)) + "px";
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

// ===== OAuth 握手（配合已部署的 Worker）=====
function login() {
  window.addEventListener("message", onAuthMessage);
  window.open(CONFIG.workerUrl + "/auth/github", "github-oauth", "width=640,height=760");
}

function onAuthMessage(e) {
  const d = e.data;
  if (d === "authorizing:github") {
    e.source.postMessage("login", e.origin);
    return;
  }
  if (typeof d === "string" && d.indexOf("authorization:github:success:") === 0) {
    try {
      const json = d.slice("authorization:github:success:".length);
      const data = JSON.parse(json);
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
  if (getToken()) showApp();
  else showLogin();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
