# CONTENT-CONSISTENCY — REQ-69 W5 内容修复·引擎侧防复发（代码批）

基线：origin/main `e3f8424`；分支 `content-consistency`（只本地提交，未 push、未部署）。
针对 READER-QA（`~/workspace/sw-prep/audit-00051/READER-QA.md`）的 F2/F3/F5 三种病，落三道引擎侧防线。原则与既有批次一致：新字段对旧书一律「缺省即旧行为」——没有锚点/边界的书，简报、落盘、校验与改前逐字相同（REQ-57 abilityDesc 的同款保守口径）。

## 一、主角硬锚点（F2：29 岁的人「三十年前亲手签字」）

**结构化落点（一种形状，三个家）** — `normalizeProtagonistAnchors`（src/story-engine.js）：

```
{ age: int 1–999 | null,
  events: [{ label: string ≤40, yearsAgo: int 0–9999 }] ≤8,
  identityFacts: [string ≤120] ≤5 }
```

- 故事配置 `config.anchors`（solo 主角；`DEFAULT_DRAFT.anchors = null`，`normalizeDraft` 归一化）；
- 化身档案 `avatar.anchors`（src/avatar.js `validateAvatarProfile` 三态语义与专属能力同构：缺键不表态、带键以归一化值或 null 为准；`avatarDraftPatch` 带入新书，`server/avatar.js` 存储/保留/文本过 `sanitizeSettingText` 同款 scrub，`server/social.js` 公开主页摘要同路携带）；
- 世界圣经 `worldBible.anchors`（世界时间线事实，经既有 `updateWorldBible` 的 patch 通道写入/保留，无 patch 时原样带过）；
- 合流：每位主角在 `config.protagonists[]` 各自带 `anchors`（`createMergedStory` 从各源 `publicConfigFor` 继承），融合书的书级槽位则清空（与 REQ-61 的 abilityDesc 同裁决：锚点是逐人的，不是全卡司的）；公开快照 `redactedSnapshotConfig` 把 anchors/abilityBounds 一并剥除（身份事实属书主私有素材，同 persona 口径）。

**简报硬约束** — `storyBeatPlan` 的 prerequisites 新增（无锚点则零新增行）：`anchorConstraintLines` 逐条复述并算好衍生年龄：「现年 29 岁」「关键事件『灾变』在 7 年前，当时 22 岁」；算术不可能的事件直接写明「当时尚未出生——不得写成主角亲历或亲手所为，只能是他人所为/同名者/冒用名号/档案记载（除非身份事实另有冻龄/转生说明）」。世界圣经锚点以「世界」为主语同路复述。服务端 `server/gemini.js` 的 `compactConfig` 把 anchors 结构化带入上下文（数字原样、文本 scrub），`SYSTEM_PROMPT` 新增「硬锚点」段（与篇幅同级）。

**章后漂移告警** — `chapterDriftWarningsFor(story, text)`，在 `acceptChapter` / `replaceChapter` / `replaceFrontierChapter` 三条落盘路径统一盖章：有告警才在章记录上写 `driftWarnings: [{kind, expected, found, excerpt}]`，干净章节不落字段（旧章字节不变）。告警只记录、永不拦截（一道启发式扫描没有资格吃掉一章正文）。`src/persistence.js` 同步放行并校验 anchors（config / protagonists / worldBible 三处）与 `driftWarnings` 的形状（镜像常量，本层保持无依赖的既有惯例）。

覆盖（实测锁定，见 tests/content-consistency.test.js）：
- 「N 年前」「N 岁」的抽取比对，N 支持阿拉伯数字与千以内中文数字（三十/三十二/一百二十，`parseChineseNumber`）；
- 主角名 40 字内的年龄表述 ≠ 锚点年龄 → `age-mismatch`；
- 锚点事件标签 60 字内的年数表述 ≠ 该事件 yearsAgo → `event-years-mismatch`；
- 年数 > 锚点年龄且主角名在 60 字内 → `years-before-birth`（F2 原形）；同段自带「未出生/冒用/同名者/不是他」等诚实读法标记时豁免（那正是锚点在起作用）。

