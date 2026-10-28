# FRONTIER-FIX — 换一版窗口机制修复（2026-10-28）

基线：本地 main `05e9d95`（线上 00031）。来源：双测试员回归定案 P2 / N-02 / F-30。
本批只落码 + 本地提交，不 push、不 deploy。文末 §5 为同批追加的用户新规「用户名不可变」销账。

## 1. 现状机制（动手前实查，非推测）

**前沿章（旧定义）**在共享引擎 `src/story-engine.js`：`frontierChapterIndex = chapters.length - 1`（已写出的最后一章）。三处把关都以它为准——`beginChapterReroll`（非前沿抛 RangeError）、`replaceFrontierChapter`（换版落盘，前置 key 与 chapter id 双核对）、`updateChapterProse`（编辑正文，非前沿静默返回原记录）。呈现层 `src/main.jsx` 的 `isFrontier = !readOnly && isFrontierChapter(story, index) && Boolean(story.chapters?.[index])` 决定控制区（换一版 / 编辑正文按钮）是否渲染。

**预生成**在 `src/generation.js` 的 `nextGenerationIndex`：当 `chapters.length < readerPosition + 2` 时生成 `chapters.length` 号章，答案经 `acceptChapter` **直接追加进 story.chapters**。锁死机制就在这一步：N+1 一落盘，`length - 1` 变成 N+1，第 N 章立刻跌出前沿——读者还没打开 N+1，N 的修改窗口已经没了。这正是回归报的现象。

**服务端**在 `server/gemini.js` 的 `validatedRequest`：reroll 分支旧判定 `index !== story.chapters.length - 1` → 409「只能为最新章节换一版。」其 contextStory 本就把 chapters 截断到 index；`chapterKey = hash(id | revision | index | interventionSignatureFor)`，不含 index 之后的章节（为新机制留了余地）。

**位置字段**：`story.chapterIndex` 是「下一可接受章」指针（acceptChapter 要求 index === chapterIndex，落盘后推进 `min(index+1, total-1)`）。`readerIndex` 是已校验字段，写入路径只有两处：`moveReadingPosition`（`src/reading-flow.js`，阅读器内一切导航经 Reader 的 `update()` 漏斗）与准备窗效应（main.jsx，旧代码 `{...prepared, readerIndex: index}` 裸 spread 写入，仅本地引擎真正落字）。**持久化**：`src/persistence.js` 的 `validateStory` 逐字段校验可选字段；`server/library.js` 经 validateLibrary 整存，无字段白名单截断——新字段只需在 validateStory 里立规矩。

**介入交叉（现状）**：`interventionTargetIndex` 用实时 readerIndex+1 且要求 target ≥ written−1；`replaceChapter`/`retractChapter` 要求 index === chapters.length−1 且 index > story.readerIndex。本批不动，交叉处以介入口径为准（见 §2 末）。

## 2. 改后语义

**新字段 `story.openedThrough`**：单调水位 = 读者真正打开过的最高章序；可选、非负整数（persistence 校验与 readerIndex 同式，报错 `openedThrough must be a non-negative integer`）。

- `frontierChapterIndex(story) = openedThroughIndex(story)`：字段在 → `min(字段, last)`；**字段缺失（旧档）→ last，旧行为逐字不变**。
- 推进：`advanceOpenedThrough(story, index)` 单调 max，已嵌进 `moveReadingPosition`（无效 index 仍原样返回原对象）；main.jsx 准备窗效应改走 `moveReadingPosition` 写位置（无效时回退旧 spread 以免丢 materialize 落盘）。**旧档首次落字播种** `min(last, max(target, last−1))`：预生成最多领先读者一章，末章之外的章节必然被打开过；播种停在 last−1，保住已定稿历史不被一次回读解锁。
- **定稿前改前沿 ⇒ 预生成作废并重排**：`beginChapterReroll` 与 `updateChapterProse` 在 index 之后有已落盘章节时，把 chapters 截断到 index+1 并把 chapterIndex 重置为 `min(index+1, total−1)`。作废是**可查的记录状态**（章数变短 + revision 轮转），不静默；重排由既有 `nextGenerationIndex` 预生成机制按新文本自动重建。
- **换版落盘的竞态收口**：`replaceFrontierChapter` 落盘时丢弃 slot 之后的一切（换版在途时落地的预生成副本随之作废）、回退 chapterIndex 到 slot 的后继位、并**再轮转一次 revision**——在途预生成是按旧文本简报、按轮转后记录取的键，不再轮转就会在换版之后合法落地冒充「重建版」；轮转后它到达即过期，被 accept 拒绝，预生成按新文本重备。
- **服务端**：reroll 判定改用共享 `isFrontierChapter(story, index)`，非前沿 409「只能为正在读的这一章换一版。」；客户端错误文案同步改为「只有正在读的这一章还能换一版——翻开下一章，这一章就定稿了」，正文编辑提示与前沿说明文案由「下一章一旦生成」改「翻开下一章」。
- **边界**：只读线三杠杆本就 no-op、服务端 403，不受影响；已定稿章节的历史行为不变（水位只进不退，回读不解锁）；无限连载的前沿章同此口径（前沿是位置概念，与篇幅模式无关，同一代码路径）。
- **介入交叉注记**：介入的目标仍是「第一未读章」，按实时 readerIndex 计算，不读 openedThrough；`replaceChapter`/`retractChapter` 的末章规则未动。本改动只移动「哪一章算前沿（可换版/可编辑）」，不碰「哪一章可被介入改写」。两条线在同一章相遇时（前沿章恰为介入目标的前一章），各自判定独立生效，以介入口径优先——介入落字后该章文本变化仍走介入自己的 replaceChapter 通道，不经换版通道。

