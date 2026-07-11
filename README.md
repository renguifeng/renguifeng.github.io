# Renguifeng.GitHub.io

基于 **Jekyll** 的个人主页 + 博客，托管在 GitHub Pages。两种发文方式：

- 🟢 **写作后台 `/admin`**（推荐，不碰代码）：VSCode 风深色编辑器 + 实时预览，写完点保存。见下方「📝 写作后台」。
- ⚪ **手动**（备选）：在 GitHub 网页加 Markdown 文件，见下方「✍️ 手动发文」。

站点：<https://renguifeng.github.io>　·　后台：<https://renguifeng.github.io/admin>

---

## 📁 目录结构

```
_posts/           文章（发布区）。文件名必须是 YYYY-MM-DD-标题.md
_drafts/          草稿（不发布）。写好后移到 _posts/ 并加日期前缀即可发布
_layouts/         页面模板（default / post / none）
_includes/        可复用片段（导航 / 页脚 / 文章卡片）
blog/             博客列表页（带分页，每页 5 篇）
tags/             标签索引页（自动按标签分组）
index.html        首页（个人主页 + 最新文章）
admin/            写作后台（自建，VSCode 风编辑器，访问 /admin）
oauth-provider/   OAuth 中转 Worker 源码（部署到 Cloudflare）
stylesheets/      样式（stylesheet.css 主样式 + syntax.css 代码高亮）
_config.yml       Jekyll 配置
```

---

## 📝 写作后台 `/admin`（推荐 —— 不碰代码）

一个 VSCode 风的深色写作界面：**左侧文章列表 / 中间 Monaco 编辑器（VSCode 同款内核）/ 右侧实时预览**。填标题 + 标签，写正文，点保存——自动生成 frontmatter、文件名、提交到仓库。**全程不碰代码 / git / 文件名。**

打开：<https://renguifeng.github.io/admin>

### ✍️ 日常发文

1. 打开 <https://renguifeng.github.io/admin>，点「用 GitHub 登录」授权
2. 左栏点文章打开编辑，或点右上「+ 新建」
3. 顶部填**标题**和**标签**（逗号分隔），中间编辑器写正文（Markdown，支持 `Ctrl+B` / `Ctrl+I` 等快捷键）
4. 右栏实时预览效果
5. 点右上**保存** → 约 1 分钟后 <https://renguifeng.github.io/blog/> 看到

> 登录态保存在浏览器 localStorage，下次打开免登；点「登出」可清除。

### 🔧 登录原理（已配好，通常不用管）

后台通过 Cloudflare Worker 做 GitHub 登录授权（OAuth），授权后用 GitHub API 直接读写 `_posts/`。这套**已经配好并验证可用**，直接用即可。

- [`oauth-provider/worker.js`](oauth-provider/worker.js) — Worker 源码
- Worker URL 写在 [`admin/app.js`](admin/app.js) 顶部的 `CONFIG.workerUrl`；换 Worker 时改这里

> 🔒 **Client Secret 只存在 Cloudflare Worker 里，永远不进代码仓库。** 浏览器只拿到一个临时访问 token（存 localStorage），不含密码。

<details>
<summary>以后要重新部署 Worker / OAuth（点开）</summary>

1. **部署 Worker**：Cloudflare → Workers & Pages → 新建 → 粘贴 `oauth-provider/worker.js` 全部内容 → **Save and Deploy**
2. **建 GitHub OAuth App**：<https://github.com/settings/developers> → New OAuth App，Callback URL 填 `<Worker URL>/cb`
3. **Worker 环境变量**：Worker 设置里加 `GH_CLIENT_ID`、`GH_CLIENT_SECRET`
4. 把新 Worker URL 填到 `admin/app.js` 的 `CONFIG.workerUrl`

</details>

---

## ✍️ 手动发新文章（GitHub 网页，备选）

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
