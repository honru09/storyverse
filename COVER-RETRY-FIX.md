# COVER-RETRY-FIX — 封面状态机「失败即永久放弃」根因修复

基线 main `b179728`（00055）。分支 `cover-retry-fix`，经 GitHub API 服务端合并回 main（本地 git 写被沙箱 EPERM 拦，沿集成波已验证的 API 路径）。

## 根因（诊断定案，本批只执行修复）

封面生成/存储/serve 全链健康；坏的是客户端状态机两处门：

1. POST /api/cover 任何一次失败都把本地状态写成 `failed`，而 `failed` 按旧设计永不自动重试（原意：防后台重试烧每日额度）。书架面对 failed 完全沉默 → 书被永久钉死在题材家族库存回落图上（《泰安·阿灿》主因；失败大概率发生在 10-27～30 晚间 Vertex 429/502 窗口或撞每日上限后的付费失败回抛）。
2. `shouldAutoRequestCover` 要求本地 `engine==='gemini'`，早期路径建的老书没有这个标 → 永不请求（《诡剑·王逍遥》可能中此条）。
3. 附带分叉：结算成功但响应抛错时，服务端已有封面、本地却记 failed，旧流程没有任何对账通道去采认。

## 三处改动

1. **failed 按天可重试**（`src/cover.js`）：新增 `coverFailureRetryable`——失败戳（cover 状态的 `updatedAt`）的本地日期早于今天才放行，同日不重试（防烧额度本意保住）；无戳/戳不可解析的老存量 failed 视同过期、放行。`shouldAutoRequestCover` 对 failed 改走此门。同时 `src/main.jsx` 的失败写入改为落自己的时间戳（`{ status: "failed", updatedAt: now }`），不再继承请求开始时的 pending 戳。
2. **图书馆加载对账**（`src/cover.js` + `src/main.jsx`）：云书库 merge 结算后，对 status ∈ {failed, none} 及过期 pending 的书（`coverNeedsMetaReconcile`）逐本查 GET /api/cover/meta（`fetchCoverReconcilePatch`），服务端已 ready 的直接采认 ready + version，不再重画重扣。每书每会话只查一次（`coverMetaChecks` 节流集），探针失败静默、不阻塞书架。
3. **engine 门放宽**（`src/cover.js` + `src/cloud-library.js` + `src/main.jsx`）：`shouldAutoRequestCover` 增加 `{ inAccountLibrary }` 入参——无 engine 标的书，已同步进账号书库、非 readOnly、章节 ≥1 时放行；显式非 gemini 标（'local'/'manual'）仍拒绝，readOnly 仍拒绝。成员资格来自云同步控制器的已同步集合，`createCloudSync` 新增只读访问器 `syncedIds(uid)`；自动上漆 effect 以当前账号的 synced 集逐书判定。

改动文件：`src/cover.js`、`src/main.jsx`、`src/cloud-library.js`、`tests/cover-client.test.js`、`tests/cloud-library-client.test.js`、本笔记。

## 测试对账

- 新增/扩展 5 颗：failed 同日挡/跨日放行/无戳放行/戳坏放行（cover-client）、engine 门三态（gemini 放行 / 无标+已同步有章节放行 / readOnly 与显式 local/manual 挡）、meta 对账采认与 needy 状态集、main.jsx 接线源级断言（失败落戳、inAccountLibrary 传参、merge 后对账、节流集）、cloud `syncedIds`（持久化集 + 本会话上传入集）。旧断言「failed 无戳 → 不重试」按新规格改正（那正是本批要修的旧行为）。
- 全量：1188 测试 / 1183 过 / 5 败——5 败恰为环境基线 dedup ENOENT×5（夹具图缺失），与 00055 集成波对账一致，零新回归。`npm run build` 通过。

## 真路径自证（real_path 口径）

起真实服务端（内存存储 + 计数型替身画家，与 tests/cover-server.test.js 同款夹具）+ 真实注册账号，走真实客户端函数与真实 HTTP，13/13 全过（脚本跑完即删，结果以此为准）：

- 书 A（failed 昨日戳）：门放行 → 真实 POST /api/cover 上漆成功（画家调用 1 次）→ 状态落 ready → 书架取图拿到对象 URL、字节为 JPEG。同日戳对照：门保持关闭。
- 书 B（服务端已有封面、本地 failed 今日戳）：重画门保持关闭（不二次扣费）；对账探针采认 ready（画家调用次数不变），书架取图成功。
- 书 C（无 engine 标）：仅本地时门关；标为已入账号书库后门开 → 真实上漆成功。

## 未证项

- React 壳层接线（merge 结算后触发对账、effect 传参）由源级断言 + 函数级真路径覆盖；本沙箱浏览器渲染不可用，未做活浏览器端到端。**最终以用户真机点验为终门**：两本问题书在真机打开书架后，一本应于次日自动重新上漆、一本若有引擎标问题应在同步后放行（或经对账直接采认服务端已有封面）。
- 对账只在云书库 merge 结算时触发一次（每会话）；未登录/纯本地会话不对账（其书也无从在服务端有封面）。
