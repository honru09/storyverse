# DEVICE-FIX — 2026-10-30 真机走查批（用户 10 张截图直报，基线 40d4ec6）

执行纪律：一次一个写手；改完 `npm run build` 再跑 e2e；单测全绿（基线 818，只许增不许减）；截图 390×844、禁 fullPage；每条修复都要有量测或守卫测试，不许只改不验。极光（aurora）主题 token 一字不动（SALT 既有守卫）。

## A. REQ-24 编辑资料：删掉不可改的 @用户名行
- `EditProfileSheet`（src/main.jsx ≈7225–7440）：当 `idLocked` 为真时，**整段 @用户名 `<label className="profile-edit-field">` 不渲染**（连同「用户名是注册时定下的 @ID，不能修改。」说明）。未锁定（尚无 @ID 可认领）时保留可编辑字段与可用性检查，原行为不变。`save()` 本就不发 handle（锁定态），不动。
- 理由（用户原话）：「这个如果不能修改，就别放在编辑里。」

## B. REQ-25 阅读器返回回来源页
根因：广场信息流「继续阅读」卡（PlazaFeed → `onOpenStory={openOwnReader}`）进的是普通 `#/reader/<id>` 路由，无来源标记；`Reader.goBack` 对自有书恒回 `home`。用户路径：广场点卡 → 阅读器 → 返回 → 落到主页（首页 hero），逻辑错误。
修法（来源标记，复用 detailOrigin 先例，不动 URL 结构）：
1. `openOwnReader(storyId, options)` 把 `options.from` 透传给 `navigate("reader", { storyId: id, from: options.from })`；`navigate` 的 reader 分支把 `from` 放进 route 对象（仅内存 route，不进 hash——刷新后丢来源可接受，回落现行默认）。
2. PlazaFeed 的 `onOpenStory` 接线改为 `(storyId) => openOwnReader(storyId, { from: "plaza" })`（App 渲染 PlazaFeed 处，≈11203）。广场内其他直达阅读器入口若有同 shape 的一并带上。
3. Reader 渲染处计算 `backRoute`：`route.plaza` → 现行 plaza-detail（不变）；`route.from === "plaza"` → `{ view: "plaza" }`，`backText="返回广场"`。`goBack` 优先 backRoute 的逻辑已存在，照用。
4. 验收：e2e 或组件测试钉死——从广场续读卡进阅读器，点返回落回广场；从主页进阅读器返回仍回主页；plaza-read（详情进）返回仍回详情。

## C. REQ-26 文字噪音清扫（用户点名：书城 caption 为例，全站同类删）
删除以下**页面级解释性标注**（功能性提示——加载/错误/费用/扫描警告/下架后果/操作后果——一律保留）：
1. 书城页 caption「正式书目——走完的故事线在这里上架，广场上分享的也是这里的书。」（Store, page-caption）
2. 广场页 caption「读完的世界、想说的话，都在这里流动。」（PlazaFeed, page-caption）
3. 主页同步说明「书架已同步到你的账号，换设备登录就能接着读。」（syncNote 成功文案——整条不再在主页渲染；失败/异常提示保留）
4. 书籍详情「发布时已脱敏：作者的私有设定与未公开分支不会出现在这里。」（世界设定面板尾注）
5. 书籍详情「带化身进入时，你的新线会沿用这套骨架，走向由你的选择分叉。」（主线节拍面板说明）
6. 书籍详情化身卡「这条线，是这个化身一步步走完的。」（与「作者的化身」chip 重复）
7. 广场「关注动态」副标「你关注的人最近在广场说了什么」
8. 上架页顶部整段规则说明（page-caption 长段）——流程内的扫描警告、下架后果说明保留原位。
保留清单（不许删）：各 loading/错误状态、进入费用提示、上架扫描警告、下架后果、自己的书不能评分、节拍溢出说明、手写书无进入/合流说明、主页欢迎语、广场主标语。
验收：grep 钉死上述 8 条文案不再出现于 src/；相关 UI 测试同步更新。

