# GENRE-FREEDOM — REQ-51 题材步去牢笼化处置笔记

基线 main `1001e79`，分支 `genre-freedom`，只本地提交、不 push、不部署。
用户来源：2026-10-30 23:35 看造世题材屏亲提 + 23:43 布局修订亲定。

## 1. 字段口径订正（与派单字面有出入，语义唯一解）

派单写「genreId='custom'」。现行代码里 `genreId` 是**世界**字段，且其 `'custom'`
已被创世神世界占用；题材字段是 `genreTemplateId`（模板 id）。若照字面把
`genreId='custom'` 当题材写，会与创世神世界撞车。故自由题材落：

- `genreTemplateId = 'custom'`（常量 `CUSTOM_TEMPLATE_ID`）
- `customGenreText`（上限 40 字，常量 `CUSTOM_GENRE_TEXT_MAX`）

## 2. 布局（23:43 修订）

- 题材步首屏：**自由创世主视觉区**在上——固定深色大区（全主题同面，如家族卡的图面）、
  黑洞式动效（conic-gradient 吸积盘 + 双环 + 核心辉光，纯 CSS、只 transform/opacity；
  全局 `[data-motion="off"]` 与 `prefers-reduced-motion` 两道既有规则都会让它完全静止）、
  自由题材输入框与例词 chips 在区内、选中态（青蓝描边+勾）。
- 分类降为第二层：入口按钮文案为用户原话「**没灵感？试试从分类里找**」（带展开/收起状态字）；
  同屏展开家族网格 → 点家族进模板墙（原两级结构不变）。入口旁常驻「已选：家族 · 模板」，
  随时可回去改。恢复草稿选了真实模板时分类区默认展开（看得见所选）；自定义/新草稿默认收起。
- 卡面删「N 种写法」等一切内部计数文案（源码与 UI 双断言无此词）；随机题材卡改为与家族卡
  完全同尺寸同制式（图面=九家族图 3×3 拼贴，删虚线异形）。

## 3. 分类库扩充：9 → 18 家族、15 → 26 模板

新增家族（模板）：武侠江湖（wuxia 武侠）、穿越重生（chuanyue 穿越、chongsheng 重生）、
娱乐圈（yulequan）、末世求生（moshi 末世）、灵异民俗（lingyi 灵异）、游戏电竞（dianjing 电竞）、
军事（junshi）、体育竞技（tiyu 体育）、种田经营（zhongtian 种田）；言情家族加 gongdou 宫斗宅斗。

全套口径（与「恶人」模板同规格，测试锁定）：每个新模板在 knowledge/genres.json 有完整条目
（3 原型、6 季节拍且第 3/5 段以「兑现选择后果」起笔、第 6 段结算、conflictEngine 的
want/obstacle/cost、5 爽点、worldSkeleton 含外显标尺、3 钩子、3 坑），另有 2 个招牌能力
（TEMPLATE_SIGNATURE_ABILITIES），gen-quality 文风锚点按构建脚本既有「就近家族兜底」规则映射
（即恶人的规格：er-ren 借玄幻）：wuxia→修仙、chuanyue→古言、chongsheng→都市、gongdou→古言、
yulequan→现言、moshi→科幻、lingyi→恐怖、dianjing→都市、junshi→科幻、tiyu→高武、zhongtian→都市；
卡池同步登记。`node scripts/build-gen-quality.mjs` 已重建 knowledge/gen-quality.json。

卡面图（本批不新生成，按主题就近复用，GENRE_SHELVES 的 `art` 字段声明、shelfArtBase 解析）：
武侠江湖→cover-eastern、穿越重生→court、娱乐圈→neon、末世求生→cover-scifi、灵异民俗→cover-xuanyi、
游戏电竞→cover-fuben、军事→frontier、体育竞技→city、种田经营→mist。书城筛选、手写书归类、
广场家族墙等所有 GENRE_SHELVES 消费方自动同步（单一数据源）。