**未覆盖边界（如实）**：
- 绝对纪年（「1998 年」「灾变第 X 年」）不解析；
- 远离主角名的他人年龄不查（有意为之，避免误伤配角）；事件标签不在年数附近时不查；
- 中文数字千以上（万级）、繁体异体数字不解析；
- 「他当时还是个孩子」这类无数字的语义矛盾、代词指代消解不在扫描内；
- 告警不回溯存量章节：只对本批之后新落盘/重掷/介入重写的章节生效，存量书的既有矛盾靠内容修复批的人工定点修订。

## 二、金手指边界（F3：「存量心算」滑成全知外挂）

**数据结构** — 能力在 name/desc 之外新增 `bounds`（做不到什么）：
- 故事侧 `config.abilityBounds`（与 `abilityDesc` 并行，`ABILITY_BOUNDS_MAX = 120`，过 `normalizeDraft` 的既有 bounded 清洗；服务端 `compactConfig` 过 `sanitizeSettingText`，与 abilityDesc 同路）；
- 化身专属能力 `avatar.ability.bounds`（REQ-57 同构落点：`normalizeAvatarAbility` 归一化，无 bounds 时保持旧 `{id,name,desc}` 精确形状；服务端存储时 bounds 与 anchors 文本同过 scrub）；
- 造世能力步同构：`abilityCandidatesFor` 的候选对象自带 bounds，造世流（src/main.jsx）把 pick 的 bounds 随 desc 一起落 draft → `createStory`；广场进入线（PlazaEnter → `enterDraftFor(abilityBounds)`）同路。

**库条目默认值** — `ALL_ABILITIES` 全部 80 条（世界池 24 + 模板招牌 52 + 通用 4）逐条补 bounds：高危条目（存量心算、读心余光、气血可视、大势预读、结算预知、前尘索引、言出法随等）逐条手写保守边界（限定对象/媒介/误差/代价）；其余按各自 desc 就近收口为「只限该能力本身所述对象与场合、须有亲历媒介、不能延伸到未见之物/人心/未发生的真相、效果有误差要付代价」。其中「存量心算」定版边界：只能估算亲眼所见、有实物或账目可核的物资存量与消耗，算不了人心、历史真相与没见过的仓库，数字是估算会出错且伤眼耗神。

**简报与系统提示** — `storyBeatPlan` 在能力行之后加「硬约束·能力边界」行（仅当书存有 bounds 时；旧书简报不变）；`SYSTEM_PROMPT` 明文：能力只能在 desc+bounds 内使用、不得越界膨胀（不能从算物滑到算人心/算历史、不能无媒介全知）、正文出现新能力必须先有剧情授予事件（传承/交易/觉醒/缴获）。`abilityBoundsFor(config)` 提供「书存优先、其次库默认」的有效边界解析，供展示/后续执法调用。

**未覆盖边界**：
- 正文侧没有自动「越界使用」检测器：bounds 是生成侧硬约束 + 人工/运营复核依据；自动识别「这一段把心算用成了读心」需要语义判定，本批不假装能做；
- 手写自定义能力在造世时仍可不写 bounds（desc 即其唯一定义，与改前同）；此时简报无边界行，库默认只按名命中时才有；
- 存量书已落盘章节里的越界桥段不在本批回改范围（内容修复批处置）。

## 三、完本简介对齐通道（F5：简介虚构赵凌霄与献祭协议）

