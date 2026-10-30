# BOOK-FACE-FIX — 书脸修复批处置笔记

基线：本地 main `49e0a66`，分支 `book-face-fix`（worktree `~/workspace/storyverse-book-face-fix`）。
范围：不部署、不 push；UI 结构未动（仅 StoryCover 的取图优先级，见 §2）。
起因：用户 2026-10-30 23:02–23:10 真机三报障（A 书《从灵田杂役开始登天》pub-e558c023-897 为主）＋ 23:13 扩围令「以后不准搞这种脱敏这种没意义的行为」。

---

## 1. 简介 / 世界设定：串味、病句、空话

### 1.1 根因定案（三条独立链）

**(a) synopsis 丢失点在实验脚本，不在产品代码。**
实验 `setup-line.mjs` 把作者简介存进了 state 包装层的 `state.synopsis`（该文件第 168 行 `state.synopsis = synopsis`），从未写到 `story.synopsis`。产品侧 `plazaSnapshot` 本来就携带 `story.synopsis`（src/story-engine.js），persistence 也校验该字段——故事身上没有这个字段，快照自然为空。线上 A 书 `snapshot.synopsis = ""` 即此故，不是发布链路弄丢的。

**(b) 病句 = 发布路径的替换式脱敏（snapshotRedactor）。**
A 书 premise 原文（本地引擎模板 bible，worldBibleFor）：「青岚宗里，身为外门杂役（底层边缘人）的沈砚在**外门柴房**发现一条会被无名外力搅动的世界线。」发布时 `plazaSnapshot` 用 `snapshotRedactor` 把 config 字面量逐词替换：`外门柴房`（出生点）→「已隐去的设定」、能力 `借火一瞬` →「匿名火种」、主角名在合流 protagonists 里 →「匿名探索者」——句子结构还在，词被换成占位，读起来就是病句。线上快照 rules 第 4 条「匿名火种每次只能借…」与本地原文「借火一瞬每次只能借天地或外物一息真火…」逐字对照可证（见 §4 对照表）。

**(c) 串味 = 拼装回落 + 服务端两处漏传 genreId。**
`plazaWorldIntroFor`（src/plaza.js）先把 premise 切句并滤掉含占位词的句子——A 书 premise 被脱敏后整句含「已隐去的设定」被滤光，backgroundBody 为空 → 回落 `genreFor(detail.genreId).description`。而 server/plaza.js 的 publish（约 638 行）与 title-sync（约 766 行）两处调用**都没传 genreId**，`genreFor(undefined)` 按 src/story-engine.js 第 974 行回落 `GENRES[0]` = mist，于是把沉潮港的目录文案（「沉潮港被潮水围住，镇上的潮汐钟会改写记忆，雾里漂来一封不该抵达的信。」）拼到青岚宗书名下。对照证据：scripts/refresh-world-intros.mjs 第 31 行起一直正确传 genreId——服务端两处是漏传 bug，不是设计。

**(d) 规则空话 = 本地模板 bible 的通用填充规则。**
worldBibleFor 给每本书盖同样的规则（「X 的秘密只能通过具体行动被唤醒」「已经发生的事会留下可追踪的回声」「能力有边界…稳定度」）。含「稳定度」的一条旧口径已滤掉，但脱敏后的「匿名火种」规则漏网（REDACTION_PLACEHOLDERS 不含它），于是详情页出现一条改写过的具体规则 + 若干谁都能套的空话。

**(e)「主角与主线」模板句** = synopsis 缺席时拼装的 beats 回落（「从『首章名』开始，一路走到『末章名』」），synopsis 补回后自动被作者简介取代（既定口径，未改）。

### 1.2 已改代码

| 文件 | 改动 |
|---|---|
| src/story-engine.js | `plazaSnapshot` 删除 snapshotRedactor 全部散文应用（title / synopsis / worldBible / chapters / choices / beats / sourceTitles 改逐字携带）；合流 snapshot 的 protagonists 改为保留原文 trait / ability / origin；`redactedTitleFor` 改为原文返回（保留导出名与签名，调用方不动）；两处头注释改写为保真口径 |
| src/plaza.js | `plazaWorldIntroFor`：① 世界文案回落严格化——只有解析出的 genre.id 与 detail.genreId 相等才借该世界目录文案，缺失/未知一律不借（再也不会借到别的世界）；② 占位词过滤扩展到快照别名（匿名火种 / 匿名探索者 / 匿名借火 / 未命名火种 / 未知来处 / 未知世界），含别名的句子/规则**整句不收录**，不做任何"修复式"改写；③ 新增通用模板规则过滤（「的秘密只能通过具体行动」「已经发生的事会留下可追踪的」两条填充规则不进公开介绍）；④ `WORLD_INTRO_VERSION` 2 → 3（存量记录可被 refresh 脚本识别重刷） |
| server/plaza.js | publish 与 title-sync 两处 `plazaWorldIntroFor` 调用补传 `genreId`（publish 用 snapshot.genreId、title-sync 用 record.genreId） |

