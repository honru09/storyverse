# FORGE-TRIM + GEN-QUALITY 处置笔记（2026-10-29 晚）

基线 1aeeb9b（本地 800/800）→ 本批本地提交。未部署、未 push，等盐系批与总验收。

## A. 造世流程瘦身

### A.1 带入化身时不再问性格 —— 完成
- **缺失的映射已补**：化身档案里承载「性格与设定」的字段是 `description`（档案表单的占位语就是「性格、气质、给人的感觉」），而它此前从未进过草稿——带入只搬了名字与外貌（`avatarAppearance`），性格只能靠主角步的 trait chips 再问一遍，这就是用户感到的突兀。
- 新增纯函数 `avatarDraftPatch(avatar)`（src/avatar.js）：返回 `{ name, avatarId, avatarAppearance, persona }`，其中 `persona = description`（空描述则不带 persona 键、不覆盖已有值）。persona 是唯一进故事配置的性格/设定文本通道（draft.persona → createStory config.persona（上限 600，描述上限 300 不溢）→ 服务端 compactConfig 消毒 → 每章 context.config.persona）。
- 三处带入点统一走它：主化身预选 effect、化身列表「用这个化身」、已带入残卡的恢复路径（同一 patch 形状）。
- UI：`draft.avatarId` 生效时主角步的性格编辑区整段不渲染；主角设定（persona）文本框保留可见可改——它是这本书的副本，改它不动化身档案，带入卡文案已同步改为「名字、样子和设定已带入」。主角昵称输入保留（预填化身名，是确认不是重问；且 avatars e2e 与「只改这本书」的既有口径都依赖它）——此为本批的判断，记录在此。
- 取消带入只清 avatarId/avatarAppearance（既有行为不变），手捏路径即时恢复；persona 里已带入的文本留作本书副本，不回滚。
- 预览面板与确认页：带化身时性格行显示「化身自带 / 性格由化身自带」。
- 测试：单测钉死 patch 映射与「persona 真进 config 并到达生成 context」；avatars e2e 新增断言成书 config.persona === 化身 description；forge-trim e2e 走完带化身全程。

### A.2 自捏性格改「输入为主」 —— 完成
- 数据：`src/personality-traits.js`（与 story-engine 的客户端数据模块同放法），100 条 = 名 + 8–16 字描绘 + 分组，源 = sw-prep/personality-100 定稿（逐条量过描绘长度并有单测守着）；旧 4 条 chips 已收编在库内。导出 `drawPersonalityTraits(count, excludeIds)` 与 `personalityTraitText(entry)`（填入格式「名：描绘」）。
- UI：性格 = 文本输入框（主控件，上限 80 字）+ 下方固定 3 个词条（名 + 小字描绘的竖排 chip）+「换一批」按钮；刷新抽新批且排除当前批 id，不重复；点词条以「名：描绘」填入、填后可改；打字即算已选（pickedTrait 治理沿用）。旧固定 chips 与 `traits` 常量下线。

### A.3 故事风格整体下线 —— 完成
- 删除：风格卡组 UI、toneId/pickedTone 状态、submit 的 tone 覆盖、草稿持久化里的 tone/toneId 字段、确认页风格行、PreviewPanel 的 tone 参数与风格行、main.jsx 的 `tones` 常量，以及 styles.css 中成孤儿的全部 `.tone-*` 规则。
- 兼容：引擎 `TONE_DIRECTIVES` 与 `DEFAULT_DRAFT.tone` 不动——旧故事存的 tone 照常被 storyBeatPlan 读取（单测钉：带 '悬疑推进' 的 createStory 规划不抛、生成照常完成）；新故事恒带引擎默认 tone；App 侧 `tone: payload.tone` 读到的是草稿的存量值，行为与下线前一致。设定集里的 STYLE_PRESETS（阅读端风格预设）是另一回事，不在本令范围，未动。

