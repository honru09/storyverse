# PROFILE-ENRICH 销账（DESIGN §35，个人主页丰富化落码批）

基线 fdc7653（§33 PROFILE-FIX + §34 账号收尾）之上落码。设计规格 = 用户亲批样稿
`~/workspace/sw-prep/profile-mock/`（mock.html + REFERENCES.md 参数表 + render-own/other.png）。
本批只提交本地 main，**未 push、未 deploy**——等用户看真截图拍板，与 §33/§34 一次上线。

## 逐项销账（样稿分区 → 实现落点 → 数据来源 → 证据）

| # | 样稿分区 | 实现落点 | 真实数据来源 | 证据 |
|---|---|---|---|---|
| 1 | 氛围顶区（立绘虚化底+染色+压暗、脸锚头像 74、名+主化身 chip、@handle、bio） | `src/main.jsx` ProfilePage `<header className="profile-hero">`；CSS `.profile-hero*`（§35 块） | 主化身立绘 = payload `avatars` 中 isMain 条的 portraitUrl（无参 portrait 路由）；头像走既有 picture 链（上传图→主化身立绘脸锚→默认头像） | own-page-{black,white,aurora}-390.png、other-window-*-390.png |
| 2 | 数据活带 作品/上架/粉丝/关注 | `.profile-stats`（作品/上架为静态格、粉丝/关注沿用 §33 活门名单按钮） | 作品：本人页 = App 注入的本地书架 `library.stories` 条数；他人页 = 服务端 `counts.works`（与 publications 同源）；上架 = `counts.publications`；粉丝/关注 = follows 名单计数 | harness 断言：本人页 [3,2,1,1]、他人页 [2,2,1,1]、空号 [0,0,0,0] |
| 3 | 动作行（自己=编辑资料；他人=关注/已关注+分享） | `.profile-actions`；关注钮未关注走品牌紫渐变、已关注回落 `.btn-pill-white.is-following` 静默态；分享为 48px 圆钮（顶栏分享入口保留） | viewerState.isFollowing / toggleFollow 既有链 | other-window-*.png（已关注态）、own-page-*.png |
| 4 | 书架区（封面横排立木层板、书名+状态/进度副行、点书进详情、「全部 ›」） | `.profile-shelf` 区 + `ProfileShelfStoryBook`（本人）/`ProfileShelfPubBook`（他人）；层板 `.profile-shelf-plank` 渐变 #7A5233→#54381F→#3E2812 与书架页同族；倾斜复用 `shelfTiltFor`、副行本人 `shelfMetaFor` / 他人广场状态口径（连载压为「连载中 · N 章」、完结取「已完结 · 全 N 章」，全标在上架卡） | 本人 = `ownStories`（仅自己主页实例由 App 注入 `library.stories` + `openOwnReader`，窗口实例永不注入）；他人 = publications（广场可见性同源）；封面：本人 StoryCover 同书架页来源链、他人 ProfileCoverArt（专属封面→世界图） | shelf-closeup-390.png、own-page-black-bottom-390.png |
| 5 | 上架区（小卡：封面+书名+状态 chip+进度/章数） | `ProfileStoreCard` + `.profile-store-*`；本人区头「管理 ›」→ plaza-publish | publications（plazaSummaryOf + coverUrl 活解析，既有） | own-page-black-bottom-390.png（连载绿 chip「赛博 · 更新至第 13 章」、完结灰 chip「修仙 · 第 1 季 · 全 24 章」） |
| 6 | 化身区（聚光展台+名牌+现驻、收藏排点选切换、新建仅本人） | `.profile-stage profile-avatar-stand` + `.profile-avatar-row`；选中态 `stageAvatarId` 按 uid 记入视图状态（二访恢复） | payload 新增 `avatars` 全收藏（见下「服务端」）；现驻 = 服务端按名匹配该化身最新公开线的 worldName 推导 | stage-main-390.png / stage-second-390.png（点选切换+现驻 青岚宗→霓虹下城 实测） |
| 7 | 空态（无书/无上架/无化身、avatar 为 null 回落） | `.profile-empty` 三区各自渲染；顶区无立绘时不渲染 bg 图层（回落染色+地面）；他人无化身整区不渲染 | 账号存在性走 §34 口径（200 空主页） | empty-own-390.png（0/0/0/0 + 三空态 + 默认头像） |

## 服务端（server/social.js + server/index.js）

- profile 载荷新增 `avatars` 数组：{id, name, description, appearance, isMain, hasPortrait,
  portraitUrl?, currentWorld?}。收藏读取 `avatarCollectionOf`：store.getCollection 优先、
  否则 collectionFromRecord(getProfile) 归一（legacy 单化身同路）。
