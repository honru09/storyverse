# FUSION-MULTI — REQ-53 合流多源 + 详情来源清单 (+REQ-61 主角逐源锁定）

分支 `fusion-multi`，基线 = `fusion-permission` 尖端 `bc45850`（REQ-49）。
本地提交，不 push、不部署、不动生产数据。用户口径：合流 2–10 本多选；
详情页「来源」区逐本列出、可跳源书详情；权限逐本服从 REQ-49 三态；
外加 2026-10-31 00:06 的 REQ-61 硬口径（见 §6）。

## 1. 双 → N 改动清单（逐处）

### src/story-engine.js
- 新增导出 `MERGE_SOURCE_LIMIT = 10`、`protagonistFallbackName(index)`（甲乙丙丁戊己庚辛壬癸）、`mergeLeadIndexFor(merge)`（lead 存储读取：整数钳制 / 'b'→1 / 其余→0）、内部 `mergeLeadValueFor`（0→'a'、1→'b'、≥2→整数存储）。
- `fusionProductModeFor(...)` 改为可变参/数组：任一源 serializing → endless；旧两参调用兼容。
- `createMergedStory` 双签名：数组形式 `createMergedStory([lines], options)` 与旧式 `(a, b, options)`。校验：每源 validateStory；<2 抛 `RangeError('合流至少需要两条故事线。')`；>10 抛 `合流最多 10 条故事线。`；重复 id 抛 `同一条故事线不能和自己合流，也不能重复作为合流来源。`（旧自融文案保留子串）；任一源 kind=merged 抛 `合流故事是多条线合流的结晶，不能再作合流的来源。`（旧文案保留子串）。
- `options.lead` 支持整数索引（越界/非法回落第一源）与 'a'/'b'。config 的 name/trait/origin/ability/destination/protagonists/sourceGenres 全按 N 拼接；protagonists 名单保持**选源序**（基线钉子行为，lead 只决定视角与题材底，不重排名单）。
- story 新增 `sources: [{title, publicationId}]`，与 sourceTitles / sourcePublicationIds / sourceIds / derivedFrom 按选源顺序对齐。
- worldBible：N==2 时 premise/rules/endingAnchor/outline 与旧文案逐字不变（pair 分支）；N>2 用「全体主角/各位主角」泛化文案。标题规则泛化：≥2 个不同非空源标题 → 全部标题 clip 后 ' × ' 拼接（缺标题侧回落主角名），否则全体主角名拼接（N==2 行为与旧一致，含同名回落）。
- `sceneFor` / 变奏场景：N==2 保持现有文案逐字不变；N>2 走全员版 `mergedCastScenesFor` / `mergedCastVariationSceneFor`（同六位骨架与滚动弧结构，称谓改全员名单）。`buildChapter` / `storyBeatPlan` 的名字回落 `甲/乙` 改走 `protagonistFallbackName`（0/1 结果相同）。
- `publicSnapshot`（分享快照）：合流分支按 config.protagonists 全量匿名化（回落名走 protagonistFallbackName），sourceGenres 全量；标题 N==2 保持 '合流：两条匿名世界线'、N>2 用 `合流：${N}条匿名世界线`；worldBible pair 保持、N>2 泛化。
- `plazaSnapshot`：protagonists 由写死两槽改为按 config.protagonists 全量映射（上限 10，无数组时回落旧两槽）；merge.lead 透传整数；返回值 merged 时加 `sources`（见 §3）。
- REQ-61（见 §6）：mergedConfig 清空 customWorldName / customWorldSetting（世界身份不随 lead 继承）。

### src/persistence.js
- config.protagonists 长度校验 `!== 2` → 2–10（文案 'must contain between two and ten characters'；已查无测试断言旧文案）。
- merge.lead 放行整数 0–9（'a'/'b' 之外）。
- story 级新增 `sources` 可选校验（数组 ≤10、每项 record、title/publicationId 若在须为字符串）。

