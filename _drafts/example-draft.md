---
title: "（草稿示例）如何发布这篇文章"
tags: [Jekyll]
excerpt: "这篇文件放在 _drafts 目录里，所以不会被发布。它演示草稿机制。"
---

# 这是一个草稿

> ⚠️ 放在 `_drafts/` 目录里的文章 **不会** 被发布到网站上。
> GitHub Pages 构建时不带 `--drafts`，所以这里是安全的「未发布」区。

## 怎么发布这篇草稿

两种方式任选其一：

### 方式一：移动到 `_posts/` 并加日期前缀（推荐）

1. 把这个文件从 `_drafts/example-draft.md` 移动到 `_posts/`
2. 重命名为 `YYYY-MM-DD-标题.md` 格式，例如 `2026-07-15-如何发布这篇文章.md`
3. 提交（commit）即自动发布

在 GitHub 网页上：打开这个文件 → 点右上角 ✏️ 编辑 → 在文件名输入框里把路径改成 `_posts/2026-07-15-example.md` → Commit changes。

### 方式二：用 published 开关

把文件直接放在 `_posts/` 里，但在最上方 frontmatter 加一行 `published: false`，文章就不会出现在列表里。想发布时删掉这行即可。

---

## 提醒

- `_posts/` 里的文件名 **必须** 是 `YYYY-MM-DD-标题.md` 格式，否则 Jekyll 不收录。
- frontmatter（最上方 `---` 之间的部分）里至少要有 `title`。`date`、`tags`、`excerpt` 可选但建议都写。
- 写完正常 commit / push，约 1 分钟后刷新网站就能看到。

这篇草稿本身没别的内容，发布前请替换成你自己的正文。
