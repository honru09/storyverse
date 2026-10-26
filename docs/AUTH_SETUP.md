# 身份接入（双通道）与生成用量

本站有两条登录通道，服务端收敛成同一种身份 `{ uid, email, displayName, emailVerified, provider }`：

- **通道 A · Firebase**：Google 弹窗登录、邮箱注册/登录、验证邮件、密码重置、身份刷新、退出和 SDK 会话恢复。
- **通道 B · 邮箱验证码**（本站自有 API，不经过任何 Google 前端服务）：`POST /api/auth/email/start` 发 6 位验证码，`POST /api/auth/email/verify` 换本站会话令牌。任何能收邮件的邮箱都可用，包括中国大陆邮箱。

在此之上还有两件事：`AUTH_ENABLED=true` 时 `/api/generate` 强制登录并按用户执行每日 token 上限；每个用户的累计生成消耗（token 与次数）持久化保存，并在账号面板「我的消耗」展示。

## 先分清边界

账号仅证明「你是谁」，不代表云同步、跨设备书架、套餐或订阅。故事与阅读进度仍属于当前浏览器的本机书架；不同账号切换也不会分割或迁移这份本机数据。共用设备退出账号后，本机书架仍留在该浏览器，敏感故事应自行导出/清理。

`GET /api/account` 返回校验过的身份、`provider`（`firebase` 或 `email-code`）、该用户的累计 `usage`，以及 `storage: "local"`、`entitlements: null`、`subscription: null`。未验证邮箱的用户仍能使用本机阅读，但界面必须如实标记 `emailVerified: false`（邮箱验证码用户天然为已验证）。此接口不根据前端状态、邮箱地址、用户提交的 paid 字段或其他未经建立信任的订阅信息授予权限。

## 生成鉴权与每日上限

- `AUTH_ENABLED` 未开启（或没有任何一条通道可用）时，`/api/generate` 保持历史行为，不要求身份——本地开发不受影响。
- `AUTH_ENABLED=true` 且至少一条通道可用时，`/api/generate` 必须携带有效身份（任一通道），无身份或凭证无效返回 `401 { code: "auth-required" }`，客户端会明确提示先登录。
- 生成前按用户检查当日（UTC 自然日，北京时间 08:00 / 东京 09:00 刷新）累计 total token：环境变量 `GENERATION_DAILY_TOKEN_CAP`，默认 `1000000`。达到上限返回 `429 { code: "quota-exceeded" }`；检查是生成前的预检，本次生成本身可以把当日用量推过上限。
- 用量存储不可用时**放行**生成并写日志（fail-open）：配额与统计是记账，不能反过来把创作打死。生成结果的落账失败同样不影响章节返回。

## 每人总消耗

- 存储在 Firestore（见下「数据存储」）：`usage_totals/{uid}` 存累计 `{ prompt, candidates, thoughts, cached, total, generations, updatedAt }`；`usage_daily/{uid}_{yyyymmdd}` 存当日同构数据，供配额预检。
- `/api/generate` 成功后服务端累加；provider 未返回用量（`unknown`）时只记 `generations` 次数、不编造 token 数。
- stdout 的 `generation-usage` 日志行新增 `uid` 字段（其余仍只有 model、storyId、chapter、genreTemplateId 与 token 数，永不含正文）。
- 账号面板登录后显示「我的消耗」：累计总 token、输入/输出/思考分项与生成章节数，大数以「万」展示；点「刷新」重新向 `/api/account` 读取。

## 通道 B：邮箱验证码

