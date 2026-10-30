# REQ-69 安全修复批（audit-fixes）— 修复报告

基线：origin/main `e3f8424`（00051）。审查来源：`~/workspace/sw-prep/audit-00051/SECURITY.md`。
集成方式：三簇并行分支（audit-a-plaza `445c54d` / audit-b-billing `c1d7481` / audit-c-server `aa48aa9`）合入本分支，集成接缝修复 1 处（见文末）。
全量：**1089 测 / 1084 过 / 5 败**，5 败与基线完全同集（dedup-fix ③a 夹具图 `dedup-shots/fixture-portrait-banded.png` 为主仓未跟踪文件、worktree 内 ENOENT）；基线同树实测 1042/1036/6 败（多出的 1 败 backup merge 为时序 flake，纯基线对照亦败、合并后复跑通过）。`npm run build` 通过。未 push、未部署、未碰生产数据。

## P0

### 1. 合流发布复检改为内容绑定（审查高危 1 + 8）
- **修法**（server/plaza.js，簇 A）：来源集不再只信客户端自报数组——从故事本体三处溯源派生去重：`sources[].publicationId` ∪ `sourcePublicationIds[]` ∪ `config.sourcePublicationId`；自报数组与派生集不一致（少报/多报）→ 400 人话拒绝。权限核查走**服务端 publication 记录图的传递闭包**（BFS 展开 `record.sources[].publicationId` + `record.snapshot.config.sourcePublicationId`，上限深度 5 层 / 32 节点，visited 防环），闭包内每个他人作者逐 publication 核查：当前 `fusionPermission === free` 或有该 publication 的 durable grant；中间节点的 grant 不覆盖原书。solo 进入线发布同样过闭包复检；发布时 `storedSourcesFor` 把进入线溯源写入服务端 `record.sources`（snapshot 按设计会清掉 config.sourcePublicationId，这一步让闭包有图可走）。来源查不到或 status 非 published → 403 拒绝（旧行为是 continue 放行）。
- **测试**（tests/audit-fusion-recheck.test.js，15 例）：修前 12 红 / 3 绿（对照组），修后 15/15 绿。覆盖：清空数组绕过、填自己书冒充、进入线一跳/两跳洗白、中间书 grant 冒充原书 grant、来源下架、来源不存在、循环链终止、正常路径（free/grant/自有/双自有）不误伤。既有 fusion-* + bookstore-plaza 集 64/64 不回归。
- **残余边界（如实）**：①改装客户端在首次上架前把三处溯源全部剥光的合流线，与 REQ-53 前真无溯源旧线在服务端不可区分，按既定口径放行（代码注释已标明，未声称关闭）；②本修复前已上架的 solo 进入线旧记录无 record.sources 溯源，闭包穿不回去，重新发布后入图；③超 5 层/32 节点的链在上限外不展开（上限内节点仍逐个核查）。

### 2. 生成门预授权冻结（审查高危 2）
- **修法**（server/billing.js 簇 B 出 API + server/index.js 簇 C 接线）：生成前按场景预估冻结——`coinFreezeForText({scene, merged})`（锚 TEXT_TOKEN_FREEZE_ANCHOR=26000，普通章冻 26 币 / 合流 39 币，≥ 实测最贵单章约 22 币；会员不打折冻结）→ `reserveCoins` 按**可用额**（余额 − 未过期冻结）判定，不足 → 429 coins-exhausted 且 generator 不被调用。冻结存权益记录新字段 `coinHolds`（TTL 15 分钟，过期自动清理，跨实例/重启有效）。生成后 `settleReservation(uid, id, 实付)` 按实际用量结算、差额释放；`covered=false` 或结算抛错 → 402 不交付。生成失败/缓存命中 → `releaseReservation`。章额度路径改为核销返回值必查：consumeChapterCredit 失败回落织币结算，再失败不交付；图片端点（/api/cover、/api/avatar/generate）统一 `settleImageCharge`：图片额度核销失败 → 回落 40 币 spendCoins，不足额 → 402 不交付。
- **测试**：tests/audit-billing-freeze.test.js（11 例：双并发冻结不穿透、settle 差额释放、超冻结 covered=false、过期失效、跨实例共享 store 仍有效）；tests/audit-generation-gate.test.js（余额 1 币复现：修前拿到整章、修后 429 且 generator 零调用；双并发各冻各的、总扣 = 两章实付之和）。两文件修前全红、修后全绿。

