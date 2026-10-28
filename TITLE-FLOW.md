# TITLE-FLOW 批次：书名独立——造世明示书名 + 自己的书随时改名

基线 b669737（含 READER-PARA）。契约写入 DESIGN.md §45。本批只落本地提交，不 push、不 deploy（按用户令：全部批次本地做完，最后一次性上线）。

## 用户原报

1. 「加上可以改书名」：自己的书要能改名。
2. 「我发现预设的时候世界名就是书名，这个很多人都意识不到，优化」：造世时书名默认等于世界名（创世神模式下 `titleFor` 直接拿世界名拼书名；开局确认页的预览卡还把世界名摆在书名的位置上），用户没意识到那就是书名、更不知道能改。

## 落点核查结论

- 书名早就是故事的独立字段 `story.title`，全站（书架 / 主页 / 阅读页眉 / 广场）都读它；缺的只是「起名」与「改名」两个入口，以及与世界名的解耦明示，不需要数据迁移。旧书 `title` 原样保留。
- publication **存标题快照**（`record.title` + `record.snapshot.title`，发布时由 `plazaSnapshot` 脱敏生成）。§29 的旧口径是「快照不自动同步、重新发布才更新」——本批按任务口径为**书名单开例外**：改名随云端书库同步镜到发布记录（理由：书名是这本书在所有公开面的名字，与简介这类内容快照性质不同），并留痕。
- 现行标题校验：`validateStory` 对 `story.title` 只要求非空、无上限；用户手改标题的现行上限是章节标题的 30 字（`CHAPTER_TITLE_MAX`，§29）。书名手填/手改沿用 30 字（`BOOK_TITLE_MAX`）；引擎派生名（建议名、合流名）不受此限追溯，存储校验不加全局上限以免误伤存量长名。

## 实现

### 引擎（`src/story-engine.js`）

- `BOOK_TITLE_MAX = 30`（注释写明与手改章节标题同规）。
- 草稿链：`DEFAULT_DRAFT.bookTitle = ''`、`normalizeDraft` 以 `cleanBounded(…, BOOK_TITLE_MAX)` 收 `bookTitle`；`createStory` 取 `config.bookTitle || titleFor(...)`。`startNextSeason` 透传 config，续季天然继承当前书名。
- `bookTitleSuggestionFor(draft)`：导出建议名（= 未起名时 `createStory` 的实际命名），供造世界面展示，保证「所见即所得」。
- `renameBookTitle(story, title)`：镜像 `renameChapterTitle`/`updateSynopsis` 口径——只读副本原样返回；空名/超 30 字人话 RangeError；同名 no-op 返回原引用；否则只换 `title` + `config.bookTitle`（续季不丢新名）+ `updatedAt`，`revision` 不动、章节逐字不变。
- 脱敏链防自伤：`snapshotRedactor` 跳过 `bookTitle` 键（书名整体从 `story.title` 脱敏，靠主角名等其他字段的映射 scrub；若把 config 的 bookTitle 副本配成替换对，书名会把自己 scrub 掉）；`redactedSnapshotConfig` 把 `bookTitle` 清空（原始自填名是书主私有存量，不进公开快照 config）。
- `redactedTitleFor(story, safeConfig)`：用既有发布记录的 safe config 重建同一张脱敏表，算出书名当前的公开形态——服务端改名镜像专用，不重建整个快照。

### 存储（`src/persistence.js`）

- `CONFIG_TEXT_FIELDS` 加 `bookTitle`：类型校验覆盖草稿与故事两路；存量无此字段不受影响。

### 服务端（`server/plaza.js`、`server/index.js`）

- `plaza.syncTitleForStory(identity, story)`：按 (uid, sourceStoryId) 找书主自己的已发布记录 → `redactedTitleFor` 算新名 → 与现名不同才写：`record.title`、`snapshot.title` 更新，`worldIntro` 按新名重烤（其 premise 过滤以书名为键），`titleHistory` 追加 `{from, to, at}` 只留最近 10 条（服务端专用字段，`summaryOf`/`detailOf` 不透出）。整段尽力而为：任何失败返回 `{synced:false}`，绝不让书库写入失败。
- 路由接线：`PUT /api/library/stories/:id`（整书）与 `.../head`（分块提交）成功后各调一次镜像——两条同步通道口径一致。