- `POST /api/auth/email/start { email }`：生成 6 位验证码，服务端只存加盐 SHA-256 哈希（`email_login_codes/{邮箱哈希}`），10 分钟过期、最多尝试 5 次、重发冷却 60 秒（冷却内不重发，旧码继续有效）。无论邮箱是否「已注册」——本站没有预注册概念——响应永远是同一个 `{ ok: true }`，不构成枚举预言机。邮件发送失败只写服务端日志，响应不变；运维应监控日志中的 `email-code: send failed`。
- `POST /api/auth/email/verify { email, code }`：校验通过后签发会话令牌（随机 32 字节），服务端只存其哈希（`site_sessions/{令牌哈希}`），30 天过期；`POST /api/auth/email/signout`（Bearer）立即撤销。用户 uid 为 `em_` + 规范化邮箱 SHA-256 的前 32 位，同一邮箱永远同一 uid；`emailVerified` 视为 `true`。
- 邮件经 SMTP 发送，凭据只读环境变量 `SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM`（`SMTP_PORT=465` 走 TLS，其余走 STARTTLS）。未配齐时该通道在 `/api/auth/config` 中为 `emailCode: false`，start/verify 返回安全的 503 未配置错误，**不会假装发送**。
- 开关：`EMAIL_CODE_ENABLED=false` 可强制关闭；默认在「SMTP 配齐 + 数据存储可用」时自动开启。
- 客户端把会话令牌存在 `localStorage`（键 `storyweave.site-session`），与 Firebase SDK 的本机持久化同级；令牌不进 UI 状态、不写日志。退出登录会同时撤销服务端会话并清除本机副本。

## 数据存储

验证码、会话与用量都需要服务端持久层，由 `DATA_STORE` 选择：

- Cloud Run 上（`K_SERVICE` 存在）且已知项目 id（`FIREBASE_PROJECT_ID` 或 `GOOGLE_CLOUD_PROJECT`）时自动用 **Firestore**，与 Firebase Admin 共用同一个 app 与运行身份。
- `DATA_STORE=firestore` 可显式指定；`DATA_STORE=memory` 仅供本地开发（重启即丢，禁止生产使用）。
- 两者都不满足时存储不可用：通道 B 关闭、用量记为 0、配额 fail-open，其余功能不受影响。

## 手动配置（需项目所有者执行）

1. 在你有权限管理的 Firebase 项目中注册 Web 应用，复制其 Web 配置。前端 SDK 固定为 `firebase@12.19.0`（兼容本项目 Node 22）；服务端为 `firebase-admin@14.5.0`。
2. 在 Authentication 的登录方式中明确启用 Google 和 Email/Password，设置 Google 支持邮箱。在授权域名列表中加入正式站点域名，以及你实际使用的本地开发域名。不要假定 localhost 已自动加入；开发时建议统一使用 `localhost` 并在控制台核对。
3. 准备发信邮箱的 SMTP 凭据（通道 B 用；例如邮箱服务商的应用专用密码），只写进部署环境变量，不进仓库。
4. 复制 `.env.example` 到本机 `.env`，保留现有 Gemini 配置，单独填写以下项目，再将 `AUTH_ENABLED` 改成 `true`：

```dotenv
AUTH_ENABLED=true
AUTH_GOOGLE_ENABLED=true
AUTH_EMAIL_ENABLED=true
FIREBASE_API_KEY=Firebase专用的公开WebAPIKey
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project
FIREBASE_APP_ID=1:your-number:web:your-app
# 通道 B（邮箱验证码）
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=no-reply@example.com
SMTP_PASS=应用专用密码
SMTP_FROM=织界 <no-reply@example.com>
# 可选
# GENERATION_DAILY_TOKEN_CAP=1000000
```

`FIREBASE_AUTH_DOMAIN` 仅填主机名，不含协议、端口或路径。可使用已正确配置 Firebase Auth 托管处理器的自定义域名。任何必填项缺失、危险域名、与 `GEMINI_API_KEY` 相同的 key，或两种 Firebase 登录方式均关闭，均使通道 A 不可用；不会降级为演示登录。通道 A 不可用不连带关闭通道 B，反之亦然。

