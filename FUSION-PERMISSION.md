# FUSION-PERMISSION — 合流权限三态与申请流程批（REQ-49）

用户 2026-10-30 23:30 亲定：合流是两个人的事——自己的书随便合；用别人的书合流，看对方的**账号级设置**：自由（直接可合）/ 询问（先申请，对方在提醒里同意或拒绝，同意后申请人收到系统提醒凭授权合流）/ 禁止（不能申请、选不了）。**默认自由**，随时可在设置里改。助手定案：粒度=账号级（非逐书）；授权一旦给出不因对方事后改设置收回；拒绝也给申请人提醒；同一申请人对同一书已有待处理申请时不可重复提交。

基线 7bad905（远程 main，REQ-47/48）→ 分支 `fusion-permission`，本地提交，未 push、未部署（主助手统一集成）。

## 数据模型

| 数据 | 落点 | 形状 |
|---|---|---|
| 设置 | profile 记录（`user_profiles`，social-store）新字段 `fusionPermission` | `'free' \| 'ask' \| 'forbidden'`，**缺省 = 'free'**（归一化 `fusionPermissionOfRecord`，非法值一律读作 free） |
| 申请 | 新集合 `fusion_requests`（social-store，内存 + Firestore 双实现） | `{ id, applicantUid, authorUid, publicationId, bookTitle, storyTitle, avatarName, status: pending\|approved\|rejected, createdAt, decidedAt }`；bookTitle 取服务端出版记录原文，不信申请人自报；storyTitle/avatarName 是申请人声明的自家线/化身，截断落库 |
| 授权 | 新集合 `fusion_grants`（同上） | 以 (applicantUid, publicationId) 为键一条：`{ applicantUid, authorUid, publicationId, bookTitle, requestId, grantedAt }`。**只写不删**——设置事后改成 forbidden 也不收回（测试钉死） |
| 提醒事件 | 既有 `account_events` | 裁决时给申请人写 `kind: 'fusion-approved' \| 'fusion-rejected'`、detail=书名（40 字截断，与既有事件同纪律） |

合流产物新增钉子：`createMergedStory` 在故事上钉 `sourcePublicationIds: [a侧, b侧]`（进入线取其 `config.sourcePublicationId`，自有原创为 `''`），与 `derivedFrom`/`sourceTitles` 并列；`persistence.validateLibrary` 同步放行校验。公开快照（plazaSnapshot）不复制该字段——源出版 id 不出服务端，与 FUSION2 既有口径一致。

## 接口（全部登录态，401 走 auth-required 口径）

| 路由 | 作用 |
|---|---|
| `PUT /api/me/profile { fusionPermission }` | 保存设置（既有 profile 端点扩展；非法值 400）；profile 载荷 `editable.fusionPermission` 回读当前值 |
| `POST /api/fusion/status { publicationIds[] }` | 合流页逐书真相：`{ authorUid, permission, granted, pending, own }`；书已下架/不存在答 `{ state: 'gone' }`；单次上限 50 本 |
| `POST /api/fusion/requests { publicationId, storyTitle?, avatarName? }` | 提交申请。拒绝口径逐条明示：自己的书 400（不用申请）、已授权 409、自由 400（不用申请）、禁止 403、已有待审 409、书不存在 404 |
| `GET /api/fusion/requests` | 本人双向申请列表（incoming / outgoing，新→旧，各 50） |
| `POST /api/fusion/requests/decide { requestId, approve }` | 只有申请里命名的作者能裁决（他人 404 不给 oracle）、仅 pending 可裁（重复裁决 409）；同意在同一串行步内写授权 + 给申请人写系统事件 |

服务层 `server/fusion.js`（createFusionService），申请/裁决按 （申请人×书）/申请 id 串行化，与 plaza 发布同纪律。装配：`createServer` 新增 `fusion` 注入位；默认装配时 social store / plaza store 各建**一个共享实例**同时喂 social、plaza、fusion 三个服务（沿 feed/ratings 共享 store 的先例，防内存模式下链断裂）；plaza 改为体内构造以便把共享 social store 交给它的发布门。

