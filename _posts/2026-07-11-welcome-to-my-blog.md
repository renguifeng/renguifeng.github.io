---
title: "欢迎来到我的博客"
date: 2026-07-11 10:00:00 +0800
tags: [随笔, Jekyll]
excerpt: "这是博客的第一篇文章。介绍这个站点是怎么搭起来的，以及我打算在这里写些什么。"
---

这是博客的第一篇文章 👋 恭喜你看到它。

这个站点用 [Jekyll](https://jekyllrb.com/) 搭建，托管在 GitHub Pages 上。发文流程非常简单：在仓库的 `_posts/` 目录里新建一个 Markdown 文件，提交后就会自动发布。具体怎么操作，看仓库根目录的 `README.md`。

## 这里会写些什么

我打算在这里记录：

- 技术学习笔记
- 踩过的坑和解决办法
- 一些小项目的开发过程
- 偶尔的生活随笔

## Markdown 排版演示

下面这些是给样式做演示的，你可以删掉。

### 列表

- 无序列表项一
- 无序列表项二
- 无序列表项三

1. 有序列表项一
2. 有序列表项二
3. 有序列表项三

### 引用

> 这是一段引用。好的产品来自对细节的打磨。
>
> —— 某个开发者

### 行内代码与链接

在终端执行 `bundle exec jekyll serve` 就能在本地预览。更多请看 [Jekyll 文档](https://jekyllrb.com/docs/)。

### 代码块（带语法高亮）

```javascript
// 一个简单的 debounce 实现
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

window.addEventListener("resize", debounce(() => {
  console.log("窗口尺寸变化了");
}, 200));
```

```python
# 斐波那契数列
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

print([fib(i) for i in range(10)])
# [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
```

### 表格

| 功能      | 是否支持 |
| --------- | -------- |
| 代码高亮  | ✅       |
| 标签分类  | ✅       |
| 列表分页  | ✅       |

---

就先写到这。如果你看到这段文字、上面的代码块有颜色，说明博客系统工作正常，可以开始写你自己的内容了。
