# RATINGS 批次处置（2026-10-29）

评分与书评落地：五星 + 可选文字评价挂**书城的书**（publication），不挂广场帖。设计契约见 DESIGN.md §49。本批只落码 + 本地提交，不 push 不 deploy，随建设期一次性上线。

## 口径落点

- **一人一书一评**：评分记录键 = (bookId, userUid) 的哈希（`server/book-ratings-store.js`，集合 `book_ratings`，memory + firestore 双实现）——唯一性是存储层事实。再评 = 改同一条：星与文字一起改，`createdAt` 不动、只动 `updatedAt`（列表行显示「已编辑」）。可删自己的评（删后重算，再删回 404 不装成功）。
- **不能评自己的书**：服务端 `rate` 硬挡 400（作者身份取自书记录的 authorUid，不信请求）；客户端对自己的书不渲染表单，只留一句说明。未登录 POST 回 401。
- **均分**：`ratingSummaryFor` 从评分记录现算（一位小数在客户端 `ratingAverageText` 统一取整显示）；每次写评/删评后由评分服务重算并 `syncRatingSummary` 镜像到 publication 记录——记录是真源，书上的 pair 是缓存；重上架时 publish 保留既有 pair 不清零。没评的书卡面不印分（`ratingCount > 0` 才渲染），详情区显示「还没有人评价」空态，不编造。
- **热门排序的评分位置（定案：贝叶斯收缩）**：`heat = 被分享数 + 帖子获赞 + 均分 × 条数/(条数+10)`（`RATING_PRIOR_STRENGTH = 10`）。1 条 5 星 ≈ 0.45，压不过 1 次真实分享；3 条 5 星 ≈ 1.15 才越过 1 次分享；条数越多均分越接近全额入账。均分本身在其他任何地方只展示、不参与排序。单测以「1 分享 vs 1 条 5 星」「3 条 5 星反超」两段断言钉死曲线方向。
- **评价提醒（派生，不轰炸）**：评分记录反范式带 `bookAuthorUid`/`bookTitle`，social.notifications 从记录现算 `kind: 'rating'` 的互动项（id `rating:<bookId>:<userUid>`，`at` = 记录 createdAt）。改评只更新同一项里显示的星/文（读活记录），id 与时间不动、不产生新未读；删评删记录，项随之撤回——与点赞/评论同一套派生纪律，不另建通知存储。
- **不设读过门槛**：书城是公开书目，登录即可评；站内没有可信的跨用户阅读记录，为一个门槛去建阅读上报不值当。此为本批明确取舍，记录在案。
- **文字评价**：可选，≤300 字（码点计），过 sanitize + 既有 setting-guard 红线扫描，与评论同口径；无举报/隐藏机制（评价不是帖子，本批不做，作者可经既有渠道举报整本书）。

## 连带修复：书城保活视图的陈旧计数

e2e 首跑实锤：书城是保活视图（§37 J），在详情页评完分返回书城，卡面仍是进详情前拉到的旧数据——均分（以及被分享数等一切卡面计数）都不会自己更新。修法：App 把当前 route 对象作 `resumeSignal` 传给 Store，导航产生新 route 对象时 Store 静默重拉（不清空现有卡、不动筛选与滚动）。只加信号不改保活架构；广场流原有 60s 静默刷新口径不变。

## 数据与接口新增

- `server/book-ratings-store.js`：`book_ratings` 集合；`ratingKeyFor(bookId, userUid)`；get/put/delete + listRatingsByBook / listRatingsByBookAuthor。
- `server/book-ratings.js`：`createBookRatingsService`（rate / remove / list）；评分人身份活解析与 plaza-feed 的 personOf 同口径（资料名 > 快照名、@ID 回落登录名、头像走上传→立绘→默认链）。
- `server/plaza.js`：新增 `syncRatingSummary`；热门 heat 加收缩后的评分项；`RATING_PRIOR_STRENGTH` 导出。
- `server/social.js`：新增 `ratingsStore` 入参，notifications 派生 rating 项；`NOTIFY_ACTIVITY_KINDS` 加 'rating'。
- `server/index.js`：`sharedRatingsStore` 与 social/ratings 双服务共享（同 sharedFeedStore 纪律）；`createServer` 新增 `ratings` 注入点；路由 `GET/POST/DELETE /api/store/:id/ratings`（GET 公开、带凭据附 viewerRating/viewerIsAuthor；写删需登录）。
- 客户端：详情页原 `.plaza-rating-slot` 占位由 `BookRatingsSection` 接管（均分+星+条数、评价列表游标分页、打分表单含改/删、作者/未登录两态）；书城卡 meta 行带分；消息中心互动文案加「评价了你的书」+《书名》· N 星 + 评价摘录。**无需迁移**：存量 2 条 publication 的 rating pair 已由 BOOKSTORE-PLAZA 迁移落零值，新评分自动点亮。

## 验证

- 单元 774/774（基线 768 + 本批 `tests/ratings-server.test.js` 6 个：均分纯函数、创建/均分上书/唯一性编辑/删除重算、自评硬挡+登录+星值+300 字+红线+404、游标分页、通知派生（改评静默/删评撤回）、热门收缩曲线）。相邻套件（notifications/bookstore-plaza/social/friends/plaza）53/53 无回归；全量中途曾出现 1 个不复现的单发失败（两次重跑全绿，记为存量 flake 观察项）。
- e2e `e2e/ratings.cjs`（夹具 ratings-shots/dev-server.mjs）：A 上架 → B 在详情打 5 星 + 写评 → 详情均分/条数/评价列表出现 → 书城卡带 ★ 5.0 → B 改 4 星（服务端断言仍只 1 条、均分 4）→ A 在互动里收到「评价了你的书」且显示当前 4 星，全链 PASS；`e2e/bookstore-plaza.cjs` 复跑 PASS（Store 刷新改动无副作用）。
- 截图（390×844，ratings-shots/，已亲看）：01-detail-ratings 评分区（5.0+表单预填+评价行）、02-store-card 书城卡带分、03-detail-edited 改评后 4.0 与「已编辑」标记、04-notifications 互动提醒。
