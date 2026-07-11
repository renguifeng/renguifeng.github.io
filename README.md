# Renguifeng.GitHub.io

基于 **Jekyll** 的个人主页 + 博客，托管在 GitHub Pages。
发文 = 在 `_posts/` 目录新增一个 Markdown 文件，提交即自动发布。无需本地安装任何东西。

访问：<https://renguifeng.github.io>

---

## 📁 目录结构

```
_posts/        文章（发布区）。文件名必须是 YYYY-MM-DD-标题.md
_drafts/       草稿（不发布）。写好后移到 _posts/ 并加日期前缀即可发布
_layouts/      页面模板（default / post）
_includes/     可复用片段（导航 / 页脚 / 文章卡片）
blog/          博客列表页（带分页，每页 5 篇）
tags/          标签索引页（自动按标签分组）
index.html     首页（个人主页 + 最新文章）
stylesheets/   样式（stylesheet.css 主样式 + syntax.css 代码高亮）
_config.yml    Jekyll 配置
```

---

## ✍️ 怎么发新文章（在 GitHub 网页操作，推荐）

1. 打开 <https://github.com/renguifeng/renguifeng.github.io/tree/master/_posts>
2. 点右上角 **Add file → Create new file**
3. 文件名按格式：`2026-07-15-我的新文章.md`
   - 前缀 `YYYY-MM-DD-` **必须**有，否则 Jekyll 不收录
4. 顶部写 frontmatter（`---` 之间）：
   ```yaml
   ---
   title: "我的新文章"
   date: 2026-07-15 10:00:00 +0800
   tags: [JavaScript, 教程]
   excerpt: "一句话摘要，会显示在文章列表里。"
   ---
   ```
5. 下面用 Markdown 写正文
6. 滚到底部点 **Commit changes**
7. 约 1 分钟后刷新网站即可看到

> 也可以用任意 Markdown 编辑器本地写好后 `git push`，效果一样。

### frontmatter 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | 是 | 文章标题 |
| `date` | 推荐 | 发布时间；不写则用文件名里的日期 |
| `tags` | 可选 | 标签数组，如 `[JavaScript, 笔记]` |
| `excerpt` | 可选 | 列表页摘要；不写则自动取正文开头 |

---

## 📝 草稿 / 手动发布

不想立刻发布的文章放进 `_drafts/` 目录（文件名**不带**日期前缀）。
GitHub Pages 构建时不会发布 `_drafts/` 里的内容。

**发布草稿**：把文件从 `_drafts/` 移到 `_posts/`，并改名为 `YYYY-MM-DD-标题.md`，提交即可。
在 GitHub 网页上：打开草稿文件 → 点 ✏️ 编辑 → 在文件名框里把路径改成 `_posts/2026-07-15-xxx.md` → Commit。

另一种方式：文件直接放 `_posts/`，frontmatter 里加 `published: false` 也能暂时隐藏，发布时删掉这行。

---

## 🏷️ 标签

文章的 `tags` 会自动汇总到 <https://renguifeng.github.io/tags/>，按标签分组列出所有文章。
文章页和标签页之间可以互相跳转。

---

## 💻 本地预览（可选）

不需要本地预览可跳过这节。如想实时调试：

```bash
# 1. 装 Ruby（Ubuntu/WSL）
sudo apt install ruby-full build-essential

# 2. 装 bundler 和依赖
gem install bundler
bundle install            # 在仓库根目录执行

# 3. 启动本地服务
bundle exec jekyll serve
# 浏览器打开 http://127.0.0.1:4000

# 预览草稿（含 _drafts/ 里的内容）
bundle exec jekyll serve --drafts
```

不装 Ruby 也不影响在线发布 —— 直接 push，看 GitHub Actions 的构建结果即可。

---

## 🛠️ 站点配置

改 `_config.yml` 可调整：
- `title` / `description`：站点标题和描述
- `paginate`：每页显示几篇文章
- `permalink`：文章网址格式
- `url`：站点域名

> 改了 `_config.yml` 后，本地需要重启 `jekyll serve` 才生效；线上 push 后自动生效。

---

## ❓ 常见问题

**Q：提交后网站没更新？**
看仓库的 **Actions** 页，确认 Pages 构建成功（绿色）。若失败，日志会指出哪一行错，通常是 frontmatter 缩进或 Liquid 语法问题。

**Q：文章没出现在列表？**
检查文件名是不是 `YYYY-MM-DD-标题.md` 格式、frontmatter 的 `---` 是否成对。

**Q：代码块没有颜色？**
确保用三个反引号的 fenced code block，并可指定语言：
<pre>
```javascript
console.log("hi");
```
</pre>
