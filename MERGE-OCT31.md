# MERGE-OCT31 — 集成波处置笔记（2026-10-31）

把 2026-10-30 夜的全部本地批次合并进 main：REQ-49/50/51/52/54/55/56/57/58/59/62
+ REQ-53/61（fusion-multi 栈），外加欠账的合流篇幅 UI 选择器。
工作分支 `merge-oct31`，基线 origin/main `1001e79`（生产 00049）。
本批做到 push + 远程哈希核对为止；**部署不在本批**（主助手走 Cloud Shell）。

## 合并链（按执行序）

| 序 | 分支 | REQ | 合并提交 | 冲突 |
|---|---|---|---|---|
| 1 | copy-scrub 9f3fbb1 | 52 文案禁词 | 24669f9 的前一提交 | 无 |
| 2 | local-cache da2b96f | 50 本地缓存 | 24669f9 | 无 |
| 3 | avatar-profile-missing 967f9eb | 58 档案缓存失效 | f56fcd0 | 无 |
| 4 | stage-head-fix c252731 | 62 展台守卫+删设置副标题 | 408accc | 无 |
| 5 | synopsis-first d0f2e0f | 56 简介生成制 | edc8082 | 无 |
| 6 | world-preset-soft 1c4eb9e | 59 世界预设草稿化 | c8a6f9c | server/gemini.js import 行 1 处（并集） |
| 7 | fusion-multi 72d0d4c（含 fusion-permission bc45850） | 49 权限三态 + 53 多源合流 + 61 逐源锁定 | 094f138 | main.jsx / plaza.js / story-engine.js 共 5 处（见下） |
| 8 | avatar-signature-ability 0245821 | 57 化身专属能力 | fb1d6a0 | 无 |
| 9 | genre-freedom 12d67bb | 51 题材去牢笼 | 65f10f7 | gemini.js ×3 / main.jsx / persistence.js / story-engine.js（并集型为主） |
| 10 | reader-polish2 4700b64 | 54 阅读器三修 | 854a1a2 | main.jsx 详情头部 1 处（小字+N 源徽章并存） |
| 11 | detail-layout 0e03ce5 | 55 详情页顺序 | 7d744a5 | 自动合并；来源区位置由集成提交 12544ce 修正（见下） |

fusion-multi 的 ancestry 已核：bc45850（REQ-49）是其祖先，合它即带入 49，
未重复合并 fusion-permission。其余各分支基线均与远程 main 1001e79 对齐
（fusion-multi 基线为栈内 7bad905，是 1001e79 的祖先）。

## 集成提示逐条销账

1. **REQ-53 × main 的篇幅/原文口径**（fusion-multi 笔记 §1/§3）：
   - `createMergedStory` 解冲突时以 fusion-multi 的 N 源结构为骨，植入 main 的
     `chosenMode`：显式 `opts.storyLengthMode`（short/season/long/endless）优先，
     未选才走组合表 `fusionProductModeFor(sources)`。引擎测试 fusion-length +
     fusion-multi 全绿佐证。
   - outline 口径取 main：只有 short 用定制六拍（双源/多源两变体），
     season/long/endless 走 `outlineFor` 按自身总章数——REQ-53 草案曾让所有
     有限篇幅都吃六拍，会让 24/100 章合流只剩 6 条大纲，已按 main 纠正。
   - plazaSnapshot 原文保真（脱敏废止令）：fusion-multi 草案里的 N 槽主角曾带
     「匿名探索者/未知来处/匿名火种」替换值（旧基线口径），已按 main 改为
     **N 槽 + trait/origin/ability 逐字原文**；sources[] 标题同理由未定义的
     `redactLine` 改 `verbatim`（该函数在合并后已不存在，属自动合并留下的
     悬空引用，一并修掉）。合并后 plazaSnapshot 全路径无替换式脱敏；
     仅剩的占位值都在 publicSnapshot（本地分享面自身匿名设计）内。
   - REQ-56 的合流本地简介回落 `localMergedIntroFor` 已泛化为 cast 数组
     （N=2 文案逐字不变，N>2 全员版），createMergedStory 与 effectiveIntroFor
     两处调用都走全名单——原草案只认双源变量名，合并时已是 ReferenceError，
     靠 fusion-multi 测试当场抓住。
2. **REQ-54 小字 × REQ-55 新顺序**：`.plaza-detail-readonly` 在合并后
   main.jsx 中恰出现 1 次，位于封面头部状态行之下（头部区）；详情截图
   DOM 实测 readonlyCount=1。REQ-55 自动合并把 REQ-53 来源区落在了
   简介与化身面板之间，与 REQ-55 定案序（头部→入口→简介→化身→世界设定
   →来源→节拍→评价）不符，集成提交 12544ce 已把来源区整段移到世界设定
   之后、主线节拍之前；DOM 实测序 entry(437) < synopsis(686) < world(989)
   < sources(1445) < beats(1702) < ratings(1911) ✓。