### server/gemini.js
- `compactConfig` protagonists `slice(0, 2)` → `slice(0, 10)`。
- `contextFor` 的 sourceWorlds：`slice(0, 2)` → 按本书主角数封顶（≤10）全量，超额条目视为非本线来源直接丢弃（旧测试的「第三世界污染」语义按新口径保留）；每源份额按源数缩放（见 §2）。
- `chapterLengthDirective`「双主角同场」→「多位主角同场」；SYSTEM_PROMPT 合流句泛化（人数以 protagonists 为准、lead 含数字位）并写入 REQ-61 两条硬规矩（见 §6）。

### server/plaza.js
- `publish()`：非 manual 分支 record 新增 `sources`，由 `storedSourcesFor(story)` 在上架时以故事自带清单为准重算（有 publicationId 的查出版记录填真实 title/authorName/authorHandle/genreId；无 id 的只存书名、作者在读时解析为发布者本人）。manual 分支 `sources: []`。
- `detail()`：merged 书在 `detailOf(withAuthorIdentity(record))` 后逐条 live 解析 sources（见 §3 三态）。
- 发布门 REQ-49 复检段本来就是对去重后的 sourcePublicationIds 逐个核对，N 源天然成立，未改逻辑、只加混合权限用例（见 §5）。

### src/plaza.js
- 新增纯函数 `detailSourcesFor(detail)`：客户端回落与归一（见 §4），供 PlazaDetail 与 plazaReaderStory 共用并单测。
- `plazaReaderStory` 透传 `sources: detailSourcesFor(detail)`。

### src/main.jsx / src/styles.css
- Merge 组件：两个 radiogroup 选器合并为一个多选列表（MergeLineCard 改 role="checkbox"，该组件仅 Merge 内使用）；状态 selectedIds 有序数组，preselect 的 sourceId/partnerId 依次种子化，缺省种子与旧默认一致（活跃故事→第一条其它原线→示例卡补位）；FRIEND_BOOK 仍作「示例」卡可选（gate 恒开）；每卡继续走 REQ-49 gate（ask 点卡提交申请、forbidden/pending 报错、已授权标注）；计数文案「已选 N / 10，至少选 2 条」；超 10 拒绝并提示；lead 改为从已选线中选一位（取消选时回落第一条），传引擎换算 leadIndex；开始前逐本复检 gates、<2 报错；mergeContext = 已选.map(mergeSourceContext)；舞台区改为核心图标 + 已选线小卡横排（.merge-stage-multi 等新样式）；标题文案改多源口径；结果行来源标题改全拼接。
- PlazaDetail：新增 `onOpenBook` 入参（App 渲染点传 openPlazaDetail，沿用现有详情打开路径与来源 origin）；新增「来源」区（plaza-panel 制式，仅 merged 且 sources 非空时渲染，见 §3）；头部融合徽章由写死两本改为全部标题拼接。
- 本书设置页合流文案 N 泛化（「由《A》×《B》…」改全拼接 +「N 位主角」；「合流故事是两条线的结晶」→「多条线合流的结晶」；非合流书入口 hint「双主角的新书」→「多主角的新书」+ 2–10 条说明）。

### 有意保留的 slice(0, 2)（视觉上限，非数据上限）
- main.jsx `coverSources` 与 WorldArtwork 的 `slice(0, 2)`：封面拼图视觉最多拼两源，是画面上限、不是数据上限，来源数据全量在 sources[] 里。已查、保留、理由在此。

## 2. Token 预算口径（sourceWorlds 按源数缩放）

旧双源口径下每源份额：summaries 最近 12 条、openForeshadowing 最近 8 条、rules 8 条、outline 按源篇幅（长线 20 / 其余按总章数）、premise/endingAnchor 各 clip 600、条目 clip 300。
N 源时总预算保持在旧双源包络附近：缩放因子 `scale = min(1, 2/N)`，作用于条数类份额并设地板——summaries `max(4, round(12·scale))`、openForeshadowing `max(2, round(8·scale))`、rules `max(3, round(8·scale))`、outline `max(6, round(基数·scale))`；premise/endingAnchor 的 600 字符 clip 不变（世界前提是每源不可再压的身份信息）。N=2 时 scale=1，与旧口径逐项相同（旧测试全绿佐证）；N=3 时每源 summaries 8 / 伏笔 5 / rules 5（新测试实证）；N=10 时每源 summaries 4 / 伏笔 2 / rules 3，十源合计仍约为双源包络的 1.7 倍以内，主角档案本身（compactConfig 每人定额 clip）不缩放——主角是逐源锁定的身份（§6），不许为省 token 压掉。

