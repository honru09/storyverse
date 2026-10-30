# DEVICE-FIX2 — 真机点验第二批处置笔记（REQ-27…33）

来源：用户 iPhone 14 Pro（393pt）点验 00043 后直报，台账
`~/workspace/sw-prep/requirements-2026-10-29/REQUIREMENTS.md` REQ-27…33。
验证台：`device-fix2-shots/`（fixture server + seed.mjs 生产字符串播种 +
shoot2.mjs 量测，79/79 断言全过；该目录不入库）。本批只落码提交，不部署。

## F1 编辑资料草稿制（REQ-27）

- **成因**：`EditProfileSheet` 的文本字段本就是本地 state（保存才 PUT），
  但四个控件即时落库——头像来源点选即 `updateMyProfile({pictureKind})`、
  头像裁剪确认即 `uploadMyPicture`、头图裁剪确认即 `uploadMyBanner`、
  恢复默认头图即 `deleteMyBanner`，且每次都回调 `onSaved` 刷新父级，
  所以没点保存也生效。
- **改法**：窗内全部改动只存草稿 state（`stagedPictureKind /
  stagedPictureUpload / stagedBannerUpload / stagedBannerReset`）；
  裁剪确认只暂存处理好的图片 payload（预览用 data: URL）；`save()`
  是唯一写路径（先暂存图上传、再删头图标记、最后 PUT 资料）；
  关窗即丢弃、零写请求。注记：保存中途某一步失败时，先落的上传即
  新存储态（与任何多步保存相同），资料 PUT 失败会报错且不关窗。
- **验收**（shoot2 F1）：改昵称+选化身头像+暂存头图后关窗——拦截到的
  写请求 = 0，重开窗与主页均为旧值；走保存路径后新名落主页。

## F2 化身展示大卡裁头（REQ-28）

- **成因**：`.profile-stage` 是 aspect-ratio 3/4 但带 `max-height:560px`，
  在宽列下被高度封顶压扁趋横（用户截图量测比 ≈1.38），`object-fit:
  cover` 随即裁掉头顶。另：立绘契约是竖幅 3:4（server/avatar.js
  imageConfig），旧式全身像比例不一，cover 对任何非 3:4 立绘都不安全。
- **改法**：封顶由高度改宽度（`width:min(100%,420px)`，420×4⁄3=560
  同一上限，框永不变横）；主图改 `object-fit:contain` 全身必入框；
  同图放大模糊垫底（`.profile-stage-backdrop`，cover+blur 26px）填满
  留边，与盐系氛围一脉；底部渐变与铭牌不动。极光只动这张卡的媒体
  拟合，未动其冻结 token/材质。切换缩略图的脸锚裁切未动。
- **验收**：展台量测 361×481（比 0.750）三主题一致；标记立绘（顶红带=
  头区、底蓝带=脚区）在 3:4 契约图与 9:16 旧图、393×852 与 390×844
  下双带同框（像素探针+亲看截图）。

## F3 主题默认迁移（REQ-29）

- **事实**：主题存 localStorage `storyweave:shell-theme`，唯一写路径是
  设置里的 `storeShellTheme`；主题系统上线前壳层只有极光一种外观，
  历史上从未记录「显式选择」与「残留」的区分。
- **判据（定版）**：自本版起 `storeShellTheme` 盖显式标记
  `storyweave:shell-theme-explicit=1`；一次性迁移（标记
  `storyweave:shell-theme-migration=device-fix2-aurora-residue-v1`）：
  存量 `aurora` 且无显式标记 = 历史残留 → 改写回默认 `black`。
  只迁 aurora（black 本即默认；white 在选择器出现前不存在，存量
  white 必是点选）。迁移只跑一次；之后用户重选极光会盖显式标记，
  永不再被迁。`public/theme-init.js` 逐字镜像同一逻辑防首帧闪烁。
- **验收**：单测 tests/theme-migration.test.js 6 条全过；浏览器复核：
  残留极光开站落 black（dataset=black、底栏悬浮胶囊、body 背景
  rgb(16,16,18)），显式极光保持 aurora。

