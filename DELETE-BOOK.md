# DELETE-BOOK 批次：删除自己的书（用户 2026-10-28 08:38 亲令）

基线 3128df9（全站迁移）。契约写入 DESIGN.md §28。本批只落本地提交，不 push、不 deploy（部署由父代理统一排队）。

## 需求与口径

用户原话：「现在还不能删自己不满意的书，加一个删除功能。」

- 入口两处：书架每本书的操作区 + 书籍详情（阅读器设定集）各加「删除这本书」。
- 二次确认弹窗写明书名与后果（全部章节、阅读进度、书签一并删除且不可恢复；已发布到广场同步下架），确认按钮用「删除《书名》」全名，不用含糊的「确定」。
- 服务端：登录 + 仅书主可删（他人删除不泄露存在性、与书库既有口径一致）、幂等；删除 = 云端书库写墓碑 + 广场发布同步清理 + 封面等附属数据清理。
- 不级联：由这条线合流/带入生成的产物是独立故事，不受影响。
- 本地态：成功即从书架移除；正打开被删的书则回书架（主页）；失败给人话错误且书保持原样。

## 实现

### 服务端

- `DELETE /api/library/stories/:id`（既有端点，`server/index.js` 路由内编排级联）：
  1. `plaza.removeForStory(identity, storyId)` —— 新增于 `server/plaza.js`：按「调用者 uid + sourceStoryId」找自己的发布，整条删除记录（不是 withdraw 标记），feed/详情/主页合集随之消失；无发布或重复调用返回 `{ removed: false }`。`server/plaza-store.js` 两套 store 新增 `deletePublication(id)`。
  2. `cover.remove(identity, storyId)` —— 新增于 `server/cover.js`：删该书的生成封面记录（`server/cover-store.js` 两套 store 新增 `deleteCover(uid, storyId)`）；与生成是否配置无关，只看 store 是否存在；幂等。
  3. `library.remove(identity, storyId)` —— 既有：删正文 head+chunks、索引摘除、写墓碑（`MAX_TOMBSTONES` 内滚动保留）。墓碑最后写，是整次删除的提交点：任一前置步失败 → 请求失败、不写墓碑、书还在，重试收敛（每步幂等）。
- 寻址纪律不变：一切记录按已验证身份的 uid 哈希寻址，非书主 DELETE 只写进调用者自己的（空）索引——书、发布、封面均不受影响，响应形状与删自己的不存在的书无区别。

### 客户端（`src/main.jsx`、`src/reading-location.js`、`src/styles.css`、`src/cloud-library.js` 既有 `deleteCloudStory`）

- `DeleteBookDialog`（App 级单例弹窗，两入口共用）：`ReadingDialog` 骨架 + 后果文案 + `button-danger` 的「删除《书名》」/ ghost 的「不删了」；进行中锁定关闭，失败把错误留在弹窗内。
- 书架入口：`LibrarySwitcher` 的 `wood-book-cell` 左下角新增 `.wood-book-delete` chip（红调，与右下「合流」chip 同显隐规律），只读书不渲染；经 `Home.onDeleteStory` 上达 App。
- 详情入口：`StorySettingsBook` 底部新增 `.settings-danger` 区（标题与按钮用 `--danger` 令牌，三套主题各自取值）；`Reader` 透传 `onDeleteStory`（先关设定集再开确认弹窗）。样式只用主题令牌：`.button-danger { background: var(--danger) }`、`.delete-book-copy strong { color: var(--danger) }`。
- `App.confirmDeleteBook` 顺序：登录态先 `deleteCloudStory`（服务端整删），成功才本地移除；`library-unavailable`（服务端未配置账号副本）例外放行纯本地删；其余失败保留书并在弹窗报错。本地移除同时：`readingStateWithoutStory`（新增于 `src/reading-location.js`）裁掉该书的阅读位置/书签并回写 localStorage（云端阅读状态随下一次同步整体覆盖）；`activeStoryId` 若指向被删书则落到剩余第一本或 null；当前路由正读被删书时 `navigate('home')`；toast「《书名》已删除。」。未登录与演示书（isDemo，从未同步）为纯本地删除。云同步 observe 观察到本地消失后会再排一次 DELETE，幂等无害。

## 验证

- 单元：全量 **627/627 通过**（基线 623 + 本批新增 4）。新增 `tests/delete-book.test.js`：
  - plaza `removeForStory`：只删调用者自己的发布、同 id 他人发布不动、详情转 404、重复调用 `{removed:false}`；
  - cover `remove`：删自己的记录、meta 回 none、他人同 id 封面保留、幂等；
  - `readingStateWithoutStory`：只裁目标书的位置与书签、不改输入对象、坏输入原样返回；
  - HTTP 组合（真实 `createServer` + 内存 store + 用户名注册）：匿名 401；非书主 DELETE 后书/发布/封面全在、墓碑只落调用者索引；书主 DELETE 一次清净（索引 0 本 + 墓碑 1 条、正文 GET 404、广场 feed 0 条、封面记录 null）；再删仍 200 且墓碑不重复。
- e2e 新增 `e2e/delete-book.cjs`（已挂入 `npm run test:e2e` 链，cloud-library 之后）：复用 cloud-library 的 fixture 服务器（真实服务 + 内存 store + 用户名登录），两本 fixture 书先同步上账号，然后——A 路：书架 chip 删除（断言弹窗后果文案 → 本地即时消失 → API 索引墓碑 + 正文 404 → 刷新不复活）；B 路：打开另一本 → 点中央呼出 chrome → 设定集 → 删除这本书 → 同一确认弹窗 → 回到主页空书架态 → API 第二条墓碑。**9/9 通过**，截图 `delete-book-shots/01-confirm-shelf.png`、`02-confirm-settings.png` 人工核对无误（弹窗文案、具名危险按钮、书架删除 chip 均在位）。
- 回归 e2e（本批触及面）：cloud-library 8/8、reader-chrome 全宽通过、journey 24/24（xvfb 下）、onboarding 18/18。
- `npm run build` 通过。

## 已知边界

- 服务端阅读状态 blob（云端书库 meta 的 readingState）里被删书的位置/书签不在 DELETE 时即时裁剪：客户端删除时已裁本地副本，下一次阅读状态同步会以本地为准整体覆盖云端；残留在云端的孤儿锚点不指向任何书、无界面入口可达。
- 已发布线的广场快照是自包含副本：删除后发布记录整条删除，读者侧随之 404；别人已「带化身进入」生成的副本是对方账号下的独立故事，按不级联口径保留。