Firebase Web API key 是公开项目标识，但必须限制在 Firebase 所需 API 上；**不能启用 Gemini Developer API，也不能复用模型密钥**。服务端只对白名单字段 `apiKey/authDomain/projectId/appId` 提供公开配置，不返回环境变量整体、Admin JSON 或凭据路径。[Firebase API key 安全说明](https://firebase.google.com/docs/projects/api-keys)

5. 为后端配置独立、最小权限的身份验证凭据。Cloud Run 可使用运行服务账号（Application Default Credentials）；本地可通过 `FIREBASE_ADMIN_CREDENTIALS_FILE` 指向仓库外的服务账号 JSON。不要把 JSON、私钥或凭据放进 `public/`、`src/`、`VITE_*` 或 Git。不要为此给运行身份 Owner/Editor 权限。**IAM 建议（仅建议，由项目所有者在云端执行）**：运行身份授予 `roles/datastore.user`（Firestore 读写验证码/会话/用量）与 `roles/firebaseauth.viewer`（带撤销检查的 ID token 校验需要读取用户状态）。
6. 重启 API 服务。开发分别运行 `npm run api` 与 `npm run dev`；生产 `npm run build` 后 `npm start`。Vite 的 `/api` 代理沿用现有配置。正式环境必须使用 HTTPS。
7. 在 Firebase 控制台设置邮件模板、发信名称和密码策略，并开启适用的邮箱枚举保护。当前前端注册至少要求 8 位密码，Firebase 的服务端策略仍是最终约束；登录允许既有账号密码，不自行截断或修改密码。

不要在这个服务进程设置 `FIREBASE_AUTH_EMULATOR_HOST`。本实现明确拒绝模拟器配置，避免 Admin SDK 接受未签名模拟器令牌；自动测试使用注入依赖，不会连真实 Auth、SMTP 或 Firestore。

## 上线清单

- [ ] Firebase 控制台：启用 Google 与 Email/Password 登录方式；设置 Google 支持邮箱；邮件模板与发信名称已设置；邮箱枚举保护已开启。
- [ ] Firebase 控制台：授权域名包含正式站点域名（及本地开发用的 `localhost`）。
- [ ] 部署环境：`AUTH_ENABLED=true` 与四个 `FIREBASE_*` 已设置；`SMTP_*` 五项已设置（如需通道 B）。
- [ ] 运行服务账号：已授予 `roles/datastore.user` 与 `roles/firebaseauth.viewer`（建议值），未授予 Owner/Editor。
- [ ] `GET /api/auth/config` 返回 `enabled/emailCode` 与预期一致；未登录调用 `POST /api/generate` 返回 401 `auth-required`。
- [ ] 用测试账号在正式 HTTPS 域名与手机浏览器实测：Google 登录、邮箱注册+验证邮件、邮箱验证码登录、生成一章后账号面板「我的消耗」数字增加。

## 客户端接口与状态

`createAuthClient({ fetchImpl?, loadSdk?, sessionStore? })` 位于 `src/auth/client.js`。正常使用不传入依赖；测试可替换这三个系统边界。

- `getSnapshot()`、`subscribe(listener)`、`start()`、`stop()`。`start()` 幂等，初始化失败会安全 resolve 并写入状态；`stop()` 清理会话监听与未完成 HTTP 请求，可再次 `start()`，不会替用户退出任何通道的会话。`subscribe` 返回取消订阅函数。
- 通道 A：`signInWithGoogle()`、`register(email,password)`、`signIn(email,password)`、`resetPassword(email)`、`sendVerification()`。
- 通道 B：`requestEmailCode(email)`、`signInWithEmailCode(email, code)`。面板自带 60 秒重发倒计时（服务端同样强制冷却）。
- 通用：`refreshUser()`、`signOut()`（结束当前通道会话；两种会话并存时一并结束）、`getIdToken()`（仅 Firebase）、`getAccessToken()`（任一通道的当前 bearer 令牌，游客返回 `null`；生成请求自动附带，收到 401 时界面明确提示先登录）。
- 状态：`loading / unavailable / guest / authenticated / error`，字段 `user/error/notice/config/busy/usage`。`user` 只含 `uid/email/displayName/emailVerified/provider`；`usage` 是服务端确认的累计用量或 `null`。`error/notice` 是可渲染的安全中文字符串或 null。
- 所有交互操作单飞，重复提交抛 `auth/busy`；取消弹窗抛 `auth/cancelled`，返回游客状态并给出普通提示。账号操作错误只暴露预定义中文信息，不输出原始 SDK 信息、密码或令牌。
- 任一通道登录成功之后必须经 `/api/account` 确认同一 `uid`，才进入 `authenticated`；恢复旧会话也一样。服务端不可达或令牌被拒绝时，`user` 为 null，不展示假验证状态。
- 注册成功后自动请求验证邮件；若发信失败，账号依然可能已经创建，界面会明确要求重新发信，不冒充已发出。点击邮件后返回站点，使用 `refreshUser()` 重新加载用户、强制刷新 ID token、再由后端确认邮箱状态。
- 密码重置对未知邮箱与正常请求使用同样的条件式成功文案，避免在应用层增加账号枚举信息。

凭据持久化：Firebase 侧完全交给 Firebase SDK；本站代码不保存密码、不缓存 Firebase bearer token。通道 B 的会话令牌按上文存 `localStorage`，服务端只存其哈希且可撤销。[会话与用户管理](https://firebase.google.com/docs/auth/web/manage-users)

## 服务端与 CSP

`GET /api/auth/config` 未配置时返回 HTTP 200 的禁用状态（含 `emailCode: false`）。`GET /api/account` 要求 `Authorization: Bearer <令牌>`：Firebase 令牌用 Admin SDK `verifyIdToken(token, true)` 校验签名、项目、有效期及撤销/禁用状态；本站会话令牌查哈希记录。缺失、非法、过期或撤销凭证为 401；配置或基础服务故障为安全的 503，不泄露内部错误。前端 SDK 导入为动态加载，禁用通道 A 时不会加载 Firebase；通道 B 是同源 API，不需要任何 CSP 放行。[ID token 验证](https://firebase.google.com/docs/auth/admin/verify-id-tokens)

正式静态服务 CSP 仅在通道 A 已配置时放行 `apis.google.com` 脚本、`identitytoolkit.googleapis.com` / `securetoken.googleapis.com` 连接及配置中那个 `authDomain` 的连接和 iframe；不使用全域通配符或 unsafe-eval。标准 Google popup 与邮箱密码流程在本轮范围内；手机若拦截弹窗，会提示允许弹窗或改用邮箱登录/验证码，未自动接入 redirect、MFA、短信或 reCAPTCHA Enterprise 流程。[Google 登录](https://firebase.google.com/docs/auth/web/google-signin)

Firebase 总包会包含本应用未导入的 Firestore 依赖。为避免其传递依赖带入已公开的 gRPC 漏洞，`package.json` 将 `@grpc/grpc-js` 固定覆盖到已修补的 1.14.6。请在未来升级 Firebase 时复核是否仍需此覆盖，不要运行 `npm audit fix --force` 降级主 SDK。[上游安全公告](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j)

## 验证范围

`npm test` 包含配置白名单、禁用态、非法/过期/撤销 token、基础服务错误、服务端身份确认、注册/验证/重置、取消与单飞、恢复会话、监听卸载、迟到响应和 CSP 的隔离测试，以及通道 B 的验证码生命周期（过期/尝试上限/冷却/防枚举）、会话签发与撤销、双通道身份解析、生成 401/429 配额、用量累加（含 unknown 只记次数）、客户端验证码流程与消耗展示格式。依赖审计命令为 `npm audit --omit=dev`。

这些测试不代表已经验收某个真实 Firebase 项目的授权域名、邮件送达、Google consent、SMTP 投递或 Admin IAM。项目所有者配置完成后，需按上方上线清单用自有测试账号在正式 HTTPS 域名及手机浏览器实际验收；代码侧没有创建真实账号、发送真实邮件或变更任何远端云资源。
