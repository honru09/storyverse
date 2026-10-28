# COVER-FIX 销账（2026-10-28，基线 91aecf8）

用户真机报障两件，同在一张广场卡上：①《疯狂的王兴润》的卡面与详情头图显示螺旋星图，不是本书封面；②卡上作者胶囊里的小圆图与左侧化身大图同人二现，且胶囊下方拿化身属性串顶替简介。逐项销账如下。

## ① 封面归位

**诊断（先复核再动手，全部实证）**：
- 生产 API 实查：publication `pub-520dce23-7d8` 的记录**有** `coverUrl: /api/plaza/pub-520dce23-7d8/cover?v=2`；该端点实取为 200 / image/jpeg / 178,817 字节 / 768×1052 的本书专属封面（本批复核时再次 curl 实证，与主助手先行实证一致）。**数据是对的，病灶在客户端。**
- 服务端链路本身完好：`summaryOf` 带 coverUrl 字段；`withAuthorIdentity`（server/plaza.js）读时按（authorUid + sourceStoryId）从封面库现算——源故事画过/重画过封面，卡面自动跟上，不需要重新发布；端点 `cover(id)` 无记录时回 null → 路由 404，**端点从不回落图冒充封面**。
- 客户端的病灶：广场卡（`PlazaCard` 的 `.plaza-card-cover`）与详情头图（`.plaza-detail-cover`）**直接渲染 `<WorldArtwork genreId>`，从未读 publication.coverUrl**。而主页上架小卡 `ProfileCoverArt` 早已是 coverUrl 优先——同一本书在主页是对的、在广场是错的，病灶定性为图源选择漏接，不是数据也不是端点。

**修法**：新增共享组件 `PublicationArtwork`（src/main.jsx），全站同一条链：**coverUrl（本书专属封面）→ 世界图 → 题材回落图（WorldArtwork 内部）**；coverUrl 存在时先渲染它，**只有图片本身加载失败（onError）才降到世界图**，失败标记随 coverUrl 变化重置。接入三处：广场卡封面、详情头图（eager）、ProfileCoverArt（主页书架/上架小卡改走同一组件——顺带补上它此前缺失的加载失败回落，此前 coverUrl 若 404 会直接破图）。

**同函数其他表面核查**：
- 书架本架、书籍详情、分享卡：展示的是**本地故事**，走 StoryCover（鉴权 object URL 通道），与 publication 链是两套机制，无此病。
- 发布选线卡（plaza-pick）、合流选线卡（MergeLineCard）：行对象是本地 story 而非 publication，没有 coverUrl 字段，不在本链范围，未动。
- 书城排行榜/书目网格（book.snapshot 派生）：本地目录数据、非 publication 记录，无 coverUrl；其图源口径属书城×广场改造批，未动。
- 「关注动态」横排（PlazaAvatarThumb）：已复核——那是关注作者动态条，头像是作者账号图（身份标记），旁边没有形象大图，不构成同卡重复，未动。

**点名（任务点 4）**：官方示例线 `pub-ff498576-b52`（《沉潮港纪事 · 沈知遥》）——feed 实查 **coverUrl 为 null**，其 cover 端点实查 **404**：它的源故事**从未生成过专属封面**，卡面上的沉潮港城市图是世界图合法回落，不是客户端跳过、更不是端点兜底冒充。本批不动它；若要官方线也有专属封面，属部署后的运营动作（以官方账号给源故事生成/重绘封面，coverUrl 会自动亮起）。

**发布侧核查（任务点 3）**：发布记录落 `sourceStoryId: story.id`，coverUrl 在读时现算——发布流程不需要、也没有单独的「带封面」步骤；源故事在封面库里有图，发布当刻起卡面即带 coverUrl（生产 pub-520dce23-7d8 记录带 `?v=2` 即为实证：封面重画到第 2 版、发布记录自动跟版）。结论：发布侧稳定，无代码改动。

**连带修掉的真 bug（fixture 实证发现）**：lead 卡双列网格第一列恒为立绘预留——当最新发布的化身**没有立绘**时，封面被挤进 112px 空列、标题逐字竖排。修法：PlazaCard 以 `leadWithPortrait` 判定网格是否成立（hasPortrait 为假、或立绘 onError 时经 onFail 回报退回普通单列卡），制式写死进 DESIGN §41。

