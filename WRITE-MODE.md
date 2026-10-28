# WRITE-MODE 批次处置（2026-10-29）

建设期最后一棒功能批。用户定案口径落地：「自己写」与 AI 造世并列——建书只定书名/简介/标签，作者逐章手写，草稿云端同步，写完一章即可上架书城、可被分享与评分。设计契约见 DESIGN.md §50。本批只落码 + 本地提交，不 push 不 deploy（用户令：全部批次本地做完，最后一次性上线）。

## 模型落点

- **记录**：`createManualStory`（src/story-engine.js）——`creationMode: 'manual'` + `engine: 'manual'`，genreId 'custom'，config 只带 `storyLengthMode: 'endless'`（借记账：无预设总章数，`finishEndlessLine` 亲手完结冻结）、`manualShelfId`（GENRE_SHELVES 家族 id，可空）、`tags`（≤5、单个 ≤12 字，去重截断）、`bookTitle`。worldBible 是空壳（premise = 简介），synopsis 落故事字段。存储校验补 `creationMode` 枚举与 config 的 manualShelfId/tags 形状（src/persistence.js）。
- **章节 CRUD**：引擎纯函数 `appendManualChapter / updateManualChapter / removeManualChapter / moveManualChapter`，与 rename/updateSynopsis 同口径（clone、updatedAt 前进、revision 不动、人话 RangeError）。正文以空行（任意换行）分段存储；空标题默认「第 N 章」；未写的空章存一个空段落占位（存储契约要求段落非空），`manualChapterHasProse` 判定「已写完」。任意位置可改——手写书没有前沿定稿规则（没有生成章站在旧章之上）。
- **写作台**：新路由 `#/write/<storyId>`（src/navigation.js + App navigate/标题表），组件 `WriteDesk`：章节列表（序号/标题/字数/上移/下移/删除带确认）+ 当前章编辑器（标题 + 正文 textarea + 实时字数）。自动保存防抖 700ms 走 `commitStory` 普通故事更新——云端书库同步、活发布签名联动都与 AI 线同一套；切章/卸载冲刷未保存草稿，beforeunload 守未保存态，保存回执「已保存 HH:MM / 正在保存…」如实显示。头部动作：在阅读器里看 / 上架到书城 / 标记完结（finishEndlessLine，二次确认）。
- **造世入口**：Forge 第一步家族墙下方一张虚线入口卡「自己写一本」；点击整页换成 `ManualBookForm`：首屏书名 + 简介，其下一行（分隔线后）家族 chips + 标签输入（渐进式披露）。建书成功直达写作台；AI 草稿原样保留。

## AI 隔离（逐处落点）

- 生成管线：`materialize` / `prepareReadingWindow`（src/reading-flow.js）对 manual 直接返回原记录；`nextGenerationIndex` 本就只认 gemini；`chapterForReading` 对 manual 只走 `withDisplayParagraphs`（READER-PARA 显示分段对手写长段同样生效，实测整墙 700+ 字单段被重切且逐字不差），永不走旧决策场修复。
- 阅读器（owner 视图）：介入钮换成「写作」（直达写作台）；前沿动作块（换一版/编辑正文）不渲染；「下一章」只在下一章已写出时可达，末章改为「写下一章」CTA；完结后的阅读终点页去掉合流钮、换回写作台。StoryMap 的 generationState 对 engine 'manual' 显示「作者手写」，不再谎报「下一章待生成」。
- 设定集：manual 书只剩书名 / 本书简介 / 章节目录 / 删除；世界圣经、世界书、文风预设、合流、介入记录、保存设定集钮全部不渲染（死控件不许装样子）。
- 合流：`fusionCandidatesFor` 排除 manual；书架书脊合流钮、主页继续卡合流钮（换成「回写作台」）同步隐藏。
- 本地分享：`publicSnapshot` 加 manual 分支——正文逐字带出、真书名，不走匿名脚手架重建（原通用路径会把手写章换成 buildChapter 的本地场景文，已堵）；ShareSheet 文案随之改口（「正文是你亲手写的原文」）。

## 上架（书城）

