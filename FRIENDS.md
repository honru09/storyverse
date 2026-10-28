# FRIENDS 批次处置笔记（好友系统）

基线 7ec96b7 → 本地提交（只落码，不 push 不 deploy）。DESIGN.md §46 同步。

## 做了什么

**找人**（登录必需，未登录 401）：
- `GET /api/users/search?q=` 用户名模糊搜：跨三个公开名来源——账号注册表（用户名账号，注册即有）、主页资料记录（handle/显示名）、广场发布署名；按解析后的公开名二次过滤、精确 handle 优先排序，limit/offset 分页（页上限 20，候选上限 200）。结果永不含本人。
- `GET /api/users/search?email=` 邮箱精确查：每账号 15 分钟 10 次限频（进程内台账，同认证通道口径）；查无/格式不对同为一个空结果，不给枚举口子；**邮箱本身永不出现在任何 payload**。可查到两类账号：邮箱验证码账号（uid 由地址派生，有公开足迹后可查）、绑定了该地址作恢复邮箱的用户名账号。地址匹配在 identity-store 层内完成（`listUidsByRecoveryEmail` 只回 uid；`listUserSummaries` 只回用户名+uid），social.js 不接触地址字段本身——RECOVERY 的结构钉（公开层源码禁引用 recoveryEmail）原样保住，为此把匹配下沉而非破例。

**申请制**（状态机，记录在 social-store）：
- 申请记录：定向 (from,to) 一条，status = pending/accepted/declined/cancelled，可带一句留言 ≤50 字（服务端计数校验）。好友关系：无序 pair 一条 friendship 记录，同意时写入。
- 幂等：已是好友/已有 pending 重复发送 → 回现状态不变；对方正等我同意时我反手发申请 = 直接成好友（回请即同意）；拒绝/取消后可再申请（新 pending 覆盖旧记录，留言与时间刷新）；同答案重复回应幂等、反答案 409；取消非 pending 为无害状态读。
- 边界：不能给自己发（400）、不存在的人 404、留言超长 400；三条写路由全部按 pair 串行化（serialise），防并发双写。

**通知（接既有 notify 体系，分类归「互动」）**：
- 待我处理的申请 → `friend_request` item（带留言，at = 申请时间）；我发出的申请被同意 → `friend_accepted` item（at = 同意时间）；**被拒绝不产生任何 item**——拒绝只在申请方自己的「我发出的申请」列表里以状态变化呈现（对方这次没有通过）。
- 未读数走既有分类水位，零新机制。`NOTIFY_ACTIVITY_KINDS` 增 `friend_accepted`。

**主页好友区**（本人主页页形态）：
- 「好友」区：首屏 = 好友列表 + 人数 + 页签行（好友/申请·待处理角标/找朋友）+ 右上「找朋友 ›」一行入口（渐进式披露）；申请页签含收到的（同意/拒绝+留言）与我发出的（状态文案+pending 可取消）；找朋友页签含用户名/邮箱两模式切换、隐私说明行、结果行按 friendState 给动作（加好友→行内留言框、申请中→可取消、待我同意→直接同意、已是好友→状态签）。
- 他人主页：动作区在关注旁加好友位，按 `viewerState.friendState`（profile 载荷新增字段）呈现 加好友/申请中·取消/同意好友申请/已是好友；加好友点开一行留言框。
- 人行组件全站同制式：服务端 `resolvedPerson` 一处解析（connections 名单同步改走它，行为不变），脸锚头像+显示名+@ID，点进对方主页窗口。

## 接口一览
- `GET /api/users/search?q=&email=&limit=&offset=`（登录）
- `GET /api/me/friends`（登录）→ { friends, incoming, outgoing, counts }
- `POST /api/users/:uid/friend-request` { message? } → { state }
- `POST /api/users/:uid/friend-request/respond` { accept } → { state }
- `POST /api/users/:uid/friend-request/cancel` → { state }
- profile 载荷 `viewerState.friendState` 新增：none/pending-out/pending-in/friends。

## 验收
- 单元全量 **752/752**（基线 740，+12：friends-server 10 条——登录门/模糊搜与分页/资料名可搜/邮箱精确与不回显/邮箱账号足迹/限频/申请全流程与幂等/同意成好友/拒绝静默/取消与回请；users-client +2——路由与体积、429 文案）。中途两处存量钉按其本意修复：viewerState 严格相等补 friendState；recoveryEmail 结构钉靠下沉匹配保住（见上）。
- e2e `e2e/friends.cjs` 6/6：A 搜到 B→带留言申请→B 在互动里看到（文案+留言）→B 申请列表同意→双方好友列表互现；零 pageerror。
- 截图（390，friends-shots/）：[01-search-390.png](sandbox://workspace/storyverse/friends-shots/01-search-390.png) 找朋友、[02-requests-390.png](sandbox://workspace/storyverse/friends-shots/02-requests-390.png) 申请列表、[03-friends-390.png](sandbox://workspace/storyverse/friends-shots/03-friends-390.png) 好友列表，已逐张亲看。

## 不在本批（记账）
- **拉黑**：未做。后续批做时落点已想好：pair 级 block 记录、被拉黑方向的申请直接 404 化、搜索结果互不可见、已有好友关系在拉黑时解除——需要用户口径确认后再动。
- 删除好友（解除关系）：未提供入口，状态机已支持（删 friendship 记录即可），待产品口径。
- Firebase（Google/邮箱密码）账号的邮箱查找：地址在 Firebase Auth 内，本站存储不可枚举，暂不可按邮箱查到；其公开名可被用户名搜索找到。
