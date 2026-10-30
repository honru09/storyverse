# INTEGRATE-00052：三批集成 + 广场帖编辑微批 + Gemini 复核修复

基线 origin/main `e3f8424`（开工与推送前两次 fetch 核对均一致）。集成 worktree `~/workspace/storyverse-integrate-00052`，分支 `integrate-00052`，独立 npm ci。未部署、未碰生产数据（部署由主助手随后执行）。

## 合并（顺序 1→2→3）与提交

| 步 | 分支 | 合并提交 | 结果 |
|---|---|---|---|
| 1 | kb-integration `91c9b01`（REQ-66） | `d399907` | 无冲突；小集 kb-integration + blurb-voice 22/22 |
| 2 | content-consistency `f980082`（REQ-69 内容防复发） | `eb18752` | 冲突 1 文件（server/gemini.js 两处，裁决见下）；交叉小集 57/57 |
| 3 | audit-fixes `a1c86f9`（REQ-69 安全） | `b1d3051` | 无冲突（server/social.js 与内容批邻接自动合并）；审计小集 47/47 |
| 微批 | 广场帖作者编辑接口（本波内完成） | `b6ce1a4` | 新测试 5/5、广场回归 11/11 |
| 复核修复 | Gemini 交叉复核的真问题（见下） | `4a79ca6` | 新测试 5/5、受影响面 148/148 |

## 冲突与裁决（仅 server/gemini.js）

1. **import 行**：KB 批加 `chapterTitleGuidanceFor / openingPatternFor / storyTemplateIdFor / worldSkeletonKbFor / WORLD_SKELETON_CROSS_LINE`，内容批加 `normalizeProtagonistAnchors`。裁决=并集（两批符号在合并树上均有真实使用点）。
2. **SYSTEM_PROMPT 大段**：KB 侧=基线段 + 简介补强（双轨金手指反差钉死、女频宫斗骨架、灵异声明式标签行、三眼自查）+ 标题分档重写；内容批侧=基线段 + 新增「硬锚点」段 + 旧「8–16 字」标题句。裁决=以 KB 侧为骨（标题带以 KB 分档为准——旧 8–16 是被 928 条实测推翻的带，见 KB-INTEGRATION.md），把内容批「硬锚点」整段（402 字）原样插入第一段与「文笔总则」段之间。核验：硬锚点段在位 ×1、chapterTitleStyle 分档表述在位、旧标题句命中 0、node --check 通过；src/story-engine.js 残留的「8–16」仅在 KB 文档注释与长解说档定义内，非活口径。
3. **上下文预算总账**：KB 每章 +145–182 字；内容批锚点/bounds 行仅在书存有锚点时出现（旧书零新增）。合计仍在 gen-quality 逐章配额（500–700 字/章）量级内、离 MAX_REQUEST_BYTES 两个数量级，无需取舍（KB 笔记口径）。

## 微批：广场帖子作者编辑接口

- **服务端**：`PATCH /api/plaza/posts/:id`（server/index.js，与 GET/DELETE 同块）；实现 `server/plaza-feed.js` 的 `updatePost`（按帖 serialise）。
  - 未登录 → 401（auth-required，「请先登录，再编辑帖子。」）；帖不存在/已删除/被举报自动隐藏（status 非 active）→ 404；他人帖 → 403「只能编辑自己的帖子。」。
  - 内容门与发布完全同一 `cleanPostText`：sanitizeSettingText + POST_CONTENT_MAX 500 字 + findSettingViolation 红线扫描，违规/超长/空 → 400 人话。只改 content 与 updatedAt；书卡、赞/评论计数、帖型不动。
- **客户端**：`updatePlazaPost`（src/plaza.js）；PlazaPostCard 自己帖的 ⋯ 菜单内新增「编辑该帖」（渐进披露：藏在既有菜单、与「删除该帖」并列）→ 卡内联编辑框（textarea + 字数 + 取消/保存），保存后就地更新正文，时间行追加「· 已编辑」小字。文案克制，无新增说明段。样式 `.plaza-post-edit*` 紧挨 `.plaza-post-confirm`，沿用同组 token。
- **测试**：tests/plaza-post-edit.test.js 5 例（本人编辑成功且详情/updatedAt 更新、越权 403 且原文不变、不存在/已删 404、红线两型 + 超长 + 空均 400 且原文不变、未登录 401）。

## 两条存量帖替换稿（本批未改生产；接口部署后由主助手以作者身份走 PATCH 执行）

1. **B 帖 `post-c46c8516-50c`**（作者 beichen_09，挂书 pub-af1b5c93-8bf）：正文一句仍含旧书名《刚失业，神豪系统找上门》（F4 改名残留，见 CONTENT-FIXES.md F4 与 W3 `req69-rename-b.mjs`）。替换法：先 GET 现正文，全文其余逐字不动，仅把旧书名替换为新书名《刚失业，我靠嗅觉翻底册》，再 PATCH 全文回写。
2. **C 帖 `post-a7eb4c1b-167`**（作者 nanqiao_07，挂书 pub-d1bac261-793《配给卡余额最低，我在废土囤成王》）：现正文（req67-book/publish-c.mjs 写入）含「当众报出站长克扣的四百斤粮」「把一座座仓库算进自己名下」两处正文 0 出处（W1 核证）。替换稿（事实据 W1 已核证新简介：0.3 分、四根氧烛起步、生态母舰、特级战备总库）：
   > 《配给卡余额最低，我在废土囤成王》写完了，100 章。秦烬是七号站配给舱的黑工，配给卡只剩0.3分，靠一手存量心算——仓库扫一眼，存量和能撑的天数全有数，误差不超过一成——从废料箱里的四根氧烛起步，一路算到生态母舰和特级战备总库。末世废土流，坑都填上了，欢迎来读。