### A.4 世界步「写法（选填）」下线 —— 完成
- 删除 god-form 内整组写法 chips（完全自由 + 15 模板）与「这就是第一步选定的题材…」注释行，只留删除说明注释。题材只认第一步（解耦不变）；创世神自由文本（世界名/背景设定）不受影响。
- **后果记账**：把 `genreTemplateId` 置空（完全自由）的唯一 UI 入口随之消失——今后新草稿无法再选出「无模板」状态；该状态仍可由旧存档恢复进入，各显示路径（PreviewPanel/确认页的「完全自由」、resolveGenreTemplates 的 null 分支）都保留完好。生成侧对 null 模板本来就走无 brief 路径，无风险。

### A.5 灵感碎片换库 —— 完成
- 数据：`src/inspiration-fragments.js`，100 条定稿（按类分组字段 category），源 = sw-prep/inspiration-100。旧 4 条意象空话池（GOD_MODE_FRAGMENTS）全部退役，单测钉死四条都不在新库里。
- 呈现沿用现行：进 god-form 时抽 4 条 chips，点一条追加进设定；每次进入创世神（含导入世界落入 god-form）重抽一批。

## B. 造世页滚动 bug —— 完成（定性与量测如下）
- **复现定性（390×844，双引擎量测）**：造世页为窗口滚动。动作条是 `position: sticky` 的**在流元素**，而 `.generation-feedback` 排在它**之后**（约 38px），页面又有 `padding-bottom: 190px`——这 190px 是按「固定覆盖条」假设留的，但条根本不在覆盖层。拉到最底时动作条底边停在距视口底 **240px** 处（Chromium/WebKit 同值），条下方是一大片空白；真机上继续拉，整页被橡皮筋拖起、露出这片空——即用户所报。
- **修法**：① generation-feedback 移到动作条之前，动作条成为造世列最后一个在流元素；② `.page-forge` 底部 padding 190px → 50px（50 + 列自身 12 = 62 = 手机底栏高，动作条在最大滚动处正好落回它的悬浮停靠线）；③ 根滚动器加 `overscroll-behavior-y: none`，过拉不再拖动整页（内滚容器如阅读流/弹层本来就有各自的 contain，未动）。
- **验收（390×844，Chromium + WebKit 双引擎）**：修复后最大滚动处动作条底边距视口底恰 **62px**（底栏带，被动作条裙边盖住、底栏按钮在其上），继续过拉 scrollY 与条位置纹丝不动；修复前同口径为 240px。e2e/forge-trim.cjs 的 scroll 检查钉住这三项（gap ≤ 64、DOM 顺序、overscroll 计算值）。
- **同病灶面清单**：全站只有造世页有 sticky 在流动作条（已 grep 核过）；其余页面要么无底栏条、要么走固定层，各自几何独立，本批只收根滚动器的过拉链（③对全站生效，属同根收口）。

