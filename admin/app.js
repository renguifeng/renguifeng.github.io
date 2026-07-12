/* ============================================================
   文章管理后台
   - 缓存层 / 多 model tab / 搜索 / 标签 / 右键菜单
   - 图片拖拽粘贴上传 / 本地草稿防丢失
   - Markdown 快捷键 / 字数统计
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
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function toast(msg, type) {
  const el = $("toast");
  el.textContent = msg;
  el.className = "toast" + (type ? " " + type : "");
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 3000);
}
function setStatusInfo(msg) { const el = $("status-info"); if (el) el.textContent = msg || ""; }

// ===== GitHub Contents API =====
async function gh(path, method, body) {
  const opts = {
    method: method || "GET",
    headers: { Authorization: "Bearer " + getToken(), Accept: "application/vnd.github+json" },
  };
  if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
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
  const empty = { title: "", tags: [], category: "", published: true, date: "", excerpt: "" };
  if (!m) return empty;
  // 优先用 js-yaml 解析(支持任意字段、多行、引号);CDN 不可用或 YAML 非法时降级正则
  if (typeof jsyaml !== "undefined") {
    try {
      const obj = jsyaml.load(m[1]) || {};
      const tags = Array.isArray(obj.tags)
        ? obj.tags.map(String).filter(Boolean)
        : typeof obj.tags === "string" && obj.tags.trim() ? [obj.tags.trim()] : [];
      return {
        title: obj.title != null ? String(obj.title) : "",
        tags: tags,
        category: obj.category != null ? String(obj.category) : "",
        published: obj.published !== false, // 缺省视为已发布
        date: obj.date != null ? String(obj.date) : "",
        excerpt: obj.excerpt != null ? String(obj.excerpt) : "",
      };
    } catch (e) { /* 解析失败,走降级 */ }
  }
  const fm = m[1];
  const title = (fm.match(/^title:\s*"?(.*?)"?\s*$/m) || [])[1] || "";
  const tagsLine = (fm.match(/^tags:\s*\[(.*)\]/m) || [])[1] || "";
  const tags = tagsLine.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const cat = (fm.match(/^category:\s*"?(.*?)"?\s*$/m) || [])[1] || "";
  return { title: title, tags: tags, category: cat, published: true, date: "", excerpt: "" };
}

// ===== 图片上传 =====
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("读取文件失败"));
    r.readAsDataURL(file);
  });
}
async function uploadImage(file) {
  const m = (file.name || "").match(/\.(\w+)$/);
  const ext = m ? m[1].toLowerCase() : "png";
  const filename = newSlug() + "." + ext;
  const ghPath = "images/uploads/" + filename;
  const dataUrl = await readFileAsDataURL(file);
  const base64 = dataUrl.split(",")[1]; // 图片二进制的 base64，直接给 GitHub
  await gh(ghPath, "PUT", { message: "上传图片 " + filename, content: base64, branch: CONFIG.branch });
  return "/images/uploads/" + filename;
}
async function uploadAndInsert(file) {
  if (!editor) return;
  setStatusInfo("上传图片中…");
  try {
    const url = await uploadImage(file);
    const sel = editor.getSelection();
    editor.executeEdits("insert-image", [{ range: sel, text: "![](" + url + ")", forceMoveMarkers: true }]);
    editor.focus();
    toast("图片已插入", "success");
  } catch (e) {
    toast(e.status === 401 ? "登录已过期，请重新登录" : "图片上传失败：" + e.message, "error");
  } finally {
    setStatusInfo("");
  }
}
function onEditorPaste(e) {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.type && it.type.indexOf("image/") === 0) {
      const file = it.getAsFile();
      if (file) { e.preventDefault(); e.stopImmediatePropagation(); uploadAndInsert(file); }
      return;
    }
  }
}
function onEditorDragOver(e) {
  if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).indexOf("Files") >= 0) e.preventDefault();
}
function onEditorDrop(e) {
  const files = e.dataTransfer && e.dataTransfer.files;
  if (!files || !files.length) return;
  const img = Array.from(files).find((f) => f.type && f.type.indexOf("image/") === 0);
  if (img) { e.preventDefault(); e.stopImmediatePropagation(); uploadAndInsert(img); }
}

