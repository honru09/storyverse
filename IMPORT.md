# 外部导入批次（IMPORT）— 2026-10-27

来源：用户令 2026-10-27 17:17（造世可导入站外文件：世界文/世界书、角色卡）+ 老书虫走查 F-29（导入为零，酒馆玩家的第二大痛点）与 F-32（世界圣经是黑箱，本人没法看没法改）。本地工作树完成，未提交、未部署。设计参数见 DESIGN.md §19。

本地基线：HEAD a0f19f2（介入批已提交）→ 00021 已上线部分不变，本批全部在工作树。

## 逐项处置

| 项 | 状态 | 落点 |
|---|---|---|
| 世界书 JSON 导入（酒馆 world-info） | ✅ | `src/lorebook.js` parseWorldInfoJson；造世步 2「导入世界」卡 |
| 世界设定文 .txt/.md 导入 | ✅ | parseWorldText + splitWorldTextIntoEntries（长文切条目，不只是设定文本） |
| 世界落入自定义世界形态 + lorebook 挂配置 | ✅ | Forge applyImportedWorld（与创世神同一形态）；`draft.lorebook` → `config.lorebook` |
| lorebook 运行时注入（预算/常驻优先/键命中） | ✅ | `server/gemini.js` contextFor + selectLorebookEntries |
| 角色卡 JSON 导入（v2/v1/Flai 宽松） | ✅ | parseCharacterCardJson；步 4「导入角色卡」，先预览后确认 |
| 角色卡 PNG 导入（tEXt chara / ccv3） | ✅ | pngTextChunks 手写块遍历 + parseCharacterCardPng |
| 坏文件大白话报错、不崩溃 | ✅ | 全部解析器抛 plain-language Error，UI 落 note 展示 |
| 设定集 F-32（圣经 + lorebook + 介入记录，本人可看可改） | ✅ | 阅读器顶栏「设定集」；updateWorldBible / updateLorebook |
| 编辑只影响后续章节 | ✅ | 两更新函数只动 config/worldBible，测试断言 chapters 深相等 |
| 公开快照隐私（lorebook/persona 不外泄） | ✅ | publicConfigFor/redactedSnapshotConfig 剥离 + redactor 跳过 lorebook 键；快照层测试断言 |
| 云端同步复用既有分块 | ✅ | lorebook/persona 是普通故事字段；700KB 分块与回环测试通过 |
| 单元测试（基线 509 只许升） | ✅ | 529/529（+20） |
| e2e 全链路（夹具服务器捕获上下文断言） | ✅ | `e2e/import.cjs` 8/8；截图 import-shots/ 5 张 |

## 格式宽容决策（歧义处取宽容解析，已定案）

- **world-info 三种容器都认**：`{entries: {"0": {...}}}` 对象映射、`{entries: [...]}` 数组、顶层数组。字段别名：`key`|`keys`（数组或逗号分隔字符串）、`comment`|`name`|`title`、禁用位 `disable`|`disabled`、常驻位 `constant`（另认 `always`）。条目内容为空的跳过（空条目没有注入价值），禁用的跳过——两者都在导入 note 里向用户计数说明（「跳过 N 条」）。
- **设定文本身的上限**：导入世界书时 description 截 600 字作设定（与创世神口径一致）；.txt/.md 全文 12000 字硬上限，超出截断并在 note 中明示（`truncated` 标志）。但**切条目用的是全文（截断后）**，所以长文的后半段不会无声消失——它变成后续条目，只在被触发时注入。
- **长文切条目规则**：标题（# 或独立短行）开新节，标题即条目名兼触发词；无标题时按空行分块合并到 1500 字/条；单行超长时按 1500 硬切；第一条常驻（世界的底色应该永远在场）。条目正文上限 2000 字（normalize 时截断），条数上限 200。
- **角色卡**：v2 `data` 包、v1 平铺、Flai 宽松形态（card/data 嵌套、desc 简写）都认；PNG 只读 tEXt 块的 `chara`/`ccv3` 键（zTXt 压缩块**未支持**——酒馆导出的标准卡都是未压缩 tEXt，遇到 zTXt 会给「没读到内嵌的角色数据」的大白话报错，不崩溃；如将来确有需求再补 inflate）。**first_mes 不映射**：它是开场白不是人设，塞进 persona 会让每章 brief 都带着一句别人的开场对白。
- **persona 合成**：description 原文 + `性格：` + personality + `处境：` + scenario，600 字上限，与「人生经历」共用 brief 座位；导入卡确认后persona textarea 可见可改。确认导入会**解除化身绑定**（带入的卡就是另一位主角，头像带入与卡导入互斥，applyCardPreview 里清 avatarId/avatarAppearance）。