**正规通道**（src/story-engine.js，紧挨既有 `updateSynopsis`/`updateIntro`，不发明新范式）：
- `buildSynopsisAlignmentDraft(story)` — 按全书章节摘要（首章 + 中点 + 末章）+ 世界圣经组装候选 `{ synopsis, intro {background, rules, thread} }`，纯函数、只产草案、永不写回；自带 check 结果；
- `synopsisAlignmentCheck(story, candidate)` — 两道校验：① 强制过既有 REQ-56/65 校验器 `introViolationFor`（官方腔/章名串联/章数播报/引擎术语全在同一清单内，另加 synopsis 长度上限）；② 新增专名硬校验：`extractProperNouns` 从候选抽专名（引号内名、姓氏领起人名、组织后缀名），逐个在 `storyCorpusFor`（章节标题/摘要/正文/事件 + 配置与圣经里的名字）中检索，检索不到即以 `unknown-name` 拦截并报出名字；
- `applySynopsisAlignment(story, candidate, { confirm })` — 无显式 `confirm: true` 时原样返回（applied: false）；带 confirm 时先跑 check，脏草案直接抛错并列明命中禁令与检索不到的专名，干净草案才经 `updateSynopsis`/`updateIntro` 既有路径写回。运营/模型自备候选同样走 check/apply 两口。书主手改简介永不被草案步骤自动覆盖。

**专名抽取的启发式边界（如实）**：
- 人名靠姓氏表 + 边界收口（标点/助词/常见动词）+ 否定副词排除（经不多、何尝不是这类普通话不入选）；组织名靠后缀表 + 「不得以动词/助词/另一后缀字领起」的收口（逼刑堂→刑堂、闯进青冥宗→青冥宗、大殿等泛称在 stoplist）；
- 无姓氏的双字名（如「老周」靠语境成立的人名）、外文名、单字名可能漏抽；冷僻姓氏不在表内会漏；
- 因此它是「虚构专名绊线」而非完整 NER：漏抽意味着某个编造名可能滑过（靠运营确认兜底），误抽意味着运营会看到一条多余告警（草案制 + 人工确认，不自动落盘，所以误报代价是可控的）。

## 测试与对账

- 新增 `tests/content-consistency.test.js`（22 条）：锚点归一化/衍生年龄/简报组装（solo·圣经·化身·合流）、漂移告警正反样本（F2 原形、年龄矛盾、事件年数矛盾、算术一致与他人年龄的静默、落盘盖章与干净章无字段）、bounds 全库覆盖与存量心算定版文案、化身 bounds/anchors 服务端 scrub 与三态保留、Gemini 上下文组装与 SYSTEM_PROMPT 断言、简介通道（虚构人名被拦、实有专名放行、官方腔被拦、无 confirm 不写、脏草案带 confirm 抛错、摘要组装草案自检通过）。
- 全量：1064 条，1059 过，5 败 = 基线 dedup 样本图 ENOENT×5（与基线失败集逐条一致）；过程中 import-daylight flake 出现 1 次、复跑即过（基线已知 flake）。新增失败零。
- `npm run build` 通过。

## 改动文件

- `src/story-engine.js` — 锚点形状/归一化/硬约束行/漂移扫描/能力 bounds 库默认值与解析/简介对齐通道；normalizeDraft、storyBeatPlan、accept/replace 路径、合流与快照的锚点口径、updateWorldBible。
- `src/avatar.js` — 化身 ability.bounds、avatar.anchors（校验/草稿补丁/集合签名/预设）。
- `src/persistence.js` — anchors 与 driftWarnings 的存储校验、abilityBounds 文本字段。
- `src/plaza.js` — enterDraftFor 带 abilityBounds 与化身 anchors。
- `src/main.jsx` — 造世与广场进入两处 pick 的 bounds 传递（最小接线）。
- `server/gemini.js` — compactConfig 带 anchors/abilityBounds（含合流逐人）、圣经 anchors 入上下文、SYSTEM_PROMPT 硬锚点与能力边界段。
- `server/avatar.js` — 化身 ability.bounds/anchors 的 scrub 与三态存储。
- `server/social.js` — 公开主页摘要携带 ability.bounds 与 anchors。
- `tests/content-consistency.test.js` — 本批测试。
