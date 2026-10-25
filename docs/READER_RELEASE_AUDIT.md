# 阅读升级发布审计

审计日期：2026-10-22。用于本轮阅读版发布、候选修订验收和回滚。以下云状态是发布前的独立只读快照，**不是新版本已上线的证明**。正式模型和预算仍以 [AI_CLOUD_DECISIONS.md](AI_CLOUD_DECISIONS.md) 为准。

## 当前结论

阅读客户端可以在测试通过、用户确认发布范围后单独发布。付费生成不能认定为商业化审核通过：`/api/generate` 尚无可信用户权益、按用户持久化额度、累计费用上限或用量账本；账号功能也未完成真实云配置。新安全开关只是暂停在线生成，不等于完成这些能力。

- **安全阅读版：** 在部署的环境中显式设置 `GENERATION_ENABLED=false`；已有故事、预设开书、阅读、选择和本机分享/合流继续使用。关闭期间不能续写需要在线生成的新章节。
- **启用在线生成：** 先完成身份、可信授权、额度与实际费用计量，再单独审核和明确启用。缺省开关保留历史行为，不能依赖“没有写 true”来确保关闭。
- 本审计与开关实现未修改生产、创建账号、发邮件、提交 Git 或调用收费模型。仅新增本地代码/测试和发布包装配置。

## 生产快照与权限证据

| 项目 | 只读实测 |
| --- | --- |
| 项目 / 区域 / 服务 | `project-175c4bc7-52ff-4b6d-b53` / `asia-northeast1` / `storyweave` |
| URL | `https://storyweave-5btfstcrda-an.a.run.app` |
| 100% 流量修订 | `storyweave-00002-cz4` |
| 服务级 min / max | 1 / 1 |
| 并发 / 超时 / 资源 | 8 / 75 秒 / 1 CPU、512 MiB |
| 运行身份 | `storyweave-runtime@project-175c4bc7-52ff-4b6d-b53.iam.gserviceaccount.com` |
| 公开访问 | `allUsers` 具有 `roles/run.invoker` |
| AI | Vertex AI、global、`gemini-3.8-flash`；`/api/status` 当时 configured=true |
| 健康 | `/api/health` HTTP 200 |
| 管理工具 | Google Cloud SDK 589.0.0；活跃身份在目标项目具有直接 `roles/owner` |
| 身份服务 | Identity Toolkit API 已启用，但项目 config 与 Google provider 的已认证只读查询均返回 `CONFIGURATION_NOT_FOUND` |

生产当时没有 Firebase 应用环境配置。初始化身份服务、注册 Web 应用、启用 Google/邮箱登录、授权域名、邮件/密码策略以及真账号验收仍待完成，详见 [AUTH_SETUP.md](AUTH_SETUP.md)。管理权限已可用，不代表组织策略、构建或第三方依赖已通过部署验证。

保留以上生产服务、公开站点访问方式、实例、运行身份、资源和模型基线。旧首次部署示例的 min=0/私有访问不适用于本次升级。修订层旧 maxScale=20 不高于服务级 max=1 的实际约束；实例上限也不是累计账单封顶。[Cloud Run 最大实例规则](https://docs.cloud.google.com/run/docs/configuring/max-instances)

## 开关协议与测试边界

`server/index.js` 在创建服务时读取字符串配置；修改后需新进程/修订生效。

| 配置 | `/api/status` | 同源 `POST /api/generate` |
| --- | --- | --- |
| `GENERATION_ENABLED=false` | HTTP 200，`configured:false`、`reason:"generation-disabled"` 和安全中文说明；不读取 provider 状态 | HTTP 503；在解析正文与调用 generator 前拒绝 |
| 缺省或 `true` | 保留 provider 原状态 | 保留原调用流程，不授予新增安全保证 |

关闭状态不受请求体 paid/开关字段、Bearer 字符串或客户端 header 改写。原来源校验仍先执行，因此不合法来源可返回 403，而不是 503。健康、静态页面和账号配置接口不受开关影响。开关不是运行中任务的取消器；旧修订已接受的请求仍可能产生费用。

验证命令：`node --test tests/release-safety.test.js tests/gemini-server.test.js tests/auth-server.test.js`，本次 28/28 通过，其中 7 项为新开关边界。全部使用注入 provider 与本地 HTTP，无收费请求。这不替代主任务完整阅读/浏览器验收。

发布源包已排除 `.impeccable/`、`assets/`、`DESIGN.md` 和 `PRODUCT.md`；保留 `public/`。`gcloud meta list-files-for-upload` 复查：63 个源文件、上述不必要项 0 个、`public/art` 17 个、客户端和服务端入口均保留。CI 已统一 `GENAI_BACKEND` 拼写并显式关闭在线生成。

## 发布操作顺序

1. 先取得用户对安全阅读版范围的确认，完成全量本地测试、构建、阅读/生成选项浏览器验收与依赖检查。单独记录未完成的真机、真实登录、模型质量、负载及商业化条件。
2. 重读当前服务流量、配置和 IAM，保留既有项目参数；执行源包文件清单检查。以下命令是候选发布示例，本文未执行：

   ```powershell
   $storyGcloud = 'C:\Users\wangxr\AppData\Local\GoogleCloudCliPortable\google-cloud-sdk\bin\gcloud.cmd'
   & $storyGcloud run deploy storyweave --source . --project project-175c4bc7-52ff-4b6d-b53 --region asia-northeast1 --no-traffic --tag ios-reader --update-env-vars GENERATION_ENABLED=false --quiet
   & $storyGcloud run services describe storyweave --project project-175c4bc7-52ff-4b6d-b53 --region asia-northeast1 --format='json(status.latestReadyRevisionName,status.traffic)'
   ```

3. 从返回值取得实际候选修订和 tag URL，检查 Ready、首页资源、健康、状态禁用、有效同源生成请求返回 503、账号真实状态与手机阅读；不发真实模型调用。tag 仍继承公开 IAM，不是私密测试环境。旧主站在切流前仍运行旧修订。
4. 所有候选检查通过后，用**实际返回的新修订名**替换占位符，再切流。检查正式 URL 的相同结果和 min/max 等关键配置，然后记录构建 ID、修订、时间、流量和验证结果。

   ```powershell
   & $storyGcloud run services update-traffic storyweave --project project-175c4bc7-52ff-4b6d-b53 --region asia-northeast1 --to-revisions NEW_VERIFIED_REVISION=100
   ```

使用 `--update-env-vars` 仅补充所需配置。`--set-env-vars` 会先移除所有既有环境变量，不适合照抄为本次更新命令。[官方 CLI 语义](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy)

## 回滚约束

本次审计前的代码回滚目标是 `storyweave-00002-cz4`：

```powershell
& $storyGcloud run services update-traffic storyweave --project project-175c4bc7-52ff-4b6d-b53 --region asia-northeast1 --to-revisions storyweave-00002-cz4=100
```

**此旧修订没有生成开关，回滚会恢复公开付费生成暴露。** 优先回到已经验证且关闭在线生成的安全修订；只有理解上述影响并有明确恢复方案时才使用旧目标。流量回滚不重新执行完整依赖检查，现有在途请求仍会完成。[官方发布与回滚说明](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
