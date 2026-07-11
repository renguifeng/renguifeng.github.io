/* ============================================================
   写作后台 · 应用逻辑
   - OAuth 握手（复用已部署的 Cloudflare Worker）
   - GitHub Contents API 读写 _posts
   - Monaco 编辑器 + marked 实时预览
   ============================================================ */

// ===== 配置（改仓库时改这里）=====
const CONFIG = {
  owner: "renguifeng",
  repo: "renguifeng.github.io",
  branch: "master",
  postsDir: "_posts",
  workerUrl: "https://soft-thunder-ce76.mailtoguifeng.workers.dev",
};
const API = "https://api.github.com";
const TOKEN_KEY = "gh_editor_token";
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
function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
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

async function listPosts() {
  const data = await gh(CONFIG.postsDir);
  if (!Array.isArray(data)) return [];
  return data
    .filter((f) => f.type === "file" && f.name.endsWith(".md"))
    .sort((a, b) => b.name.localeCompare(a.name)); // 文件名降序 = 日期新的在前
}

async function getPost(path) {
  const data = await gh(path);
  if (!data || data.type !== "file") return null;
  return { path: data.path, sha: data.sha, content: b64decode(data.content) };
}

async function savePost(path, content, sha, message) {
  const body = {
    message: message,
    content: b64encode(content),
    branch: CONFIG.branch,
  };
  if (sha) body.sha = sha;
  return gh(path, "PUT", body);
}

// ===== frontmatter 解析 / 生成 =====
function parsePost(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { title: "", tags: [], body: raw };
  const fm = m[1];
  const body = m[2];
  const title = (fm.match(/^title:\s*"?(.*?)"?\s*$/m) || [])[1] || "";
  const tagsLine = (fm.match(/^tags:\s*\[(.*)\]/m) || [])[1] || "";
  const tags = tagsLine
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  return { title: title, tags: tags, body: body };
}

function buildPost(title, tags, body) {
  const now = new Date();
  const ts =
    now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + " " +
    pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds()) + " +0800";
  const lines = ["---", 'title: "' + (title || "无标题").replace(/"/g, '\\"') + '"', "date: " + ts];
  if (tags && tags.length) lines.push("tags: [" + tags.join(", ") + "]");
  lines.push("---", "");
  return lines.join("\n") + body;
}

function newSlug() {
  // MVP：用时间戳命名，避开中文/拼音转换，文件名规范且唯一
  const now = new Date();
  return (
    now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + "-" +
    pad(now.getHours()) + pad(now.getMinutes())
  );
}

// ===== 状态 =====
let editor = null;
let currentPost = null; // { path, sha } 或 null（新建）

// ===== Monaco + 预览 =====
function initMonaco() {
  require.config({ paths: { vs: MONACO_CDN } });
  require(["vs/editor/editor.main"], function () {
    editor = monaco.editor.create($("editor"), {
      value: "",
      language: "markdown",
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      lineNumbers: "on",
      wordWrap: "on",
      scrollBeyondLastLine: false,
      padding: { top: 12 },
    });
    editor.onDidChangeModelContent(debounce(updatePreview, 200));
    updatePreview();
  });
}

function updatePreview() {
  if (!window.marked) return;
  const title = $("title-input").value.trim();
  const md = editor ? editor.getValue() : "";
  const full = (title ? "# " + title + "\n\n" : "") + md;
  $("preview").innerHTML = window.marked.parse(full);
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
  refreshList();
}

async function refreshList() {
  const ul = $("post-list");
  ul.innerHTML = "";
  const loading = document.createElement("li");
  loading.className = "muted";
  loading.textContent = "加载中…";
  ul.appendChild(loading);
  try {
    const posts = await listPosts();
    ul.innerHTML = "";
    if (posts.length === 0) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "（还没有文章）";
      ul.appendChild(li);
      return;
    }
    posts.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = p.name.replace(/\.md$/, "");
      li.dataset.path = p.path;
      li.addEventListener("click", () => openPost(p.path, li));
      if (currentPost && currentPost.path === p.path) li.classList.add("active");
      ul.appendChild(li);
    });
  } catch (e) {
    ul.innerHTML = "";
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "加载失败：" + e.message;
    ul.appendChild(li);
    if (e.status === 401) {
      toast("登录已过期，请重新登录", "error");
    }
  }
}

async function openPost(path, li) {
  try {
    const post = await getPost(path);
    if (!post) return;
    currentPost = { path: post.path, sha: post.sha };
    const parsed = parsePost(post.content);
    $("title-input").value = parsed.title;
    $("tags-input").value = parsed.tags.join(", ");
    if (editor) editor.setValue(parsed.body);
    document.querySelectorAll(".post-list li").forEach((x) => x.classList.remove("active"));
    if (li) li.classList.add("active");
    updatePreview();
  } catch (e) {
    toast("打开失败：" + e.message, "error");
  }
}

function newPost() {
  currentPost = null;
  $("title-input").value = "";
  $("tags-input").value = "";
  if (editor) editor.setValue("");
  document.querySelectorAll(".post-list li").forEach((x) => x.classList.remove("active"));
  updatePreview();
  $("title-input").focus();
}

async function saveCurrent() {
  if (!editor) return;
  const title = $("title-input").value.trim();
  const tags = $("tags-input").value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const body = editor.getValue();

  if (!title) {
    toast("请填写标题", "error");
    return;
  }
  if (!body.trim()) {
    toast("正文为空，没保存", "error");
    return;
  }

  const content = buildPost(title, tags, body);
  let path, message;
  if (currentPost) {
    path = currentPost.path;
    message = "更新：" + title;
  } else {
    path = CONFIG.postsDir + "/" + newSlug() + ".md";
    message = "发布：" + title;
  }

  const btn = $("save-btn");
  btn.disabled = true;
  btn.textContent = "保存中…";
  try {
    const sha = currentPost ? currentPost.sha : undefined;
    const res = await savePost(path, content, sha, message);
    currentPost = { path: path, sha: res.content.sha };
    toast("已保存 ✓ 约 1 分钟后网站更新", "success");
    refreshList();
  } catch (e) {
    if (e.status === 409 || e.status === 422) {
      toast("文件已变化，重新打开后再试", "error");
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
  currentPost = null;
  showLogin();
  toast("已登出");
}

// ===== OAuth 握手（配合已部署的 Worker）=====
function login() {
  window.addEventListener("message", onAuthMessage);
  window.open(CONFIG.workerUrl + "/auth/github", "github-oauth", "width=640,height=760");
}

function onAuthMessage(e) {
  const d = e.data;
  // 1) Worker 先发 'authorizing:github'，我们要回一条消息触发它把 token 发过来
  if (d === "authorizing:github") {
    e.source.postMessage("login", e.origin);
    return;
  }
  // 2) 收到 token
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
  $("new-btn").addEventListener("click", newPost);
  $("save-btn").addEventListener("click", saveCurrent);
  $("logout-btn").addEventListener("click", logout);
  $("title-input").addEventListener("input", debounce(updatePreview, 200));

  if (getToken()) {
    showApp();
  } else {
    showLogin();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
