# EDIT-BOOK 批次：编辑自己的书（简介 + 目录）与章长指令带回收

基线 6391df0（含删书批 d1535fd 与 A/B 文档提交）。契约写入 DESIGN.md §29。本批只落本地提交，不 push、不 deploy（部署由父代理统一排队）。

## 需求与口径

用户 2026-10-28 08:52 亲令两条：「可以自己对自己的书编辑目录，编辑简介」；08:36 批准的章长 A/B 已定案回收（CHAPTER-AB.md：新臂均值 1968.5 过冲目标带，建议指令带 1600–1950 + 地板 1550），本批一并落地。

定案要点：

- **简介**存故事自身新字段 `story.synopsis`（≤300 字），不另起同步通道——它就是故事数据的一部分，随云端书库整体 PUT 同步。旧书默认来源定案：展示回落到 `worldBible.premise`（世界核心）——那是书城卡片与广场详情此前一直当作本书介绍展示的原文，不是新造文案；书主第一次保存把自己的话落成字段，清空保存删字段回到回落。
- **改名只改标题**：章节顺序、正文、id、摘要不动，有单元测试以正文哈希 + id/顺序对照钉死；故事 `revision` 故意不前进（chapterKey 绑 revision，改名不该作废已预生成的下一章），靠 `updatedAt` 走同步。
- **定稿章节可改名**：标题是元数据，有意不受「前沿章才可编辑正文」的定稿规则限制。
- **广场**：编辑只作用于自己的书；发布是发布时快照、不自动同步，重新发布走既有 upsert 覆盖。快照自本批起携带 synopsis，口径句落在设定集简介区的一处小字提示里。

## 实现

### 引擎（`src/story-engine.js`）

- `SYNOPSIS_MAX = 300`、`synopsisOf(story)`（自有简介 → premise 回落 → 空串）、`updateSynopsis(story, text)`：修剪、超限抛 RangeError 人话、同值 no-op 返回原引用、空文本删字段；只动 synopsis 与 updatedAt，生成永不读此字段。
- `CHAPTER_TITLE_MAX = 30`、`renameChapterTitle(story, index, title)`：readOnly 直接返回原故事；下标越界/空标题/超 30 字抛 RangeError 人话；同名（含修剪后同名）no-op；否则 clone 后只替换该章 title + updatedAt。
- `plazaSnapshot` 返回值新增条件字段 `synopsis`（经 redactLine 脱敏，与其他字符串同口径），未设置时不出现，详情继续回落 premise。

### 存储与服务端

- `src/persistence.js`：`validateStory` 把 `synopsis` 列入可选字符串字段并加上限 300（注释标明镜像引擎 `SYNOPSIS_MAX`，与 lorebook 上限同法）。云端书库服务端复用同一 `validateLibrary`，所以上限与形状在 PUT 入口即被拦（400 人话）。
- `server/plaza.js` `summaryOf`：新增 `synopsis: clip(record.snapshot?.synopsis, 300)`，旧发布记录为空串。
- 书主校验无新端点：编辑落云走既有 `PUT /api/library/stories/:id`，一切按已验证 uid 寻址——与删书批同一口径。

### 章长指令带（`server/gemini.js`）

- responseSchema 段落说明：全章 1750–2150 字 → **1600–1950 字**。
- 系统提示篇幅句：每章 1750–2150 字 → **1600–1950 字**；地板句「正文不足 1700 字」→「**不足 1550 字**」。仅此两处。

### 客户端（`src/main.jsx`、`src/styles.css`、`src/reader-flow.css`）

- `StorySettingsBook` 顶部新增「本书简介」区：文本域（初值 = `synopsisOf(story)`，maxLength 300）+「保存简介」按钮 + 已保存回执/错误内联；提示文案写明广场快照口径。
- `StorySettingsBook` 新增「章节目录」区：查看态为章节列表，「编辑目录」进入逐章输入态，「保存目录」整批生效，失败（如某章超 30 字）错误留在区内且不退出编辑态。
- 阅读器 `ChapterDirectory` 抽屉新增「编辑目录」态（仅非只读且有已写章节时出现）：逐章输入、保存/取消；编辑态不渲染剧情星图，避免误触跳章丢草稿；超限在此同样被人话拒绝（e2e 实测）。Reader 新增 `saveSynopsis` / `saveChapterTitles` 两个处理器（返回错误字符串或 null）经既有 `update()` 落盘，两处入口共用。
- 展示位：`storeBookMeta` 的 note 改走 `synopsisOf(book)`；广场详情在有 synopsis 时于「世界设定」之前渲染「本书简介」面板。

## 验证

- 单元：全量 **635/635 通过**（基线 627 + 本批新增 8）。新增 `tests/edit-book.test.js`：
  - `updateSynopsis`：落字段 + 修剪、updatedAt 前进、正文哈希不变、revision 不动、输入不被修改；`synopsisOf` 回落顺序与清空语义；超 300 字 RangeError 人话、边界值可存。
  - `renameChapterTitle`：改已定稿的第 1 章——id/顺序/正文哈希全不变、只有该章标题不同、revision 不动；空/超 30/越界下标人话报错；同名 no-op；readOnly no-op。
  - 存储层：synopsis ≤300 合法、301 与非字符串被 `validateLibrary` 拒绝；save/load 往返保留简介与新标题。
  - `plazaSnapshot`：无简介时字段缺席（详情回落 premise），有简介时快照携带原文。
  - HTTP 组合（真实 `createServer` + 内存 store + 用户名注册）：书主 PUT 编辑版（简介 + 两章改名）后 GET 全数在位；陌生人以同 id PUT 只写进自己名下，书主副本分毫不动；超长简介 PUT 得 400。
  - `tests/gemini-generator.test.js` 的 F-16 章长测试已改为断言新带（1600–1950 / 地板 1550 / 不含旧带），注释补全 A/B 回收来由。
- e2e 新增 `e2e/edit-book.cjs`（已挂入 `npm run test:e2e` 链，delete-book 之后）：复用 cloud-library fixture 服务器。走完：设定集写简介保存 → 账号副本带简介；设定集改两章标题 → 列表生效；阅读器目录抽屉见新标题；抽屉里 31 字标题被人话拒绝、改合法值保存；阅读器顶部细线显示新标题；重载后本地与编辑器初值都保留。**12/12 通过**，截图 `edit-book-shots/01-synopsis-saved.png`、`02-toc-renamed.png`、`03-drawer-renamed.png` 人工核对无误。
- 回归 e2e（逐套按既定配方跑）：journey 24/24、recovery 4/4、gemini 4/4、intervention 7/7、control 5/5、cloud-library 8/8、delete-book 9/9、onboarding 18/18、reader-chrome 28/28、visual 72 captures 0 failures。
- `npm run build` 通过。

## 已知边界

- fixture 故事是本地引擎书，阅读器会按既有预生成机制替它往前备一章（e2e 里表现为目录多出一章本地备章）；断言因此只钉 fixture 自有的前三章。这是既有行为、与本批无关。
- 广场 feed 卡片仍展示 premise 摘要（summaryOf 的既有字段）；synopsis 只进详情面板与 summary 透出字段，feed 卡换用简介不在本批口径内。
- 简介与改名不触发任何重新生成：已预生成的下一章保持原样（其上下文从未包含标题与简介，改名/改简介对它无影响，这正是 revision 不前进的依据）。