// ===== 媒体库 =====
const RAW_BASE = "https://raw.githubusercontent.com/" + CONFIG.owner + "/" + CONFIG.repo + "/" + CONFIG.branch + "/";
const CDN_BASE = "https://cdn.jsdelivr.net/gh/" + CONFIG.owner + "/" + CONFIG.repo + "@" + CONFIG.branch + "/";
const IMG_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
function thumbUrl(path) { return CDN_BASE + path; } // 优先 jsdelivr(有缓存更快)
function buildMediaCell(f) {
  const cell = document.createElement("div");
  cell.className = "media-cell";
  const img = document.createElement("img");
  img.src = thumbUrl(f.path);
  img.alt = f.name; img.loading = "lazy";
  img.onerror = function () { if (this.src.indexOf(RAW_BASE) < 0) this.src = RAW_BASE + f.path; }; // 回退 raw
  cell.appendChild(img);
  const info = document.createElement("div");
  info.className = "media-info";
  info.textContent = f.name;
  info.title = f.name;
  cell.appendChild(info);
  const actions = document.createElement("div");
  actions.className = "media-actions";
  const ins = document.createElement("button");
  ins.className = "btn-ghost"; ins.textContent = "插入";
  ins.addEventListener("click", (e) => { e.stopPropagation(); insertImageUrl(f.path); });
  actions.appendChild(ins);
  const del = document.createElement("button");
  del.className = "btn-ghost"; del.textContent = "删";
  del.addEventListener("click", (e) => { e.stopPropagation(); deleteMedia(f.path, f.name, f.sha, cell); });
  actions.appendChild(del);
  cell.appendChild(actions);
  return cell;
}
async function openMediaLib() {
  const modal = $("media-modal");
  modal.classList.remove("hidden");
  const grid = $("media-grid");
  grid.innerHTML = '<div class="tree-loading">加载中…</div>';
  try {
    let files = await gh("images/uploads");
    if (!Array.isArray(files)) files = [];
    files = files.filter((f) => f.type === "file" && IMG_RE.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
    grid.innerHTML = "";
    if (!files.length) { grid.innerHTML = '<div class="tree-loading">还没有图片,点上方选择文件上传</div>'; return; }
    files.forEach((f) => grid.appendChild(buildMediaCell(f)));
  } catch (e) {
    grid.innerHTML = (e.status === 404)
      ? '<div class="tree-loading">还没有图片,点上方选择文件上传</div>'
      : '<div class="tree-loading">加载失败：' + escapeHtml(e.message) + "</div>";
  }
}
function insertImageUrl(path) {
  if (!editor) return;
  const sel = editor.getSelection();
  editor.executeEdits("insert-image", [{ range: sel, text: "![](/" + path + ")", forceMoveMarkers: true }]);
  editor.focus();
  toast("已插入图片", "success");
}
async function deleteMedia(path, name, sha, cell) {
  if (!window.confirm('删除图片 "' + name + '"？\n\n引用它的文章会显示裂图,此操作不可撤销。')) return;
  try {
    await deleteFile(path, sha, "删除图片 " + name);
    cell.remove();
    toast("已删除 " + name, "success");
  } catch (e) {
    toast(e.status === 401 ? "登录已过期，请重新登录" : "删除失败：" + e.message, "error");
  }
}
function closeMediaLib() { $("media-modal").classList.add("hidden"); }

// ===== 本地草稿（防丢失）=====
function draftKey(path) { return "draft:" + path; }
function saveDraft(tab) {
  try { localStorage.setItem(draftKey(tab.path), tab.model.getValue()); } catch (e) {}
}
const draftTimers = new Map();
function saveDraftDebounced(tab) {
  const key = tab.path;
  clearTimeout(draftTimers.get(key));
  draftTimers.set(key, setTimeout(() => { saveDraft(tab); draftTimers.delete(key); }, 800));
}
function getDraft(path) { try { return localStorage.getItem(draftKey(path)); } catch (e) { return null; } }
function clearDraft(path) { try { localStorage.removeItem(draftKey(path)); } catch (e) {} }

// ===== Markdown 编辑辅助 =====
function toggleWrap(symbol) {
  if (!editor) return;
  editor.pushUndoStop();
  const sel = editor.getSelection();
  const model = editor.getModel();
  const text = model.getValueInRange(sel);
  const sl = symbol.length;
  let out;
  if (text.length >= sl * 2 && text.substring(0, sl) === symbol && text.substring(text.length - sl) === symbol) {
    out = text.substring(sl, text.length - sl);
  } else {
    out = symbol + text + symbol;
  }
  editor.executeEdits("md", [{ range: sel, text: out }]);
  editor.pushUndoStop();
  editor.focus();
}
function toggleHeading(level) {
  if (!editor) return;
  editor.pushUndoStop();
  const pos = editor.getPosition();
  const model = editor.getModel();
  const line = model.getLineContent(pos.lineNumber);
  const stripped = line.replace(/^#{1,6}\s*/, "");
  editor.executeEdits("md", [{
    range: { startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: line.length + 1 },
    text: "#".repeat(level) + " " + stripped,
  }]);
  editor.pushUndoStop();
  editor.focus();
}
function insertLink() {
  if (!editor) return;
  const sel = editor.getSelection();
  const text = editor.getModel().getValueInRange(sel) || "链接文字";
  editor.executeEdits("md", [{ range: sel, text: "[" + text + "](https://)" }]);
  editor.focus();
}

// ===== 字数统计 =====
function updateWordCount() {
  const el = $("word-count");
  if (!el) return;
  const tab = activeTab();
  if (!tab || !tab.model) { el.textContent = ""; return; }
  const text = tab.model.getValue();
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  const en = (text.match(/[a-zA-Z0-9]+/g) || []).length;
  el.textContent = (cjk + en) + " 字" + (cjk ? " · 中文 " + cjk : "");
}

// ===== 缓存层 =====
const fileCache = new Map();
let cacheStatus = "idle";
async function loadCache() {
  if (cacheStatus !== "idle") return;
  cacheStatus = "loading";
  if (!searchQuery && currentView === "tags") renderSidebar();
  try {
    const files = await listDir("_posts");
    const entries = await Promise.all(files.map((f) => getFile(f.path).then((d) => (d ? { meta: f, data: d } : null))));
    fileCache.clear();
    entries.filter(Boolean).forEach(({ meta, data }) => {
      const fm = parseFrontmatter(data.content);
      fileCache.set(data.path, { path: data.path, name: meta.name, sha: data.sha, content: data.content, title: fm.title, tags: fm.tags, category: fm.category, published: fm.published });
    });
    cacheStatus = "ready";
  } catch (e) {
    cacheStatus = "idle";
    console.warn("缓存加载失败", e);
  }
  if (!searchQuery) renderSidebar();
}

// ===== Tab 层 =====
let editor = null;
let emptyModel = null;
let openTabs = [];
let activePath = null;
let untitledSeq = 0;

function findTab(path) { return openTabs.find((t) => t.path === path); }
function activeTab() { return openTabs.find((t) => t.path === activePath); }
function setTabDirty(tab, d) { if (tab.dirty === d) return; tab.dirty = d; refreshTabBar(); }

function attachModelListeners(tab) {
  tab.model.onDidChangeContent(() => {
    setTabDirty(tab, true);
    saveDraftDebounced(tab);
    updateWordCount();
  });
}

async function openFile(path) {
  if (!editor) { toast("编辑器加载中，稍候", "error"); return; }
  const existing = findTab(path);
  if (existing) { switchTab(path); return; }
  try {
    const f = await getFile(path);
    if (!f) return;
    let content = f.content;
    const draft = getDraft(f.path);
    if (draft !== null && draft !== f.content) {
      if (window.confirm("检测到该文件有未保存的本地草稿（可能是上次未正常关闭）。\n\n「确定」恢复草稿 / 「取消」加载服务器版本")) {
        content = draft;
      }
    }
    const model = monaco.editor.createModel(content, "markdown");
    const tab = { path: f.path, name: f.path.split("/").pop(), sha: f.sha, model: model, dirty: false, viewState: null, isNew: false };
    model.updateOptions({ tabSize: 2 });
    attachModelListeners(tab);
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
  updateWordCount();
}

function closeTab(path, force) {
  const idx = openTabs.findIndex((t) => t.path === path);
  if (idx < 0) return;
  const tab = openTabs[idx];
  if (tab.dirty && !force) {
    if (!window.confirm('"' + tab.name + '" 有未保存修改，确认关闭？\n（确认后本地草稿也会清除）')) return;
  }
  if (tab.model) tab.model.dispose();
  clearDraft(path); // 主动关闭清草稿；崩溃不走这里，草稿保留用于恢复
  openTabs.splice(idx, 1);
  if (activePath === path) {
    const next = openTabs[idx] || openTabs[idx - 1] || null;
    if (next) switchTab(next.path);
    else {
      activePath = null;
      if (editor) editor.setModel(emptyModel);
      refreshTabBar();
      updateWordCount();
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
  const template = "---\n" + 'title: ""\n' + "date: " + ts + "\n" + "tags: []\n" + 'category: ""\n' + "---\n\n";
  const model = monaco.editor.createModel(template, "markdown");
  const tab = { path: id, name: "新建文章.md", sha: null, model: model, dirty: true, viewState: null, isNew: true };
  model.updateOptions({ tabSize: 2 });
  attachModelListeners(tab);
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
  const oldPath = tab.path;
  let path, message;
  if (isNew) { path = "_posts/" + newSlug() + ".md"; message = "新建文章"; }
  else { path = tab.path; message = "更新 " + tab.name; }

  const btn = $("save-btn");
  btn.disabled = true;
  btn.textContent = "保存中…";
  try {
    const sha = isNew ? undefined : tab.sha;
    const res = await saveFile(path, content, sha, message);
    tab.path = path;
    tab.sha = res.content.sha;
    tab.name = path.split("/").pop();
    tab.isNew = false;
    setTabDirty(tab, false);
    if (activePath === oldPath) activePath = path;
    clearDraft(oldPath);
    clearDraft(path);
    const fm = parseFrontmatter(content);
    fileCache.set(path, { path: path, name: tab.name, sha: tab.sha, content: content, title: fm.title, tags: fm.tags, category: fm.category, published: fm.published });
    refreshTabBar();
    renderSidebar();
    toast("已保存 ✓ 约 1 分钟后网站更新", "success");
  } catch (e) {
    if (e.status === 401) toast("登录已过期，请重新登录", "error");
    else if (e.status === 409 || e.status === 422) toast(isNew ? "文件名已存在，稍等几秒重试" : "文件已被改动，重新打开后再试", "error");
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
    clearDraft(path);
    renderSidebar();
  } catch (e) {
    toast(e.status === 401 ? "登录已过期，请重新登录" : "删除失败：" + e.message, "error");
  }
}

// ===== 发布 / 撤回(文件在 _drafts ↔ _posts 之间移动)=====
// 文件名规则:_drafts/slug.md  ↔  _posts/YYYY-MM-DD-slug.md
function postSlugFromName(name) {
  return name.replace(/^(\d{4}-\d{2}-\d{2}-)?(.+?)\.md$/, "$2");
}
function draftFilename(slug) { return "_drafts/" + slug + ".md"; }
function postFilename(slug) {
  const d = new Date();
  return "_posts/" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "-" + slug + ".md";
}
// 草稿 → 发布:先 PUT 目标、后 DELETE 源(PUT 失败草稿还在,可重试)
async function publishFile(path, name, sha) {
  const slug = postSlugFromName(name);
  const dest = postFilename(slug);
  if (!window.confirm('发布 "' + slug + '" 到 _posts？\n→ ' + dest + "\n\n约 1 分钟后网站可见。")) return;
  setStatusInfo("发布中…");
  try {
    const src = await getFile(path);
    if (!src) { toast("找不到源文件", "error"); return; }
    await saveFile(dest, src.content, undefined, "发布 " + slug);
    try { await deleteFile(path, src.sha, "发布后移除草稿 " + slug); }
    catch (e2) { toast("已发布,但旧草稿删除失败,请手动清理 " + path, "error"); }
    // 同步 tab 与缓存
    const tab = findTab(path);
    if (tab) {
      tab.path = dest; tab.name = dest.split("/").pop(); tab.isNew = false;
      const fresh = await getFile(dest);
      if (fresh) tab.sha = fresh.sha;
      clearDraft(path); clearDraft(dest);
    }
    if (activePath === path) activePath = dest;
    fileCache.delete(path);
    refreshTabBar();
    renderSidebar();
    toast("已发布 ✓", "success");
  } catch (e) {
    if (e.status === 409 || e.status === 422) toast("目标文件已存在,改名后重试", "error");
    else if (e.status === 401) toast("登录已过期，请重新登录", "error");
    else toast("发布失败：" + e.message, "error");
  } finally {
    setStatusInfo("");
  }
}
// 发布 → 草稿:反向移动
async function unpublishFile(path, name, sha) {
  const slug = postSlugFromName(name);
  const dest = draftFilename(slug);
  if (!window.confirm('撤回 "' + slug + '" 为草稿？\n→ ' + dest + "\n\n网站将不再显示该文。")) return;
  setStatusInfo("撤回中…");
  try {
    const src = await getFile(path);
    if (!src) { toast("找不到源文件", "error"); return; }
    await saveFile(dest, src.content, undefined, "撤回草稿 " + slug);
    try { await deleteFile(path, src.sha, "撤回发布 " + slug); }
    catch (e2) { toast("已撤回,但旧 _posts 文件删除失败,手动清理 " + path, "error"); }
    const tab = findTab(path);
    if (tab) {
      tab.path = dest; tab.name = dest.split("/").pop(); tab.isNew = false;
      const fresh = await getFile(dest);
      if (fresh) tab.sha = fresh.sha;
      clearDraft(path); clearDraft(dest);
    }
    if (activePath === path) activePath = dest;
    fileCache.delete(path);
    refreshTabBar();
    renderSidebar();
    toast("已撤回为草稿", "success");
  } catch (e) {
    if (e.status === 409 || e.status === 422) toast("草稿已存在同名,改名后重试", "error");
    else if (e.status === 401) toast("登录已过期，请重新登录", "error");
    else toast("撤回失败：" + e.message, "error");
  } finally {
    setStatusInfo("");
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
      fontSize: 14, lineNumbers: "on", wordWrap: "on",
      scrollBeyondLastLine: false, padding: { top: 12 }, tabSize: 2,
    });
    // 保存
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCurrent);
    // Markdown 快捷键
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => toggleWrap("**"));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => toggleWrap("*"));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit1, () => toggleHeading(1));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit2, () => toggleHeading(2));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit3, () => toggleHeading(3));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, insertLink);
    // 图片拖拽 / 粘贴
    const dom = editor.getDomNode();
    if (dom) {
      dom.addEventListener("paste", onEditorPaste, true);
      dom.addEventListener("dragover", onEditorDragOver, true);
      dom.addEventListener("drop", onEditorDrop, true);
    }
    refreshTabBar();
    updateWordCount();
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
  menu.classList.remove("hidden");
  const rect = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - rect.width - 8) + "px";
  menu.style.top = Math.min(y, window.innerHeight - rect.height - 8) + "px";
}
function hideContextMenu() { $("context-menu").classList.add("hidden"); }