## 3. 四路径逐条销账

证据文件：`tests/frontier-fix.test.js`（10 条）+ `e2e/control.cjs`（5 条，整套重写）。

**路径① 预生成已落盘、未打开 → N 仍可改。** 单元：水位停在 N−1 时 chapters 已含 N+1（`storyWithLandedPregeneration`），`isFrontierChapter(N)` 为真、换版与编辑双杠杆可用；服务端收到带预生成整记录的 reroll 请求被接受且 chapterKey 一致。e2e check 1：ch.3 已落盘、saved `openedThrough===1`、`chapters.length===3` 时 ch.2 仍有双按钮、ch.1 无。

**路径② 打开 N+1 → N 永久锁定。** 单元：`moveReadingPosition` 打开 N+1 后水位 = N+1，N 跌出前沿且回读不解锁；服务端对 N 的 reroll 回 409、对新前沿 N+1 接受、对未打开的预生成本身回 409。竞态：换版在途时读者打开下一章 → `replaceFrontierChapter`/`acceptRerolledChapter` 整版拒绝（沿旧 CONTROL 的「锁定赢」口径，只是锁的触发点从落盘改成打开）；在途预生成竞态见 §2 收口条，单元单列一条（mid-pass 落地的副本被换版丢弃、迟到的第二份副本因 revision 已轮转被拒、新预生成按新键重建）。e2e check 4：打开 ch.3 → `openedThrough===2`、ch.3 有按钮（前沿前移）、回到 ch.2 双按钮消失（截图 `control-shots/04-finalised-chapter.png` 新增）。

**路径③ 定稿前改 N → N+1 作废并重排。** 单元（编辑）：落盘后 `chapters.length===2`、`chapterIndex===2`、revision+1、水位不动、`nextGenerationIndex===2`；服务端简报 recentChapter 含编辑尾巴标记（EDITED_TAIL），证明重建简报自新文本；重建章可正常落盘。单元（换版）：轮转当场截断（请求发出前记录已变短）。e2e check 2：reroll 请求的 `story.chapters.length===2`（作废在服务端可见）、新 ch.3 请求以换版后章节为简报（REROLLED_CHAPTER_1）、落盘 ch.3 带换版后 revision 标记且 ≠ 陈旧预生成版、ch.1 逐字不变；check 3 编辑路径同构（EDITED_TAIL 标记 + 编辑后 revision 标记）。

**路径④ 只读线无变化。** 单元：readOnly 记录上换版/编辑/水位推进全 no-op，服务端 reroll 403。呈现层 `isFrontier` 本就带 `!readOnly` 前置，未动。

## 4. 测试与 e2e 结果（含期待变更注记）