- **门**（src/plaza.js `plazaGateFor` manual 分支，先于化身规则）：≥1 章有正文即可；连载中 = serializing，亲手完结后 = finished。与 AI 线共用 PlazaPublish 页：无化身不再挡有手写书的用户；行文案带「作者手写」；清单面板对 manual 换成简介/正文/手写三条。
- **服务端**（server/plaza.js `publish` manual 分支）：跳过化身解析与 snapshotSourceViolation（来源标记对 AI 线的要求），保留 validateLibrary + 共享门 + `redLineViolation` 全文扫描（简介走 bible.premise、章节全量）。快照 = `manualSnapshotFor`（src/plaza.js）：只收有正文章节并重排序号、synopsis 用作者自填原文、无 enterTemplate、无 worldIntro 烤制（record.worldIntro = null）。record 落 `manual: true` + `manualShelfId`；summaryOf 透出 manual 标记、shelfId 优先取 manualShelfId。
- **改名镜像**：`syncTitleForStory` 对 manual 记录走直线分支（原名直写 + titleHistory 留痕，不做脱敏重建、不重烤 worldIntro）。
- **活发布**：既有 `syncLivingPublication` 以（章数， 完结态）为签名，manual 书同为 endless + 已在 plazaMine 时自动跟上新章——上架后在写作台写新章，书城副本自动更新，与无限连载同口径。正文改稿（章数不变）不自动同步，重新上架一次即可（与 AI 线编辑口径一致，写作台与上架页文案都已明说）。

## 呈现口径（二选一已定案）

卡面不做特殊标记：StoreBookCard 与 AI 书同制式，chip 显示家族名（无家族时「作者手写」兜底，那是分类信息不是标记）；帖子书卡 meta 同口径且隐藏「带化身进入」钮。「作者手写」标注落在详情页：作者行旁小字 chip + 头图副行（家族 · 作者手写 · 篇幅 · 状态）；详情隐藏化身面板、世界设定、主线节拍三整块，入口区只剩「读原作线」+ 一句诚实说明（只能读、不能进入也不能合流）。评分/分享/举报/下架与 AI 书同权（评分服务端禁自评照旧）。

## 验证

- 单元全量 **782/782**（基线 774 + 本批 8）。新增 tests/write-mode.test.js：建书形状/标签清洗/校验、章节 CRUD 与索引不变量、AI 隔离（materialize/预生成/生成下标/融合候选/显示分段逐字）、发布门、快照形状、publicSnapshot 逐字；HTTP 全链（真实 createServer + 内存 store）：**无化身**作者同步草稿 → 另一「设备」拉回整书 → 上架（manual/shelfId/serializing 断言）→ 书城目录与详情（正文逐字、无 enterTemplate）→ 他人评分 200、自评 400 → 改名经书库 PUT 镜像到记录；空书与红线正文上架被拒、草稿仍可同步。
- e2e 新增 `e2e/write-mode.cjs`（夹具 write-mode-shots/dev-server.mjs，内存共享装配；已挂入 `npm run test:e2e` 链尾），**6/6 通过**：造世双入口 → 建书表单（选家族/标签）→ 写作台写两章自动保存 → 云端副本到位 → 新上下文（第二设备）拉回两章 → 写作台上架 → 书城卡出现 → 第二用户开详情（断言「作者手写」在场、「带我的化身进入/与我的线合流」不在场）→ 读原作线连读两章正文命中。截图 write-mode-shots/01-forge-manual-entry.png（造世双入口）、02-write-desk-editor.png（写章编辑器：章节行 + 34 字 + 已保存回执）、03-store-card.png（上架后书城卡），390 宽，人工核对无误。
- 回归 e2e（本批触及面）：onboarding 18/18、bookstore-plaza 全链、cloud-library、edit-book、title-flow、reader 均通过（见提交前跑批记录）。`npm run build` 通过。

## 已知边界 / 后续记账

- 化身带入、合流对 manual 书本批不开放（用户定案）；若将来开放，服务端快照需要补 enterTemplate 语义，另批处理。
- manual 书没有专属封面生成入口（封面管线是化身线语义）；卡面走世界图回落（custom 题材图），与创世神 AI 书同等待遇。
- 写作台是单章编辑器形态（列表 + 当前章），没有跨章全文视图；作者改稿的版本历史不存在（与全站「无历史版本」口径一致）。
- 章节正文上限 MANUAL_CHAPTER_TEXT_MAX = 100,000 字/章（防呆，非产品限制）；单章在阅读器按既有显示分段呈现。
