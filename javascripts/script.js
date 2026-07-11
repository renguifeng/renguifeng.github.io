// Renguifeng.github.io
// 轻量增强脚本：① 导航当前区块高亮  ② 页脚年份自动更新
// 原生 JS，无依赖。即使加载失败也不影响页面展示。

(function () {
  "use strict";

  // 页脚年份
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // 导航高亮：滚动到哪个区块，对应的导航项就高亮
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll(".nav-links a")
  );
  var sections = navLinks
    .map(function (a) {
      var id = a.getAttribute("href");
      return id && id.charAt(0) === "#" ? document.querySelector(id) : null;
    })
    .filter(Boolean);

  if (!sections.length || !("IntersectionObserver" in window)) {
    return; // 不支持就保持纯静态，不影响使用
  }

  var activeLink = null;

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;

        var id = "#" + entry.target.id;
        var match = navLinks.filter(function (a) {
          return a.getAttribute("href") === id;
        })[0];

        if (!match) return;
        if (activeLink === match) return;

        if (activeLink) activeLink.classList.remove("active");
        match.classList.add("active");
        activeLink = match;
      });
    },
    {
      // 让“区块顶部进入视口约一半时”视为当前区块
      rootMargin: "-45% 0px -50% 0px",
      threshold: 0
    }
  );

  sections.forEach(function (s) {
    observer.observe(s);
  });
})();
