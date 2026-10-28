# ACCOUNT-POLISH — 账号体验收尾批销账（2026-10-28）

基线 67dae85（PROFILE-FIX）之上叠加。条目口径以 `~/workspace/regression-persona/REGRESSION-PERSONA.md` 原文为准（N-01、F-06、F-08、N-05 + 清单外发现的主页 404）。登录体系红线未动：用户名+密码通道行为、防枚举统一文案、限速、会话口径一律不变。

## 1. N-01 找回状态查询慢网健壮化

- **根因**：客户端 `request()` 的 12 秒超时 abort 后抛出的是无 code 的 AbortError，被 `safeError` 吞成泛化文案「账号操作暂时未完成，请稍后重试。」（回归第一轮实况）；且全程无重试、无等待文案，一次抖动即死（第二轮「正在处理…」12 秒+ 无回执）。
- **改法**（`src/auth/client.js`）：
  - 新增错误码 `auth/network-timeout` 与专属文案「网络有点慢，没能连上账号服务。请检查网络后再试一次。」；`request()` 只把自家计时器触发的 abort 译为超时（`stop()` 的主动中止保持取消语义）。
  - `usernameRecoveryStatus` 改走 `requestWithRetry`：仅传输失败（超时 / TypeError）自动重试恰一次（间隔 600ms）；任何服务端答案（含 429）永不重试。
  - 客户端工厂新增可选 `timeoutMs`（默认 12000 不变），供测试注入。
  - 面板（`AccountPanel.jsx`）：请求持续 5 秒未回，表单内出现等待文案「网络较慢，仍在处理中，请稍等；如果一直没有结果，可以检查网络后重试。」
- **验证**：
  - 单元（tests/recovery-client.test.js 新增 3 条）：首回卡死→重试成功且恰 2 次请求；双回卡死→`auth/network-timeout` 专属文案（非泛化）；429→只发 1 次、报 `auth/too-many-requests`。
  - **弱网实测**（本地 AUTH 开启服务，Playwright 路由延迟注入，390 宽）：探针 A 首回请求延迟 13s（> 客户端 12s 超时）→ 自动重试 → **12,983ms 到达阶段面板、恰 2 次请求**；探针 B 全部请求延迟 30s → **5,399ms 慢网等待文案可见、24,673ms（≈12+0.6+12）落超时文案、恰 2 次请求后停手**。截图 `account-polish-shots/recovery-slow-wait.png`。

## 2. F-06 登录面板文案诚实化

- **根因**：游客页脚整句写死「没有 Google 账号，也可以用用户名或邮箱验证码登录」，只按 storage 分支切换，与 `emailCode` 开关无关——生产 `emailCode:false` 时照样承诺验证码登录。
- **改法**（`AccountPanel.jsx`）：页脚改为现场组装（`guestFooter`）：方式句只列 `methodOptions`（由 `usernameAvailable`/`codeAvailable` 推出）中真实开通的通道；存储句仍按 `config.storage` 事实源。验证码未开时页脚实测为「…没有 Google 账号，也可以用用户名登录。」（探针断言含此句且不含「邮箱验证码」）。
- **验证**：单元源码断言（tests/auth-panel-ui.test.js 新增）；实测截图 `account-polish-shots/login-footer-code-off.png` + `recovery-slow-wait.png` 底部同款页脚。

## 3. F-08 注册确认密码 + 报错不跨视图残留

- **根因**：注册表单只有一个密码框；报错残留的真源是客户端快照 `account.error` 全视图共享，面板 `changeMode` 只能清本地 `localError`，清不掉快照里的上一视图报错。
- **改法**：
  - 注册模式新增「确认密码」框（两路注册共用）：输入不一致即时红字提示；提交时在任何通道调用前拦截（`setLocalError("两次输入的密码不一致，请再确认。")` 直接 return，不发请求）；「创建账号」按钮在不一致时禁用。
  - 客户端新增 `clearError()`（只清快照 error，不碰 notice/会话）；`changeMode` 切换视图时同时清本地与快照报错。登出复位、操作成功路径同步清确认密码字段。