## F4 书城卡真机崩坏（REQ-30，REQ-21 复发）

- **成因**：作者行里只有显示名可缩（min-width:0+省略号），@handle 是
  `flex:none`、官方徽章与「作者」标签不可缩，盐系玻璃壳 10px 内边距
  又收窄内容宽——固定方吃满后显示名被压到 1 字。元信息行各段继承
  `flex:none;white-space:nowrap` 拒绝收缩、行无 overflow 约束，整行
  按自然宽绘出卡外；各行 min-content 反过来撑大卡片最小宽，是
  WebKit 下网格跨列重叠印刷的成因链。REQ-21 的守卫只钉了 nowrap，
  没钉子段收缩纪律，且死在短 fixture 数据。
- **改法**（书城作用域）：卡片 `overflow:hidden` 硬裁剪（任何像素不
  出卡）；显示名 `flex:0 1 auto;min-width:4em` 保底 4 字；@handle
  改 `flex:1 1 0%;min-width:0` 先行收缩（极窄时省略号，详情页有全称）；
  元信息行 `overflow:hidden` + 子段可缩省略，篇幅段 `flex:none` 保全；
  ≤380px 档再收 gap 与名保底 3.5em。
- **验收**：生产真实字符串 fixture（织界官方+@storyweave+官方徽章、
  regression_1029b 长名、★ 5.0 · 1 条评价、连载中 · 已更 1 章 /
  第 1 季 · 全 24 章 · 被分享 1 次同卡三段齐全）在 393/390/430 ×
  黑/白/极光下：每卡每元素 containment=0 外溢、相邻卡 bbox 不相交、
  织界官方名宽 = 60px（4 字保底恰达）、最挤卡元信息 scrollWidth ==
  clientWidth（149/149）。

## F5 他人主页窗顶部（REQ-31）

- **核查结论**：窗口没有独立硬编码色板——`.profile-window-sheet`
  背景走 `--profile-bg`，三主题均别名到当前主题 token，窗口挂在同
  文档 `.app-shell` 内、跟随 `html[data-shell-theme]`。用户观感落差
  来自下两条，不是主题不跟随。
- **成因**：①空白带——窗口内 `.page-profile` 仍带整页形态的
  `padding-top:calc(8px + env(safe-area-inset-top))`（≈55px），拖拽柄
  `.profile-window-grab` 又是流内一条，hero 的负 margin 只抵页面
  padding、抵不到柄区；topbar 按钮落在 hero 自带 padding 处，正骑
  接缝。②污渍影——回落糊化图（blur 26px + brightness(.52)）按暗
  主题调校，深色立绘糊完在浅色面上成居中深色团。
- **改法**：grab 改绝对定位覆层（贴窗顶、柄加阴影保浅色图上可见）；
  窗口内 page-profile padding-top 归零、hero margin-top 归零——头图
  直达窗顶圆角下，关闭/分享按钮完整落在头图区内；糊化回落（仅
  `:not(.is-clear)`，不碰上传/默认清晰头图）按主题罩 opacity：
  白 .5 / 黑 .85，极光不动。
- **验收**：pangboya 形态（无头图、深色立绘回落）在黑/白两主题
  393 宽：sheet 顶与 hero 顶间隙 = 0，×/分享按钮 bbox 完整在 hero
  内，sheet 计算背景随主题（黑 rgb(16,16,18) / 白 rgb(237,234,227)），
  白主题截图亲看无深色污渍团。

## F6 造世「继续」悬浮胶囊化（REQ-32，用户亲令）

- **成因**：`.forge-actions` 在 ≤1049px 是 `position:sticky` 坞带，
  但它恒是造世列最后一个流内元素、父级到它为止——sticky 没有
  行程，等于流内定位，位置随内容高度与滚动漂移。
