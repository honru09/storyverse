# REQ-59 世界预设去死板 —— 预设从「定死的世界」降为「可改的起点草稿」

基线：origin/main 1001e79。分支：world-preset-soft（本地提交，不 push 不部署）。
用户原令（2026-10-31 00:04）：青岚宗、长宁街这些**预设世界本身设定太死**，不喜欢，看着优化（已澄清非图片问题）。

## 一句话结论

预设世界不再有「写死的成套设定」：每个预设只剩名字、一句氛围（tagline）、视觉图三件套对外示人；它的设定文本降级为**可编辑草稿的种子**——选中即可改名、改写设定，改后的文本才是进故事配置、worldBible 与生成简报的那一份；世界的样貌与规则由生成侧按「题材写法 × 最终版设定文本 × 主角」现写（服务端简报新增 `worldSettingData` 数据块并明示以草稿为准现写）。出生点同步松绑：预设点保留作选项，另可改名/自写一个（`startPointCustom` 标记，与创世神自填同语义）。没改的人零额外操作：预设原文即草稿，原样走完。

## 预设钉死文本盘点与处置表

盘点范围：`src/story-engine.js`（GENRES / worldBibleFor / storyBeatPlan / outlineFor / sceneFor）、`src/main.jsx`（世界卡/世界步）、`src/plaza.js`、`server/cover.js`、`server/gemini.js`。

| # | 钉死文本 | 原位置 | 处置 |
|---|---|---|---|
| 1 | 世界名 `genre.world`（沉潮港/青岚宗/霓虹下城/长宁街/长乐宫/七号前哨站） | GENRES、`worldNameOf` 直回预设名 | **改草稿制**：`worldNameOf` 改为草稿名优先（`worldDrafts[genreId].name`），全链路统一走它——bible premise、大纲弧收尾、beat plan、发布快照 `worldName`、合流 premise、封面世界名、进入线模板，改名一处生效 |
| 2 | 世界描述 `genre.description`（每个世界一整句成套设定文案） | GENRES；消费面：世界卡小字、封面 flavour、广场介绍回落 | **降级为草稿种子**：未编辑时它就是草稿文本本身（经 `worldSettingOf` 读取）；一旦编辑，被用户文本完全取代。世界卡面删除该行（卡面只留名字+氛围+图）；封面 flavour 与广场回落只在世界未改名时才借用它，改名后一律不借（防旧文案串回新世界） |
| 3 | bible premise 模板句「…在出生点发现一条会被无名外力搅动的世界线」 | `worldBibleFor` 预设分支 | **删除**。premise 改为按最终设定文本组装，与创世神分支同构：「世界名：设定文本 + 身份短语 + 主角 + 的故事，就从这个世界里开始，第一幕落在出生点」；设定被清空时回落「世界的样子将随故事逐一显形」 |
| 4 | bible rules[0]「X 的秘密只能通过具体行动被唤醒」 | `worldBibleFor` 预设分支 | **删除**。改为「世界设定（这个世界以此为准）：最终设定文本」。其余两条（回声不可抹去/能力有边界）保留——它们是引擎一致性规则而非世界设定，且广场介绍本来就会把它们滤掉 |
| 5 | bible endingAnchor「必须决定把记忆交给谁，以及是否让世界继续保持原样」（沉潮港的「记忆」味串进全部六个世界） | `worldBibleFor` 预设分支 | **删除**。改为按世界名组装的锚（与创世神分支同句式：「必须决定 X 的未来走向，以及谁有资格改写它的规则」） |
| 6 | beat plan 先决条件「世界：固定世界名」且全程无设定行 | `storyBeatPlan` | **下放生成侧**：世界名改走 `worldNameOf`；新增「世界设定：最终设定文本」先决行，与创世神的「创世设定」行同例——每一章的简报都以最终文本为据现写 |
| 7 | 出生点全套 hook（每世界 14–15 条成稿开局处境句）+ 身份落点表 | GENRES.spawnPoints、ORIGIN_SPAWN_TABLE | **保留作选项，另开自写通道**（定案④）：新增 `startPointCustom` 标记；出身步加渐进式披露折叠「没有合心意的？自己写一个出生点」（名字+开局处境，复用创世神自填的同款字段与上限）；引擎 `resolveStartPoint` 见标记即按自写点解析（越过身份格回落，与创世神自填同语义），无标记时旧回落行为逐字不变 |
| 8 | 默认出生点名 `genre.location` | GENRES | **保留**：它是默认出生点的注册锚（老存档无 startPointName 时靠它解析到同一个点），属结构而非设定文案 |
| 9 | 预设书名 `genre.title`（《借火登天》等） | GENRES、`titleFor` | **保留**：它是书名建议而非世界设定；书名步本来就能改（TITLE-FLOW），且书名与世界名早已是两回事——世界改名不联动书名 |
| 10 | 本地模式分章正文（每世界 6 章成稿散文） | `sceneFor` | **保留**：那是离线「预设体验」模式的故事正文本身，不是世界设定文案；动它等于删掉离线模式。在线生成从不读它 |
| 11 | tagline（一句氛围） | GENRES | **保留**（定案①明示：名字+一句氛围+视觉图） |
| 12 | 身份×世界本地称谓（如青岚宗·宗门真传） | ORIGIN_SPAWN_TABLE.title | **保留**：称谓讲的是「人」在世界里的叫法，是身份系统的本地化标签，不是世界设定成稿 |
| 13 | 各世界能力池 WORLD_ABILITY_POOLS | story-engine | **保留**：能力步的候选库，与世界设定文案无关，且能力步本来就有自写 |
| 14 | 世界图 `public/art/<id>-*.webp` | public/art | **保留**（定案①明示），预设 id 与封面/图映射一律不动 |

