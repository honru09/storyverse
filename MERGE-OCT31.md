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

工具：`agy-call --model gemini-4-argon-high`，只喂脱敏的裁决摘要
（提示词与原始输出存本目录 merge-review-prompt.txt /
merge-review-out.json）。Gemini 给 11 条、总结论「暂不可 push」，
要求先处置 4 条高危。逐条拿代码证据核完后：**3 条真问题成立并已修
（其中一条牵出比它所指更深的三层同类问题）、其余不成立或不阻断**，
修复提交 a006e6b，新增 tests/fusion-integration.test.js 钉住全部
跨批接缝。逐条处置：

1. **疑点A（season/long 合流退回题材大纲会丢多源结构）——不成立为
   阻断项**。题材大纲只是本地 bible 脚手架；合流的模型侧结构由
   SYSTEM_PROMPT 合流段 + sourceWorlds + protagonists 承载，与篇幅
   无关。补证据测试：N=3 season 合流 total=24、大纲 24 条；自拟
   题材源为 lead 的 season 合流同样成形（fusion-integration）。
   main 既有口径（短篇才用定制六拍）本就是 merged-publish 批的
   定案，本波不推翻。
2. **疑点E（N>2 本地简介回落）——大半不成立**。N>2 分支无「两人/
   双方」字样（关系句用「他们」，bond 是融合线整体的关系设定、
   非某一对的私属）；点名的是各主角的**出身世界**（逐源锁定的
   应有之义），融合世界本身另以合流点表述，不冒充任一源世界；
   长度由 sanitizeIntro 的字段上限截断（600/600/300×3）。
3. **疑点B（bible 具体规则进公开回落会漏术语）——不成立**。
   introRulesFromBible 逐条过 introViolationFor（术语表+填充标记+
   串章名禁令），命中整条丢弃而非放行；广场侧 plazaWorldIntroFor
   再过一遍。草稿当定稿之虑：回落只在生成版缺位时出现，口径与
   REQ-56 定案一致。publicSnapshot 不带 intro（其 premise 走自身
   的匿名 redactor，见第 6 条）。
4. **疑点C（重生模板改数据是凑字面量）——不成立**。「遗憾清单」
   本身就是可枚举标尺（一条一条划掉、逐条报账），与其它模板用
   官品/积分/排名达标同理；「标尺」是本站读者面既有词汇（阅读器
   续季文案即用「标尺已经抬高一格」），不在任何禁词/术语表内。
5. **疑点D（白名单开口过大）——不成立**。白名单是「指定文件 +
   定义行全文精确匹配」；且广场侧 WORLD_INTRO_ENGINE_TERMS 就是
   `= INTRO_ENGINE_TERMS` 的同一份导入（src/plaza.js:336），不
   存在双份词表失步。
6. **第 6 条（redactLine 删除殃及 publicSnapshot 匿名）——不
   成立**。redactLine 只活在 plazaSnapshot 的草案里；publicSnapshot
   的 snapshotRedactor 独立完整，合并后其合流 cast 仍走匿名替换
   （引擎 3850 行一带），fusion-multi 的 publicSnapshot 断言全过。
7. **第 7 条（abilityDesc 逐源锁定）——成立，已修**。合流 cast 的
   protagonists 只带能力名（数据模型里没有逐人 desc），但故事级
   abilityDesc 经 leadConfig 继承进了融合线，brief 会把它当全书
   的能力说明。修：createMergedStory 清空 abilityDesc（与
   customWorldName/Setting 同列），断言入 fusion-integration。
8. **第 8 条（SYSTEM_PROMPT 设定段并存）——成立，且比所指更深，
   共三层全修**。① contextFor 的 worldSettingData 对合流故事照常
   发射（按 lead 题材+其世界草稿现算）——按 kind 拦截。②
   compactConfig 把 lead 的 worldName/worldSetting 解析进融合线
   的 config 块——compactConfig 加 kind 参数、合流不解析。③
   storyBeatPlan 的 prerequisites 第一行与「世界设定：」行同样按
   lead 现算——合流改为「N 个源世界并联融合出的新世界」接地行、
   跳过设定行与 lead 出身行；顺带修掉 beatPlan 与主页 hero 里
   写死的「双主角」（REQ-53 的 2–10 人口径），基线测试里钉旧
   字面的两条断言已更新并留 supersede 注。注意：草稿原文出现在
   sourceWorlds 里是**合法**的——那是该源书自己的 bible 历史，
   本节断言只禁它出现在「融合线自身世界」的三个位置。
9. **第 9 条（缓存 × 档案重拉 × 能力字段）——后半成立，已修**。
   前半不成立：SW 只缓存 /api/library 与 /api/plaza*（network-
   first），档案接口不在其路由内，服务端亦未给档案 JSON 设缓存
   头。后半成立：avatarCollectionSignature 原只含名/立绘/主位，
   只改专属能力时签名不变、主页展台的能力行会陈旧——签名行已
   并入 ability 名+描，断言入 fusion-integration，原 REQ-58 语义
   测试全过。
10. **第 10 条（篇幅预选被静态默认值锁死）——不成立**。实现是
    渲染期派生：`lengthMode = lengthChoice || fusionProductModeFor
    (selectedStories)`，未点档位前增删源书实时重算，候选签名含
    lengthMode（fusion-length 测试覆盖回落与显式选择两路）。
11. **第 11 条（N=10 徽章溢出 + 基线失败遮蔽）——不阻断**。徽章
    是普通流内 inline 元素（11px、无 nowrap、无固定高），CJK 书
    名任意处可断行，N=10 只会多行变高，不存在横向溢出机制；完
    整书单另有来源区承接。基线 5 失败全在 dedup-fix 的图片裁边
    测试内，断言只涉裁边本身，不遮蔽其它表面（各表面有独立套件
    且全过）。留观察项：N≥5 合流书的详情页真机观感未实测，
    部署后请父 agent 结合真机点验留意。

复核后全量：1019 例、1013 过、6 失败 = dedup 样本图 ENOENT ×5
+ import-daylight flake ×1（单跑 3/3 通过），与基线失败集逐条
相同。build 通过。

## 收尾

- push：`git push origin merge-oct31:main`；`git ls-remote origin main` 核对。