### 1.3 本地重刷预览实证（新代码 × A 书原文数据，未上线）

把 state-a 的 synopsis 写回 story.synopsis 后本地跑 plazaSnapshot + plazaWorldIntroFor：

- `snapshot.synopsis === state 原稿` → **true（逐字）**
- `snapshot.worldBible.premise === 原文` → **true（逐字）**，值：「青岚宗里，身为外门杂役（底层边缘人）的沈砚在外门柴房发现一条会被无名外力搅动的世界线。」
- intro.background =「「青岚宗」——玄幻题材的世界。青岚宗里，身为外门杂役（底层边缘人）的沈砚在外门柴房发现一条会被无名外力搅动的世界线。」
- intro.rules = 仅 [「借火一瞬每次只能借天地或外物一息真火，使用后经脉必遭烈火反噬半个时辰。」]
- intro.thread = synopsis 原文领衔
- 全文不含「沉潮港」、不含「已隐去/匿名」

### 1.4 三本书人话版简介/世界设定（待过目件）

`book-intros/` 目录：

- [A-从灵田杂役开始登天.md](book-intros/A-从灵田杂役开始登天.md) — synopsis 用 state 原稿逐字；三段体例齐
- [B-刚失业神豪系统找上门.md](book-intros/B-刚失业神豪系统找上门.md) — **注意口径冲突**：state 原稿写「签到 App 神豪系统」，正文实际是「城市嗅觉」（额度实验已记「系统机制存在感弱」）。文件里给了建议版（与正文对齐）+ 原稿存档，需拍板用哪版
- [MERGE-合流书.md](book-intros/MERGE-合流书.md) — synopsis 为新写（合流线原本没有）；另注明拼装口径现只写单主角名，双主角版是人话稿、拼装是否跟进留定

### 1.5 存量重刷方案（部署后执行，本批未上线未重刷）

1. 本批 + 合流发布门批（3565a70 / e975f85）部署后：
2. A、B 两书：用实验账号走正规 publish——先把选定 synopsis 写回各自故事的 `synopsis` 字段（修复 1.1(a) 的丢失点），再调 publish；快照按新口径逐字重建，worldIntro 按 v3 拼装。脚本可直接改 `~/workspace/sw-prep/quota-experiment-100ch/publish-books.mjs`（加一行 synopsis 回填）。
3. 合流书：对 merge-mvuyfqwi-6 走正式 publish（发布门放行后），快照逐字、intro 按 v3。
4. 其余存量记录（含官方书）：跑 `node scripts/refresh-world-intros.mjs`（它从存储记录重拼 intro 并传 genreId，版本 <3 的都会被重拼）。
5. **重刷后验证（必做）**：GET /api/store/pub-e558c023-897，抽查 `snapshot.worldBible.premise` 与 state-a 原文逐字比对——原文：「青岚宗里，身为外门杂役（底层边缘人）的沈砚在外门柴房发现一条会被无名外力搅动的世界线。」并检查详情 intro 不含「沉潮港 / 已隐去 / 匿名火种 / 匿名探索者」。

---

## 2. 封面定案（逐图哈希比对，不猜）

比对材料：线上 `/api/plaza/<pub>/cover?v=1`、A/B 账号 `/api/cover?storyId=`（cover store 生成图）、`public/art/` 世界图。

| 书 | 线上封面 sha256 | 与 cover store 生成图 | 与世界图 | 结论 |
|---|---|---|---|---|
| A pub-e558c023-897 | `1f6b7d1…05baf`（768×1052 JPEG） | **逐字节一致** | 世界图 cultivation-1122.webp `1d14d16…dcbb` 不一致 | 详情面挂的**就是本书专属封面 v1**（灵田+柴房木棚+灰袍青年掌心火光+双龙火峰，对题），无需重生成 |
| B pub-af1b5c93-8bf | `ffd314c…4abf8` | 一致（围裙勺子面馆工+气味轨迹+霓虹街，对题） | city-1122.webp `a1ee260…e35` 不同 | 同上，本书专属封面，对题 |
| 合流 merge-mvuyfqwi-6 | cover store v1 ready，`31e4f92…b4` | — | — | 双世界拼图+双主角背对背，对题；**瑕疵**：画面中央有生成式乱码伪字，上架前是否重掷一版留主助手定 |