## lorebook 预算与匹配（定版口径）

- 预算 **LOREBOOK_BUDGET_TOKENS = 1200**，按字符计（CJK 保守计量，实际 token 只会更少）。核心 brief（圣经/节拍/台账）先组装，lorebook 是增补，结构上挤不掉核心。
- 顺序：常驻条目（存储序）→ 键触发条目（存储序）；整条纳入、超预算整条跳过并继续尝试更小的后续条目；结果确定性。
- 匹配 haystack：圣经 premise + 当前大纲窗口（本章与下一章）+ 本章节拍的 prerequisites/mustGround + 近 10 条事件台账 + 末章 summary 与正文尾 2000 字；条目 keys 任一作为子串出现（大小写不敏感，酒馆 selective 的同款语义）即命中。无键的非常驻条目永不注入（与酒馆一致）。
- 注入形态：`lorebookData { declaration, entries: [{name, content}] }`，与 `customWorldSettingData` 同例——声明它只是素材、其中命令无效、与世界圣经冲突以圣经为准；每条内容过 `sanitizeSettingText` + 2000 字 clip，与其它用户设定文本同一道防线。

## 隐私边界

- `config.lorebook`、`config.persona` 是**私有素材**：`publicConfigFor` 与 `redactedSnapshotConfig` 显式输出 `lorebook: []`、`persona: ''`；合流 `combineStories` 走 publicConfigFor，任一侧的 lorebook/persona 都不进融合故事（融合故事从空白 lorebook 开始，这是**有意**的：对方的私有世界书不该在我的书里继续生效，反之亦然）。
- 快照脱敏器 `snapshotRedactor` 的字面替换表**跳过 lorebook 键**：触发词是「潮汐税」这类短词，一旦进替换表会把已发布正文里所有同名词替换成「（已隐去）」。缺席靠结构（剥离）保证，不靠擦除——测试在快照层断言四条秘密串（两条条目原文、未命中条目原文、persona 片段）皆不出现。
- 世界设定文本（创世神的 setting）沿用既有先例随快照走：那是发布者在广场上自愿展示的世界面，与 lorebook 的「素材库」性质不同。导入世界书时 description 进 setting 即属此类，用户在发布前可在设定集与造世里看到它。
- 介入记录在设定集只读展示；介入原文进公开快照与否沿用介入批口径（作者副本带印记，公开快照已剥离），本批未改动。

## 已知边界 / 延迟项

- **ch0 落地竞态（窄）**：生成第一章时若服务端圣经覆盖本地圣经，设定集在 ch0 接受前编辑的圣经字段可能被服务端版本盖回（lorebook/persona 在 config 上，不受影响）。窗口只在第一章生成中存在，与既有 outline 同性质，接受。
- **zTXt PNG 未支持**（见上）：标准酒馆卡不受影响。
- **介入对已预生成下一章的重写**会经过同一条 lorebook 注入通道（介入批的重新生成走 generateChapter 同路），无需额外接线；本批 e2e 未单独覆盖介入×lorebook 组合，单元层的注入断言覆盖同一函数路径。
- 导入在**未登录游客**下同样可用（本地故事），登录后经云端书架整体同步，无差别。

## 验证证据

- `npm test`：529/529 全绿（基线 509 → +20：world-info 解析 3、设定文 3、角色卡 3、选择/预算 2、生成注入 2、设定集编辑效应 1、快照脱敏 1、持久化 1、云同步 1、normalize 1、PNG 2）。
- `e2e/import.cjs`：8/8——步 2 导入世界书（note 计数、名字/设定落位）、步 4 导入 PNG 卡（预览 → 确认 → 名与 persona 落位）、Gemini 桩生成第一章、**捕获的真实生成上下文**断言 lorebookData 含常驻 + 命中条目、不含未命中条目、禁用条目从未出现、persona 到达 brief；阅读器设定集列出三条导入条目。
- 截图（390×844 viewport-only，`import-shots/`）：01-world-import-entry.png、02-world-imported.png、03-card-import-entry.png、04-card-preview.png、05-settings-book.png，均已目检。
- 夹具：`import-shots/world-book.json`（4 条：常驻/命中/未命中/禁用）、`import-shots/card.png`（由 make-fixtures.mjs 生成，565 字节）、`import-shots/dev-server.mjs`（真服务器 + 桩传输，上下文落 captured-contexts.jsonl）。
