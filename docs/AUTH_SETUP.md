# Firebase 身份接入

本轮接入 Google 弹窗登录、邮箱注册/登录、验证邮件、密码重置、身份刷新、退出和 SDK 会话恢复。默认关闭，不会自动创建 Firebase 项目、启用远端服务、创建真实用户或调用付费模型。

## 先分清边界

账号仅证明「你是谁」，不代表云同步、跨设备书架、套餐、订阅或生成额度。故事与阅读进度仍属于当前浏览器的本机书架；不同账号切换也不会分割或迁移这份本机数据。共用设备退出账号后，本机书架仍留在该浏览器，敏感故事应自行导出/清理。

`GET /api/account` 只返回校验过的身份以及 `storage: "local"`、`entitlements: null`、`subscription: null`。未验证邮箱的用户仍能使用本机阅读，但界面必须如实标记 `emailVerified: false`。此接口不根据前端状态、邮箱地址、用户提交的 paid 字段或其他未经建立信任的订阅信息授予权限。

**重要：现有 `/api/generate` 未在本轮加上认证、按用户限额或付费检查。公开部署仍有生成入口被滥用和产生费用的风险。身份接入不等于计费安全，也不等于可直接公开商业上线。** 本轮未修改 Gemini 生成行为。下一步上线前应单独设计后端鉴权、配额、速率限制、可信支付回调和成本上限。

## 手动配置（需项目所有者执行）

1. 在你有权限管理的 Firebase 项目中注册 Web 应用，复制其 Web 配置。前端 SDK 固定为 `firebase@12.19.0`（兼容本项目 Node 22）；服务端为 `firebase-admin@14.5.0`。
2. 在 Authentication 的登录方式中明确启用 Google 和 Email/Password，设置 Google 支持邮箱。在授权域名列表中加入正式站点域名，以及你实际使用的本地开发域名。不要假定 localhost 已自动加入；开发时建议统一使用 `localhost` 并在控制台核对。
3. 复制 `.env.example` 到本机 `.env`，保留现有 Gemini 配置，单独填写以下项目，再将 `AUTH_ENABLED` 改成 `true`：

```dotenv
AUTH_ENABLED=true
AUTH_GOOGLE_ENABLED=true
AUTH_EMAIL_ENABLED=true
FIREBASE_API_KEY=Firebase专用的公开WebAPIKey
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project
FIREBASE_APP_ID=1:your-number:web:your-app
```

`FIREBASE_AUTH_DOMAIN` 仅填主机名，不含协议、端口或路径。可使用已正确配置 Firebase Auth 托管处理器的自定义域名。任何必填项缺失、危险域名、与 `GEMINI_API_KEY` 相同的 key，或两种登录方式均关闭，均使认证不可用；不会降级为演示登录。