### 3. 兑换与权益写入原子化（审查高危 3）
- **修法**（server/billing.js，簇 B）：两个 store 新增事务原语 `transactEntitlement`（单 doc）与 `transactBilling`（同事务跨 billing_entitlements + billing_codes）——Firestore 侧 `db.runTransaction`，Memory 侧全局互斥链。redeem 全程迁入 transactBilling（查码→失败计数→applyGrant→标记已用+发放一次提交；业务结论以返回值出事务、ApiError 在提交后抛，保证失败计数不被回滚吞掉）。spendCoins / applyDailyCoinTopUp / consumeChapterCredit / consumeImageCredit / grantProduct / 失败计数全部迁 transactEntitlement；进程内 serialise 降为无原语 store 的兜底。
- **测试**（tests/audit-billing-atomicity.test.js，6 例）：修前 5 红——核心断言「exactly one redemption succeeds — 2 !== 1」（双账号并发同码双发实锤），另跨实例 spend 不守恒、topUp×spend 交叉覆盖、双实例同烧一份章额度、双实例 grant 只落一份；修后 6/6 绿（恰一成一败、败方文案与无效码不可区分、赢家只发一份）。

### 4. 保留名硬拦截（审查高危 4）
- **修法**（server/username-auth.js，簇 C）：导出 `isReservedUsername`——规范化（小写 + 去 `[_.\-\s]`）后等值拦截 storyweave / storyweaveofficial / storyweave+纯数字后缀 / official / admin / support / system；register 入口 400 人话拒绝。social.js 的 @handle 领取同步接此拦截（本人登录名除外）。
- **注记**：`storyweave_official` 已于 2026-10-31 08:09 由我方正规注册占名（独立防御），本条为注册侧纵深。测试（audit-server-hardening）：StoryWeave、story.weave_official、storyweave01、OFFICIAL 全拒；storyweave_fan、mystoryweave 放行。

## P1

### 5. usage 缺失按保守估算计费（审查 F-14 残余）
billing 新增导出 `meteredTextCost(model, usage)`：usage 缺失/'unknown'/残缺 → FALLBACK_TEXT_TOKENS=16000（70/30 拆分）估算，`estimated=true`，costCny > 0；正常 usage 与 textCostCny 逐值一致。index.js 结算改走此函数；stdout 用量日志加 `usageEstimated`，成本账本记录带 `estimated:true`（集成接缝：recordTextCost 已接住该字段并按估算量落账，见文末）。测试：三种坏 usage 全估算且 >0；正常 usage deepEqual 旧值。

### 6. 章节交付幂等持久化
新建 server/delivery-store.js（memory + Firestore 双实现，集合 `generation_deliveries`）。key = sha256(uid + storyId + chapterIndex + 请求指纹)，指纹为决定生成结果的请求要素规范化 JSON 之 sha256（config/worldBible/干预/kind 与来源 id + 已有章节 id 序列 + index/mode，读者易变态排除）。命中检查在冻结之前：命中直接回登记结果（标 cached、不重生成不重扣）；结算成功后才登记。测试：同请求连打 generator 只调一次只扣一次；新 server 实例 + 同一 store「重启」重放仍命中。降级：登记写失败只记日志不堵交付（丢的是重放捷径，不是章节）；匿名本地模式不登记。

### 7. 配置漂移 fail-closed（审查高危 7，按暂缓清单外处理——本条在 P1 必修内）
身份必需且「计费应然」的配置下：billing 不可用 → 503 + stderr ALERT；用量日读失败（usedToday === null）→ 503 + ALERT。漂移定义已在代码注释与测试中钉死：环境已配置持久化存储（DATA_STORE/K_SERVICE）而 billing 缺席，或 billing 在线但用量读失败；从未配置计费的本地/测试场景（auth-channels 等既有台）不误伤。测试见 audit-generation-gate / audit-server-hardening。