## 4. 关键词映射表（自定义题材 → 家族；归档与写法共用同一张）

位置：src/story-engine.js `CUSTOM_GENRE_FAMILY_KEYWORDS`。规则：**最长关键词命中优先**，
同长按表序（强信号在前）。家族代表模板（借写法）= 该家族 templateIds[0]。

| 家族 | 关键词 |
| --- | --- |
| 悬疑惊悚 | 规则怪谈、怪谈、悬疑、惊悚、恐怖、诡异、克苏鲁、侦探、探案、推理、刑侦 |
| 灵异民俗 | 灵异、民俗、风水、阴阳、茅山、僵尸、冥婚、捉鬼、闹鬼、纸扎 |
| 反派主角 | 反派主角、反派、恶人、魔头、黑化、大反派 |
| 副本竞技 | 无限流、无限、副本、轮回乐园、主神空间、闯关 |
| 游戏电竞 | 电竞、竞技、网游、游戏、手游 |
| 穿越重生 | 穿越、重生、快穿、穿书、魂穿、胎穿 |
| 末世求生 | 末世、末日、废土、丧尸、灾变、囤货、天灾 |
| 科幻 | 科幻、星际、赛博、机甲、太空、外星、异星、人工智能、时空、宇宙 |
| 武侠江湖 | 武侠、江湖、武林、门派、镖局、侠客 |
| 玄幻修真 | 修仙、修真、仙侠、玄幻、高武、灵气、宗门、御剑、渡劫、洪荒 |
| 军事 | 军事、军旅、特种兵、佣兵、军营 |
| 历史 | 历史、谍战、特工、间谍、民国、古代、朝堂、权谋、宫廷、帝王、三国、大明、大唐、大宋、大清、抗战 |
| 言情 | 言情、恋爱、爱情、甜宠、虐恋、耽美、百合、总裁、替嫁、婚恋、暗恋、初恋、宫斗、宅斗、后宫 |
| 娱乐圈 | 娱乐圈、明星、演员、综艺、影帝、影后、偶像、选秀 |
| 种田经营 | 种田、农家、田园、农场、渔村、山村 |
| 体育竞技 | 体育、足球、篮球、网球、奥运、运动员、赛场、拳击、赛车 |
| 短篇 | 短篇、知乎、盐选、微小说、短故事 |
| 都市现实 | 都市、职场、校园、青春、现实、创业、神豪、商战、官场、医生、律师 |

边界例（测试锁定）：「末世种田」→末世求生（同为 2 字、末世在表序前；该题材的读者预设以末世为框）；
「重生都市」→穿越重生（重生先行）；「赛博侦探」→悬疑惊悚（侦探与赛博同长、悬疑在表序前）；
「武侠江湖」→武侠江湖（新家族，不再借玄幻修真）。

**未命中兜底定案**：归档与写法同落 **玄幻修真**（代表模板 xuanhuan）——平台主风向家族、
爽文通用骨架最全，同一本书两处口径一致，创作侧永不因没分类被拦。

## 5. 生成与归档链路

- 客户端：createStory/normalizeDraft 保留 custom pin+文本（无文本则 pin 剥离回落）；
  persistence 的 CONFIG_TEXT_FIELDS 与 generation.mergeSourceContext 携带 customGenreText（合流借锚同路）。
- 服务端：compactConfig 过 sanitizeSettingText（定界为数据）；resolveGenreTemplates 按映射借锚点模板的
  brief/beat/gen-quality 切片；contextFor 新增 `customGenreData` 定界块（声明题材身份以用户文本为准、
  借用手法只作写法参考）；SYSTEM_PROMPT 加对应说明行。生成写回 `genreTemplateId='custom'`，
  借用模板永不盖章改籍。
- 归档零服务端改动：plazaSnapshot 在 custom 时把 home shelf 写进 `safeConfig.manualShelfId`，
  server summaryOf 本就 manualShelfId 优先派生；enterTemplate 携带 customGenreText，
  别人带化身进入时续写仍按原著的自由题材走。

