# BUGHUNT-FIX 处置笔记（2026-10-29）

基线：main ce1791e（READER-SETTINGS-FIX，未回退）。来源：显示 bug 猎手报告
`~/workspace/regression-designer/BUGHUNT-2026-10-29.md`（BH-01…BH-11）+
素材二期 21 张（`~/workspace/sw-prep/platform-assets/MANIFEST.md` 二期节）。
全部量测在本机 fixture（bookstore-plaza-shots/dev-server）+ 构建产物上以猎手
同款方法（computed color / scrollWidth vs clientWidth / Range 行盒）复验；
探针与截图在 `bughunt-fix-shots/`（probe.cjs / probe2.cjs / probe3.cjs /
probe4.cjs / login360.cjs + *-report.json）。

## 逐项处置

### BH-01 主页续读 hero 白昼暗字压深封面 —— 已修
- 根因：`.hero-copy` 是固定深色玻璃面（rgba(10,20,48,.55)），其文字却用壳
  主题墨色，白昼主题下为 rgb(23,24,28)，猎手实测对比度 1.02。
- 修法（压图文字族统一口径）：共享 `:root` 新增压图专用固定浅色 token
  `--on-art:#f5f7ff` / `--on-art-dim:rgba(216,226,250,.82)`，三主题不翻转。
  `.hero-copy` color、`.hero-copy>p`、`.resume-position` 改走 on-art；
  h1 em 渐变停靠点在 hero 内改固定亮色组（#6ee7ff/#a78bfa/#f0a6ff）。
- 复验（三主题 × 390）：h1 与 resume computed color 均为 rgb(245,247,255)；
  对 hero 玻璃面（压在中等明度封面像素上合成）的对比度 **11.73**（三主题
  同值；修前 1.02）。截图 home-hero-white-390.png / home-hero-black-390.png。

### BH-02 弱提示反向色（.library-sync-note / .avatar-fields-hint）—— 已修
- 根因：共享别名 `--ink-soft: var(--surface)` 把「柔墨色」接到了**面色**
  token——全站仅此 2 处使用且都是 color:，于是提示文字永远穿着背景的
  颜色家族，三主题全灭（猎手量测：白昼下与底色同为 rgb(247,247,244) 级）。
- 修法：`--ink-soft` 改指 `var(--dim)`（全站搜过该 token，仅此 2 个消费
  点，无其他牵连）。
- 复验：sync note 三主题 computed color = 各主题 --dim（白 rgb(93,96,104)
  对 #f7f7f4 对比度 **5.64**；黑 rgb(167,167,173) 对 #050507 ≈**8.6**；
  极光 rgb(169,185,218) 对 #060d1f ≈**9.5**）；fields hint 黑/白两主题同
  值。截图 avatars-studio-black-1440.png（hint 可读）。

### BH-03 合流页 .merge-art-label 白昼暗字 —— 已修
- 修法：补 `color:var(--on-art)`（原只有 text-shadow 无 color）。
- 复验（白昼 390）：computed color rgb(245,247,255)（修前 rgb(23,24,28)）；
  截图 merge-white-390.png，双图标签均为白字。

### BH-04 广场续读卡双图平铺 —— 已修
- 修法：续读卡（54×72）调用点只取 `coverSources(...)` 的首张；同时
  WorldArtwork 改为「sources 有 1 张走单图、2 张才成对」，小缩略位再
  也不必绕。大图面（主页 hero、合流页）的双图用法不变。
- 复验：卡内 `.world-art-pair` 数量 **0**、img 数量 **1**；
  截图 plaza-white-390.png（单图）。

### BH-05 造世界步卡标题白昼暗字 —— 已修
- 修法：`.world-card`（背景 #0a1430 恒定）color 改 on-art；
  `.world-card-copy small` 与 `.world-card>svg` 改 on-art-dim；钩子句 em
  在卡内钉固定亮青 #6ee7ff（原 var(--cyan) 在白昼为深青，同族问题）。
- 复验（白昼 390）：卡 bg rgb(10,20,48)、标题 strong rgb(245,247,255)、
  small rgba(216,226,250,0.82)。截图 forge-worlds-white-390.png。