// ===== 左栏渲染 =====
let currentView = "files";
let searchQuery = "";
let statusFilter = "all"; // all | published | draft(仅文件视图生效)

function renderSidebar() {
  if (searchQuery) { renderSearchResults(searchQuery); return; }
  if (currentView === "tags") renderTagsView();
  else if (currentView === "categories") renderCategoryView();
  else renderFileTree();
}

async function renderFileTree() {
  const c = $("sidebar-content");
  if (!c) return;
  c.innerHTML = '<div class="tree-loading">加载中…</div>';
  try {
    const results = await Promise.all(DIRS.map((d) => listDir(d.path)));
    c.innerHTML = "";
    DIRS.forEach((d, i) => {
      if (statusFilter === "published" && d.path !== "_posts") return;
      if (statusFilter === "draft" && d.path !== "_drafts") return;
      c.appendChild(buildFileGroup(d.label, d.path, results[i]));
    });
    setActiveInTree();
  } catch (e) {
    c.innerHTML = '<div class="tree-loading">加载失败：' + escapeHtml(e.message) + "</div>";
    if (e.status === 401) toast("登录已过期，请点「登出」后重新登录", "error");
  }
}

function buildFileGroup(label, dirPath, files) {
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
  const isDraft = dirPath === "_drafts";
  files.forEach((f) => {
    const li = document.createElement("li");
    li.dataset.path = f.path;
    li.dataset.sha = f.sha;
    if (activePath === f.path) li.classList.add("active");
    li.addEventListener("click", (e) => {
      if (e.target.classList.contains("del-btn") || e.target.classList.contains("state-btn")) return;
      openFile(f.path);
    });
    const name = document.createElement("span");
    name.className = "fname";
    name.textContent = f.name.replace(/\.md$/, "");
    li.appendChild(name);
    // 状态切换:草稿 ↗ 发布 / 发布 ↙ 撤回
    const stBtn = document.createElement("button");
    stBtn.className = "state-btn " + (isDraft ? "pub-btn" : "unpub-btn");
    stBtn.title = isDraft ? "发布到 _posts" : "撤回为草稿";
    stBtn.textContent = isDraft ? "↗" : "↙";
    stBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isDraft) publishFile(f.path, f.name, f.sha);
      else unpublishFile(f.path, f.name, f.sha);
    });
    li.appendChild(stBtn);
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
  if (cacheStatus !== "ready") { c.innerHTML = '<div class="tree-loading">索引中… 正在加载文章内容</div>'; return; }
  const tagMap = new Map();
  fileCache.forEach((e) => { e.tags.forEach((t) => { if (!tagMap.has(t)) tagMap.set(t, []); tagMap.get(t).push(e); }); });
  const tags = Array.from(tagMap.keys()).sort();
  c.innerHTML = "";
  if (tags.length === 0) { c.innerHTML = '<div class="tree-loading">还没有带标签的文章</div>'; return; }
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