## D. REQ-19 主页头图：新默认图 + 可上传自换
现状：`.profile-hero-bg` = 主化身立绘 `filter:blur(26px) brightness(.52)` 糊化放大——无化身/立绘不合适的用户就是一团糊（用户截图实锤）。
1. 新默认头图：`public/art/banner-profile-1600.webp`（+800w 版）——「万千世界织锦」横幅画（主助手另行生成交付，生成前先用 banner-store 图占位开发、文件到位后换路径即可）。无自定义头图时 hero 背景用它（清晰呈现，只保留既有 tint/shade 渐变保证文字对比，不再 blur 糊化整图）。
2. 解析顺序：用户上传头图 → 化身立绘（现行糊化处理可保留为回落）→ 新默认头图。准确口径：有上传用上传（清晰 cover）；没上传但有主化身立绘时仍可用立绘糊化氛围（现行为）；两者皆无 → 新默认图清晰呈现。
3. 上传通道（照头像 picture 全套克隆）：social-store 加 `bannerKeyFor/getBanner/putBanner/deleteBanner`（Firestore collection `profile_banners`，memory 版同步）；social.js 加 `saveMyBanner`（校验同 picture：JPG/PNG、≤1MB、magic bytes）+ `banner(uid)` 字节解析 + profile payload 加 `banner: { kind: 'upload'|'avatar'|'default', url }`（upload 时 url=`/api/users/<uid>/banner?v=<bannerVersion>`，default 时 url=`/art/banner-profile-1600.webp`，avatar 时 url=null 表示前端用 portrait 糊化）；profile record 加 `bannerVersion`。
4. 路由：`POST /api/me/profile/banner` + `GET /api/users/:uid/banner`，挂进 server/index.js 既有分发（照 picture 两条的位置）。
5. 前端：hero 背景按 `profile.banner` 渲染（upload/default → `<span class=profile-hero-bg style=backgroundImage>` 不带 blur filter 的清晰版 class；avatar/缺省 → 现行糊化立绘）；EditProfileSheet 在头像区下方加「主页头图」一行：预览缩略 + [上传图片] [恢复默认]，上传走**横幅裁剪**（复用 PictureCropper 的拖拽/缩放骨架，裁剪框改 3:1 横幅、圆形遮罩改矩形；输出走 canvas 降采样 ≤1600×533 JPEG 再 POST）。裁剪组件参数化：加 `shape: 'circle'|'banner'` 与目标宽高比 prop，头像路径行为不变（既有测试钉死）。
6. 验收：server 测试（未登录 401、错格式 400、上传后 GET 字节一致、他人主页 payload 带 banner url）；UI 测试（编辑窗出现头图行、默认态 hero 用新图、上传态用上传图）；390 截图：无化身新号主页（默认图）、honru 主页（立绘回落）、上传后主页。

## E. REQ-20 书架摆正 + 按钮不被层板压
1. 摆正：`--tilt` 全站恒 0——`LibrarySwitcher`（≈1163）、主页 profile shelf（≈7796/7824）不再传 tilt（或 shelfTiltFor 改为恒 0 并更新 tests/shelf.test.js 的 seeded 断言为恒 0 断言）；CSS `.wood-book{transform:rotate(var(--tilt,0deg))}` 与 `.is-leaning` 的 +6deg 一并摘除（leaning 逻辑删除）；`.profile-shelf-cover` 的 rotate 同摘。点书抽出动画（is-pulled 的 translateY/scale）保留。
2. 按钮行：用户截图中木架书下方「删除/合流」胶囊被层板压住下半。查 `.wood-shelf` 行结构：动作行须在层板**之上**的流内（z-index/次序），行高留足（动作行 margin-bottom ≥ 层板顶边 + 4px）。量测验收：动作按钮 boundingBox 底边 < 层板顶边（DOM 断言），390 截图亲看不压。

## F. REQ-21 书城双列卡同高同基线
根因：`.store-book-card` 非 flex 列；简介 1–3 行伸缩、byline 可换行、chips/meta 条件渲染，整卡高度随内容漂移，同行两卡封面以下逐行错位。
改固定制式（整卡 `display:flex;flex-direction:column;height:100%`，grid 行高由最高卡决定后全行拉齐）：
- 封面：现 4/3 不变。
- byline：单行不换行（name 省略号、handle 超长省略），高度恒定（min-height 按一行 + 既有 padding/border）。
- 简介：恒占 **2 行**高（line-clamp 2；无简介时以空行占位渲染同高空 `<p>` 或 min-height 占位），行高 1.6×13px×2。
- chips 行：恒一行高（无世界 chip 时也占位），meta 行恒一行（无评分/分享时占位空行）。
- 结果：同行两卡 byline 基线、简介首行、chips、meta 逐行对齐（DOM 量测：同行两卡各行 top 差 ≤1px，写进 e2e/组件测试）。
广场卡（PlazaBookCard 等同 shape 的卡面）若复用同一 body 结构，同规处理；独立结构则本批只动书城，广场记账。