## 实现落点

**数据（src/story-engine.js）**
- 新增 `PRESET_WORLD_SETTING_MAX = 600`（与创世神设定同界）；config 新增 `worldDrafts: { [genreId]: { name, setting } }`（条目是该世界「当前有效全文」的完整快照——UI 首次编辑时以预设全文播种，所以条目永远自洽，不存在半覆盖）与 `startPointCustom: boolean`，均进 `DEFAULT_DRAFT` 与 `normalizeDraft`（条目做 trim/限长/只认真实预设 id/空条目丢弃）。
- 新增导出 `worldDraftOf` / `worldSettingOf`；`worldNameOf` 改为导出且草稿优先。`createStory` 的白名单拼装（main.jsx App 层 generate）同步补 `worldDrafts` 与 `startPointCustom` 两个字段（漏传则编辑在成书时丢失——已钉进 UI 源码断言旁的链路）。
- 存档校验（src/persistence.js）：`worldDrafts` 形状/上限校验（条目 ≤12、名 ≤40、设定 ≤600，与 lorebook 同款镜像常量）、`startPointCustom` 进布尔字段表。

**草稿编辑 UI（src/main.jsx，只动世界步与出身步，不动题材步）**
- 世界卡面：删 description 行，只留封面图+名字+氛围（截图 01）。
- 世界步：选中预设后，网格下方出现渐进式披露折叠「改一改这个世界（名字和设定都能改）」——世界名 input（与创世神同款 clipToUnits/40 上限）+ 设定 textarea（600 上限+计数）+ 两句说明 + 「恢复这个世界的预设原文」（有草稿时才出现，一键删条目回预设）。折叠默认收起，不改的人完全无感（截图 02，含改名实况）。
- 离开世界步与提交成书时，编辑稿过 `findSettingViolation` 硬前检（与创世神设定同一检查、同一时机：不在输入时拦）；App 层 generate 再检一次。
- 右侧「当前设定」预览面板为预设世界补「设定」行（此前只有创世神有），显示有效设定摘录；出身步提示文案中的世界名走有效名（截图 03 中「在青岚山门能落脚的地方」即改名后的贯通实证）。
- 出身步：预设出生点网格下加折叠「没有合心意的？自己写一个出生点」（名字+开局处境，均为既有字段/上限）；自写生效时网格上方有状态行（「这一本从你写的「X」开始」+「改用预设出生点」一键撤销）。标记纪律：选预设卡/换身份/掷骰/随机组合/换世界一律清标记（与既有 name/hook 清除点逐一对齐）；两个输入框从预设态首次输入时互不串带（名字框起笔清 hook、处境框起笔清名字，与创世神自填的清 hook 语义一致）。

**生成侧（server/gemini.js）**
- `compactConfig`：预设世界新增 `worldName`（最终名）+ `worldSetting`（最终设定文本，`sanitizeSettingText` 后）随简报走；创世神仍走原 customWorldName/Setting，不重复。
- `contextFor`：新增定界数据块 `worldSettingData`（与 `customWorldSettingData` 同款声明，另加一句「写世界圣经时以这份草稿为准，现写这个世界的样貌与规则，不要套用与它无关的现成世界设定」）；注入清洗从单条推广为成对：最终设定文本在 context 中的一切逐字副本（种子 bible 的 premise/rules、beat plan 的世界设定行）统一换成清洗后版本，与创世神设定同一待遇。SYSTEM_PROMPT 追加一段 worldSettingData 的处理规矩（与 customWorldSettingData 段并列）。
- 封面（server/cover.js）：编辑过的世界以自己的名字+设定文本作 flavour，未编辑的保持原目录 flavour。

**发布侧（src/plaza.js / story-engine 快照）**
- 快照 `worldName` 经 safeConfig（normalizeDraft 携带 worldDrafts）自动取最终名；`enterTemplate.config` 新增携带 `worldDrafts`，`enterDraftFor` 接住——带化身进入一个被改名/改写的已发布世界，进的是那个世界，不是原装预设。
- `redactedSnapshotConfig` 随 startPointName/Hook 一并清 `startPointCustom`（自写标记是书主状态，不进快照）。
- 广场介绍的目录文案回落加守卫：`worldName` 与预设名一致才借 `genre.description`（改名书的 premise 被滤空时宁可只剩标签行，不把旧世界文案印到新名下）。
- 快照来源守卫改用引擎新导出 `isLocalTemplateBible`：当前组装与**已退役的旧组装**都认作本地模板（旧组装逐字复刻在 `legacyPresetBibleFor`，仅供比对）——否则老本地书的存量 bible 会因模板换代被误判「来源无法确认」而拦下发布。

