# PHONE-FIX 销账（§37）— 真机点验修复 + 素材接入批

基线本地 main 5b28eb6；本批只落码 + 本地提交，不 push 不 deploy。
验证总览：单元 **663/663**；build 过；截图 harness **55/55 断言、0 失败**（phone-fix-shots/，不入库）；
e2e：journey **24/24**、onboarding **18/18**、reader **30 PASS**、reader-chrome **46 PASS**、
visual **exit 0（72 captures）**、新增 keepalive **6/6**。
帧率环境：390 宽 headless Chromium（软件渲染），数值偏保守。

## A. 真机五条

- **A1 造世默认落点** ✔ 根因：草稿初始化器把模板墙首项（xuanhuan）静默填入并持久化，再入被当真选。
  改：草稿加 `templatePicked` 随保存落盘；恢复时仅当真点过（或旧草稿模板非首项）才进模板页。
  证据：onboarding 新增断言（新访造世无「换个家族」、点玄幻修真才进墙）通过；截图 forge-landing-l1-after-{360,390}.png、family-wall-after-430.png。
- **A2 头像裁切** ✔ `PictureCropper`（方形视口、拖动、缩放滑杆 1–3、圆形引导 + 44px 圆形实时预览），
  确认走 `bitmapRegionToSquareJpeg`（512 JPEG）→ 既有上传通道，服务端零改动；取消回编辑面。
  证据：crop-mid/crop-framed/crop-after-after-390.png；fallback-cover-shelf 图中头像位为裁后图。
- **A3 个人简介** ✔ 服务端 profile record 加 `bio`（≤120 字、计数、超限禁用保存、与显示名同面同存；
  `tests/profile-custom-server.test.js` bio 往返/上限/传图不丢 3 测）；本人 hero 显 bio 或可点占位
  「写一句介绍自己」，他人只显有内容的 bio。证据：bio-edit/bio-after-visitor-after-390.png。
- **A4 展台白角** ✔ 立绘三层 mask 交集（径向 ∩ 垂直 ∩ 水平渐隐带）把图底色长渐隐消融，主体区实心。
  量测：浅底立绘角均 14.9 vs 深底立绘 5.3（差 9.6 ≤ 12）；边界阶跃浅 3.6 / 深 2.4（≤12）；
  白主题角均 232.8（图未消失）。证据：stage-light/dark 改前改后对照 ×2 组 + 白/极光主题图。
- **A5 光晕高级化** ✔ 白椭圆探照灯退役：环境辉光（品牌紫 .26 → 青 .10）+ 身后柔光 + 脚下椭圆柔影（.48），
  中心不爆白、三主题成立。证据同 A4 对照组（改后图可直接看出白角消失与光感变化）。

## B. 素材接入（源 sw-prep/platform-assets，MANIFEST 口径）

- 转换：31 个 WebP 入 `public/art/`（PIL q82 method6），家族 9×2 档 25–99KB、回落封面 3×2 档 36–84KB、
  空态 6 张 5.7–15.7KB、等待图 82.1KB，合计 ≈1.4MB，与现行世界图同档。
- **B1 家族卡** ✔ .shelf-brick.has-art 图卡（cover 图 + 底部渐变压暗叠名，选中青环/随机砖不变）。
  证据：forge-landing-l1、family-grid-after-430.png。
- **B2 空态** ✔ 统一 `.empty-art` 插图卡（圆角 20px + 描边）：广场/书城/消息居中 104–116px；
  主页书架/上架/化身三处 96px `.profile-empty-art`。证据：empty-plaza/empty-messages/empty-profile-after-390.png。
  **如实标注**：书城空态代码已接入，但当前书城有官方书目、空态未触发，empty-store 图未取到（量测 storeEmptyArt=0）。
- **B3 等待图** ✔ GenerationOverlay 背景层 + 深色 scrim，既有断言（卡在视口内/进度条）全过。
  证据：waiting-overlay-after-390.png。
- **B4 回落封面** ✔ `fallbackCoverVariantFor`：仅无专属封面且状态 failed/none 且世界不适配
  （空/custom/未知 worldId）时按题材选东方/都市/星际，映射写进 DESIGN §37；pending 保持世界图 + chip；
  拿不准退回世界图。单测 +2（tests/cover-client.test.js 12/12）。证据：fallback-cover-shelf-after-390.png
  （custom 世界 + 玄幻模板的故事戴东方变体封面）。

## F. 设置区排版

✔ 一组一面板 + 发絲线分隔；组距令牌化（标题 margin [2,26,26,26]、标题→面板 8px）；
行高实测 [62,63,62,56,62,56,63,63]（min 56）；外观主题改等宽分段控件（ShellThemeSegments 与账号面板共用）；
退出登录独立面板置账号组后（红字、无副文）；滚到底末行与悬浮底栏间距 **21px ≥ 16**。
证据：settings-full/settings-appearance/settings-white-after-390.png。