## G. REQ-22 排版松绑三处
1. 首页续读 hero 底部簇（aurora.css `.hero-starmap` + `.hero-actions`）：星图条与按钮行之间距 16→20px；星图条内 padding 加大（12px 14px 8px → 14px 16px 12px）；「下一章已备好/待生成」状态与星图点阵拉开（gap ≥12px，状态胶囊不贴边）；主按钮与合流 ghost 同行时高度一致（ghost padding 对齐主按钮盒高），窄屏换行时整行距 ≥10px。390 截图：按钮文字不贴边、状态点与文字不挤。
2. 读者评价卡（`.book-ratings` 系列）：面板内 padding 16→20px；空态行（图标+文案）与打分行间距 ≥14px；打分星行高加大（pick 按钮 padding 4px 5px）；表单脚（字数/按钮）与输入框间距 10→14px。
3. 作者化身卡（`.plaza-avatar-panel` + `.plaza-avatar-frame.is-large`）：大图框 76px 方框内，上传图/默认图**不再** 50% 12% 顶锚裁切（该锚只许 portrait 立绘）；非 portrait 时 `object-position:50% 50%` 且不缩放，portrait 继续脸锚缩放。框背景改透明（摘 `--medal-bg` 垫色），图填满框、无灰边。面板 gap 14→16px、上下 padding 随 plaza-panel 20px 对齐（见 2 的面板 padding 若全站 plaza-panel 统一改 20px 则此处自动跟随——二选一，别重复改）。
验收：三面 390 截图 + 化身卡三种图源（upload/portrait/default）各一张。

## 交付
- 批注文件 DEVICE-FIX.md 末尾回填逐条处置与量测数字；DESIGN.md 补 §52 记本批口径（头图解析顺序、书架摆正 supersede 微倾斜、书城卡固定制式、文字噪音删除清单）。
- 单测全绿 + `npm run build` + 受影响 e2e（shelf/store/profile/reader 返回流）通过；截图存 device-fix-shots/（不入库）。
- 提交信息：`DEVICE-FIX: banner upload + straight shelf + store card format + reader back-origin + text-noise sweep`，push 前 `git show --stat HEAD` 核清单（不许带 *-shots/）。

## 执行回填（2026-10-30，执行者自测 + DOM 量测，390×844）

