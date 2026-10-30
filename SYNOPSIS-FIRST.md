# REQ-56 简介生成制 — 处置笔记（synopsis-first 分支，基线 origin/main 1001e79）

用户 2026-10-30 23:55 亲定：所有书的简介按生成制标准、不许模板拼装；「主角与主线」不许章名串联与章数播报、按本书具体内容写；简介由生成侧在生成这本书时一并写好（并进同一次调用）；关于书的一切文字书主都可自己编辑，生成版只是草稿，已发布书改完走重新发布同步。本批只本地提交，不 push、不部署、不动生产数据。

## 现状差距（开工盘点，逐条）

1. **生成侧不写简介**：开篇调用只产出 worldBible{premise,rules,endingAnchor,outline}；story.synopsis 只有书主手写才有，intro 字段根本不存在。
2. **发布全靠拼装**：plazaWorldIntroFor 的 background 靠 premise 切句拼装；无 synopsis 时 thread = 「X是这个世界的主角。故事从『首章名』开始，一路走到『末章名』。这条线已经完结，全 N 章。」——正是被禁的废话式样，且无任何自动禁令检查（dedup-fix 测试还钉着这条旧断言）。
3. **本地 bible 模板规则全是填充**：worldBibleFor 三条通用规则（秘密唤醒/回声/稳定度）哪本书都一样，本地书没有任何具体规则与简介来源。
4. **编辑面缺发布版三段**：EDIT-BOOK 已有书名/简介/章节标题编辑，设定集另有世界圣经编辑（premise/rules/endingAnchor，属引擎 canon）；但详情页展示的公开三段（background/rules/thread）是拼装产物、无落盘字段，书主改不了。

## 生成侧改动（并进同一次调用，无额外付费调用）

- `server/gemini.js` responseSchema（开篇）：新增顶层 `synopsis`（100–180 字白话简介）与 `intro{background, rules[1–3], thread}`，与 worldBible 同级、列入 schema required；字段描述自带禁令口径。SYSTEM_PROMPT 追加一段开篇简介写作要求（具体到本书：处境/目标/对手/代价；禁章名串联、禁章数播报、禁空话、禁内部说法）。
- validateOutput：在 bible 的 retryable try 内一并校验 synopsis/intro（界：synopsis 60–300、background/thread 30–600、rules 1–3 条每条 8–300）并跑共享禁令检查 `introViolationFor`，命中即 retryable 502、同一次请求内重问，违规文案永不落盘。
- **一处口径决定**：校验「容缺席」——schema 强要求、validateOutput 不因缺席杀章，与 events/foreshadowing 的既有先例一致；理由：本地兜底草稿接得住（见下），不让一条简介的采样滑失杀掉整章开篇（FINAL-FIX R-01 修的正是这类失败）。但在场且违规必拒（不静默丢弃——静默丢弃等于让拼装回落冒充生成版）。
- 两条 provider 路径（Vertex / API-key）的组装同改：synopsis/intro 从 validated 剥出、随结果带出，不漏进 chapter 对象。服务端生成端点透传整个 result，无 HTTP 层吞字段。
- `src/generation.js`：acceptGeneratedChapter / acceptRerolledChapter 在 index===0 落 worldBible 的同点落 result.synopsis / result.intro（sanitizeIntro 清洗形状），覆盖本地兜底草稿；后续章节不带这两字段，书主在开篇后的编辑永不被生成覆盖。重掷第 1 章 = 新开篇，简介草稿连同圣经一并换新（与 worldBible 既有重掷口径一致）。

### mock 实证（tests/synopsis-first.test.js，生成→落盘全链）

mock 开篇产出并成功落到 story 上的简介样本一条：

> 阿遥是白潮港的守夜人，靠一本手写日志过日子。最近潮汐钟开始乱响，镇上人的记忆每天少一截，她的日志里还多出了一封没有署名的信。她要在雾季结束前查清信的来历，代价是每找回一段别人的记忆，她自己的过去就淡一分。

配套 intro 三段（background 白潮港与守夜屋 / rules 潮汐钟改写记忆·无主信须天亮前回 / thread 镇长索日志·守灯人称信是她十年前所寄·查得越深忘得越多）同测逐字落盘。另测：首答 synopsis 带「全 24 章」播报 → 同请求内重问、第 2 答合格落地（calls=2）；持续违规 → 3 次后 502 拒绝、违规文案永不落地；schema 断言开篇含 synopsis/intro 且在 required 内、第 2 章 schema 两者皆无。

## 禁令清单（单一事实源：story-engine `introViolationFor`；广场侧叠加版 `worldIntroViolationFor`）

- 章名串联：/从「…」开始，一路走到/、/一路走到「…」/
- 章数播报：/全 N 章/、/已更新到第 N 章/、/这条线已经完结|还在连载/
- 引擎术语（INTRO_ENGINE_TERMS，与广场既有过滤表合一）：资产与负债、因果账目、制约、稳定度、数值、参数、提示词、回合制、账目制、世界线扰动值
- 模板填充（INTRO_FILLER_MARKERS）：「的秘密只能通过具体行动」「已经发生的事会留下可追踪的」「可追溯的回声」「由创作者亲手写定」
- 广场侧另加：退役脱敏占位标记（SNAPSHOT_ALIAS_MARKERS，已隐去/匿名火种类）
- **禁令只约束生成侧与拼装回落，永不约束书主自己的编辑**（updateIntro 不查禁令——书主的书、书主的话）。

## 发布优先与回落策略