**用户截图 2 那张「山上亭子+极光带」= 青岚宗世界图 cultivation-1122.webp 本人**（逐图一致）。出现位置是**阅读器封面页**，机制定案：

- 详情面 PublicationArtwork 用 `publication.coverUrl`（server 按 authorUid + sourceStoryId 从 cover store 实时解析）→ 正确显示专属封面。
- 阅读器封面页用 StoryCover，看的是 plazaReaderStory 读副本：**快照不带 cover 字段**（封面存 cover store、不进快照），coverStateOf 判 none，读副本也没带 detail.coverUrl → 回落 WorldArtwork → 世界图。读者从书城点进去先看到世界图，与详情页的真封面对不上，用户遂判「这不是这本书的封面」——判断成立，是读副本丢了封面地址。

**已改代码**：

| 文件 | 改动 |
|---|---|
| src/plaza.js | `plazaReaderStory` 把 `detail.coverUrl` 带进读副本 story（无则空串） |
| src/components/StoryCover.jsx | 新增最高优先级：story.coverUrl 存在时直接渲染该公开封面图（与详情面同一张），加载失败才回落原有链（自有封面 → 世界图 → 题材回落图） |

本地故事（自有书架）没有 coverUrl 字段，行为不变；广场读副本与详情从此同图。

---

## 3. 章节标题：谜语体口径

### 3.1 根因

标题生成口径此前几乎空白：server/gemini.js 只有 responseSchema 里一句「中文章节标题，1–80 字。必须是真正的标题，不能只写章节编号数字」+ 第 150 行光秃数字拦截；SYSTEM_PROMPT 对标题文风只字未提。模型自由发挥即默认四字意象体（柴房借火 / 照壁辨火 / 禁殿死车…），gen-quality 资料库里也没有标题口径可约束。

### 3.2 已改代码（生成口径，只影响新章）

| 文件 | 改动 |
|---|---|
| server/gemini.js | schema 标题描述改为：8–16 字、陈述式一句话说清本章发生什么、白话常用词、不堆四字意象词、不写成谜语、不剧透本章结局（附正例） |
| server/gemini.js | SYSTEM_PROMPT 文笔总则段追加标题硬性规矩（同上口径，明示禁用「照壁辨火」「禁殿死车」式生僻词拼接） |

（本地脚手架 buildChapter 的程序化标题不在报障范围，未动。）

### 3.3 存量标题方案（不直接全量改）

- 样例：[book-intros/A-前10章标题样例.md](book-intros/A-前10章标题样例.md)（旧→新对照 + 每章依据，等拍板）。
- 拍板后执行路径（建议）：写一次性脚本，按 (storyId, chapterIndex) → 新题映射，逐本调服务端改题/或随重刷 publish 时在故事对象上改 title 后走 publish（快照 title 派生自章节数据）；A 书 100 章、B 书 24 章、合流 6 章分本生成映射表（依据各章 events 拟题、人工抽查不剧透），不许模型批量盲改上线。
- 注意：章节标题同时出现在快照 chapters 与 beats（详情目录读 beats 的 title 派生），改题必须走能同时刷新两者的正规路径（重新 publish），不要手改 Firestore 单字段。

---

## 4. 脱敏拆除清单与分类（23:13 扩围令执行记录）

全局 grep 发布链路 scrub / redact / 脱敏 / redactor 全部命中，逐处分类如下。

### 4.1 散文替换式脱敏 —— 已全部拆除（发布文本改用原文）

| 位置 | 原行为 | 处置 |
|---|---|---|
| src/story-engine.js `plazaSnapshot` 内的 `snapshotRedactor` 应用（title / synopsis / worldBible premise·rules·outline / chapters 标题·段落·摘要·events·伏笔 / choices / beats / sourceTitles） | 把 config 字面量（出生点、能力、身份、姓名、故乡等）逐词替换成「已隐去的设定」「匿名火种」「某地」等占位 | **拆除**：全部改逐字携带原文（内部以 `verbatim` 恒等函数保持原有清洗管线形状） |
| src/story-engine.js 合流 snapshot 的 protagonists 构造 | trait / origin / ability 被换成「匿名探索者」「匿名火种」 | **拆除**：保留原文三字段；avatarId / appearance 本就无字段（结构性，见 4.2） |
| src/story-engine.js `redactedTitleFor` | 改名时按替换表 scrub 新标题 | **拆除**：原文返回；导出名/签名保留，server 调用方（标题同步）不感知 |

### 4.2 结构性不带出 —— 不是脱敏，保持不动