// 分类视图:按 frontmatter 的 category 聚合(单值)。复用标签视图的交互。
function renderCategoryView() {
  const c = $("sidebar-content");
  if (cacheStatus !== "ready") { c.innerHTML = '<div class="tree-loading">索引中… 正在加载文章内容</div>'; return; }
  const catMap = new Map();
  fileCache.forEach((e) => {
    if (!e.category) return; // 无分类的文章不列入
    if (!catMap.has(e.category)) catMap.set(e.category, []);
    catMap.get(e.category).push(e);
  });
  const cats = Array.from(catMap.keys()).sort();
  c.innerHTML = "";
  if (cats.length === 0) { c.innerHTML = '<div class="tree-loading">还没有带分类的文章(在 frontmatter 加 category: 分类名)</div>'; return; }
  cats.forEach((cat) => {
    const entries = catMap.get(cat);
    const wrap = document.createElement("div");
    wrap.className = "tag-group";
    const h = document.createElement("div");
    h.className = "tag-group-header";
    h.textContent = cat;
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
  if (cacheStatus !== "ready") { header.textContent = "索引中… 请稍候再搜"; wrap.appendChild(header); c.appendChild(wrap); return; }
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

function switchView(name) {
  currentView = name;
  $("view-files-btn").classList.toggle("active", name === "files");
  $("view-tags-btn").classList.toggle("active", name === "tags");
  $("view-categories-btn").classList.toggle("active", name === "categories");
  $("status-filter").style.display = (name === "files") ? "" : "none";
  renderSidebar();
}
function updateFilterBtns() {
  $("filter-all-btn").classList.toggle("active", statusFilter === "all");
  $("filter-published-btn").classList.toggle("active", statusFilter === "published");
  $("filter-draft-btn").classList.toggle("active", statusFilter === "draft");
}
function setStatusFilter(name) {
  statusFilter = name;
  updateFilterBtns();
  if (currentView === "files") renderSidebar();
}
const onSearchInput = debounce(function () {
  searchQuery = $("search-input").value.trim();
  renderSidebar();
}, 150);

// ===== 登录视图 =====
function showLogin() { $("login-view").classList.remove("hidden"); $("app-view").classList.add("hidden"); }
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
  updateWordCount();
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
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
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
    document.body.style.cursor = ""; document.body.style.userSelect = "";
    localStorage.setItem(WIDTH_KEY, String(sidebar.offsetWidth));
  });
}

