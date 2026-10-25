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

## iOS 升级验证（2026-10-22）

`onboarding.cjs` / `npm run test:onboarding` 是新增16项体验回归：真实未配置API、Google/邮箱禁用状态、重连确实重新请求、游客继续、草稿恢复、阅读字号/行距/浅暖夜、Esc归焦、刷新持久化与故事字节不变。需要构建后的真实API服务，不是只有Vite preview的静态服务器；以 `AUTH_ENABLED=false`、空模型key运行 `node server/index.js`，目标用 `TARGET_URL` 指定。不会创建真实账号或调用收费模型。CI改为同源Node静态/API服务运行两套测试；未声称远端Actions已执行。

当前三个流程脚本共36项通过：`journey.cjs` 28项、`recovery.cjs` 4项、`gemini.cjs` 4项。恢复脚本创建下一本书前明确退出阅读器，不依赖旧版隐藏阅读工具栏的偶然导航行为。

`visual.cjs` 在全新上下文捕获320×740、390×844、1440×960与实际用户窗口445×621下的15种页面/状态：首次首页、账号、世界、角色、能力、开局、阅读、设置、夜读、决策、目录、书城、合流、结果、返回首页。它等待字体和图片、关闭系统动画，并验证溢出、图片、未捕获异常、44px触控、阅读工具行及造世按钮不被底栏遮住。它不是像素相似度断言，也不替代人工设计复核。

以正在运行的同源应用为例：

```powershell
$env:TARGET_URL = 'http://127.0.0.1:5173'
$env:PW_ARTIFACT_DIR = 'D:/Projects/Novel/.impeccable/review'
node e2e/visual.cjs
```

60张当前截图和 `visual-report.json` 在 `.impeccable/review/`（本地忽略目录）。流程报告在临时目录 `storyverse-e2e/`；未将用户存档或模型密钥放进测试夹具。完整范围见 [升级验收](../docs/IOS_UPGRADE_VERIFICATION.md)。
