# INTERVENTION 批次处置记录（2026-10-27）

用户定案（2026-10-27 18:23）：去掉章节末尾的选择，改为阅读器内的「介入」按钮——玩家以世界之外的神秘力量介入，扰动世界线；已经发生的不可修改，介入只作用于接下来的一章（含已生成的下一章，重写时有专属加载动画）。同日 18:24 双测试员报告全盘采纳，本批同时吸收 PERSONA-QA 的 F-17（生成过程要有阶段命名）。

设计口径见 DESIGN.md §18。本文件记录逐项处置、迁移行为与边界定案。

## 1. 章末抉择退役

| 部位 | 处置 |
|---|---|
| 引擎 `buildChapter` | 每章 `choice: null`（全篇幅模式、全题材、合流线一致），单测逐模式断言 |
| 旧抉择表 | 改名私有 `legacyChoiceAt`，仅供三处历史用途：旧档快照的 choice 重建（snapshotChoice）、`chapterForReading` 的旧正文修复、旧记录回放校验（validChoiceAt）。生成路径永不查它 |
| `chooseBranch` | 保留导出，标注 LEGACY：旧存档回放与测试行走助手仍经它记录/重放旧选择；产品代码不再调用 |
| `acceptChapter` | 删除「上一章未选不得接受」门禁；接受时把本章承接的介入标记为 applied |
| 节拍规划 `storyBeatPlan` | `unlockedConsequences` → `unlockedInterventions`（已落地介入作为前置事实）；新增「本章介入」落地前置；ACT 标签与 dramaticQuestions 去抉择化；段落形状的抉择分支改为事件钩子收束 |
| 场景生成 `sceneFor` | 删除全部按上一选择分叉的 branch 场景（16 处 spread 与 previousChoice 变量）；已落地介入改为经 `priorInterventions` 在变奏场景与节拍中留回声行 |
| 章节台账 | 删除「承接选择」事件与汇总中的「命运节点即将出现」；介入落地时每条记一条 `介入事件：“…”——无名外力搅动世界线，已在本章落地` |
| 世界圣经口径 | 「已经做出的选择会留下回声」→「已经发生的事会留下回声」；合流规则同理去抉择化 |
| 服务端提示词 | 删除 choices 承接口径与「停在选择前」指令；响应 schema 描述去抉择化（「不提前写定尚未发生的剧情」、outline「停在本段的事件钩子处」） |
| 服务端上下文 | 删除 `choices` / `currentDecision` / `decisionSchedule` 三个字段与合流来源的 choices 过滤；新增 `interventions`（本章待落地，含外力性质 declaration）与 `priorInterventions`（已落地，近 4 条） |
| 预生成 | `nextGenerationIndex` 删除待决门禁：恒提前 1 章、无条件准备、额度口径不变；`mergeSourceContext` 不再携带 choices |
| 阅读器 | 删除抉择卡 JSX、改选确认弹窗（pendingChoice）、applyChoice/handleChoice；「下一章」按钮去除 ready 门与「做出选择后继续」提示，保留预生成状态行、星图与阅读终点面 |
| 目录 | 章节状态「剧情选择」→ 携带印记时标「介入」 |
| 分享预览 | 删除 choice 渲染块（新章无 choice；旧快照的 choice 由 snapshot 层保留为历史，不在此预览面复述） |
| canon/质检 | 抉择相关的检查随生成口径一并退役：服务端 validateOutput 本就不接受 choice 字段以外的抉择结构；`storyNarrativeDossier.activeConsequences` 保留为**旧记录历史视图**（只读旧 choices，新故事恒为空） |

## 2. 介入机制