- `counts.works` = publications.length（与 publications 同源同数，他人页口径）。
- 现驻推导：publications 已按 publishedAt 降序，按快照 avatar 名建 Map（首见=最新），
  匹配化身名取 worldName；无公开线则字段**省略**（雾银在只发主化身线时无现驻，不编造）。
- portrait 按化身取图：`GET /api/users/:uid/portrait?avatar=<id>` 经 imageSlotFor 解析槽位
  （主化身恒 'current'、其余 `<id>:current`）；收藏中不存在的 id 回 404 不回落主图；
  无参行为一字不变（既有广场/头像链零影响）。
- 客户端缓存兼容：旧缓存载荷无 avatars 时，用主化身 avatar 合成单条收藏渲染，刷新后补全。

## 与样稿的两处有意偏差（均经截图实测后定）

1. **展台 mask 收紧**：样稿参数 mask 74%→97% 在真实立绘上仍露出浅色矩形边（stage 特写实锤）。
   生产改为「图形椭圆」mask（88%×96%、55% 实心→84% 透明）+ 氛围层压暗（brightness .30）+
   暗角渐晕 + 一层极弱同图光晕（opacity .22），读感对齐样稿渲染图的「暗场光池」：
   矩形完全消解、人物立于光中。参数与理由已写入 DESIGN §35 语境（CSS §35 块注释）。
2. **书架副行压缩**：86px 宽的书格装不下广场全标（「连载中 · 已更 13 章」必截断），书架行压为
   「连载中 · N 章」/「已完结 · 全 N 章」；全标保留在上架卡副行（空间足够）。

## 数据真实性对照（harness 种子 + API 实测，profile-enrich-shots/report.json）

- 作者 enrich_author：化身 2 位（陆青禾=主、雾银），公开线 2 条——《借火登天》（陆青禾，
  修仙季篇 24 章完结，世界 青岚宗）、《霓虹账本》（雾银，无限连载已更 13 章，世界 霓虹下城）。
- API 载荷实测：counts = {works:2, publications:2, followers:1, following:1}；
  avatars[主].currentWorld = 青岚宗、avatars[雾银].currentWorld = 霓虹下城（逐一对上最新公开线）；
  /api/plaza 记录 2 条，与上架数一致。
- UI 实测：他人页数据带 [2,2,1,1]、书架 2 本、上架卡 2、展台现驻 青岚宗；
  本人页（本地书架种子 3 本 = 2 条公开线 + 1 条未发布《雾桥夜话》）数据带 [3,2,1,1]、
  书架 3 本 + 开新书格 1、上架卡 2、展台切雾银后现驻 霓虹下城；
  空号 enrich_quiet 数据带 [0,0,0,0]、三空态、顶区无氛围图层。
- harness 断言总计 59/59 通过（含三主题×自己/他人、360/430 窗口、开窗/关窗滚动保全
  520→520、他人页零新建入口、现驻推导、骨架外计数）。

## 既有成果回归（不得回退项）

- 他人窗口滚动保全（开 520 保持、关恢复 520，三主题+360/430 各测一轮）✔
- 320ms 对称退场、二访缓存、底栏四格、令牌收编、作者胶囊脸锚：本批未触碰其实现，
  shell-migration 测试全量通过背书 ✔
- 退役项（§35 写死）：段控 合集/全部、合集拼贴、书架搜索/排序 UI 拆除；
  profile-boards.js 纯函数与测试保留备查。shell-migration 中 §27 扇形拼贴与 §33 展台/骨架
  三处钉点已按 §35 supersede 更新并注明。
- 新单元测试：social-server 新增 §35 载荷/按化身 portrait/currentWorld 用例；
  两处 counts deepEqual 同步加 works。单元全量 654/654 ✔

## 截图集（profile-enrich-shots/，不入库）

own-page-{black,white,aurora}-390.png、own-page-black-bottom-390.png、
other-window-{black,white,aurora}-390.png、other-window-black-{360,430}.png、
empty-own-390.png、stage-main-390.png、stage-second-390.png、shelf-closeup-390.png。
全部由主执行者逐张亲看（氛围顶区融合、展台矩形消解、层板、三主题成立、空态诚实）。

## e2e

2026-10-28 本地真服务（AUTH_ENABLED=false, PORT=8899）+ xvfb 四套全过：
visual（exit 0，72 CAPTURE、零 fail/error）、journey 24/24、onboarding 18/18、
intervention 7/7。