## G. 粒子 + 图标

- **G1** ✔ `ParticleField`（Canvas、零新依赖）。落点/密度：主页展台 dust（14 微尘）、造世 forge（6 光丝/26 尘）、
  等待面 waiting（5/22）、广场页头 faint（3/12）、书城页头 faint、登录面 starfield（见 H）。
  开关：动效关/reduced-motion/save-data → 除 starfield 外整层不渲染（particles-off 对照图 + 断言 canvas 不在 DOM）。
  帧率实测（390 宽 headless Chromium 软件渲染）：广场页头 **60.3**、造世 **60.3**、等待面 **60.2**（干净重测值）。
- **G2** ✔ 展台 dust 档即光锥内缓升微尘，stage 对照图可辨、不抢人物。
- **G3** ✔ `burstParticles`（26 火花/950ms/同开关）：Forge 生成成功、广场发布成功、关注成功（取关不放）三接点。
- **G4** ✔ Icon 家族 +7（shield/logout/database/info/help/palette/megaphone，描边 1.8）：
  设置每行行首图标、消息三类页签图标（users/megaphone/sliders）、书架新建 tile 裸「+」换 plus 图标。
  数据活带为内容排版、非图标替身，保持不动（定案）。全程无 emoji 图标。
- 红线守住：阅读器正文/chrome、列表滚动区无粒子（harness + reader-chrome 断言）。

## H. 登录界面（最终口径）

**简洁高级。**（第一行按工单要求写基调。）
参考更正记录：第一版借《深渊坠落》开始界面、第二版借 mini-games 登录模块（构图留白 + 吉祥物状态机制），
两版均被用户亲口作废；最终不模仿任何参考，只做织界自己的：动态星空纵深 + 中央玻璃窗口。
- 星空：ParticleField starfield 模式——星点带深度（z）持续向观者流过，远小慢、近大快；
  克制口径：390 宽 **65 颗**（封顶 90）、细而疏、慢速；DPR ≤2、离屏/后台停。
  动效关/reduced-motion 时变静态星点（两帧一致断言过）——G1 例外，理由：星空是登录的底本身。
  动态证据：两帧 900ms 间隔 canvas 数据不一致断言过；帧率 **57.3–58.1**（同 G 环境）。
- 窗口：星空之上正中央一个玻璃窗（blur + 细描边），标题锁在窗内顶部（Logo + 织界 **34px** 实测 +
  STORYWEAVE 青色字距副标 + 一句 intro），表单/全部入口在窗内，诚实页脚在窗内底部小字；
  390 宽实测窗口 x=15 / w=360（左右留边）；键盘高度 520 时聚焦密码框 y=79–131 完整可见、窗口整体让位。
- 红线全保留：单框邮箱/用户名分流、Google、注册/验证码/找回三视图、报错、/api/auth/config 诚实页脚；
  主按钮高 54、Google 52（≥44 断言过）。三视图共用同一星空 + 同一窗口。
- 附带修复：品牌锁曾被 `.reading-dialog p`（特异性 0,1,1）压成 13.6px——前两版截图里标题一直偏小，
  本轮升特异性后实测 34px，如实记账。
- 证据：login-default/login-register/login-error/login-reset/login-white/login-aurora/login-static/
  login-keyboard-after-390.png + login-default-after-360.png。

### H 返修（呈现层，主助手亲看首版截图判定不合格后追加）

首版把 scene 做成了 ReadingDialog sheet 的内衬——不合格点：sheet 标题栏「登录与注册」+拖拽条
仍在、广场从 sheet 背后透出（不是全屏场景）；星空在截图里完全看不见（窗口几乎占满 sheet、
星场投影又中心加权，窗口四周的天空带里没有星）。返修只动呈现，表单内容/行为/口径一字未改：

- 挂载：未登录态改挂新增的 `AccountSceneDialog`——全屏 fixed overlay（role=dialog、
  aria-label 沿用「登录与注册」），body 锁滚动 / Esc 关闭 / 关闭后焦点回触发钮；已登录
  「我的账号」仍走 ReadingDialog。sheet 标题栏与拖拽条在登录面退役，✕ 改为场景右上角的
  玻璃圆钮（44px）。焦点归还的捕获顺序是承重的：先记下触发元素、再把焦点移给 ✕——div
  overlay 没有原生 dialog 的自动归焦，捕获晚了就会瞄准随自己一起卸载的 ✕（onboarding
  「Escape 归焦」首跑实败、按此修、复跑 18/18）。