## 执法点与边界（如实）

**硬执法（服务端，绕不过）**
1. 申请/授权 API 本身：上表全部拒绝口径都由服务端按真实记录判定，不信请求体里的作者、书名与状态。
2. **发布门复检**（`server/plaza.js publish`，非手写分支）：合流书上架时，对其 `sourcePublicationIds` 逐个核对——来源书仍在架且作者≠本人时，须「作者当前设置为 free」或「存在本人对该书的授权」，否则 403。作者把设置从 ask 改到 forbidden 也拦得住没授权的（授权在则放行）。
3. 消息中心条目由真实记录派生：申请 pending 期间作者互动类目出现 `fusion_request` 条目（带 requestId），裁决后自动消失；申请人结果走系统类目事件，不伪造、不回填。

**客户端执法（官方客户端内有效）**
4. 合流页（Merge）：进入线按 /api/fusion/status 逐本上门——free/已授权可选；ask 无授权时卡片置灰、徽章「需先申请」，点卡即提交申请（成功后变「申请中」并出提示行）；已有待审为「申请中」不可选；forbidden 置灰标「对方未开放合流」不可选。点合流按钮时再复检两侧门（与选线同判据）。自己的线与示例书永不受限。
5. 设置 UI：个人主页 → 设置 → 新增「社交」组 · 合流权限行（自由/询问/禁止三段，与主题分段同制式），规矩文案两句：「别人用你的书合流时按这里办。选『询问』，对方要先申请、你同意后才能合。」保存走 profile 端点、失败回滚并报错。
6. 消息中心：互动类目合流申请行带「同意 / 拒绝」按钮（裁决后整行随刷新消失）；系统类目文案——通过：「合流申请已通过 / 你申请合流的《X》已通过，可以进行合流了。」（用户指定句）, 拒绝：「合流申请未通过 / 《X》的作者这次没有同意合流申请。」

**边界（不假装的部分）**
- 故事创建在本机客户端完成、已发布书的正文对读者公开是产品设计本身——所以「创建合流故事」这一步没有服务端调用可拦，靠官方客户端的选线门 + 发布门复检两道。改装客户端可以绕开选线门在本机生成，但**上不了书城**（发布门按服务端记录复检），产物只留在其本机书架。
- 存量合流书（本批之前创建）没有 `sourcePublicationIds`，发布门无从核对、放行通过；新创建的合流书自带钉子。
- 来源书在合流后被作者下架/删除的，发布门查无此书 → 不拦（已无可咨询的作者，产物按发布者自己的书处理）；授权记录仍在，只是失去对象。
- 合流页在未登录/状态接口不可达时门保持开放（不因网络问题锁死用户自己的书架），发布门仍是后盾——此取舍与本文件第 4 条的判据一致。
- 本批基线（7bad905）下合流发布门仍是 FUSION2 旧规（仅 endless 合流可发布）；merged-publish-gate 分支的「已完结合流可发布」泛化与本批的授权复检是 publish() 内相邻两段，集成时按序叠加即可，复检段只对 `kind === 'merged'` 生效、与门规正交。

## 测试

- 新增 `tests/fusion-permission.test.js` 10 条：词汇/门纯函数、createMergedStory 钉子、设置默认/保存/非法值/不被其他字段保存冲掉、free 默认全链路（status/申请拒绝/自己的书/未登录 401）、ask 全生命周期（申请→防重复 409→作者消息中心条目+未读→非作者裁决 404→同意写授权→重复裁决 409→条目消失→申请人系统提醒→作者改 forbidden 后授权仍在）、forbidden 403、拒绝路径（系统提醒+可再申请）、发布门三态（ask 无授权 403 / 授权后 200 / free 直通 200）。
- 存量用例更新 1 处：`tests/profile-custom-server.test.js` 的 editable 精确形状断言加入新字段 `fusionPermission: 'free'`（字段新增的预期变化，非行为回归）。
- 全量：915 条，**910 过**；失败 5 条全部是 dedup 样本图 ENOENT 环境类（新 worktree 无 dedup-shots 素材，与基线同类）；`npm run build` 通过。