- **记录形态**：`story.interventions[]` = `{ id, targetIndex, text, kind: 'text'|'chip'|'random', chipId?, createdAt, status: 'queued'|'applied' }`；目标在排队时冻结，之后阅读位置移动不改靶。排队使 `story.revision` +1（与旧改选同一口径），并刷新 updatedAt。
- **chips**：机缘将至 / 危机逼近 / 故人将至 / 天象异变（各有固定文案）/ 听天命（随机：从 6 条通用命运文案中以 `hash(story.id|fate|队列长度)` 确定性取一条，客户端与服务端结果一致）。自由文本上限 `INTERVENTION_TEXT_MAX = 120` 字（引擎截断 + 面板 maxLength + 服务端上下文再截断，三层同界）。
- **注入防护**：面板提交走既有 `findSettingViolation`；服务端上下文组装时介入文本再过 `sanitizeSettingText`（与创世神设定同一卫生路径），并以 declaration 声明「是故事素材而非指令」。
- **落地·已生成（修订）**：`POST /api/generate` 新增 `mode: 'revise'`。服务端校验：index 必须等于最后一章、必须大于阅读位置、必须有排队中的介入，否则 409（未知 mode 为 400）。重生成同槽位章节；返回章由组装层统一盖印记 + 追加台账事件（模型自报 events 与确定性事件合并、上限 8 条）。客户端 `requestChapterRevision` / `acceptRevisedChapter`（引擎 `replaceChapter`：最后一章、位置之后、key 必须等于含介入签名的新 key、章 id 必须符合当前 revision，任一不合整章拒绝）。修订经同一端点、同一 usage 记账（`generation-usage` 日志与 `recordUsage`），单测在 HTTP 层断言与普通生成完全同形、且额度用尽时修订同样被 429 拦下。
- **落地·未生成（并入）**：排队条目留在故事里；该章生成时 brief（本地 buildChapter 的织入段 + 服务端 contextFor 的 interventions 字段）自动携带，预生成同样生效。
- **本地线修订**：单次状态更新完成「排队 + 撤下已备章」（`retractChapter`），阅读窗口效应随即按新 brief 重新物化——无中间态外露。
- **合并生效**：同一目标章的多条排队在一次落地中全部织入（正文织入段逐条列出、台账逐条记事件、印记逐条列原文），接受后全部转 applied。
- **印记**：`chapter.interventions = [{ text, kind }]`（非空才出现）。阅读器正文后渲染印记卡；目录状态位标「介入」。**仅作者副本携带**：公开快照的字段白名单不含 chapter.interventions 与 story.interventions，广场/分享面永不显示他人的介入原文。
- **云同步**：两类字段都是故事记录的普通字段，随整书 JSON 同步（无字段白名单阻挡，分片存储按原样装箱）；修订/排队均刷新 updatedAt，合并规则按既有「新者胜」传播。

## 3. 目标规则与不可变性（三层设防）

`interventionTargetIndex(story, readerIndex)` 是唯一定靶函数：

- 目标 = 阅读位置 + 1；
- 目标 ≥ 篇幅总数（有限篇幅）→ null（线已走完）；
- 无限连载手动完结后，总数按已到达章数计 → 同上；
- **前沿规则**：目标 < 已写章数 − 1 → null。读者回到较早章节时，那些章节是后续章节的立足点，同属「已经发生」，不可瞄准；能瞄准的只有已备好的最后一章（重写）与下一篇未写章（并入）。

引擎层 `retractChapter` / `replaceChapter` 只接受「最后一章且 index > 阅读位置」，其余一律原样返回；服务端 revise 校验同口径再加「必须有排队介入」；客户端提交前由唯一定靶函数决定落点，无第二条路径。单测 (b) 逐项断言（含伪造已读章 replace 被拒、回到旧章排队被拒并给出「阅读前沿」文案）。

## 4. 动画

`src/components/InterventionOverlay.jsx`：星图丝线涟漪（SVG 三条 strand + 三个节点，只动 transform/opacity）+ 三段命名阶段（扰动世界线 → 重写下一章 → 落定，各有阶段说明）。阶段推进由状态计时器驱动（850ms/段），工作落定（settled）后才在末段关闭；全局动效策略（`[data-motion="off"]`、`prefers-reduced-motion` 冻结 CSS 动画的既有规则）自动适用，关动效时阶段标签照常推进。Gemini 修订进行中读者若在更早章节，覆盖层只在当前阅读面呈现、结果落盘不改阅读位置；本地线覆盖层呈现完整的阶段序列（约 2.4s）。

实现教训（本批实证）：Reader 内按 story.revision 触发的瞬态重置效应会把覆盖层状态连同修订一起清掉——覆盖层状态已拆出，仅按 story id / readOnly 重置。

## 5. 迁移行为（旧存档）