- 故事新字段 `intro = { background, rules, thread }`（与 worldIntro 同形；生成永不回读，展示文案非 canon，与 synopsis 同架构）。persistence 加形状/上限校验（600/600/300×3，镜像 INTRO_*_MAX 注释）。
- plazaSnapshot 逐字携带 intro（仿 synopsis 条件字段）；server/plaza.js publish 与 title-sync 组装 detail 时带 snapshot.intro；detailOf 暴露 intro 供客户端同源重算；scripts/refresh-world-intros.mjs 的 worldIntroForRecord 同步带入。
- plazaWorldIntroFor 改为**逐段优先生成版**：每段过 worldIntroViolationFor 才采用，不合格段单独回落（background→原拼装、rules→圣经过滤链、thread→synopsis→兜底），合格段照常站住。
- 回落 thread **废除**章名串联与章数播报：主角句 + 首个已发布 beat 的 summary 首句（过禁令检查才拼；无 summary 只留主角句）。卡片 intro 的进度尾裁剪逻辑随之删除（thread 不再带进度尾；卡片元信息行仍有状态与章数标签，不受影响）。
- WORLD_INTRO_VERSION 3→4：存量 v3 烘焙记录在详情页自动走客户端现算（detail 已带 intro），或由 refresh 脚本/重新发布重烘焙；本批不迁生产数据。
- **本地兜底**（createStory/createMergedStory 出生即带）：localIntroFor/localMergedIntroFor 只用本书事实拼装——世界目录文案或创世者设定原文（前两句）、主角出身/身份/能力、大纲首末拍（末拍剥「第N章，」前缀）、圣经规则过滤填充与术语后的具体条。模板圣经三条全是填充 → rules 诚实为空数组，宁空不编。实测三形态（模板/创世神/合流）产物逐段过禁令检查。
- 旧书（无 intro/synopsis 字段）：effectiveIntroFor 走同一本地拼装回落，详情与编辑面都不空白；publicSnapshot（本地分享副本，匿名设计）不带 intro，保持原样。

## 编辑覆盖面盘点与补齐

盘点（EDIT-BOOK 后现状）：书名 ✓（设定集，保存后服务端镜像到已发布记录）、本书简介 ✓（设定集，上限 300）、章节标题 ✓（设定集目录区+阅读器目录抽屉）、世界圣经 premise/rules/endingAnchor ✓（设定集，引擎 canon）、合流来历只读展示。
缺口与补齐：**公开三段本身不可编辑** → 引擎加 `updateIntro`（修剪/上限/RangeError 人话/同值 no-op/三段全空删字段回落，与 updateSynopsis 同口径）；设定集在「本书简介」区后新增「世界设定（发布版）」区（背景/规则一行一条/主线三个 textarea，初值 = effectiveIntroFor——生成版优先、无则回落拼装值，书主看到的即读者看到的），与既有编辑同入口、不新开平行界面；Reader 加 saveIntro 经 update() 落盘；文案两句说清「改动先落在你自己的书上；已经发布的，重新发布一次才会同步」（与简介区同调）。manual（自己写）书保持原三区（书名/简介/目录），不显示该区——其详情三段仍走发布合成，属已知边界。
权限：仅书主——编辑面只存在于自己的书（Reader 的 settingsOpen 受 !readOnly 门控），与既有编辑同口径，无新增通道。

## 契约落档

DESIGN.md 新增 §55 简介生成制（生成同调/禁令清单/发布优先/本地兜底/编辑覆盖面五条写死口径）。

## 测试结果

- 新增 tests/synopsis-first.test.js：10/10 全过（生成同调与落盘、禁令重问/拒绝、缺席容忍、本地三形态兜底、发布逐段优先、逐段回落、回落禁令、编辑全字段与重发携带、旧书回落）。
- 旧测试按 REQ-56 口径更新 4 处（均为被本令 supersede 的旧断言，改动处留了 supersede 注释）：dedup-fix ④ thread 期望 ×3（章名串联/进度播报旧制）、edit-book plazaSnapshot synopsis 前提 ×1（「书主没写就没有」→「出生即带草稿、快照带当前值、字段真缺席才省略」）。
- 全量：基线（1001e79+node_modules 软链）911 测 905 过 6 败 → 改后 **921 测 915 过 6 败**。失败集：dedup 样本图 ENOENT ×5（worktree 无未跟踪样本图，环境类，基线同败）；import-daylight「backup merge identical」×1——时间戳 flake（两 fixture 的 createStory 跨毫秒则 JSON.stringify 恒等比较判为 updated；单独重跑 3 次 2 过，机制先于本批存在、本批未触该比较逻辑），与任务简报的已知 flake 名单一致。build 通过（chunk 体积警告为既有）。
- 未跑：e2e（需活服务+浏览器 harness，不在本批门禁内；设定集新增区段的 aria 标签为全新命名，与既有选择器无冲突）。

## 集成提示

- 改动面：src/story-engine.js、src/plaza.js、src/generation.js、src/persistence.js、src/main.jsx、server/gemini.js、server/plaza.js、scripts/refresh-world-intros.mjs、DESIGN.md、tests/{synopsis-first（新）,dedup-fix,edit-book}。与在跑的 fusion-permission / local-cache / copy-scrub / genre-freedom / fusion-multi / reader-polish2 / detail-layout 各分支的文件面有重叠（main.jsx、plaza.js、gemini.js），集成时按常规解冲突；本批对 WORLD_INTRO_VERSION 的 3→4 与 detailOf 的 intro 暴露是加法，冲突风险低。
- REQ-52（copy-scrub）不在本基线内：其守卫白名单口径里 SYSTEM_PROMPT 属内部提示词正文，本批在 SYSTEM_PROMPT 内新增的禁词是以「禁止出现」反例形式写入的提示词文本，集成时按其既有白名单处理即可。
