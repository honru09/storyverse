# BOOKSTORE-PLAZA 批次处置（2026-10-29）

用户 2026-10-28 09:14 亲定模型 + 21:14 扩围落地：**发布 = 上架书城，广场 = X 式社交信息流**。本批只落码 + 本地提交，不 push 不 deploy，随建设期一次性上线。设计契约见 DESIGN.md §47。

## 模型落点

- **书城**（`GET /api/store`）：正式书目。分类按题材家族（`shelfId` 由 `genreTemplateId` 经 `shelfForTemplate` 读时派生、不落盘）；搜索匹配标题/作者/世界名子串；三排序——最新上架（publishedAt）、完本（completedAt、仅完结）、热门（shareCount + 该书帖子获赞总数，经 feed service 的 engagementByBook 守卫式 join）。**永不造假热度**：计数全是真实事件的反范式累计，被分享数只在 >0 时才印上卡。
- **广场**（`GET /api/plaza`）：全站一条时间流、最新在前、游标分页。两种帖：分享书帖（book_share，分享语 1–500 字 + 书卡片）与自由文字帖（free_text）。点赞 toggle（幂等翻转）、评论平铺（≤300 字；评论人可删自己的、帖主可删自己帖下任意评论）、举报满 3 个不同人隐藏（帖与评论同口径）。发帖入口 = 广场顶部一行占位「说点什么，或分享一本书…」点开才展开（渐进式披露）；分享书另有书城详情页「分享到广场」入口（编辑器预置本书）。
- **互动提醒**：被赞/被评论/自己书被分享的痕迹进消息中心「互动」类。实现走**派生**：social.notifications 从 feed 的 like/comment 记录现算（like 项 id `like:<postId>:<uid>`、comment 项带 excerpt/commentText），自己赞/评自己帖过滤，取消点赞自动撤回通知——不另建通知存储。
- **删帖不动书**：删分享帖只回滚该书 shareCount −1；书下架/删除后帖子保留，书卡读时解析为「已下架」占位（书记录消失时用帖子存的分享时标题快照 bookTitle 显示）。

## 取舍（与预研规格的冲突处，以用户亲定模型为准）

1. **物理集合不拆**：publication 记录仍在 `plaza_publications`、仍走 createPlazaStore；「书城/广场拆分」落在表面语义与 API（/api/store vs /api/plaza）而非复制数据。预研规格里另建集合的方案会让存量 2 条与全部既有链路（发布守卫、改名镜像、删书联动）双写漂移，不取。
2. **标题后缀是存量数据，不是显示拼装**（本批实查定案）：story-engine 的 `titleFor` 在故事创建时把标题拼成「题材名 · 主角名」写进 story.title，发布快照原样带出。清洗规则 = 只截精确尾缀 ` · ${avatar.name}`（共享纯函数 `cleanBookTitle`，src/plaza.js），落在发布路径 + 迁移脚本；用户主动改过的书名不含该尾缀，不受影响。
3. **热门口径**：预研曾提阅读数——站内没有可信的跨用户阅读计数（读是本地行为），不编造；热门 = 被分享次数 + 帖子获赞总数，两者都是服务端真实事件。
4. **旧路由保留兼容**：`POST /api/plaza/publish` 与 `GET /api/plaza/:id` 仍在（回 `{ publication }` 旧形状），`GET /api/store/:id` 为正主；客户端已全量切新 API。
5. **评分只留位**：详情页留空占位 `<div className="plaza-rating-slot">`，summary 带 ratingAverage/ratingCount 零值字段，评分与书评是下一批，不做半截。
6. **帖子 permalink**：`#/plaza/post-<id>` 落在广场流并置顶该帖（focusPost）；书 id 是 `pub-` 前缀，`post-` 前缀不会遮蔽书籍详情路由。

## 迁移（server/migrations/20261029_store_books_and_feed.mjs）

对存量 publication（线上 2 条）幂等执行：①标题清洗（record + snapshot 两处）；②落 shareCount/rating 计数零值；③固定 id 播种 2 条**真实**分享帖（官方完结上架帖 post-official-sample-01、pangboya 分享帖 post-user-pangboya-01，文案为真实上架/简介内容，点赞评论真 0）；④按现存 active 分享帖重算 shareCount。CLI 先冷备份全部 publication 到 `server/backups/plaza_publications_pre_store_feed_<ts>.json` 再迁移，可重跑。**尚未对生产执行**——随一次性上线时在 Cloud Shell 带 `DATA_STORE=firestore` 运行。

## 数据与接口新增

- `server/plaza-feed-store.js`：posts/comments/likes 三集合（memory + firestore 双实现），键公式 postKeyFor/commentKeyFor/likeKeyFor(postId,userUid)；like 与 comment 反范式带 postAuthorUid + postExcerpt 供消息中心派生。
- `server/plaza-feed.js`：createPlazaFeedService（feed/postDetail/engagementByBook/createPost/deletePost/toggleLike/reportPost/listComments/createComment/deleteComment/reportComment）；发帖与评论都过 findSettingViolation 红线扫描；作者身份活解析与书城同口径。
- `server/plaza.js`：summaryOf 加 shelfId/shareCount/rating*；新增 books() 目录查询、bookCardFor()、adjustShareCount()。
- `server/social.js`：createSocialService 新增 feedStore 入参（默认自建），notifications 派生 like/comment 项。

## 验证

- 单元 759/759（基线 752 + 本批新文件 tests/bookstore-plaza-server.test.js 6 个：cleanBookTitle、书城过滤/搜索/排序、信息流全链+通知、删帖不动书+下架占位、发帖守卫+举报隐藏、迁移幂等）；`npm run build` 过。
- e2e `e2e/bookstore-plaza.cjs`（夹具 bookstore-plaza-shots/dev-server.mjs，内存共享装配）：书城浏览→详情→分享到广场→流里出现书帖→另一用户点赞+评论→作者在互动里收到两条提醒，全链一条 PASS。
- 截图（390×844，bookstore-plaza-shots/）：01-store 书城首页、02-store-detail 书城详情、03-plaza 广场流（分享帖+成功 toast）、04-composer 发帖编辑器（分享页签预置本书）、05-notifications 互动提醒。广场流的自由帖在断言里验了 DOM 文本（首屏被置顶分享帖占住，未单独成图）。
- 施工中修掉的一个真 bug：评论接口服务端读 `content`、客户端发 `text`——服务端已兼容两者（text 优先）。
