# 浏览器完整旅程

`journey.cjs` 在全新浏览器上下文中测试 390px 和 320px 手机页面，不读取或改动日常浏览器的存档。

覆盖：四步创作、草稿刷新恢复、章节与目录选择门槛、六章结局、阅读刷新恢复、浏览器前进后退、取消与确认改选、后续故事变化、匿名只读发布与刷新、两本自己的故事合流成独立第三本书、合流结局、横向溢出和页面未捕获异常。

启动项目后运行（需要 Node.js 22.12+；Playwright 已列入开发依赖）：

```sh
npm ci
npx playwright install chromium
npm run dev -- --host localhost --port 5173 --strictPort
```

另一个终端：

```sh
npm run test:e2e
```

默认使用可见 Chromium。`TARGET_URL` 可指定运行中的应用；`PW_ARTIFACT_DIR` 可指定截图与 JSON 报告目录。无桌面的 CI 可显式设置 `PW_HEADLESS=true`。默认报告写入系统临时目录下的 `storyverse-e2e`。

若本机已安装 `playwright-skill`，也可复用其依赖：

```powershell
$env:TARGET_URL = 'http://localhost:5174'
node 'C:/Users/wangxr/.codex/skills/playwright-skill/run.js' e2e/journey.cjs
```

测试失败返回非零退出码，并保存失败截图。该套测试验证本地体验闭环，不表示已经接通云端账号、真实 AI、联机或支付。

`recovery.cjs` 另外验证真实备份下载、无效 JSON 上传被拒绝、取消恢复、确认恢复与旧存档留存、损坏存档保护、存储额度不足以及禁止访问 localStorage 的降级体验。故障注入只影响临时测试上下文，下载内容使用虚构人物资料。

`gemini.cjs` 在浏览器的 HTTP 边界模拟 `/api/status` 和 `/api/generate`，不需要密钥，也不会访问真实模型。它验证完整六章创作、选择前停止预取、真实响应正文保留、分享人工检查、两个原创故事的 AI 合流、500 错误重试、连击去重、取消开局、迟到分支响应丢弃，以及刷新后继续预取。可单独运行 `node e2e/gemini.cjs`。
