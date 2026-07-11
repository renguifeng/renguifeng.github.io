/* ============================================================
   Cloudflare Worker — Decap CMS GitHub OAuth Provider
   ------------------------------------------------------------
   作用：充当 Decap CMS（/admin）和 GitHub 之间的 OAuth 中转，
        让你在博客后台用 GitHub 登录、把文章提交到仓库。

   部署（全部在 Cloudflare 网页操作，无需装软件）：
   1. 注册/登录 https://dash.cloudflare.com （免费）
   2. Workers & Pages → Create → Worker → 取个名字 → Deploy
   3. 点 "Edit code"，把本文件全部内容粘贴进去 → Save and Deploy
   4. 回到该 Worker 的 Settings → Variables → 添加两个变量：
        GH_CLIENT_ID      = （GitHub OAuth App 的 Client ID）
        GH_CLIENT_SECRET  = （GitHub OAuth App 的 Client Secret）
   5. 拿到 Worker 的 URL（形如 https://xxx.your-name.workers.dev）
      → ① 告诉 Claude，更新 admin/config.yml 的 base_url
        ② 在 GitHub OAuth App 里把 Callback URL 设成  <Worker URL>/cb

   GitHub OAuth App 在哪建：
   https://github.com/settings/developers → New OAuth App
   - Homepage URL:  https://renguifeng.github.io
   - Callback URL:  https://<你的 Worker URL>/cb
   ============================================================ */

const REDIRECT_PATH = "/cb";

// /cb 拿到 token 后返回给 CMS 的页面，实现 Decap OAuth 握手协议
function callbackHtml(token) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>授权中…</title></head>
<body style="font-family:-apple-system,Segoe UI,sans-serif;text-align:center;padding:48px">
  <p>正在返回编辑器…</p>
  <script>
    (function () {
      var token = ${JSON.stringify(token)};
      var provider = "github";
      function receiveMessage(e) {
        window.opener.postMessage(
          "authorization:" + provider + ":success:" + JSON.stringify({ token: token, provider: provider }),
          e.origin
        );
        window.removeEventListener("message", receiveMessage, false);
      }
      window.addEventListener("message", receiveMessage, false);
      window.opener.postMessage("authorizing:" + provider, "*");
    })();
  </script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1) 启动授权：跳转到 GitHub 授权页
    if (url.pathname === "/auth/github") {
      if (!env.GH_CLIENT_ID) {
        return new Response("Worker 缺少环境变量 GH_CLIENT_ID（去 Cloudflare Worker Settings 里配置）", { status: 500 });
      }
      const params = new URLSearchParams({
        client_id: env.GH_CLIENT_ID,
        redirect_uri: url.origin + REDIRECT_PATH,
        scope: "repo,user",
      });
      return Response.redirect(
        "https://github.com/login/oauth/authorize?" + params,
        302
      );
    }

    // 2) GitHub 回调：用 code 换 access_token，再传回 CMS
    if (url.pathname === REDIRECT_PATH) {
      const code = url.searchParams.get("code");
      if (!code) return new Response("缺少 code 参数", { status: 400 });
      if (!env.GH_CLIENT_ID || !env.GH_CLIENT_SECRET) {
        return new Response("Worker 缺少环境变量 GH_CLIENT_ID / GH_CLIENT_SECRET", { status: 500 });
      }

      const resp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: env.GH_CLIENT_ID,
          client_secret: env.GH_CLIENT_SECRET,
          code,
          redirect_uri: url.origin + REDIRECT_PATH,
        }),
      });

      const data = await resp.json();
      if (data.error || !data.access_token) {
        return new Response("换取 token 失败：" + (data.error_description || data.error || "未知错误"), { status: 400 });
      }

      return new Response(callbackHtml(data.access_token), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // 健康检查
    return new Response(
      "Decap CMS OAuth Provider ✓\n访问博客 /admin 通过 GitHub 登录。",
      { headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  },
};