- 几何：scene 升为全屏层（absolute inset 0），窗口 flex margin:auto 双轴居中——390×844
  实测中心 cx=195、cy=422（±0/±30 断言）；窗口改为内部滚动容器，max-height = 100%−96，
  顶/底各留 48px 天空带、左右各 20px；键盘高 520 时聚焦密码框完整可见（input y=234–286）。
- 星可见性：scene 背景渐变栈加一层**固定星屑**（27 个 1–2px 径向点、四角定点），作天空的
  远景基底，canvas 纵深流是其上的动层。理由：流场克制且中心加权，任意单帧四角可能暂空——
  基底保证任何一帧窗口四周都有星（首版 TR 定点曾被 ✕ 钮盖住，已挪到钮外实测可见）。
- 程序化证据（`phone-fix-shots/login-scene-run.mjs`、report-login-scene.json）：默认图四角
  72×72 区域按「亮度 >90 的连通簇 ≤16px 且峰值 ≥110」计星点——TL 1 / TR 2 / BL 1 / BR 1，
  合计 **5**；静态图同为 5；动/静两帧断言沿用（动 900ms 不一致、静 700ms 一致）；overlay 与
  scene 矩形 = 视口全幅、边缘命中测试落 overlay 内、原生 dialog 数 0，全部断言过。
  新截图：login-scene-after-390 / login-scene-static-after-390 / login-scene-error-after-390
  （+ login-scene-keyboard-after-390）。
- 回归：单元 663/663；onboarding 18/18；visual 72 捕获 exit 0；本 harness 全量 55/55、
  与原 report-after 逐条比对零回退。**recovery 0/4 与基线 c318579 同值**——stash A/B 实证
  （基线同四条、同错误），是本机环境下的既有失败、非本返修引入，如实记账不掩饰。

## I. 主页分享去重 + 文案预设

✔ 分享钮（氛围区 + 关注行各一处、同动作）开分享面板；「···」删复制链接项——本人菜单为空故
「···」钮整体撤掉（断言 count=0），他人菜单只剩「举报该用户」（断言不含复制链接项）。
面板预置文案（本人 + 有主化身实测全文）：
「我在织界养了一个化身「陆青禾」，陪我走进一个个故事世界。来看看我的主页 👉 @fix_author <主页链接>」
无化身/他人版按 §37 规则组装；链接沿用现行口径（origin + pathname + #/profile/<uid>），他人不带隐私参数。
复制后 toast「分享文案已复制。」+ 剪贴板全文一致断言过；系统分享仅 navigator.share 存在时渲染。
证据：share-panel/share-copied/share-menu-other-after-390.png。

## J. 预加载与页面保活

- 保活视图：广场 / 我的世界（书架）/ 造世 / 书城 / 我的主页（页面形态）五视图——首次访问后同挂
  main 下各自槽位、hidden 切换；他人主页窗口维持既有 SWR 单窗；阅读器不保活（K）。
- 滚动恢复：App 连续记录每视图 scrollY；导航瞬间先冻结旧视图位置 + 120ms 守卫防导航自身滚动污染；
  切回 rAF 恢复。实测：主页离开 300 → 回来 **300**（±0）；e2e keepalive 广场/书架两路 ±2 内。
- 状态保住：造世切走切回模板墙步态仍在（e2e 断言）；广场 feed 保活后 60s 静默刷新继续，
  主页走 profile SWR——切回无 loading 指示（harness + e2e 双断言）。
- 预取：首屏可交互后 requestIdleCallback 预热家族图 640×9 + 等待图 + 空态图×6（Image()，
  e2e 请求计数断言过）；已登录预热本人 profile 载荷（loadProfile）；书城列表为本地派生、无端点不新造；
  未登录不预取私人数据。
- 连带修复：①预取 effect 依赖引用后声明变量致 TDZ 白屏（已改直取 account.user 并留注释）；
  ②ProfilePage 的 shareOpen useState 位于两个 early return 之后、冷缓存进主页触发 React #310 崩溃
  （I 批埋点、本轮复现并修复：提到 hooks 区；stage 场景复测过）。
- 证据：keepalive-return-profile-after-390.png（切回主页即时态、已在原滚动位）+ e2e/keepalive.cjs 6/6。

## K. 阅读器独立顶层页面

- 改前：Reader 与各页同在 main 的互斥 page 渲染里（节点本身同级），但 Topbar/Sidebar/BottomNav
  在阅读时照常渲染压在阅读器之上（底栏仅组件内 null），他人主页窗口还能叠在来源页上——
  用户感知「阅读器是广场页面的第二层」属实。