## 3. 来源字段结构与三态

数据流三层：
1. **本地 story.sources**：`[{title, publicationId}]`，选源序；publicationId = 该源线进入时所自的出版 id，自有原线为 ''。
2. **发布快照 snapshot.sources**：同结构，title 过与 sourceTitles 相同的脱敏（本分支基线口径；main 已拆替换式脱敏，集成时以 main 为准对齐）、publicationId 照带。说明：REQ-49 曾把源出版 id 排除在快照外（谨慎口径），REQ-53 用户亲令来源要在详情公开列出并可跳转，该 id 本就是已出版的公开标识，就此 supersede；本地 story id（sourceIds/derivedFrom）仍永不外带。
3. **服务端 record.sources**（`storedSourcesFor` 上架时重算）：`[{publicationId, title, authorName, authorHandle, genreId}]`。有 id 的以出版记录现行 title/作者为准（本地进入线的标题可能已改名，不作数）；无 id 的 authorName/authorHandle 存空，读时填发布者本人。

**detail 读取时逐条 live 解析**（`resolvedSourcesFor`），每条输出 `{publicationId, title, authorName, authorHandle, genreId, coverUrl, state}`：
- `live`：出版仍在架——title/author/coverUrl 取现行值，详情页整行可点跳该书详情。
- `gone`：id 在但出版已下架/删除/被隐藏——只显存量 title/author + 「已下架」chip，不可点（与广场「书下架帖显已下架」口径一致，无死链）。
- `own`：无 id——发布者自己的未上架源线，只显书名 + 作者（本人），不跳。
- 普通书详情不出现此区；manual 书 sources 为空、不出现。

## 4. 存量回落策略

- 老 record 无 `record.sources`：detail 回落用 `record.sourceTitles`（+ snapshot.config.sourceGenres 配 genreId）拼 `state: 'listed'` 的纯展示条目——有书名、无作者、无跳转，不空白、不报错（新测试以「删掉已存 record.sources 后 detail 仍列全」实证）。
- 客户端再兜一层：detail 到达客户端时若 sources 缺失/未带 state，`detailSourcesFor` 用 sourceTitles + snapshot 源题材重拼（'listed'）；若 sources 在但个别条无 state，有 id 归 'live'、无 id 归 'listed'。
- 本地老合流故事无 story.sources：plazaSnapshot 从 sourceTitles × sourcePublicationIds 两条平行数组重建 sources，老线再发布即刷出完整清单。线上那本实验合流书的正式重刷是部署后的生产动作（本批不碰生产数据），代码回落已保证重刷前详情也不空白。

## 5. 测试结果

新增 `tests/fusion-multi.test.js`（14 条）：
- 3 源创建全链：protagonists/sourceTitles/sourceIds/derivedFrom/sources 对齐、标题三拼、任一 serializing→endless、全 finished→short、开篇章节三人同名出现、validateLibrary 过。
- 边界：10 源可合、11 源抛错、1 源/0 源抛错、重复源抛错、merged 源抛错（任意位置）。
- lead 整数位（lead:2 → merge.lead===2、题材底取第三源、校验过；越界 lead 回落第一源；'a'/'b' 旧拼写不变）。
- plazaSnapshot 三源（endless 前提）：sources 3 条与 sourceTitles 对齐、进入源带 publicationId、本地 story id 不出现在序列化里。
- publicSnapshot 三源：匿名 3 人（甲/乙/丙）、标题「合流：3条匿名世界线」；双源旧文案不变。
- gemini context 三源：sourceWorlds.length===3、protagonists 3 人进 compactConfig、每源份额按 scale=2/3 缩放（12→8 / 8→5 / 8→5）、第 4 条污染 mergeContext 被本书主角数封顶丢弃。
- REQ-61 两条（见 §6）。
- 服务端混合权限（HTTP 全链）：读者合 own（无 id）+ ask 作者源 + free 作者源：无授权发布 403 → 申请获批后 200；record.sources 3 条（entered 源以出版标题/作者存储）；detail 三态 own/live/live；free 源下架后变 gone 且标题保留；剥掉 record.sources 后 detail 回落 listed 三条不空白。
- forbidden 作者源在三源 cast 中同样 403。
- detailSourcesFor：非合流返回 []、resolved 三态透传、老 detail 由 sourceTitles 重拼 listed、无 state 条目按有无 id 归类；plazaReaderStory 透传 sources。