## 兼容

- 老故事：config 无 worldDrafts/startPointCustom 时全部解析回落到预设名/预设描述/身份格默认点，行为与旧版一致（有专项测试钉死）；已定格在各自 bible 的世界本体一字不动。
- 老草稿：`legacyDraftToDraft` 是展开式迁移，新字段自动透传，缺失即默认空，无需迁移代码。
- 预设 id、世界图、封面映射、GENRE_SHELVES/题材模板：全不动。创世神一级入口与借出生点机制：不动（自写出生点的字段与上限直接复用它）。
- 下一季（startNextSeason 展开 config）、合流（源 bible 走 mergeSourceContext）：worldDrafts 随 config 自然携带。

## 与 REQ-56（synopsis-first）的 schema 集成注意点

- REQ-56 在其分支动 `server/gemini.js` 的**开篇输出 schema**（responseSchema/validateOutput 的 worldBible 字段 + synopsis）与 `src/plaza.js` 的 `plazaWorldIntroFor` 优先序。本批在 gemini.js 动的是 `compactConfig`、`contextFor` 尾部清洗段与 SYSTEM_PROMPT 的数据块说明段——与 schema 区不重叠；合并若在 SYSTEM_PROMPT 相邻行冲突，解法是两段数据块说明并存（customWorldSettingData 段、worldSettingData 段、REQ-56 的 synopsis 口径段互不替代）。
- REQ-56 的 bible/synopsis 生成口径应以 `worldSettingData` 为世界依据（本批 declaration 已写明「以草稿为准现写」）；synopsis 不要再从旧 premise 模板反推，本批后 premise 本身就是「最终设定文本+主角」的组装。
- plaza.js：REQ-56 改 intro 优先序时保留本批两处语义——①快照来源守卫走 `isLocalTemplateBible`（含旧组装识别）；②目录文案回落只限未改名世界。若 REQ-56 让 intro 优先采用故事自带 synopsis/三段，与本批守卫不冲突（守卫只管最后回落层）。

## 已知边界（既有防护口径，非本批引入）

- `sanitizeSettingText` 对「忽略以上指令」等锚定形状全覆盖，对「忽略以上所有指令」这类双量化词形状不覆盖——这是既有防护本身的边界，创世神路径同样如此；本批按任务口径「一律过既有注入防护」原样接入，未扩大也未缩小。专项测试的注入夹具按既有覆盖形状钉死（标签去形 + 锚定句切除 + 创作内容保留，三项都在真实生成简报上断言）。

## 测试

- 新增 `tests/world-preset-soft.test.js`（13 例）：编辑稿落 config+bible 组装（premise/rules/anchor/beat plan/快照 worldName/enterTemplate）、未编辑等价与旧模板句退役断言、跨世界不串稿、旧 config 兼容、旧组装 bible 识别（isLocalTemplateBible 三态）、自写出生点越过身份格+第一章逐字开场、无标记回落旧行为、存档校验与限长、硬前检同口径、**mock 生成实证**（捕获真实请求体：worldSettingData 在简报内、编辑文本逐字到达、目录旧文案零出现、模型 bible 回传被采纳）、注入清洗实证、封面 prompt 双态、广场回落守卫双态、UI 源码接线断言。
- 既有测试更新 1 处：`tests/story-engine.test.js` 的 storyBeatPlan 先决条件计数 5→6（新增世界设定行，与创世设定行同例；介入用例 6→7），并加该行内容断言——属本批预期行为变化。
- 全量：924 例，919 过，5 失败——与基线失败集逐一相同（dedup-fix 的 ③a ×5，样本图 ENOENT 环境失败）；基线 911 例中另有 storyBeatPlan 1 例为本批预期变化、已按上条更新后通过。`npm run build` 通过。

## 截图（390×844，fixture 真服务+真构建，world-preset-soft-shots/，未入库）

- `01-world-step-presets.png`：世界步预设态——世界卡只剩封面+名字+一句氛围。
- `02-world-draft-editor.png`：选中青岚宗后展开编辑折叠区，世界名已改为「青岚山门」，设定框内是预设原文草稿。
- `03-spawn-custom.png`：出身步——该身份的预设出生点（主峰藏经阁·默认/真传洞府）在上，自写折叠区展开（名字+开局处境）；提示文案的世界名已是改后的「青岚山门」。
- 截图过程中抓到并已修复一处真实缺陷：自写折叠区用到未导入的 `START_POINT_HOOK_MAX`，出身步渲染会抛 ReferenceError——已补 main.jsx 导入并重跑截图验证。