- **A. REQ-24 ✔**：`idLocked` 时编辑窗整行不渲染 @用户名 label（连说明小字）；未锁定路径与 checkHandle 原样；save() 不发 handle 未动。量测：真机式 fixture 编辑窗 innerText 含「@用户名」= false、含「主页头图」行 = true，文件输入 = 2（头像 + 头图）。守卫 tests/device-fix.test.js。
- **B. REQ-25 ✔**：openOwnReader 透传 options.from（spread 形）、navigate 把 route.from 穿过 hash 重解析保留（内存字段，hash 结构未动）、Reader backRoute 新增 from==="plaza" → {view:"plaza"}、backText「返回广场」。量测（真实点击流）：广场续读卡 → 阅读器 → 状态行返回钮 aria-label=「返回广场」→ 落回广场续读卡 ✔；主页 hero → 阅读器 → aria-label=「我的世界」→ 落回主页 ✔；详情 → plaza-read 路径原样（backRoute=plaza-detail，未动）。
- **C. REQ-26 ✔**：8 条按文件原话逐条删除，`grep` 于 src/ 零残留（守卫 tests/device-fix.test.js 钉死 8 条原文 + 保留清单抽样：自己的书不能评分、下架后果、节拍溢出「章节拍，进入后逐步展开」、广场主标语、未登录同步风险提示、loading 文案均在）。syncNote 改为登录态恒 null（主页与 LibraryTools 两处均不再渲染成功文案）。连带更新 e2e/cloud-library.cjs：原断言已删文案的检查改为「已同步书架无 .library-sync-note」。
- **D. REQ-19 ✔**：全链路落地——social-store（bannerKeyFor/bannerSourceFor + memory/Firestore profile_banners）、social.js（saveMyBanner/deleteMyBanner/banner 字节解析、payload banner 字段、editable.hasBanner、bannerVersion 在 saveMyProfile/saveMyPicture 重建记录时保留）、index.js（POST/DELETE /api/me/profile/banner、GET /api/users/:uid/banner、userMatch alternation 加 banner）、users.js（uploadMyBanner/deleteMyBanner/bitmapRegionToBannerJpeg ≤1600×533）、PictureCropper shape 参数化（circle 行为与既有测试不变）、EditProfileSheet「主页头图」行、ProfilePage hero 三态渲染。默认图 `public/art/banner-profile-1600.webp`（+800w）已由主助手交付到位。量测：新号 hero = is-clear + url(banner-profile-1600.webp) + filter none；有立绘号 hero = 立绘糊化（blur(26px) brightness(.52)，回落原行为）；UI 上传后 hero = is-clear + url(/api/users/<uid>/banner?v=1) + filter none。服务端测试 tests/profile-banner-server.test.js（401/伪造 magic 400/超限 400/上传后 GET 字节一致/他人 payload 带 ?v=1/改名保存不清除版本/再传 v=2/删除回默认 + GET 404）全过；profile-custom 的 fresh-user 测试已同步 hasBanner 与默认 banner 断言。
- **E. REQ-20 ✔**：shelfTiltFor 恒 0（tests/shelf.test.js 改恒 0 断言）、LibrarySwitcher/profile shelf 摘 tilt 与 is-leaning、CSS 摘 .wood-book rotate 与 .profile-shelf-cover rotate（tests/list-layout-ui.test.js 改 doesNotMatch 守卫）。量测：getComputedStyle(.wood-book).transform = 'none'；动作按钮底边 1116.9 < 层板顶边 1124.9，间隙 8px（≥4px 规格）。
- **F. REQ-21 ✔**：StoreBookCard 固定制式（卡 flex 列 height:100%、body flex 列 flex:1；byline 加 store-book-byline 单行 21px、handle 省略；intro 恒渲染 2 行槽 min-height 41.6px clamp 2；chips store-book-chips min-height 28px；meta store-book-meta margin-top:auto）。量测（书城首行两卡）：卡 top 差 0px、卡高差 0px（均 280.3）、byline/intro/chips/meta 各行 top 差全 0px、行高 21/41.6/28/29 两卡一致。广场帖卡为独立结构，本批未动（记账：如后续要求同规，另批处理）。
- **G. REQ-22 ✔**：① hero：.hero-starmap margin-top 20px、padding 14px 16px 12px、.storymap-mini gap 14px；`.hero-starmap + .hero-actions{margin-top:20px}`；ghost 按钮 min-height 50px + padding 12px 16px 与主按钮同高（截图亲验双按钮等高、状态胶囊不贴边）。② 评价卡：`.plaza-panel.book-ratings{padding:20px}`（scoped，未动全站 plaza-panel——按文件「二选一」取 scoped 解）、空态 margin-bottom 14px、pick padding 4px 5px、form-foot margin-top 14px；量测 computed padding = 20px。③ 化身卡：panel gap 16px + 上下 padding 20px；frame 背景改 transparent；img 默认 object-position 50% 50% 不缩放，.is-portrait 独占脸锚。量测：portrait 作者 frame = is-portrait、objectPosition 50% 12%、transform matrix(2.05…)、frameBg rgba(0,0,0,0)；无立绘作者 frame = objectPosition 50% 50%、transform none、frameBg 透明。
- **测试与构建**：单测 827/827 全绿（基线 818 + 新增 9：profile-banner-server 2、device-fix 7；另同步更新 shelf/list-layout-ui/shell-migration/cover-fix/profile-custom 五处既有断言至新规格）；`npm run build` 成功。e2e：reader 33/33、reader-chrome 41/41、cloud-library 8/8、bookstore-plaza 全链 PASS、ratings 全链 PASS、avatars 8/8。已知本地基线失败未触碰（journey、gemini 分享/合流超时、recovery、title-flow/write-mode 本地 AUTH 断言），与本批无关。
- **截图（device-fix-shots/，390×844，非 fullPage，不入库）**：01-profile-default-banner / 02-profile-avatar-banner / 03-edit-sheet（无 @行 + 头图行）/ 04-banner-cropper（3:1 矩形框）/ 05-profile-uploaded-banner / 06-store-grid / 07-detail-avatar-portrait / 08-detail-ratings / 09-detail-avatar-default / 10-home-hero / 11-home-shelf / 12-plaza-continue，量测原文 measurements.txt 同目录。化身卡三图源：07=portrait 脸锚、09=default 居中；upload 图源在化身卡上与 default 同规则（50% 50% 不缩放，CSS 同一路径），未单独出图。
- **口径备忘**：aurora 主题 token 一字未动（aurora.css 仅 .hero-starmap 两行间距值，属 REQ-22 规格内）；渐进模糊未应用于任何表面；未碰部署/Cloud Shell。