全量：`npm test` 共 929 条（基线 915 + 本批新增 14），924 过、5 失败；5 条失败与基线 bc45850 对照为同一组 `tests/dedup-fix.test.js` ③a 图片测试（样本图 ENOENT，环境缺文件，已在基线 worktree 实测同败），无新增失败。`npm run build` 通过。

## 6. REQ-61 合流主角逐源锁定 + 融合新世界（2026-10-31 00:06 用户亲纠）

**口径**：合流的每位主角逐源锁定——就是他自己源书的主角，名字/性格/能力以源书档案为准原样进入；不许串名、不许借用另一条线的主角名、更不许把两边写成同一个人（同名也是两个人）。世界是融合生成的新世界，不以任一源线世界为宿主——不是「A 的世界里来了 B 的人」，是各源样貌与规则并联成一个新场。多源同理：N 位主角各归各源。起因：实验合流书城市侧主角被写成 A 线的「沈砚」，而 B 书正主是「陆鸣」。

**落实点**：
- 引擎（story-engine.js）：`createMergedStory` 的 protagonists 逐源由 `publicConfigFor(该源自己的 config, 该源自己的名字)` 组装——第 i 位主角的 name/trait/origin/ability/avatarId/avatarAppearance 全部只取第 i 条源线自己的档案；lead 切换只改视角（merge.lead）与题材底（genreId/tone），永不重排、永不改写名单（测试钉死：翻 lead、换选源序，主角始终跟源书走）。同名双源仍是两条独立档案（avatarId/能力互不相同）。
- 世界不宿主：mergedConfig 原先经 `...leadConfig` 继承了 lead 源的 customWorldName / customWorldSetting——lead 是创世神线时，融合线的世界名与设定文本就成了它一个的世界。本批清空这两项（世界身份）：融合世界的身份只由融合 worldBible（前提逐一点名各源世界、在新合流点相遇）与各源各自的 sourceWorlds 条目承载。出生点（startPointName/Hook）是开场落点、不是世界身份：它维持既有钉子行为随 lead 继承（story-engine.test.js spawn point 用例钉死），与本口径不冲突。融合线的 destination 本就是各源地点并联拼接（既有行为，与此口径一致）。
- 快照（plazaSnapshot）：protagonists 直接取融合 config 的名单（已逐源锁定），逐位只做既有脱敏字段替换（trait/origin/ability 换匿名值、avatar 字段留家），名字逐位原样保留——快照侧不存在跨源取名的路径（测试实证沈砚/陆鸣双源快照名单）。
- 提示词组装（server/gemini.js）：compactConfig 的 protagonists 逐位映射各自字段（一一对应、不交叉）；sourceWorlds 按本书主角数封顶、逐源独立条目（每源自己的 bible/summaries/伏笔，不并账到别人名下）；SYSTEM_PROMPT 合流句已明文写入两条硬规矩（逐源锁定含「同名也是两个人」、融合新世界含「每位主角都是本地人」），生成侧不得串名借名、不得以任一源世界为宿主。
- 实验书的错误发生在实验脚本手工拼装进入线/合流的环节（非引擎路径）；生产侧按沈砚×陆鸣重刷是部署后动作（另有审计批），本批以测试把引擎/快照/提示词三条正路全部钉死。

**测试**（tests/fusion-multi.test.js 新增 2 条）：①逐源锁定——双源 （沈砚·修真 / 陆鸣·都市） 主角名/性格/能力/avatarId 逐槽等于各自源书；翻 lead、换序、三源、同名双源四种变体下仍逐源一致；plazaSnapshot 名单同断言（主角名与各自源书不一致即失败）。②融合新世界——lead 源为带 customWorldName/customWorldSetting/startPoint 的创世神线时，融合 config 的世界名/设定文本两项全空、出生点仍随 lead（既有钉子）、bible 前提为「合流点相遇」且点名双方世界。