Firebase Web API key 是公开项目标识，但必须限制在 Firebase 所需 API 上；**不能启用 Gemini Developer API，也不能复用模型密钥**。服务端只对白名单字段 `apiKey/authDomain/projectId/appId` 提供公开配置，不返回环境变量整体、Admin JSON 或凭据路径。[Firebase API key 安全说明](https://firebase.google.com/docs/projects/api-keys)

4. 为后端配置独立、最小权限的身份验证凭据。Cloud Run 可使用已获准访问此 Firebase 项目的运行身份（Application Default Credentials）；本地可通过 `FIREBASE_ADMIN_CREDENTIALS_FILE` 指向仓库外的服务账号 JSON。不要把 JSON、私钥或凭据放进 `public/`、`src/`、`VITE_*` 或 Git。不要为此给运行身份 Owner/Editor 权限。撤销检查需要后端读取用户状态的权限。
5. 重启 API 服务。开发分别运行 `npm run api` 与 `npm run dev`；生产 `npm run build` 后 `npm start`。Vite 的 `/api` 代理沿用现有配置。正式环境必须使用 HTTPS。
6. 在 Firebase 控制台设置邮件模板、发信名称和密码策略，并开启适用的邮箱枚举保护。当前前端注册至少要求 8 位密码，Firebase 的服务端策略仍是最终约束；登录允许既有账号密码，不自行截断或修改密码。

不要在这个服务进程设置 `FIREBASE_AUTH_EMULATOR_HOST`。本实现明确拒绝模拟器配置，避免 Admin SDK 接受未签名模拟器令牌；自动测试使用注入依赖，不会连真实 Auth。

## 客户端接口与状态

`createAuthClient({ fetchImpl?, loadSdk? })` 位于 `src/auth/client.js`。正常使用不传入依赖；测试可替换这两个系统边界。

- `getSnapshot()`、`subscribe(listener)`、`start()`、`stop()`。`start()` 幂等，初始化失败会安全 resolve 并写入状态；`stop()` 清理会话监听与未完成 HTTP 请求，可再次 `start()`，不会替用户退出 Firebase 会话。`subscribe` 返回取消订阅函数。
- `signInWithGoogle()`、`register(email,password)`、`signIn(email,password)`、`resetPassword(email)`、`sendVerification()`、`refreshUser()`、`signOut()`、`getIdToken()`。
- 状态：`loading / unavailable / guest / authenticated / error`，字段 `user/error/notice/config/busy`。`user` 只含 `uid/email/displayName/emailVerified`；`error/notice` 是可渲染的安全中文字符串或 null。
- 所有交互操作单飞，重复提交抛 `auth/busy`；取消弹窗抛 `auth/cancelled`，返回游客状态并给出普通提示。账号操作错误只暴露预定义中文信息，不输出原始 SDK 信息、密码或令牌。
- Firebase 成功之后必须经 `/api/account` 确认同一 `uid`，才进入 `authenticated`；恢复旧会话也一样。服务端不可达或令牌被拒绝时，`user` 为 null，不展示假验证状态。
- 注册成功后自动请求验证邮件；若发信失败，账号依然可能已经创建，界面会明确要求重新发信，不冒充已发出。点击邮件后返回站点，使用 `refreshUser()` 重新加载 Firebase 用户、强制刷新 ID token、再由后端确认邮箱状态。
- 密码重置对未知邮箱与正常请求使用同样的条件式成功文案，避免在应用层增加账号枚举信息。

凭据持久化完全交给 Firebase SDK；应用代码不手动写入 localStorage/sessionStorage，不保存密码，不缓存 bearer token。`getIdToken()` 仅为已通过后端校验的当前会话提供短期令牌，调用者必须通过 HTTPS 发给后端；不可用它替代服务端鉴权。[会话与用户管理](https://firebase.google.com/docs/auth/web/manage-users)

## 服务端与 CSP

`GET /api/auth/config` 未配置时返回 HTTP 200 的禁用状态。`GET /api/account` 要求 `Authorization: Bearer <Firebase ID token>`，使用 Admin SDK `verifyIdToken(token, true)` 校验签名、项目、有效期及撤销/禁用状态。缺失、非法、过期或撤销凭证为 401；配置或基础服务故障为安全的 503，不泄露内部错误。前端 SDK 导入为动态加载，禁用认证时不会加载 Firebase。[ID token 验证](https://firebase.google.com/docs/auth/admin/verify-id-tokens)

正式静态服务 CSP 仅在认证已配置时放行 `apis.google.com` 脚本、`identitytoolkit.googleapis.com` / `securetoken.googleapis.com` 连接及配置中那个 `authDomain` 的连接和 iframe；不使用全域通配符或 unsafe-eval。标准 Google popup 与邮箱密码流程在本轮范围内；手机若拦截弹窗，会提示允许弹窗或改用邮箱登录，未自动接入 redirect、MFA、短信或 reCAPTCHA Enterprise 流程。[Google 登录](https://firebase.google.com/docs/auth/web/google-signin)

Firebase 总包会包含本应用未导入的 Firestore 依赖。为避免其传递依赖带入已公开的 gRPC 漏洞，`package.json` 将 `@grpc/grpc-js` 固定覆盖到已修补的 1.14.6。请在未来升级 Firebase 时复核是否仍需此覆盖，不要运行 `npm audit fix --force` 降级主 SDK。[上游安全公告](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j)

## 验证范围

`npm test` 包含配置白名单、禁用态、非法/过期/撤销 token、基础服务错误、服务端身份确认、注册/验证/重置、取消与单飞、恢复会话、监听卸载、迟到响应和 CSP 的隔离测试。依赖审计命令为 `npm audit --omit=dev`。

这些测试不代表已经验收某个真实 Firebase 项目的授权域名、邮件送达、Google consent 或 Admin IAM。项目所有者配置完成后，需用自有测试账号在正式 HTTPS 域名及手机浏览器实际验收；本轮没有创建真实账号、发送真实验证邮件或变更远端云资源。