| 位置 | 说明 |
|---|---|
| 快照整体形状 | 内部 id、来源故事 id（sourceIds）、化身 id 在快照里**没有字段**，不是"被替换"，是结构上不带出；本批未新增任何标识字段 |
| src/story-engine.js `redactedSnapshotConfig`（快照 config 整形） | 进入模板用的 config 形状：进入者必须自选的字段（自己的化身/身份/出生点/能力）从空白开始、作者的沉浸式生活字段不进模板。这是模板结构，不是把已发布文本改词；保留。注意其常量里仍有「匿名火种」等占位**字段值**——只出现在"进入草稿"的待填字段里，不出现在任何已发布文本里 |
| src/plaza.js `cleanBookTitle` | 发布时去掉书名尾巴上的「 · 化身名」后缀，属书名结构清理，保留 |

### 4.3 保留但性质不同 —— 注入防护（非脱敏）

| 位置 | 说明 |
|---|---|
| server/gemini.js `sanitizeSettingText` | 只中和结构性冒充标记（角色标签、控制 token、定界符），普通散文逐字节不变；防的是提示注入，不是内容脱敏。保留，笔记在此明示分类 |
| server/plaza.js `scrubSnapshotSetting` | 发布时对快照 config 的自由文本字段跑同一套 sanitizeSettingText，同上。保留 |

### 4.4 不在本批范围 —— 本地分享面

| 位置 | 说明 |
|---|---|
| src/story-engine.js `publicSnapshot` + `snapshotRedactor` 定义本体 | 这是**本地只读分享副本**（面对面分享给同设备/导出场景）的自身匿名设计，不走发布链路。按派单分类口径未动；`snapshotRedactor` 定义因此保留。tests/remote-story.test.js 的相关断言未改 |

### 4.5 快照源校验对齐核查

`snapshotSourceViolation`（src/plaza.js）比对的是正文与本地 buildChapter 的复算结果、bible 与模板 bible——校验"快照是否来自这本书本身"，不依赖脱敏口径，**无需改动**，核查结论在此留痕。服务端 publish 的 `scrubSnapshotSetting` 后仍跑 `validateStory`，新快照（原文）可正常通过（plaza-server 全套测试已证）。

### 4.6 测试同步

| 测试 | 改动 |
|---|---|
| tests/plaza-shared.test.js | 「keeps the avatar name and drops private config text」→ 改为断言 config 字段结构性为空 + premise/rules/synopsis **逐字保真**；新增 3 条：BOOK-FACE-FIX intro 本书口径（无串味、无填充规则）、旧脱敏记录整句剔除且不借文案、reader 副本携带 coverUrl |
| tests/fusion2.test.js | 合流快照用例改名并翻转断言：protagonists trait/ability 逐字（secret-trait-a / 听潮），avatarId/appearance 仍无字段、来源 id 仍不出现 |
| tests/plaza-server.test.js | round-trip 用例改名并翻转断言：stored premise 与原故事 bible **逐字相等**、feed/detail 显示原文；config.hometown / avatarId 结构性断言保留 |
| tests/title-flow.test.js | redactedTitleFor 用例改为断言标题逐字返回 |
| tests/remote-story.test.js | **未改**（本地分享面，不在本批） |

---

## 5. 测试结果

- 改前基线（相关 5 文件）：51 条，46 过、5 失败（dedup 样本图 ENOENT，环境类）。
- 改后全量：**892 条，887 过，5 失败**——失败仍为同 5 条 dedup-fixture 图片 ENOENT（worktree 未带 dedup-shots 样本图，与本批无关，基线同失败）。
- 本批相关文件（plaza-shared / plaza-server / fusion2 / title-flow / remote-story / dedup-fix 文本部分）：全过，含新增 BOOK-FACE-FIX 用例 3 条。
- `npm run build`：通过（仅既有 chunk 体积警告）。

## 6. 改动文件总表

代码：src/story-engine.js、src/plaza.js、server/plaza.js、server/gemini.js、src/components/StoryCover.jsx
测试：tests/plaza-shared.test.js、tests/fusion2.test.js、tests/plaza-server.test.js、tests/title-flow.test.js
文档：BOOK-FACE-FIX.md（本文件）、book-intros/（三本书简介 + A 书标题样例）

## 7. 未做 / 待定

- 未部署、未 push、未重刷线上数据（按派单）；重刷步骤与验证对照在 §1.5。
- B 书 synopsis 用建议版还是原稿，需拍板（§1.4）。
- 合流书封面中央乱码伪字是否重掷，需拍板（§2）。
- 合流书「主角与主线」双主角口径是否改拼装，需拍板（§1.4）。
- 存量 130 章标题未改，样例待拍板（§3.3）。
