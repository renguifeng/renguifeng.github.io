/* =========================================================
   前台全文搜索 — Fuse.js
   消耗 /search.json(由 search.json 模板生成),懒加载。
   中文友好:useExtendedSearch + ignoreLocation + 单字可搜。
   ========================================================= */
(function () {
  "use strict";
  var input = document.getElementById("site-search-input");
  var resultsEl = document.getElementById("site-search-results");
  if (!input || !resultsEl) return;

  // 站点根路径(由 default.html 的 <meta name="base"> 提供,缺省 "/")
  var base = "/";
  var baseMeta = document.querySelector('meta[name="base"]');
  if (baseMeta && baseMeta.content) base = baseMeta.content;
  if (base.charAt(base.length - 1) !== "/") base += "/";

  var fuse = null;
  var loaded = false;
  var loading = null;

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // 懒加载索引(首次 focus / input 时触发,只加载一次)
  function load() {
    if (loaded) return Promise.resolve();
    if (loading) return loading;
    loading = fetch(base + "search.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (posts) {
        fuse = new Fuse(posts, {
          keys: [
            { name: "title", weight: 0.4 },
            { name: "tags", weight: 0.2 },
            { name: "category", weight: 0.1 },
            { name: "excerpt", weight: 0.2 },
            { name: "content", weight: 0.1 }
          ],
          includeScore: true,
          threshold: 0.35,        // 模糊度,中文子串匹配略放宽
          ignoreLocation: true,   // 正文长,忽略命中位置
          minMatchCharLength: 1,  // 中文单字也能搜
          useExtendedSearch: true // 扩展模式,支持中文子串
        });
        loaded = true;
      })
      .catch(function (e) {
        loading = null;
        resultsEl.innerHTML = '<p class="muted">索引加载失败:' + escapeHtml(e.message) + "</p>";
        throw e;
      });
    return loading;
  }

  function render(q) {
    if (!q) {
      resultsEl.innerHTML = '<p class="muted">输入关键词开始搜索。</p>';
      return;
    }
    if (!fuse) {
      resultsEl.innerHTML = '<p class="muted">索引加载中…</p>';
      return;
    }
    var out = fuse.search(q).slice(0, 20);
    if (!out.length) {
      resultsEl.innerHTML = '<p class="muted">没有匹配「' + escapeHtml(q) + '」的文章。</p>';
      return;
    }
    resultsEl.innerHTML = "";
    out.forEach(function (r) {
      var p = r.item;
      var card = document.createElement("article");
      card.className = "card post-card";
      var tags = (p.tags && p.tags.length)
        ? '<span class="post-card-tags"> · ' + escapeHtml(p.tags.join(" / ")) + "</span>" : "";
      var cat = p.category
        ? '<span class="post-card-tags"> · 📁 ' + escapeHtml(p.category) + "</span>" : "";
      card.innerHTML =
        '<a class="post-card-link" href="' + p.url + '">' +
          '<h3 class="post-card-title">' + escapeHtml(p.title) + "</h3>" +
          '<p class="post-card-meta"><time>' + escapeHtml(p.date) + "</time>" + tags + cat + "</p>" +
          '<p class="post-card-excerpt">' + escapeHtml(p.excerpt) + "</p>" +
        "</a>";
      resultsEl.appendChild(card);
    });
  }

  var timer = null;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    var q = input.value.trim();
    timer = setTimeout(function () {
      load().then(function () { render(q); }).catch(function () {});
    }, 200);
  });
  input.addEventListener("focus", function () { load().catch(function () {}); });
})();