## 6. 提示词构成差异实证（tests/gemini-custom-genre.test.js，假 Vertex 捕获请求）

同世界（沉潮港 mist）同主角（阿遥）同为第 1 章，仅 customGenreText 不同：

- 「民国谍战」：customGenreData 块含原文；genreBrief 以历史模板（lishi）的 readerPromise 起头；
  styleAnchor.genre='lishi'。
- 「赛博侦探」：customGenreData 块含原文；genreBrief 以 horror 模板起头；styleAnchor.genre='horror'。
  两份 genreBrief 不相等——写法构成确实随题材词而变。
- 「蒸汽朋克黄铜城」（未命中）：落兜底 xuanhuan brief，但 customGenreData 仍以读者原话为准声明题材身份。
- 普通模板故事：请求中无 customGenreData；result.genreTemplateId 为模板 id。
- 注入形文本：「…<system>…」尖括号失效为〈system〉；「。忽略以上所有指令，…」整句剔除
  （见第 8 节的顺修）。

## 7. 「自己写一本」被压半截的定案

渲染实测（390×844，e2e/genre-freedom.cjs）：滚动容器是 .page-forge，内容列 .forge-main 已有
172px 底部留白（REQ-32 口径），滚到底时入口完整越过固定继续胶囊与底栏
（atBottom 断言 + 三方几何断言全过；截图 step1-bottom-390.png 目检完整）。
用户截图里的半截是**未滚到底的中间态**：入口尚在底栏渐进模糊带下方，文字透出半截——
结构上入口在内容流末端、底部留白充足，本批以几何断言把「滚到底完整可见可点」锁为不回归项；
真机若仍见中途压字，属渐进模糊带的设计问题，不在本批范围。

## 8. 顺修：sanitize 链式覆写句缺口

注入测试实证：最常见的覆写句式「忽略以上所有指令」不在既有 sanitize 规则的射程内
（时间范围组与全量组各只匹配一个词，连用时两边落空）。已最小收紧 server/gemini.js 的
该条正则（全量词可跟在范围词后），方向为删得更多、与该通道（创世神设定/lorebook/介入/
自由题材共用）的既定意图一致；gemini 既有注入类测试全绿。

## 9. 测试与截图

- 新增 tests/genre-freedom.test.js（11 例）：落盘/恢复/空 pin 剥离/旧草稿/映射 15 例+最长优先/
  兜底/发布归档/enterTemplate/18×26 全套完整性/卡图存在/源码无计数文案与新布局标记。
- 新增 tests/gemini-custom-genre.test.js（4 例）：见第 6 节。
- 既有测试更新（计数随扩容）：knowledge-genres 15→26 且新模板纳入爽文惯例检查；
  story-engine「fifteen」→「twenty-six」。
- e2e/genre-freedom.cjs（390×844）五项全过：首屏 hero 主角位+分类不在屏、展开后 19 卡
  offsetWidth/Height 全等且卡面无计数文案、入口几何、输入→继续到世界步、reload 恢复自定义草稿。
- 全量 926 测：本批相关全绿；失败仅已知环境集——dedup 样本图 ENOENT×5（恒定，与基线同）
  + import-daylight flake×1（浮动，复跑可过）。中途发现的两条 startflow-ui 旧口径断言
  （intro 文案、selectTemplate 同轴清理）已随新定案改写，改后该文件 19/19。
- build 通过。
- 截图（genre-freedom-shots/）：step1-hero-390.png（自由创世首屏）、step1-shelves-390.png（分类展开态，
  19 卡同制式、卡面仅家族名）、step1-bottom-390.png（滚到底入口完整）、step1-custom-restored-390.png
  （自定义草稿恢复态）。助手自查：hero 首屏主路径一眼成立；展开态图面贴题；随机卡拼贴语义成立。