- **验证**：单元源码断言 3 条 + 客户端 `clearError` 行为测试 1 条；实测截图 `account-polish-shots/register-confirm-mismatch.png`（不一致红字在场、创建按钮禁用经探针断言）。

## 4. N-05 未配置文案矛盾清理

- **根因**：未配置态与「storage 非 synced」共用同一页脚分支，于是 AUTH 未配置时面板写「登录后书架仍保存在本机；不会自动上传故事或个人设定。」——登录本身不可用，却给了一个反向存储承诺。
- **改法与全站扫查结果**（逐处对齐到 `/api/auth/config` 同一事实源）：
  - 游客页脚：`!configured` 时只写「账号服务尚未配置。你仍可继续本机阅读。」（与客户端 unavailable 文案同句），不作任一方向存储承诺；加载中不渲染页脚。
  - 面板内 4 处「还没开通，可以改用 X」报错改为 `alternativeLoginText(exclude)` 现场组装，只列真实开通的替代通道（旧文案无条件点名验证码/邮箱）。
  - 帮助 FAQ「密码忘了怎么办」：用户名账号一句改为「邮箱找回通道开通后能用邮箱验证码重设（通道没开通时账号页会如实说明）」，不再无条件承诺。
  - 复核无误、未动：验证码页签显隐（本就由 `emailCode` 驱动）、注册提示 `registerHint`（本就按通道可用性分流）、已登录存储说明（仅登录后可见，此时配置事实已定）、找回各阶段面板文案（本就按 `channelOpen` 诚实分支）。
- **验证**：单元源码断言（含旧句 `不会自动上传故事或个人设定`、`可以用用户名或邮箱验证码登录` 全仓面板内除名）；onboarding e2e（AUTH 未配置态）18/18 全过。

## 5. 无化身账号主页 404（清单外发现）

- **根因**：`social.profile()` 与 `exists()` 以「资料记录 / 化身记录 / 已发布」任一足迹为存在性判据；刚注册、没建化身的账号被深链打开即 404「这位用户还不存在。」
- **改法**（`server/social.js`）：新增 `accountExists(uid)` —— `username:` 账号查 identity store 的注册记录；`profile()` 与 `exists()`（关注/举报/名单共用）都先认账号本身。无化身账号返回 200 诚实空主页：显示名=用户名（既有兜底序）、头像=默认头像、`avatar: null`（展示位缺失不编造）、计数全 0。真不存在的 uid 仍 404。
- **连带修复**（`server/index.js`）：默认接线下 auth 子服务与 social 各建一个 identity store —— Firestore 模式共用同一集合无碍，**内存模式是两张互不可见的 Map**，实测默认接线下新判据不生效（注册完立刻深链仍 404）。`createServer` 改为默认服务共用一个 identity store 实例（注入自有服务的调用方自理，与测试夹具同理）。
- **验证**：服务端测试新增 1 条（共享 store 夹具：无化身账号 200 且 payload 形状逐项断言、`username:ghost_user` 与无名 uid 双路 404）；默认接线实例实测：注册 `slow_reader` 后直接 GET profile → 200（avatar:null、默认头像、零计数）。截图对照 `account-polish-shots/profile-no-avatar.png`（fresh_face2 主页窗口正常打开）与 `account-polish-shots/profile-404.png`（ghost_user 仍报「这位用户还不存在。」）。

## 总验证

- 单元全量：**653/653 全绿**（本批新增 10 条：social +1、recovery-client +4、auth-panel-ui +5）。
- e2e：onboarding 18/18、recovery（存储恢复）4/4，均在本地服务实跑。
- 弱网实测：见 §1（探针 A/B 均为实测数字）。
- 截图：`account-polish-shots/`（不入库）5 张：login-footer-code-off / register-confirm-mismatch / recovery-slow-wait / profile-no-avatar / profile-404，390 宽。
- 口径定案：DESIGN.md §34。