## ② 作者位（追加令）

- **摘小圆图**：PlazaCard 作者行内的 PlazaAvatarThumb 撤除——lead 卡左侧已有化身形象大图，同卡不许同人二现（第一规则）。详情页化身面板的图不动（那是化身自己的位置）。
- **改作者署名行 `.plaza-byline`**：展示**作者本人**——「作者」字距标签 + 作者显示名（publication.authorName，本就由服务端按 profile record 现算）+ @ID + 官方标（金色小标，与站内官方色同语言）；整行可点进作者主页窗口（沿用 onOpenProfile），右侧留 chevron；无主页入口时退化为静态行。本人发布时「我发布的」chip 保留在行右。视觉制式：无药丸底、发丝线在行下与下方 chips 分隔，字阶 11 标签 / 15 名 / 12.5 @。
- **@ID 数据**：feed/detail 新增 `authorHandle`（server/plaza.js 的 summaryOf 透传 + withAuthorIdentity 现算）：profile record 认领的 handle 优先（走 social 的 publicHandle，邮箱形值永不作 handle）；用户名账号取登录名（uid `username:<name>` 后缀，与主页解析同口径）。客户端在 @ 与显示名相同（忽略大小写）时不重复展示——真实个案 pangboya 即此形，署名行只出名字一次。
- **官方信号去重**：meta 行原「官方示例」徽章撤下——官方标已进署名行，卡上一处即可（第一规则）；详情页头部的完整官方说明不动（不同表面）。
- **简介行换真简介**：lead 卡署名行下方原属性串（`{化身名} · {appearance}`）撤除，改共享函数 `plazaCardIntroFor`（src/plaza.js）：publication.synopsis 优先（作者自写简介，如「王兴润成神之路！」）；无简介时取世界大纲主线段——拼装时刻意剔除化身 appearance（属性串是设定表、不是介绍），并剪掉主线段尾部的进度句（「已完结，全 N 章」与 meta 行重复，第一规则）；再无则不渲染。化身属性串在详情页化身卡里照旧，不丢信息。

## 记账（本批不动，归书城×广场批）

标题后缀同名问题：《疯狂的王兴润 · 王兴润》的标题后缀与左侧立绘名牌同为化身名，加上署名行的作者名，一卡三处人名相望——其中标题后缀属发布数据的标题口径（书城×广场批的数据口径范围），本批只记账不动。作者位本身已按本批口径只呈现作者一次。

## 验收

- 单元 **699/699**（基线 687；新增 12：cover-fix 接线断言 7、plaza-shared 的 plazaCardIntroFor 3、plaza-server 的 authorHandle 2）。
- 服务端新断言：用户名作者 feed/detail 的 authorHandle = 登录名；认领 handle 经桩 socialStore 实证优先于 uid 回落；无封面时 coverUrl 恒 null。
- Fixture 真服务验收（cover-fix-shots/run.mjs，真 HTTP + 内存存储全套服务，种子为真形状数据）**12/12**：feed A 带 coverUrl/authorHandle、B 无封面为 null；390 宽下 lead 卡封面 img src === coverUrl、署名行文案「作者 封面作者 @cover_author」且行内无图、整卡不出现属性串、简介行 === 作者 synopsis、无封面卡回落世界图、详情头图 img src === coverUrl、网络层打坏封面后回落世界图（onError 门实证）、无立绘 lead 卡网格退回单列。
- e2e：journey **24/24**、visual **exit 0**（期待变化：无——卡面在 e2e 种子里均无专属封面，链的下两级行为与改前一致；byline 在 journey/visual 中无既有断言点）。
- 截图（cover-fix-shots/，不入库）：plaza-after-390.png（lead 卡全宽专属封面 + 署名行 + 真简介）、detail-after-390.png（详情头图为专属封面）、fallback-after-390.png（封面打坏后世界图回落）。

DESIGN 同步：§41（封面链写死、lead 网格成立条件、卡片作者位口径）。