### BH-06 书城封面标题 8 字仍省略 —— 已修
- 根因：分档字号是定值，不看封面实际宽度（猎手：sw170 > cw145@390）。
- 修法（不动 plazaTitleTierFor 及其锁定测试）：`.plaza-card-cover` 加
  `container-type:inline-size`，标题字号改为
  `min(档位上限, (100cqw − 内距) / (字数 × 1.07))`，字数由 StoreBookCard
  以 `--title-glyphs`（标题字数 + 《》2）注入。×1.07 是实测安全系数：
  本机 CJK 字体 hinting 会把小字号字形进位向上取整（8.53px 字排成
  9px/字；猎手环境 16.5px 排成 17px/字），恰好 1em 的公式仍会溢出约
  5.5%；真 1em 字体上至多小 7%。
- 复验（sw ≤ cw 为过线）：

  | 标题 | 360 | 390 | 430 |
  |---|---|---|---|
  | 《阿灿的绝密档案》（原《王兴润的绝密档案》，发布时按主角名清洗） | 134≤134 · 13.91px | 145≤145 · 15.06px | 165≤165 · 16.5px（档位上限） |
  | 《长夜将明时谁在门外站了整整一夜》（17 字） | 134≤134 · 7.37px | 145≤145 · 7.97px | 165≤165 · 9.07px |
  | 《二十四桥明月夜玉人何处教吹箫声声慢》（19 字） | 134≤134 · 6.59px | 145≤145 · 7.13px | 165≤165 · 8.12px |

  截图 store-banner-black-390.png（两张长题卡封面标题完整单行、无省略号）。

### BH-07 广场续读卡标题差 6px 截断 —— 已修
- 修法：卡 padding-inline 14→12px、gap 14→12px、标题字号 16→15.5px。
- 复验：strong sw **228** ≤ cw **228**（修前 226 > 220）。

### BH-08 「我的世界」卡副行尾字孤字成行 —— 已修
- 修法：副行章节尾段（`第 N 章` / `第 N / M 章`）包进
  `.mine-row-tail{white-space:nowrap}`，整段换行不拆字。
