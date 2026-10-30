# MERGED-PUBLISH — 已完结合流短篇可发布（发布门变更）

## 依据

用户（产品所有者）2026-10-30 22:53 亲令：实验三本书都要发布，合流的要
「正儿八经合流然后发布」。此命令 supersede FUSION2 旧规「short 合流线
永不发布」中「已完结合流短篇也不能发布」的部分。

## 规则变更（本批）

- `kind=merged` 且有限篇幅（short/season/long/custom）的合流线：
  **完结（isStoryComplete）后可发布**（lineStatus=finished）；未完结
  仍拒绝，理由文案为「合流故事还没走完，完结后才能发布。」（含
  「合流」可识别）。
- merged endless：沿用现行规则不变（走普通 endless 门：化身 + ≥1 章，
  连载中可活发布）。
- 普通 short 线（非 merged）：仍不可发布，文案不变。
- 服务端无需改动：server/plaza.js 本来就按任一主角化身为合流线验权，
  发布只经 plazaGateFor + plazaSnapshot 两道门。

## 追加：合流篇幅用户可选（2026-10-30 23:00 用户亲令，引擎层）

supersede 组合表钉死篇幅的口径：合流篇幅与普通造世一致、由用户选。

- `createMergedStory` 接受 `options.storyLengthMode`（合法值
  short/season/long/endless）：传了就用用户的选择；没传（或非法值）
  才回落组合表（完结×完结→short、任一连载中→endless）。显式选
  short 也能压过组合表的 endless 回落。
- `storyLengthModeOf` 对 merged 不再强制 short：读 config 钉住的
  mode（任一合法值），无法识别才回落 short（旧合流存档钉的是
  short/endless，行为不变）。
- `src/persistence.js` 的 totalForStory 去掉 merged 特殊分支：合流线
  章数上限按所选篇幅走（short 6 / season 24 / long 100 / custom 按
  target / endless 999 封顶）。大纲与结局锚随篇幅：short 保留六拍
  定制大纲，其余有限篇幅用 outlineFor 按自身总量生成。
- 发布门与 plazaSnapshot 已按「有限篇幅合流线」泛化（见上），与所选
  篇幅天然同构，无需逐 mode 改码。
- 本次实验合流书 merge-mvuyfqwi-6 **维持 short 6 章**（短篇弧线锚点
  已按 6 章收尾设计）：未改 mode、未续写。

### 待办：合流 UI 篇幅选择器（本批未做，注明原因）

合流发起界面（src/main.jsx 的合流流程）目前没有篇幅选择器，引擎已
能接受选择但 UI 还传不出。**原因**：main.jsx 正在 REQ-47/48 两个
worktree 中大改（阅读器翻页/主页守卫），本批按令不动 main.jsx 以免
冲突。待 REQ-47/48 的 main.jsx 落地主线后，另批在合流发起面加篇幅
选择（短 6 / 中 24 / 长 100 / 无限，与造世篇幅菜单同口径），把选择
透传给 createMergedStory 的 options.storyLengthMode。

## 改动文件

- `src/plaza.js`：plazaGateFor 的 merged 分支改为按完结判定；文件头
  产品规则注释同步对齐。
- `src/story-engine.js`：plazaSnapshot 的 merged 抛错改为仅未完结时抛
  （TypeError「合流故事还没走完，不能发布到广场」）；完结线正常出快照
  （merged=true、lineStatus=finished、totalChapters=6）。
- `src/persistence.js`：totalForStory 泛化（合流线按所选篇幅上限）。
- `tests/plaza-shared.test.js`：merged 门断言改双向（3 章拒绝且理由含
  合流/还没走完；6 章 publishable=true、finished）。
- `tests/fusion2.test.js`：endless 合流测试内的 short 门断言改双向；
  快照断言改双向（3 章抛错、6 章快照成功且字段核对）；新增
  「fusion length is the reader's choice」用例：选 season 的产物
  mode=season/total=24，6 章时门拒绝+快照抛错，24/24 后门可发布+
  快照成功（storyLengthMode/totalChapters/chapters 字段核对），
  validateLibrary 按 24 上限（7 章合法、25 章拒绝）；选 long→total
  100 且 6 章不可发布；选 endless→Infinity 且活发布；无选择/非法值
  回落组合表不变。
- `tests/plaza-server.test.js`：拒绝用例改未完结合流（3 章，400，
  理由含合流/还没走完）；新增用例「publish accepts a completed fused
  short line」——完结合流发布 200、chapterCount=6、lineStatus=
  finished、落库 1 条且 merged=true。
- `MERGED-PUBLISH.md`：本文件。

未动：reader-fix3 / avatar-fix 两个 worktree；未部署、未 push。

## 测试结果（2026-10-30，本 worktree 实跑）

- 发布门三件套：plaza-shared 16/16、fusion2 13/13、plaza-server
  10/10 全绿（篇幅扩围前）。
- 篇幅扩围后：fusion2 14/14、plaza-shared 16/16、plaza-server 10/10、
  persistence（与前三件合计 87/87）全绿。
- 全量（扩围后）：891 条，886 过；失败为 tests/dedup-fix.test.js
  样本图 ENOENT ×5（dedup-shots/*.png 是未入 git 的本地产物目录，
  新 worktree 天然缺失；与既有基线报告的同类环境失败一致，非本批
  回归）。另 tests/import-daylight.test.js 的 backup merge 用例有
  既有间歇 flake：本 worktree 全量第二跑出现 1 次，已在未改动的
  基线 49e0a66 主树上复现（8 跑失败 2 次），属既有环境抖动、与本
  批改动无关。

## 合流线本体准备（同批，实验侧）

- 合流线 merge-mvuyfqwi-6 已补第 6 章《两界新道》（index 5，
  chapterId merge-mvuyfqwi-6:chapter:5:r0，14,925 token，¥0.0829，
  一次成功），现 6/6 完结；已 uploadStory 同步 A 账号（qingshan_ke）
  云端书架。脚本：quota-experiment-100ch/prep-merge-publish.mjs；
  落账：data-merge.csv（merged-chapter 第 6 行）。
- 专属封面已生成：version 1（¥0.28 定额，data-merge.csv
  phase=cover-image 行；state-merge.json 的 mergeCoverDone=true）。
- 以上均已从磁盘重读验证（章节数/state/CSV 行），非只信进程输出。

## 待部署说明

本批基于本地 main 49e0a66、分支 merged-publish-gate。部署由主助手在
REQ-47/48 合并落地后统一排队：合并本分支 → 部署 → 用 A 账号对
merge-mvuyfqwi-6 走正式 publish（预期 publication 成功、书城可见、
coverUrl 指向专属封面）。注意线上现行版本仍是旧门，部署前发布会被
旧门拒绝，属预期。

## 提交状态

已提交：分支 merged-publish-gate（基于 49e0a66），本笔记随提交一并
入库。未 push、未部署（按分工由主助手统一排队）。