- **改法**：≤1049px 整段换 `position:fixed` 悬浮胶囊（left/right
  16px、max-width 720px 居中、实色面+浮影+999px 圆角）；bottom 按
  底栏几何分主题：极光整条底栏顶边 62px → `calc(72px + safe)`，
  黑/白悬浮胶囊顶边 72px → `calc(82px + safe)`；`.forge-main` 加
  底部 padding 防末卡被遮；旧 sticky/裙边规则删除。≥1050px 侧栏
  布局保持流内不变。同 bar 内的「进入第一章」「上一步」同口径
  恒位；forge 内无其他同型流内主按钮条。禁用态同位置灰置。
- **验收**：步 1 与步 2+ × 滚动 0/到底共 4 次量测 bbox 完全一致
  （x16 y702 w361 h68，pos=fixed）；e2e/forge-trim 的滚动契约同步
  更新为 REQ-32 口径（gap=82px 恒定）后 6/6 通过。

## F7 全站横向溢出清零 + 输入防放大（REQ-33）

- **溢出成因**：与 F4 同源的卡内溢出是真凶之一（已在 F4 收口）；
  逐页程序排查（广场/书城/主页/造世/详情 × 393/390/430）后其余
  「出界」元素全部定性为被祖先硬裁的设计内出血——极光氛围 blob
  （`.aurora-bg` overflow hidden 包裹）、主页头图糊化层（`.profile-
  hero` 裁）、脸锚裁切图（各 frame overflow hidden）、详情氛围画
  （`.detail-ambience` 裁）、分类 chips（自身横滚行内）——均不能
  移动页面。定性明细在 device-fix2-shots/probe-overflow.mjs。
- **兜底**：壳层加 `html,body,#root{overflow-x:clip}`（clip 不建
  滚动容器，sticky 顶栏不受影响）；兜底不替代 F4 卡内断言。
- **放大成因（实锤）**：`src/account.css` 登录场景覆写
  `.account-scene .account-form input{font-size:15px}`，小于 iOS
  Safari 的 16px 聚焦放大线——聚焦即放大、登录跳转后缩放残留。
  按用户追加口径全站统一：审计全部 CSS 后共 9 处 <16px 文本输入
  覆写（登录 15、广场发帖 15、评论 14、书城搜索 15、编辑资料
  15/15、好友搜索 15、加好友 14、兑换码 14）全部改 16px；另在
  styles.css 末尾加全局地板规则（text/search/email/password/
  number/tel/url/无类型 input + textarea + select 一律 16px）兜
  未来组件。介入 textarea、阅读查找 input 本就 ≥16（基线 16px /
  1rem），在地板覆盖内。
- **验收**：五页 × 三宽程序断言 scrollWidth ≤ innerWidth 且无未裁
  剪出界元素（79 项总断言内）；Chromium 全站可见文本输入计算字号
  审计（书城/广场/发帖展开/编辑资料窗）全 ≥16px；**WebKit 引擎**
  （iPhone 14 Pro 设备描述）真实登录全程：登录框计算字号 16、
  聚焦与登录落地广场 visualViewport.scale 恒 = 1，另抽测书城
  搜索、广场发帖框聚焦后 scale 仍 = 1。
  （本机 WebKit 曾缺系统库：以 noble .deb 解包补齐 Playwright
  bundle 的 sys/lib + mesa EGL surfaceless 软件渲染后跑通，
  配方见 shoot2.mjs 注释。）

## 测试与守卫

- `npm test`：**840/840 全绿**（基线 828 + F3 迁移 6 + 本批守卫 6）。
  新增 tests/theme-migration.test.js（F3 判据）、tests/device-fix2
  .test.js（F1 单一写路径、F4 收缩钉、F5 覆层、F6 fixed、F7 兜底
  与字号地板）；tests/shell-migration.test.js 的 F2 两处旧拟合守卫
  按 REQ-28 换钉（cover→contain+backdrop、max-height→宽度封顶），
  极光冻结断言一字未动。
- e2e：bookstore-plaza PASS、ratings PASS、avatars 8/8、friends
  6/6、forge-trim 6/6（滚动契约已按 REQ-32 更新）、intervention
  7/7、visual 全矩阵 capture 完成。
- fixture 量测：device-fix2-shots/shoot2.mjs **79/79**（Chromium
  75 + WebKit 4），截图同目录（不入库）。