- 改后：view=reader 时壳层只渲染 Reader（Aurora/Sidebar/Topbar/BottomNav 全不渲染，app-shell 加
  is-reader-top）；Reader 为 main 直接子节点、与保活槽位同级兄弟；进入时窗口层随 route 收起、
  无三层叠；退出回来源（广场线→详情、只读→书城、自有→书架），来源滚动按 J 恢复；
  直达/刷新无来源时沿既有出口（自有→书架、只读→书城）——与工单「回广场」一句的出入：
  既有 journey e2e 把自有书出口钉在书架（「我的世界」按钮名与断言），且书架即自有书的来源面，
  故保留既有口径并在此注明，未按字面改广场。
- 阅读器内部零改动。证据：e2e/keepalive.cjs——广场相邻路径（造世/书架/书城三路）断言
  .page-reader 不在任何 [data-keepalive] 槽位与任何 .page-* 子树内、无 topbar/sidebar/bottomNav/
  profile-window 共存、shell data-view=reader；reader 30 + reader-chrome 46 全过。

## 期待变更清单（已同步进测试并注明）

1. onboarding：A1 落点断言（家族总览、无预选）；草稿 deepEqual 剔除 restoredDraft 内部标记（J 挂载时机）。
2. visual：forge 动作可见性只量已渲染按钮（保活隐藏的造世不计）。
3. 新增 e2e/keepalive.cjs（J/K 断言）。

## 未决/如实标注

- 书城空态截图未取到（书城有官方书目，空态未触发；代码已接入）。
- 登录键盘量测 winTop 为负：窗口比 520 高度视口高、对话框滚动让位，聚焦字段完整可见——按工单
  「窗口要整体让位不被遮」以字段可见为准达标，窗口顶出视口属对话框滚动模型内。
- 本批未 push、未 deploy；线上仍为 00030 + 本地 5b28eb6 之后的本批提交，真机点验待用户。

## 附：recovery e2e 定点修复销账（批次后追加，只改测试未动产品）

基线 0c1d8c3 上 `e2e/recovery.cjs` 为 0/4（基线 c318579 同样 0/4，与登录返修无关）。逐条实证后失败形态与最初预判（双落点双命中）只部分吻合，实为三因各一，已按实证修：

1. **T2/T4（损坏/存储被拒）—「备份与恢复」strict 双命中，预判方向成立但落点不同**：实际报错 `resolved to 2 elements` = 存储 alert 自带的「备份与恢复」钮 + 书架页页脚钮（保活后同在 DOM；设置组落点未登录不渲染、未参与）。修法：`openBackup` 不再做可见性分支，恒走用户真实路径——`goto #/home` 后以 `footer` 作用域内的页脚钮进面板，双命中在任何存储状态下都不成立。产品双落点是 §36 定案，未为测试改产品。
2. **T1（备份恢复全流程）—与备份钮无关，是 J 保活的另一面**：草稿在建书后已被正确消费（探针实测 `hasDraft:false`），但保活的造世视图仍停在上一本的「确认你的故事」确认页（主钮为「进入第一章」），且回滚重走时身份已落定、合并的身份/出生点屏只需点一次「继续」——旧 helper 的「先点继续、固定点 4 次」两处都对不上。修法：进造世后若见确认页，先点步骤片「第 1 步：题材」（aria-label 实测值）回第一步；前进改为状态驱动（点「继续」直到「主角昵称」表单出现为止），全新（4 次）与回滚（3 次）两条路径通吃。
3. **T3（额度失败）—alert 是短命 toast 而非横幅**：探针实测「暂时无法保存」在首次保存失败时（约 +2s、向导途中）弹出、数秒内自动消失；旧用例在建书返回后才开始 `waitFor`，必然错过。修法：把该 alert 的 `waitFor` 提前到建书之前挂上、建书后兑现，其余断言（持久状态文案、导出内容、重试保存）不变。

验收：recovery 4/4、单元 663/663、onboarding 18/18 不回退。

**其余套件同类隐患排查（grep + 结构阅读，未复现、未扩围修）**：
- 「备份与恢复」标签仅 recovery.cjs 使用，多落点双命中风险不外溢。
- 固定次数「继续」连点的建书 helper 散见 avatars/control/import/intervention/reader-chrome/visual，但各自每个上下文至多完成一次创作（「进入第一章」各 1 次），暂不触发 T1 型陷阱；journey 同一上下文建两本，但第二本前有 `page.reload`（保活状态随之重置）且先等第一步标题，事实上已绕开；gemini 的多次「进入第一章」是同一开局屏的失败/取消重试且场景间换 context，非二次新建。
- 触发条件备忘：今后任一套件若在同一上下文、无 reload 地完成一本再建第二本，就会撞上 T1 同款陷阱，按本节口径（步骤片回滚 + 状态驱动连点）处理。
- 观察项：「继续阅读」无作用域点击散见 avatars/delete-book/edit-book/journey/keepalive/recovery，目前各视图只有一个同名钮；若将来广场等视图新增同名钮，会变双命中，届时按视图作用域收窄。