### 8. 合流倍率服务端派生
结算的 merged 结论以服务端 library 存量 head.kind 为准（scene 与倍率同源，均按派生结论）；存量查不到时回落：信客户端声称（声称 merged 按 ×1.5、声称 solo 按 solo），成本账本标 `mergedBasis: 'client-unverified'`，存量命中标 `'stored'`（口径已写入代码注释）。测试：存量 merged + body 谎报 solo → 按合流价结算；存量 solo + body 声称 merged → 按 solo。

### 9. 红线扫描补面
redLineViolation 补扫：story.title、story.synopsis、story.intro.*（递归全部字符串/数组逐条）、config 主要自由字段（主角名/性格/出身/能力名+描述/自由题材/出生点自写/化身外貌与生活细节/世界草稿名与设定等）、合流 protagonists[] 各人自由字段。只扩 findSettingViolation（违规内容）覆盖，与 REQ-56/65 文风禁令清单分工不变。测试：红线样本分别塞入 synopsis / intro.thread / abilityDesc / title 发布全被拦，干净书照常上架。

### 10. 边角三件
- Origin 纪律：allowedRequest 的 write 判定由仅 POST 改为 POST/PUT/DELETE/PATCH；无 Origin 的 DELETE → 403，合法 Origin 照常（已测）。
- /api/status 脱敏：未登录响应剔除 provider/model/location 等字段，只保留可用性；内部 ledgerModel 仍取全量；登录后全量（已测）。既有 gemini-server / release-safety 的旧期望（匿名回显模型名）按 REQ-52 口径更新为脱敏形状断言。
- 用户名通道登出吊销：username-auth 新增 `signOut(token)`（按 sha256(token) 删服务端 session），auth.js 门面 `usernameSignOut`，新路由 `POST /api/auth/username/signout`（与邮箱 signout 对称），客户端 `src/auth/client.js` 按 session.provider 分流吊销端点。测试：登录→signout→同 token 请求 /api/account 得 401；邮箱通道不变。

## 既有测试调整（如实登记，均为口径变更的必然结果）
- billing-server / notifications-server / plaza-server：官方号 `storyweave` 不能再走 HTTP 注册（正是 #4 要堵的洞）→ 夹具改为直接种入 identity store 后 HTTP 登录取 token，断言不变。
- gemini-server / release-safety：匿名 /api/status 期望改脱敏形状（见 #10）。
- username-client：登出吊销端点期望改 username/signout（见 #10）。

## 集成接缝修复（集成者）
簇 C 按契约以**服务方法**调用 `billing.meteredTextCost`，簇 B 只做了模块级导出——合并后 index.js 会静默回落到旧的 0 币计量路径。已在 server/billing.js 补：①服务返回对象挂 `meteredTextCost` 方法；②`recordTextCost` 接住 `estimated` / `mergedBasis` 参数，估算结算按 meteredTextCost 的估算量落账并标 `estimated:true`（否则账本会给已收费章节记 0 成本行）。两处均有注释标明 REQ-69 集成接缝。

## 遗留门禁（本批不动，上线前必须处理）
1. **Stripe 履约幂等顺序**（审查高危 6）：发放先于记账、记账失败被吞，Stripe 重投可重复发放。Stripe 未开通，属开通前必修门禁——开通批必须先落「事件先记账/幂等键先行」再翻开关。
2. **邮箱验证码限流与尝试跨重发累计**（审查高危 5）：发送/校验端点无限流、猜满删码重发即重置尝试数。验证码登录通道当前关闭（emailCode:false），随 SMTP 开通批一并修（发送侧限流 + 尝试数跨重发累计 + 轰炸防护），开通前不得翻开通道。
3. 簇 A 残余边界三条（见 #1）：改装客户端首架前剥光溯源、旧进入线记录未入图、超长链上限外不展开——接受为当前架构边界，后续若做服务端进入登记可再收紧。

## 线上验证（留待部署后）
本批未碰生产数据。部署后需验：新 revision 号与 bundle、/api/status 匿名形状、保留名注册拒绝实测、官方号登录不受影响、一次真实低余额生成被冻结门拦下的行为。