### 客户端（`src/main.jsx`、`src/styles.css`）

- 造世开局确认步（第 5 步）：预览卡 `<h3>` 改为**有效书名**（自填 ?? 建议名），不再摆世界名；卡下新增 `.book-title-field`：标签「这本书的书名」、输入框以建议名为 placeholder、一行小字「书名可以和世界不一样。不改，就用上面这个建议名；开书以后也能在设定集里改。」字段写进 draft（`onDraftChange` 整体保存，草稿往返保留），App `generate` 的字段白名单加 `bookTitle` 透传 `createStory`。
- 设定集（`StorySettingsBook`）顶部新增「书名」区（在「本书简介」之前）：输入框（初值 = 现书名，maxLength 30）+「保存书名」+ 已保存回执/人话报错内联；提示一行写明「改名会同步到已经发布的广场版本」——与简介区「重新发布才同步」的旧口径**并列明示、互不冒充**。Reader 新增 `saveBookTitle` 处理器，与 `saveSynopsis` 同模式（返回错误字符串或 null）。

## 验收

- 单元全量 **718/718**（基线 709 + 本批 9）。新增 `tests/title-flow.test.js`：
  - 建议名口径：预设世界建议名 = 题材书名 · 主角（不是世界名）；创世建议名以世界名打头；未起名书 `config.bookTitle` 为空。
  - 自填胜出：创世书自填名落 `title`/`config.bookTitle`，世界名保持独立；`plazaSnapshot` 的 title/worldName 各归其位，快照 config 不带原始自填名。
  - `renameBookTitle`：只动书名（章节哈希不变、revision 不动、updatedAt 前进、入参不被改）、同名 no-op；空名/31 字人话报错、30 字边界可存；只读副本不改。
  - 存储：`bookTitle` 非字符串被 `validateLibrary` 拒；save/load 往返保留。
  - 脱敏：新名引用私有生活字面量（家乡）被 scrub 成「某地」；config 带 bookTitle 副本时书名不自伤。
  - 续季：改名后的完结季开下一季，新季继承新名。
  - HTTP 全链（真实 `createServer` + 内存 store + 用户名注册 + 化身 + 24 章季线发布）：改名经整书 PUT 同步后 feed/detail 立即新名、worldIntro 仍在、记录留痕且 `titleHistory` 不出现在公开 payload；同名编辑不新增留痕；陌生人同 id PUT 不动发布；分块 head 提交路径同样镜像（第二次留痕）。
  - 客户端接线源码断言：造世字段/建议名 placeholder/预览有效书名/App 白名单/设定集改名入口齐备。
- e2e 新增 `e2e/title-flow.cjs`（已挂入 `npm run test:e2e` 链，edit-book 之后），**6/6 通过**：造世五步走到确认步——字段 placeholder 为建议名、预览卡呈建议名、输入新名预览即时变、世界行仍是世界名；本地模式开书后 localStorage 中 `title`/`config.bookTitle` 为自填名。设定集改名——空名被人话拒绝、合法名保存、阅读器顶栏与账号副本同步新名。截图 `title-flow-shots/01-forge-title-390.png`（造世书名环节，390）、`02-settings-title-390.png`（设定集改名入口，390），人工核对无误。
- 回归 e2e：onboarding **18/18**、edit-book 全过（`npm run build` 后对本批构建运行）。
- `npm run build` 通过。

## 已知边界

- 改名不改合流出处：已融合书的 `sourceTitles` 是融合时定格的双书名标注（§24 产物口径），来源书后来改名不回溯改它——那是「当时由哪两本书融合」的历史记录。
- 存量书的 `config.bookTitle` 多为空（出生时没走过书名字段）：改名时由 `renameBookTitle` 补齐，续季自此继承现名；未改过名的旧书续季仍按建议名规则命名（与本批前行为一致）。
- 镜像只覆盖发布记录的标题面：封面图上没有书名文字（标题一律 UI 叠字，§41），无需重画；书城/广场卡面读 `record.title`，随镜像即时生效。