- 复验（长标题种子，逐字 Range 行盒）：行宽 **[252, 203]**，尾段完整
  落在第二行末（修前猎手实测 256/255/**12**，「章」孤字成行）。
  截图 plaza-minerow-white-390.png。
- 量测注记：本机 Chromium 里 `NodeFilter.SHOW_TEXT_NODE` 为 undefined，
  TreeWalker 会退化成 SHOW_ALL 把元素当文本节点返回（Range offset 按
  子节点数计），逐字量测必须用字面量 4 + nodeType 双检——probe3 已按
  此写法，后续探针沿用。

### BH-09 桌面化身行描述被徽标挤截断 —— 已修
- 修法：`.avatar-main-badge` 移入名字行（新增 `.avatar-card-name-row`
  flex：名字 + 徽标同行），描述恢复整行宽度。
- 复验（1440，黑/白）：主化身行徽标在名字行内（badgeInNameRow=true），
  描述 sw **213** ≤ cw **213**，与无徽标行同宽（修前 156 > 148 独短一截）。
  截图 avatars-studio-black-1440.png。

### BH-10 壳顶栏透印 —— 已修
- 修法：三主题 `--topbar-bg` alpha 提到近实：极光 .72→**.93**、黑
  .78→**.94**、白 .82→**.95**（桌面侧栏共用此 token，连带同样变实，
  可接受）。未引入全屏 backdrop-filter（性能红线）；`.topbar` 原有
  局部 blur(16px) 保留未动——猎手量测读作 none 与本地 computed 不符，
  疑为其探针读到的元素/状态不同，本修复不依赖该模糊，二者如实记录。
- 复验（白昼，滚动后）：顶栏 computed background rgba(247,247,244,**0.95**)；
  截图 plaza-topbar-scrolled-white-390.png，栏下文字不可直读。
  shell-migration 测试的 aurora topbar 钉值已同步更新并注明 BH-10 例外。

### BH-11 化身小缩略位无脸锚 —— 已修
- 修法：`.avatar-portrait-img` 基础规则补 `object-position:50% 12%`，
  与广场作者头像等既定脸锚统一；.avatar-card-thumb / .avatar-bring-thumb
  / .avatar-photo 等小位全部经 AvatarPortrait 渲染此 img，随之生效；
  大舞台（3:4 同比）位置近乎无影响。
- 复验：fixture 化身无立绘可裁，改以级联实测——在真实 thumb 容器内
  注入同类 img，computed object-position = **50% 12%**（卡片位与带入位
  两处 + 基础规则三点一致）。生产立绘走同一 img 类，上线后随真机点验
  复核。

### 功能观察项：360 视口登录后偶现登出落地页 —— 未复现，证据关闭
- 复现：本地 fixture 真 UI 流程（主页标签页登录面板输账密提交）360×740
  ×3 + 390×844 ×2 对照：**5/5 全部登录成功落地**，提交后 0.7s 会话即
  存在，6s 后仍在已登录壳内（导航在、登录钮无），零 pageerror。
  报告 login360-report.json，截图 login360-*.png。
- 代码侧：登录/落地路径无任何按视口宽度分支的代码（全仓 matchMedia
  仅图墙列数与 prefers-reduced-motion 两处，断点 700/1050 也不区分
  360/390）。
- 定性：**非产品缺陷，倾向猎手探针时序**——其生产探针在登录后固定
  等待内断言，persona 账号云端书房同步未完时可能撞上访客态首帧。
  保留注记：本地未能复刻 persona 量级的云端数据，若生产再现，以
  再现时的账号/网络条件为准重开。

### 邮箱注册文案 —— 已改实
- 注册面板提示改为「用邮箱注册，提交后直接登录；另发一封验证邮件
  确认邮箱，日后找回账号也靠它。」（原「确认后就能登录」与实际
  注册即登录不符）。
- 注册后通知同步改实：成功「账号已创建并登录；验证邮件已发出，确认
  邮箱后找回账号更方便。」/ 失败「…验证邮件尚未发出，可在账号页重新
  发送。」（保留 auth-client 测试钉住的「账号已创建…尚未发出」语义）。

## 素材二期接入（21 张 → public/art 共 23 个 WebP）
- 回落封面 5（yanqing/xuanyi/fuben/duanpian/fanpai，各 640/1122 两档）：
  `cover.js` 回落变体表按 MANIFEST 家族表改全覆盖（九大家族齐）；
  门控不变（仅 custom/未知世界启用，知名世界仍走世界图）。旧注释的
  「故意不映射」口径由专用家族画作废，注释已改写；cover-client 测试
  同步改口径并新增九大家族全覆盖断言（799 中新增 1 条）。
- 空态 9：empty-search（书城搜索无果换图 + 书架搜索无果）、
  empty-friends（好友/申请空）、empty-follows（关注/粉丝空）、
  empty-search（好友搜人无果）、empty-fusion（合流无自有线整页空态，
  替换原图标位）、empty-comments（评论空，行内 44px）、
  empty-ratings（评分空，行内 44px）、empty-bookmarks（阅读器书签空）、
  empty-write（写作台无章节）、empty-lorebook（设定集世界书无条目）。
  截图：store-search-empty-390.png / friends-empty-390.png /
  merge-empty-390.png。
- 等待 3：GenerationOverlay 的 `.generation-bg` 加 data-stage 绑定，
  aurora.css 按阶段换图：准备=织线（原图）/ 构思=waiting-birth /
  落笔=waiting-growth / 成章=waiting-chapter，压暗 ::after 不变。
  fixture 的生成器写死未配置（configured:false），本地无法驻留真实
  Gemini 等待；阶段图以「构建产物 CSS + 组件同构 DOM」harness 实测：
  data-stage 0/1/2/3 的 computed background-image 依次为
  weaving/birth/growth/chapter，截图 generation-stage0..3-*.png
  （harness.cjs 存档）。预热清单已加三图（keepalive e2e 的 waiting
  预热断言仍过）。
- 书城横幅 1：书城页头改横幅位，标题「书城」与「上架我的故事」骑
  图上预留暗带（on-art 色），页面只留一个标题（零重复规则）。
  截图 store-banner-black-390.png。预热清单已加。
- 海报样板 3：只入库参照、不转码不挂表面，MANIFEST 已加注记。

## 测试与回归
- 单测 **799/799 全绿**（基线 798 + 新增 1）。改口径的既有测试 3 处，
  均在测试内注明理由：cover-client（家族全覆盖）、shell-migration
  （topbar alpha BH-10 例外）、auth-panel-ui（新文案）。
  注：中途「backup merge」一条曾失败一次，单独跑与终跑均过，属既有
  间歇 flake（与 RATINGS 全量单发 flake 同类观察项）。
- e2e：reader / intervention / control / cloud-library / delete-book /
  edit-book **全过**；journey 16/18、gemini 3/4、keepalive 5/6 的失败
  全部落在同一既有死定位器 `本机分享`（该文案已不存在于 src，属
  e2e 脚本与现行分享模型脱节）；title-flow / write-mode / recovery
  的失败与 ce1791e 基线**逐字相同**（stash 对比实测）。以上均为既有
  问题，非本批引入，列入记账待后续 e2e 修复批处理。
- build 通过；本地提交，不部署不 push（父 agent 统一部署）。

## 未修记账
1. e2e 死定位器 `本机分享` 及 title-flow/write-mode/recovery 基线
   失败：另批处理。
2. BH-11 与等待阶段图的生产真机复核：随本版部署后点验（fixture
   无立绘/无 Gemini 配置的固有限制，已在上文如实标注量测方式）。
3. 360 登录观察项：证据关闭；生产再现时按新条件重开。

---

# BH-12 / BH-13 / BH-14（2026-10-29 晚，用户真机截图直报第二波）

## BH-12 主页续读 hero：面板压封面 → 图为主

- 诊断（生产 persona 号实测）：hero 350×580；信息面板 `.hero-copy`
  320×272（390 宽）/ 370×288（440 宽），占 hero 面积 42.9% / 46%；
  rgba(10,20,48,.55) + blur(14px) 圆角卡，「约半张图被盖死」属实。
- 改法：面板本体下线——`.hero-copy` 去 background / border /
  backdrop-filter / margin，标题、元信息、星图、按钮直接坐
  `.home-hero::after` 渐变 scrim（五段加深：0% .05 / 34% .34 /
  56% .68 / 78% .86 / 100% .95）；文字全程 `--on-art` /
  `--on-art-dim` 压图口径（BH-01），标题与元信息各加一层柔和投影。
  按钮改单行 wrap flex：主钮实心 pill `flex:1 1 140px` 置卡底，
  「与另一条线合流」「回写作台」降为 13px 紧凑 ghost pill 与主钮
  同行（双 ghost 时第二个才换行）。连带：hero 内 `.gen-state` 四态
  全主题改走压图色（白主题下原 `--dim`/`--violet`/`--mint` 在深色
  scrim 上深压深）；清掉随面板而设的三处旧规则（≤360px 的
  `.hero-copy{margin:10px}`、reduced-transparency 的 hero-copy
  实底、prefers-contrast 的 hero-copy 描边）。
- 可见面积口径：遮挡 = 不透明/模糊面板覆盖的像素占比。改前
  42.9–46%；改后 **0%**（copy 区 computed background =
  rgba(0,0,0,0)、无 backdrop-filter；仅剩渐变 scrim，图在任意点
  不被遮断，静态帧全幅可见 100% ≥ 目标 80%）。
- 对比度（猎手同法：canvas 采样文字中心 3×3 图色 × 该处 scrim
  alpha 合成后算 WCAG 比值）：本地种子真实世界图、三主题同值
  （压图色不随主题变）——标题 17.88 / 元信息 10.10 / 生成态
  10.03。白昼最坏情形（合成近白图 RGB≈209–230 + 白主题 harness
  实测）：标题 7.11 / 元信息 6.14 / 生成态 7.58，全部 ≥ 4.5。
- 标题不截断：13 字长标题实测 h1 scrollHeight ≤ clientHeight。
- 截图：bh1214-shots/hero-after-{black,white,aurora}.png、
  home-after-{black,white,aurora}.png、hero-after-bright.png。

## BH-13 主页化身区：展台丢头 + 缩略条塞全人/双环/名字半裁

- 诊断（生产 persona 号实测）：展台固定 384px 高带，立绘
  768×1052 的可见纵带仅 0.024–0.701（440 宽）/ 0.016–0.801
  （390 宽）——20–30% 画高被 cover 裁掉，非契约构图的旧立绘
  头部即出画（用户实报）。缩略图 plain cover + 50% 4% 把全身
  立绘缩成小团（本地以真立绘复现，与真机截图一致）；选中的
  主化身 tile 同挂 is-selected + is-main，violet 边与 amber
  box-shadow 叠成双环，量测坐实。
- 改法：展台改海报原框 `aspect-ratio:3/4; max-height:560px`，
  50% 8% 顶锚保留（宽屏触顶时仍护脸带）；缩略图入 BH-11 脸锚
  家族：`object-position:50% 12%` + `transform:scale(2.05);
  transform-origin:50% 14%`（广场大框同参，不另发明）；选中且
  主化身时 `box-shadow:none`，只留一层 violet 环；名字定
  `line-height:1.5` 并把行底 padding 2px → 8px。
- 量测（persona 真立绘 + 构建产物同源 CSS harness；内容宽
  318/350/400 三档）：展台可见纵带 **0.002–0.976**（≈97.4%
  画高入画；海报脸带 12.6–21.5% 稳在画内）；截图亲看全身头足
  入画、缩略图为头肩特写、单环、名字完整。名字盒高 18px ≥
  行高 16.5px。
- 记账：名字半裁在 Chromium 几何下未复现（原名盒 16px 完整），
  iOS 真机机制未定案；已按行高 + 底距双加固，随本版部署后以
  用户真机复核为准。

## BH-14 主页木质书架：单本巨册 + 书底信息行重叠

- 诊断（生产 persona 号实测）：只有 1 本「其他故事」时 cell 被
  flex 撑到 190×253——自然槽位（390 宽、容量 3）约 93px 宽，
  巨册为 2.05 倍宽、约 4 倍面积；删除/合流两个绝对 pill 与
  face 元信息盒相交 805 / 874 px²（压字属实）。
- 改法：cell 改自然槽位宽——WoodShelf 把容量以 `--shelf-cap`
  注入，`width:calc((100% − (cap−1)×14px)/cap)`（190px 上限
  保留），`flex:0 0 auto` 不再撑大；书少时靠左立、架面留空。
  删除/合流移出封面，改为封面下 in-flow 动作行（恒渲染保各书
  封面底沿对齐层板），按钮 `flex:none; white-space:nowrap`
  防窄槽压缩竖排；face 标题改一行截断（标题一行 / 元信息
  一行）。
- 量测（本地种子，390 宽）：1 本与 3 本两种状态下 cell 均为
  93px 宽（与满行槽位一致，单本不再放大）；删除/合流与标题、
  元信息四组相交面积全 0；按钮 40×25px 单行 pill；多本封面
  底沿对齐（1081/1082px，1px 差为倾斜书包围盒）。截图亲看：
  单本靠左立于空架面、3 本排布与改前一致。截图：
  bh1214-shots/shelf1-after.png、shelf3-after.png。

## 测试与回归（BH-12/13/14 批）

- 单测 **800/800 全绿**（基线 799 + 新增 BH-12 契约 1 条；
  BH-13/14 契约并入 shell-migration / list-layout-ui 既有测试；
  shell-migration 的 profile-stage 384px 旧引脚按 BH-13 改
  3/4 框口径，测试内已注明 supersede 理由）。
- e2e：delete-book 9/9 全过（书架删除路径走新动作行）；
  visual 全旅程对本地新构建 exit 0。
- 注：全量单测中途两见间歇失败各一（import-daylight「backup
  merge」、本批新测试引脚旧值），前者单跑与终跑均过、属既有
  flake；后者已修引脚，终跑 800/800。
- build 通过；本地提交，不部署不 push（父 agent 统一部署）。
- 未修记账：BH-13 名字半裁的 iOS 真机复核（见上）；三项均待
  部署后用户真机点验。