// ===== OAuth =====
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
  $("view-categories-btn").addEventListener("click", () => switchView("categories"));
  $("filter-all-btn").addEventListener("click", () => setStatusFilter("all"));
  $("filter-published-btn").addEventListener("click", () => setStatusFilter("published"));
  $("filter-draft-btn").addEventListener("click", () => setStatusFilter("draft"));
  $("media-btn").addEventListener("click", openMediaLib);
  $("media-close").addEventListener("click", closeMediaLib);
  $("media-upload-input").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setStatusInfo("上传 " + files.length + " 张…");
    try {
      for (const f of files) await uploadImage(f);
      toast("已上传 " + files.length + " 张图片", "success");
      openMediaLib(); // 刷新列表
    } catch (e2) {
      toast(e2.status === 401 ? "登录已过期，请重新登录" : "上传失败：" + e2.message, "error");
    } finally {
      e.target.value = "";
      setStatusInfo("");
    }
  });
  $("media-modal").addEventListener("click", (e) => { if (e.target.id === "media-modal") closeMediaLib(); });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P") && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const s = $("search-input");
      s.focus(); s.select();
    }
  });
  document.addEventListener("click", hideContextMenu);
  document.addEventListener("scroll", hideContextMenu, true);
  if (getToken()) showApp();
  else showLogin();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