## C. GEN-QUALITY 文风蒸馏库接线 —— 完成
- **数据落位**：`knowledge/gen-quality.json`，由新增 `scripts/build-gen-quality.mjs` 从 sw-prep/gen-quality 生成（范例剥标题行与自检段、卡片只取 名+公式），与 genres.json 同放法、同加载纪律：服务端启动读一次、形状校验、失败静默禁用（`loadGenQuality`，`createGeminiGenerator` 新增 `genQuality` 覆盖参数，与 genreTemplates 同惯例）。
- **锚点**：`styleSliceFor(story, index, quality)`（server/gemini.js，导出供测）。模板→范例映射是数据不是猜测：直配 10 个（xuanhuan/xianxia/gaowu/urban/guize-guatan/horror/suspense-supernatural/romance-modern/romance-ancient/scifi），回落 5 个按圣经口径就近（campus→都市、lishi→古言、wuxianliu→规则怪谈、zhihu-short→悬疑、er-ren→玄幻）；无模板或模板未知 → 不注入（返回 null）。注入字段 `styleAnchor { declaration, genre, text }`，declaration 明示只学文风、人名地名情节禁挪；SYSTEM_PROMPT 另有对应执行句。
- **句式卡**：每章 **3 张**（圣经 3–5 张区间的下限——实测 4 张时切片达 762 字超预算，按「超了就裁」取 3）：1 张章末钩子卡 + 2 张题材风味卡（爽文向=打脸/扮猪、恐怖与规则=恐怖收束、言情=心动、其余=打脸）。钩子**型**按 (hash(storyId)+章序) % 4 在四型间轮转（危机/反转/新人物/未完成动作），同型永不相邻两章（严于圣经的 ≤2 章），四章内四型全覆盖；抽取是 (storyId, index) 的纯函数，重试/缓存合并不会换卡。只注入卡名+公式，例句永不进提示（单测钉 items 只有 name/formula 两键）。
- **圣经数值进 SYSTEM_PROMPT**（精简条文，与文笔总则同级）：推进密度（每 300–500 字 ≥1 推进点、单章 ≥3 且 ≥1 兑现型）、开篇 100 字三件事、对白三到五成、压抑:兑现 ≤2:1 且账记台账、钩子须有本章伏笔、禁用词核心清单（命运的齿轮/空气仿佛凝固/嘴角勾起一抹弧度/眼中闪过一丝精光/倒吸一口凉气/恐怖如斯/不禁/竟然/宛如/犹如 + 排比抒情收尾）。
- **冲突注明**：圣经段长带（常态 30–80、硬顶 150）与生成校验的硬门（单段上限 420、平均 320，READER-PARA）不能直接对齐——硬门放宽会放进整面墙正文。本批取舍：SYSTEM_PROMPT 的段落口径由「约 60–300 字」改「约 40–150 字为常态」，作为提示目标严于硬门、与校验不冲突；校验门未动。若日后要把 150 变硬门，需另行评估整章作废率。
- **增量实测**：切片内容（双 declaration + 范例 + 卡名公式）在 15 模板 × 前 8 章全域量测 = **423–575 字**，落在 §10 预算（约 500–700）内沿（短范例题材偏下限，是额度上限口径、非下限要求）。SYSTEM_PROMPT 新增条文是每请求固定成本、不计入切片。
- **合流**：styleSliceFor 的模板取 resolvedTemplates 的 lead 侧 primary（与 genreBrief 同源），双主角线同样吃锚点。

## 验收结果
- 单测 **811/811 全绿**（基线 800 + 本批 11）；startflow-ui 三个旧规格钉子已按新规格改写（governance 去 tone、god-form 去写法、god 入口不再写空 pin）。
- e2e：新 `e2e/forge-trim.cjs` **6/6**（创世神新池 / 带化身步 4 / 带化身成书 config / 自捏步 4 / 自捏成书 config / 滚动几何）；`e2e/avatars.cjs` 8/8（新增 persona 断言）；`e2e/onboarding.cjs` 18/18；`e2e/import.cjs` 无失败。
- `e2e/journey.cjs` 16/18——失败点是 reader 侧「本机分享」按钮点击超时；**已在未改动的基线 1aeeb9b worktree 上复现同点同失败，属既有问题、非本批回归**，记账待后续批次定位。
- 截图（390×844，forge-trim-shots/）：01-step4-avatar.png（化身带入：无性格区、档案设定在 persona 框内）、02-step4-self.png（输入为主 + 3 词条 + 换一批）、03-step2-godmode.png（无写法组、碎片点入设定）、04-scroll-bottom.png（拉底：动作条贴底栏、无空白带）。四张已逐张亲看。
- 构建 `npm run build` 通过。

## 记账（未做/待定）
- e2e/forge-trim.cjs 与 avatars.cjs 共用 fixture `avatars-shots/dev-server.mjs`，该目录按 *-shots 不入库的惯例仍未入库——两个 e2e 在干净克隆上跑前需先有这份 fixture（与本批之前 avatars.cjs 的状态相同，未恶化）。
- 关键章强模型档（文风 lever 之二）未动，待实测对比拍板。
- journey 的「本机分享」既有失败待定位（与本批无关）。