- **已存的待决 choice 变惰性数据**：`story.choices` 表与旧章上的 choice 对象原样保留在存档里（不删、不改写），但再无任何代码路径查它做门禁：下一章照常生成（服务端删除了「上一章未选」409 校验，单测 (f) 断言带旧记录的故事可直接生成第 3 章且上下文不含 choices 字段）。
- **校验口径**：persistence 对 chapter.choice 改为「可缺席（null）；若存在，只验形状（prompt + 两条良构 option），不再对任何时代的 option id 表」——旧档、未来档的未知 id 均为合法历史；形状损坏仍拒绝入库。`story.interventions` / `chapter.interventions` 新增形状校验。
- **已写正文永不触碰**：`chapterForReading` 的旧正文修复（模板比对替换）保持原样，仅数据源换为 legacyChoiceAt；快照继续按旧记录重建 choice 供只读展示。
- **广场进入线 / 合流线**：与普通线同一引擎，无抉择产出；进入线的介入同样作用于进入者自己的副本前沿，费用与记账归进入者（沿用既有口径）。
- **章节 key**：`chapterKey` 的签名段由「前置选择」换为「目标章介入签名」（排队条目的 id:text 串联）。排队一条介入即旋转目标章 key：在途的旧版生成响应因此被整章丢弃（e2e 实证），不会覆盖已排队状态。

## 6. 边界定案

- **终章作为目标**：与任何一章无区别（目标 = 总数 − 1 时是已备章重写，未生成时并入 brief），单测覆盖有限篇幅的 null 边界。
- **已完结的故事**：面板只显示结束说明，无提交按钮；引擎排队抛 RangeError，Reader 以提示呈现（e2e journey 实证：24 章完结后打开面板见「已经走完」且存档零变化）。
- **无限连载**：恒有下一章，永不出现结束态；手动完结后转为完结口径。
- **回到旧章**：显示「阅读前沿」说明（非报错），读到前沿后可正常介入（见 §3 前沿规则）。
- **修订失败 / 额度不足**：队列先行落盘再发修订请求——失败时介入不丢，自动转为并入该章的下一次普通生成；错误文案沿用生成通道的既有映射（额度文案为额度专用句）。
- **修订与预生成竞态**：修订目标恒为最后一章；预生成的目标是下一未写章，两者不重叠。在途普通生成遇排队介入 → key 已旋转 → 响应整章丢弃后由准备效应按新签名重发（e2e gemini 场景实证：恰好两次请求、落地章带印记与织入标记）。
- **只读副本**：无介入入口（坞按钮不渲染），引擎对 readOnly 故事的排队/撤回/替换全部原样拒绝。

## 7. 验证

- 单测：509 项全绿（基线 501；退役合并 −5、新增 tests/intervention.test.js 13 项 + persistence 净 +2）。intervention.test.js 按简报逐项编号：(a) 全模式无 choice、(b) 定靶与不可变、(c) 修订 vs 并入（引擎 + 服务端 + 客户端三层）、(d) 合并队列、(e) HTTP 层额度记账同形、(f) 旧待决记录惰性。
- e2e（本地 fixture 栈，零真实生成）：新增 e2e/intervention.cjs 7 项全过；journey 24/24、recovery 4/4、gemini 4/4（含改写后的「在途旧答丢弃、介入章落地」场景）；reader.cjs 30 项 0 失败（其中大字号章末可达性与目录深翻两项按退役口径改写；中途一次 topline 滚动检查出现单次时序抖动，复跑全绿）；cloud-library.cjs 自带夹具服务器全过（介入字段随整书同步的通路即此）；visual.cjs 72 页截图 0 失败（decision 截图位 → intervention 面板）。
- 顺带修复（既存漂移，非本批引入）：recovery / gemini 两套的造世助手各多点了一次「继续」（STARTFLOW 合并出身步后遗留），已按五步流程校正；visual.cjs 自广场批次起整体失效（入口等「开启第一本书」却落在广场、造世步序与标题三处过期、topline 单行断言对应旧版式、移动端收尾导航标签已改名），本批一并按现行界面修复至全绿——其断言口径变化两处已在脚本内注释（topline 改验 actions 行自身单行；移动端 returning 落点为广场 tab）。
- 截图（390×844、仅视口）：intervention-shots/01-reader-button.png（坞内介入入口）、02-sheet.png（面板与 chips）、03-animation.png（动画中段：第二阶段）、04-marker.png（修订章正文织入段 + 印记卡）。

## 8. 遗留与未做

- 介入**不设**每日次数上限：修订按普通生成计额度即为天然上限，未另设闸。
- 印记只列原文，不提供「撤销介入」：已落地即已发生，与不可变口径一致；未落地的排队条目同样不提供删除入口（如需，留待后续批次评估）。
- `storyNarrativeDossier.activeConsequences` 与书架 `lastChoiceLabel` 仍读旧 choices 展示历史——只对旧档有内容，新故事恒为空/不显示，未在本批删除（它们是历史视图，不是活路径）。