## Gemini 复核（agy gemini-4-argon-high，代码级走查 e3f8424..b6ce1a4 全 diff；提示词 review-prompt-00052.txt、原文 review-out-00052.txt 同存本仓根）

逐条经集成者用代码证据复核，结论：

| # | 复核点 | Gemini 结论 | 集成者裁决 |
|---|---|---|---|
| 1.1a | 文本 5 种 scene（普通/进入/合流/revise/reroll）的冻结与倍率覆盖 | 不成立 | 同意：deriveMerged 按服务端存量派生，revise/reroll 也走合流倍率冻结 39 币 |
| 1.1b | 图片付费路径未预冻结、且服务内先落盘后结算，402 时图已可取（中危） | **真问题** | **属实，已修（4a79ca6）**：cover.js:220 / avatar.js:317-340 确在服务内落盘、结算在路由事后。修法=`paidImageGeneration`：额度先消费（生成失败经新增 `billing.restoreImageCredit` 退回）、织币先冻结后按 hold 结算；并发双发只成一张（新测试锁定） |
| 1.1c | 文本结算 covered:false 时 402 抛在 recordTextCost 之前，成本流水漏记（低危） | **真问题** | **属实，已修**：两条 throw 改为先落账再抛（settleShort 标记），新测试断言拒付章的成本记录在册 |
| 1.2 | 漂移告警（accept/replace/reroll）与结算/交付幂等的先后 | 不成立 | 同意：落盘 accept 全在客户端、发生在服务端 200 之后；delivery key 只取 chapter id 序列，不读 driftWarnings |
| 1.3 | KB 上下文增量（+145–182 字/章、第 1 章 +504）是否顶穿冻结锚 | 不成立 | 同意：约吃 4000 token 缓冲的 20%；第 1 章无历史包袱，总量最低 |
| 2.1 | kbArcLineFor 与锚点/bounds 行重复/矛盾/稀释 | 不成立 | 同意：分属 mustGround 与 prerequisites 两数组；「按期兑现本职能力」与「禁跨类膨胀」互补 |
| 2.2 | SYSTEM_PROMPT 合并后标题口径残留 8–16 或段落互覆 | 不成立 | 同意：与集成者自查一致（残留仅注释与长档定义） |
| 2.3 | beatPlan 用原始 story 组装，锚点/bounds/abilityDesc 原文绕过 scrub（低–中危） | **真问题** | **属实，已修**：contextFor 的 scrubPairs 扩入这些字段的全部打印形态（原文/trim/120 截断/240 截断各配 [raw, safe]）；新测试断言出网请求 beatPlan 内只有清洗形 |
| 3.1 | 对齐通道写回后再发布的溯源派生完整性 | 不成立 | 同意：updateSynopsis/updateIntro 只动 synopsis/intro，不碰三处溯源 |
| 3.2 | storedSourcesFor × redactedSnapshotConfig 交叉污染 | 不成立 | 同意：publish 读原始 story、溯源存 record.sources 服务端字段，快照剥除不影响图 |
| 3.3a | solo 进入线经对齐改简介后闭包穿回原书 | 不成立 | 同意：三跳路径（进入→发布→再合流）在 audit 测试已有覆盖 |
| 3.3b | 附带：已上架书重发时 record.sources 被客户端当次派生覆盖，首架后剥溯源可洗掉服务端记录（低危） | **真问题** | **属实，已修**：publish 先取 existing，`recordProvenanceIds(existing)` 并入 assertFusionConsent 的 direct 集（不进自报一致性校验）；当次派生为空时保留 existing.sources。新测试：剥指针重发后 sources 仍在、源作者改禁止后剥洗重发被 403 拒 |
| 微批 | PATCH 接口权限/红线/接线 | 不成立 | 同意 |

修法过程中锁定的两个既有行为口径（勿回退）：图片付不起时——账上有图片额度但消费失败→402 coins-exhausted（audit 门测试）；无任何支付工具→回抛服务自身 429 额度错误（billing-server 测试）。paidImageGeneration 按 creditOffered 区分两者。

## 全量对账

- 集成后（复核修复前）全量第二轮：1130 测 / 1125 过 / 5 败；复核修复后全量：**1135 测 / 1130 过 / 5 败**。5 败与基线失败集逐条一致：dedup ③a 样本图 ENOENT×5（`dedup-shots/fixture-portrait-banded.png` 为主仓未跟踪文件、worktree 内不存在）。
- import-daylight backup-merge：集成后首轮全量出现 1 次、第二轮通过、单独复跑 8/8——已知时序 flake，非本波回归。
- `npm run build` 通过（仅既有 chunk 体积提示）。

## Push 记录

- 推送前 fetch 核对 origin/main 仍为 `e3f8424`；代码部分（d399907..4a79ca6）以 `git push origin HEAD:main` 直推，origin/main → `4a79ca6`，回读确认。本笔记为紧随其后的笔记提交，push 后以 origin/main 回读为准。
