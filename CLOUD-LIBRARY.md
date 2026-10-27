# CLOUD LIBRARY 批次处置（2026-10-27）

背景：PERSONA-QA F-23（34 条中排名第 1）——故事与阅读进度只存在生成它的
浏览器本地存储里，换会话/换设备/清缓存即整架丢失。本批让书跟账号走：
服务端按账号存书架，本地存储仍是离线工作副本。规格口径已写入 DESIGN.md
§17，本文件是逐项处置与验证证据。全部改动只在本地工作树，未 commit /
push / deploy。

## 1. 服务端存储（server/library-store.js、server/library.js）——完成

- 按仓库既有 store 先例实现：`createLibraryStore({ env, db })` 与
  avatar/plaza-store 同构——`dataStoreKind(env)` 决议，生产 Firestore、
  本地显式 memory、无配置返回 null（服务随之回 503「云端书架尚未开
  通」，与封面/化身未开通口径一致）。
- 拆分方案与尺寸理由：Firestore 单文档上限 1 MiB。一本 100 章长线的
  正文约 600 KB–1 MB 级、999 章无限连载约 6 MB 级，整书单文档必爆。
  故三层：`library_meta`（每账号一份索引：元数据条目+删除墓碑+阅读状
  态 blob，恒小）、`library_stories`（每书 head：除 chapters 外的全部
  字段+chunkCount，KB 级）、`library_chapters`（章节按序装箱，单箱
  JSON 预算 700 KB——常量 `CHUNK_BUDGET_BYTES`，为文档上限与记录框
  架留 300 KB+ 余量）。worldBible、config、choices、事件/伏笔台账（在
  章节 events/foreshadowing 内，随章节走）、readerIndex 全部随书往返。
- 不变量：head 存在 ⇔ 故事完整（写入恒先 chunk 后 head，索引最后更
  新）；缩小故事时删除多余的旧 chunk（有测试）。
- 键为 uid（+故事 id/序号）的 sha256，与既有 store 一致；URL 不带 uid。

## 2. 接口（server/index.js）——完成

`GET /api/library`（索引，无正文）、`GET /api/library/stories/:id`、
`PUT /api/library/stories/:id`（整书单发，服务端拆箱）、
`PUT /api/library/stories/:id/chunks/:n` + `PUT .../head`（大书两段
式：分块预存不可见，head 提交时服务端组装并全量校验后才可见）、
`DELETE /api/library/stories/:id`（删数据+留墓碑）、
`PUT /api/library/reading-state`。

- Owner-only 是构造性的：路由只用令牌解析出的 uid 寻址，请求里没有
  任何可指定他人 uid 的位置；B 账号取 A 的书恒 404（服务层+HTTP 层
  双测试）。
- 沿用既有约定：Origin 守卫覆盖全部 /api；请求体走 readPlazaJson
  （1.5 MB 上限，即既有 MAX_REQUEST_BYTES）；错误形状 { error, code? }，
  401 映射为「请先登录，再使用云端书架。」+ auth-required 码。
- 入库校验：复用客户端同一套 `validateLibrary`（src/persistence.js，
  服务端 import——与 avatar.js import src/avatar.js 同先例）；单发与
  head 提交都全量校验，分块单箱另有形状/序号连续性检查。
- 云端书架数据不进入任何公开面：广场仍走自己的发布副本与脱敏管线，
  本批没有触碰 plaza/avatar/social 的任何读写路径（仅 index.js 新增
  独立路由段）。

## 3. 客户端同步（src/cloud-library.js、src/main.jsx 接线）——完成

- 工作副本不变：library-store 与本地优先逻辑零改动；生成/阅读不等待
  网络。未登录行为与上线前完全一致（同步控制器只在 account 进入
  authenticated 后启动）。
- 登录合并（createCloudSync.merge，App 在 uid 出现时触发一次）：纯函
  数 `planMerge` 逐书对账——本地独有→上传、云端独有→下载、同 id 按
  updatedAt 新者胜、等时不动；下载与墓碑删除在一次 store.update 内
  落地（过本地同一套结构校验，坏数据进不来）。
- 删除传播：墓碑（云端删除记录，时间 ≥ 本地 updatedAt 才删本地，本
  地更新更晚则复活重传、服务端入库清墓碑）+ 本机已同步表
  （`storyweave:cloud-synced:<uid>` 存 id→updatedAt）区分「本机删
  除」与「本机从未有过」：前者传播 DELETE，后者只下载；合并永不因
  「云端没有」删除本地书。
- 写穿：App 订阅 library 变化，登录态下对 updatedAt 与已同步戳不同
  的故事防抖（2.5 s）排队上传、本机删除排队 DELETE、阅读状态
  （reading-locations blob 原始值变化）一并排队；全部失败静默留队，
  下一触发重试（控制器单链串行，merge 与 flush 不并发）。
- 阅读状态口径：新设备本地为空→云端灌入（直接写回 reading-locations
  的 localStorage 键，该 store 的 refresh 会读到新值）；本机已有→以
  本机为准并回传。章级 readerIndex 在故事内，随故事对账走。
