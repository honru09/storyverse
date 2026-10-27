# 多化身批次细则（MULTI-AVATAR，PERSONA-QA F-27 / F-28）

F-27（高）：一人一化身是卡文化用户的结构性劝退——化身要有一抽屉，按题材与心情换人。本批次把化身改为账号级集合，主化身概念保留，F-27 报告获用户全盘批准后开工；它明确 supersede 早期「一账号一主化身」口径，但**主化身的身份语义（一账号对外只有一个身份面）逐字保留**。F-28（中）：重画时能锁「只有头发变，其余不变」，且改前先明示花一次立绘额度。

## 逐项处置

| 需求 | 落点 | 说明 |
|---|---|---|
| 集合存储 + 旧单化身自动迁为主化身 | `server/avatar-store.js` `collectionFromRecord` | 见「迁移行为」 |
| 化身页：列表/新建/改名改样/删除/设主 | `src/main.jsx` `AvatarPage` | 卡片列表（立绘+名字+主化身徽标）+「新建化身」卡；编辑器按选中化身播种 |
| 上限 10 位 | `AVATAR_LIMIT`（server/src 同源词汇） | 服务端 400 拒绝；列表与新建卡都明示「已 N / 10 位」 |
| 每位化身独立档案+立绘+版本 | store 槽位模型 | 见「立绘槽位」；版本历史仍是 current/previous 两槽，按化身各自持有 |
| 造世第 4 步选择器 | `Forge` `.avatar-picker` | 主化身挂载时预选中（仅草稿无名/无选时）；任一化身可带、选择可取消 |
| 合流双侧按各自化身解析 | `Merge` | 按故事 config.avatarId 在集合内查，查不到回落故事主角字面卡 |
| 广场进入选择化身 | `PlazaEnter` + `App.enterPlazaLine` | picks.avatarId 抵达建书，config 记选定化身 id+快照 |
| 广场发布：任一自有化身可发 | `server/plaza.js` 发布门 | 按 config.avatarId 在集合内核对「走完这条线的是不是你的化身」；快照记该化身名/样；作者块身份仍走主化身链 |
| 阅历按化身分别派生 | `avatarJourneys`（未改）+ 页面按选中化身渲染 | 每位化身自己的故事线列表，点开照常进阅读器 |
| 删除安全 | 服务端三态删除 + 客户端回落链 | 见「删除语义」 |
| F-28 重画锁 | `buildAvatarPrompt` 的 `REPAINT LOCK` 段 | 见「锁定契约」；请求组装级回归测试断言锁定行与未动项描述共存 |
| F-28 额度明示 | 化身页常驻行 + 新建卡 | 「每次重画用掉今天 1 次立绘额度（已用 X / 共 Y 次）」；新建卡「新立绘用掉今天 1 次额度」 |
| 身份链不变 | — | 上传图 → 主化身立绘 → 星空书默认；公开主页只显示主化身；列表 owner-only（路由全部在 auth 之后、uid 只取令牌） |
| 云端书架不动 | — | 化身是服务端数据，不进 library 同步 |

## 迁移行为

- 存储记录演进为双形态：`{ uid, avatars: [...], mainId, avatar: <主化身镜像> }`。镜像使批次前的读取方（`createAvatarService().getProfile` 被 plaza/social 使用）零改动。
- 旧记录 `{ uid, avatar }` 第一次被读到时即呈现为单元素集合、该化身即主化身。旧档案的 id 是服务端在化身功能首发时即铸好的 `avatar-<uuid>`（`git show HEAD:server/avatar.js` 的 save 路径），迁移**原样保留**——旧故事 config 里存的 avatarId 与集合成员 id 逐字相等，发布门、选择器、合流卡全部照常命中（单测以带真实 id 形态的旧记录覆盖）。仅当 id 整个缺失时（首发前不存在此形态，属防御性兜底）才派生确定性 id `avatar-legacy-<uid>`。
- 迁移是读时呈现、写时落盘：不批量改写 Firestore，无迁移脚本、无停机。

## 立绘槽位（关键不变式）

图片存储的槽位由化身是否为**主化身**决定，而不是由 id 决定：

- 主化身：`current` / `previous`（历史槽位——公开图片端点 `/api/users/:uid/avatar`、`/api/plaza/:id/avatar` 直读此槽，正因如此它们不必改）。
- 其余化身：`<avatarId>:current` / `<avatarId>:previous`。
- 设主：旧主与新主的两对槽位互换（四次搬图，空槽跳过）。
- 删主：第一顺位顶为主化身，其画搬进历史槽，旧主的画随记录删除。
- 生成参考图只读目标化身自己的当前槽——逐化身隔离有单测断言（画 B 时参考取 B 槽、写回 B 槽，A 槽字节不变）。

## 删除语义

- 删非主化身：删记录 + 其两个图片槽。
- 删主化身（还有其他化身）：第一顺位顶上为主化身（含搬图）；被删者的画删除。
- 删到空：记录回到「无化身」态，历史槽一并清。
- 书与广场线不受影响：故事 config 自带样子快照文本；任何按 id 解析化身的地方（造世卡、合流卡、主页、广场作者块）查不到即回落——主角字面信息 / 主化身 / 默认头像，永不报错、永不空白。e2e 第 8 项实测：删掉书所带化身后，书在书架照常打开、章节照常可读、config 快照逐字未动。

## 锁定契约（F-28）

`POST /api/avatar/generate` 带 `lockPart`（发色/发型/服装/鞋/脸部特征/脸部备注六选一）时，请求组装（`buildAvatarPrompt(profile, { hasReference, lockPart })`）追加：

```
REPAINT LOCK — repaint exactly like the reference painting, changing ONLY the <锁定项中文名> to: <新描述>. Every other named feature must be preserved exactly as described — <其余五项描述逐项列出> — and any feature the text does not mention follows the reference painting. Do NOT restyle, swap, or omit described clothing or accessories outside the locked part.
```

无参考图时（新化身首画带 lock 无意义但不禁止）锁定段退化為「除锁定项外严格按描述」。回归测试在请求组装层断言：锁定行在场、锁定项新描述在场、未动项（如服装「绣着银线的长风衣」）描述在场、整幅重画（无 lock）时锁定段不在场。

## 已知边界

1. 立绘额度是账号级共享池：10 位化身共用每日上限（与批次前一致，页面文案按账号口径写「今天已用 X / 共 Y 次」）。
2. 设主化身的槽位互换是四次顺序写，非事务：进程中途崩溃可能留下一份画在错误槽位——下一次生成/设主会覆盖自愈，最坏情况是主化身暂时显示另一位的画，不丢原图（旧图仍在其 id 槽）。
3. 化身页在移动端的舞台区仍是单列编辑器（与批次前同一版式）；列表在编辑器上方，条目多时需滚动——为批内取舍，未做抽屉式折叠。

## 验收

- 单元 557/557（基线 542，+15）；`npm run build` 通过。
- e2e `e2e/avatars.cjs` 8/8（夹具 `avatars-shots/dev-server.mjs`：真 server + 内存 store + 图像管线 stub + 预置旧形态账号）：迁移→建第二位→设主→造世带第一位→config 断言→删该化身→书照常打开。回归：onboarding 18/18、intervention 7/7、cloud-library 全过。
- 截图（390×844 视口）：`avatars-shots/01-avatar-list.png`（双化身列表+主化身徽标+已 2/10 位）、`02-forge-picker.png`（主化身预选中态）、`03-repaint-lock-line.png`（锁定与额度明示行）。