3. **REQ-56 × REQ-59（server/gemini.js）**：SYSTEM_PROMPT 三段数据块说明
   并存——customWorldSettingData（既有）、worldSettingData（REQ-59，
   明示写 bible 以草稿为准现写）、customGenreData（REQ-51）；synopsis 的
   schema 口径与写作段同在（gemini.js 92/787 行一带）。冲突仅 import 行，
   取符号并集。`WORLD_INTRO_VERSION` 合并后 = 4（src/plaza.js）✓。
   另有一例跨批断言过时：REQ-56 测试曾断言模板书本地回落 rules 为空，
   REQ-59 后 bible 首条规则是世界设定原文（具体内容、非填充），已按
   REQ-59 口径更新该断言（留 supersede 注释），行为取「保留具体规则、
   只滤填充」。
4. **REQ-57 × REQ-49 / 三步邻接**：server/social.js 两批邻接自动合并，
   fusion-permission 与 avatar-ability 测试合并后同跑 24/24 ✓。
   main.jsx 题材步（51）、世界步（59）、能力步（57）逐区核对：51×59 的
   一处冲突（world 计算 vs customGenreActive）解为两者并存——world 走
   REQ-59 的草稿名优先，template 解析保留 REQ-51 的 customGenreActive；
   persistence CONFIG_TEXT_FIELDS 取并集（customGenreText + abilityDesc 都在）。
5. **REQ-50 SW × REQ-52 守卫**：合并后 `public/sw.js` 最终态
   `VERSION = 'storyweave-v3'`、`MEDIA_CACHE = 'media-v1'` ✓；
   copy-scrub 守卫在合并树上复跑——REQ-56 的 `INTRO_ENGINE_TERMS`
   （与广场 WORLD_INTRO_ENGINE_TERMS 同性质的过滤清单、永不展示）被守卫
   命中，已按 REQ-56 笔记预告的口径加入显式白名单（写明理由），守卫
   本体与其余扫描零命中。

## 集成中抓到并修掉的问题（除上）

- **genre-freedom 自带潜伏失败**：knowledge-genres 的「chongsheng ruler」
  在 genre-freedom 分支尖端本身就红（其全量报告漏报）——重生模板的
  worldSkeleton 没有一条点名可枚举标尺，不合爽文总则「标尺仪表盘化」。
  已把其首条改为「遗憾清单就是这一世的标尺，全程可见：……」（清单本身
  即标尺，语义不变），该文件 5/5 转绿。
- 合流篇幅 UI 选择器（欠账，本批补）：Merge 页「如何相遇」区新增
  「篇幅」四档（短篇·6 章 / 一季·24 章 / 长线·100 章 / 无限连载），
  状态 `lengthChoice` 未动时以 `fusionProductModeFor(selectedStories)`
  回落预选（源全完结→短篇、任一连载中→无限，与引擎组合表同值）；
  runMerge 把有效值以 `storyLengthMode` 传引擎并计入候选签名；
  篇幅说明行按有效模式一句话说清（守两句口径）。新增
  tests/fusion-length.test.js 4 例（显式压过组合表、无限/长线总数与
  大纲口径、未选回落、UI 接线源码断言）全过。

## 验证门结果

- **全量测试**：1014 例，1009 过，**5 失败 = 基线失败集逐条相同**
  （dedup-fix ③a 样本图 ENOENT ×5，环境缺图）；import-daylight 本轮
  通过（flake 0 条）。两条集成新失败（copy-scrub 守卫、
  knowledge-genres）已按上文修到归零，无任何新增失败带出。
- **build**：`npm run build` 通过（仅既有 chunk 体积警告）。
- **截图自查**（merge-oct31-shots/，390×844 Chromium，夹具真服务+
  真构建，脚本 merge-oct31-shots.mjs，DOM 检查 9/9）：
  01 题材步——自由创世黑洞主视觉+自由输入+「没灵感？试试从分类里找」
  次级入口，卡面无计数；02 世界步——世界卡只剩名+氛围，草稿编辑展开
  （青岚宗名/设定可改，设定为预设原文）；03/03b 合流选源——多选列表+
  计数、四档篇幅齐全、短篇回落预选高亮、说明一行；04/04b/04c 主页——
  化身在列（REQ-58 链）、展台完整在框、设置行只剩「设置」二字
  （DOM small=0）；05 详情——头部小字恰一次、评分摘要行、入口组、
  简介、来源两行（书名+作者+@handle）、节拍、评价垫底，顺序 DOM 实测。
  全部逐张亲看通过。

## Gemini 复核（用户亲令）

（agy-call high 档复核结论与逐条处置填于下方，push 前完成。）

## 收尾

- push：`git push origin merge-oct31:main`；`git ls-remote origin main` 核对。