- 恢复路径即 F-23 的解法：新浏览器 + 登录 + 本地空架 → 合并自动下
  载全部云端书与阅读位置（e2e 实证，见 §6）。
- 演示书（isDemo）不参与同步任何方向；合流（merged）故事与普通故
  事同规则同步，合流本地流程未动。

## 4. 诚实文案——完成

- 首页书架区新增状态行（.library-sync-note）：登录且已同步→「书架已
  同步到你的账号，换设备登录就能接着读。」；未登录且本地有书→
  「故事只保存在当前浏览器 · 登录后自动同步到账号，换设备不丢。」
  （无云端配置时为「…换设备或清理缓存会丢失。」）；书架与备份对话框
  同步显示同一行。
- 账号面板两处旧文案改为按 `account.config.storage` 区分：synced 时
  明示自动同步与本机留底，local 时保留原文案。
- 服务端 auth 配置/账号响应的 storage 字段不再写死：按
  `dataStoreKind(env)` 如实计算 synced/local，config message 同步改
  写（synced 时为「登录后，故事和阅读进度会自动同步到你的账号。」）；
  登录成功 notice（邮箱验证码/用户名注册/用户名登录三处）改走同一
  口径。既有断言 storage:'local' 的测试其 env 均未配存储，结论不变、
  全部保持绿。

## 5. 兼容性——完成

- 既有本地用户数据零迁移：STORAGE_KEY、库结构、故事 id 均未动；同
  步是叠加层。广场/化身/社交/封面流程未改（全量单测绿含其全部套件）。
- AUTH_ENABLED=false（onboarding/reader 的本地模式）：账号服务不可用
  → 同步控制器不启动，应用行为与之前一致（onboarding e2e 18/18 实
  证）；接口在未配存储时 503、未登录时 401，均不影响游客路径。

## 6. 测试与验证——完成

- 单测：477 → **501，全绿**（+24）。新增 tests/library-server.test.js
  （13：装箱拆分/超限拒绝、整书往返、超大书 head+chunk 存储与精确重
  组、缩书清旧 chunk、非法故事拒绝、两段式不可见→提交可见、head 提
  交拒绝缺块/内联正文、删除墓碑与复活清碑、阅读状态往返与形状校
  验、跨账号隔离、无存储 503、HTTP 全路由含双账号隔离）与
  tests/cloud-library-client.test.js（11：planMerge 六类冲突矩阵、
  上传拆分单发/分块无损、各端点调用顺序、503→null、merge 上/下/墓
  碑、阅读状态灌入、observe 写穿与失败留队重试、不重复上传）。
- 构建：vite build 通过。
- e2e（新增 e2e/cloud-library.cjs，夹具服务器
  cloud-library-shots/dev-server.mjs——真 server + memory 存储 + 用户
  名通道，生成器为永不调用的桩）：**8/8 通过**。流程：A 已登录浏览
  器持本地书 → 服务端索引/正文/段落锚点均核实已上云；B 全新浏览
  器仅带会话 → 书、readerIndex=1、段落锚点全部恢复，首页显示
  「第 2 / 24 章」与已同步文案；C 未登录持本地书 → 显示浏览器专属
  文案。三上下文均无 pageerror、无横向溢出。
- 回归旁证：onboarding e2e 对 AUTH_ENABLED=false 服务器 **18/18**。
  reader e2e 在本机环境于第 62 行长章渲染等待超时（21 项 PASS 后）；
  已用 pristine HEAD 1417016 的独立 worktree 构建同法复跑，**同一位
  置同一失败**——属本沙箱既有环境抖动（与 startflow 批记录的本地引
  擎 stall 同类），非本批回归，未在本批修它。

## 7. 截图（cloud-library-shots/，390×844，真实本地服务器捕获）

- `01-logged-out-local-note.png`：未登录、本地有书——「故事只保存在
  当前浏览器 · 登录后自动同步到账号，换设备不丢。」
- `02-restored-shelf.png`：全新浏览器登录后恢复的书架——《雾港守塔
  人》在第 2/24 章，下方「书架已同步到你的账号，换设备登录就能接
  着读。」
- 同目录 dev-server.mjs（夹具服务器）与 probe.mjs（一键起服务器+跑
  e2e 并产图）。

## 8. 已知边界（如实记录）

- meta 索引是单文档读-改-写（与站内其他 store 同先例，未用事务）：
  双设备同一瞬间各写一本不同书，索引条目理论上可能丢一条；故事本
  体在各自的 head/chunk 文档里不丢，且下次登录合并会按「本地独
  有→上传」自愈索引。
- 分块上传中断会留下无 head 的孤儿 chunk（不可见、无索引），同书下
  次同步覆盖同序号；删除只清 head 记录的 chunkCount 范围，孤儿不占
  可见空间但占存储，量级为单次中断的分块大小。
- 段落锚点跨设备口径是「本机已有则以本机为准」（见 §3），因此两台
  设备同读一书时段落级位置各表、章级位置按 updatedAt 归一——这是
  保守选择：宁可本机位置不被旧锚点覆盖，也不做锚点级合并。
- 阅读状态 blob 整体上限沿用 reading-location 本地口径（100 锚点 /
  80 书签），服务端同上限校验。