- 单元全量 **676/676**（基线 663 + frontier-fix 10 + §5 的 username-immutable 3）。受影响子集（frontier-fix / control / reading-flow / intervention / generation-client）58 条全过。
- **期待变更**：`tests/control.test.js` 两处抛错断言正则改新文案 /只有正在读的这一章还能换一版/，文件头注加 FRONTIER-FIX 说明；该文件夹具无 openedThrough、走旧档回退——旧断言（包括 CONTROL 的在途竞态叙事）靠回退语义全过，竞态的真水位版由新文件接替。`e2e/control.cjs` 整套重写：删旧「把第三章预生成堵在门外」的夹具，改为预生成真实落地；mock 段落带 `rev ${story.revision}` 标记以区分陈旧预生成与重建版；5 条 check 按新语义重述。
- e2e（本地服务 AUTH_ENABLED=false，最终构建）：control **5/5**、journey **24/24**、reader exit 0（30 PASS）、reader-chrome **46/46**、intervention **7/7**（介入交叉回归）。
- reader-chrome 时序说明（如实记录）：在长时间运行的 8899 服务 + 机器高负载下，本套的滚动/点按时序检查曾两度失败（360「scrolling folds」×2、430「tap survives drift」×1，失败点逐次不同）；同套件对基线 05e9d95 的归因跑 46/46，最终在空闲机器对最终构建复跑 46/46 exit 0。与该套件既有的负载敏感性（滑杆 seek 检查注释自陈、旧基线亦有挂账）同族，判定为环境抖动而非本批回归。

## 5. 用户名不可变（2026-10-28 用户新规，同批落码）

**口径**：用户名 = 注册时定下的 @ID（登录凭据 + 主页 @ 标识 + 分享文案里的 @，三位一体），注册之后任何入口不许改；显示名（昵称）与简介照旧可编辑。

**现状审计（动手前实查）**：
- 服务端唯一写口是 `PUT /api/me/profile`（`server/social.js` 的 `saveMyProfile`）：旧代码收 `handle` 字段、过格式/唯一性/影射校验后**真写**进 profile record。有效 @ID 的解析是 record 优先（`identityFromRecord`：record.handle → fallback），用户名账号的 fallback 才是登录名——于是用户名账号可以认领一个与登录名不同的 @handle，其主页 @ 与分享 @ 随之与登录凭据分家。这正是新规要堵的口。
- 客户端唯一入口是编辑资料面（EditProfileSheet）的「@用户名」输入框：初值取 `editable.handle`（record 值），用户名账号 record 为空 → 字段开着空白、占位文案邀人另设一个。保存时 patch 恒带 handle。
- 注册侧（`server/username-auth.js`）：格式与唯一性校验在注册时执行，本批不动。

**防线（服务端强制）**：`saveMyProfile` 计算有效 @ID = `record.handle || 登录名（uid 为 username: 时）`；提交值（null 视作清空）与有效值不同即处置——有效值非空 → **400「用户名（@ID）定下后不能修改。」**（改名与清空同罪）；有效值为空（尚无 @ID 的非用户名账号）→ 首次认领，走原格式（3–20、小写字母数字下划线）/ 唯一性 / 不得影射他人登录名的校验，那是「定下」不是「改」。提交值与有效值相同 = 回带现值，无操作放行（记录不重复写入登录名）。**选 400 不选静默忽略**：编辑器要把拒绝说给用户听；静默忽略会让界面假报保存成功而 @ID 没动，是假数据。`checkHandle`（编辑器可用性反馈）对已锁账号如实回「不能修改」/「这是你现在的用户名」，不再报假可用。

**客户端**：EditProfileSheet 以解析后的 `profile.handle` 为有效 @ID——非空即**只读呈现**（readOnly + 注明「用户名是注册时定下的 @ID，不能修改。」），保存 patch 不再带 handle；为空（未认领）时照旧可填 + 可用性检查。设置/账号区的用户名展示本就是只读文本，无其他改名入口（全仓 updateMyProfile 调用方仅编辑面与头像切换两处，后者不带 handle）。

**证据**（单元全量 676/676 含下述）：
- 新增 `tests/username-immutable.test.js`（服务级，3 条）：用户名账号改名/清空/置空全 400、回带现值 200、昵称+简介仍可改；非用户名账号首次认领成功（小写归一化保留）、认领后改名/清空 400、checkHandle 锁定反馈；首次认领的格式 400 / 影射登录名 409 / 撞他人 handle 409 矩阵完整保留。
- `tests/profile-custom-server.test.js` 三处**期待变更**（已在测试内注明）：record CRUD 测试改为「记录赢显示名、@ID 恒为登录名」；validation 测试的 UPPER 认领改判 400 不能修改；uniqueness 测试改述为 HTTP 边界上的不可变口径（撞名矩阵移交服务级新文件）。
- 注册流程不受影响：username-auth 既有套件全过（注册格式/唯一性/登录/找回均未触碰）。
