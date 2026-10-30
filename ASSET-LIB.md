# 织界专属设计素材库（REQ-34 第一批）

> 用户口径（2026-10-30）：「素材」不只是图片——专属样式的按钮、窗口边角与边框、字体效果、显示效果、线条与角落细节都算素材。
> 本批**只建库 + 出图鉴**：不接任何生产页面、不部署。选中哪件、落到哪个表面，由后续批次逐面接入。

## 文件

| 文件 | 说明 |
|---|---|
| `src/design-assets.css` | 素材库本体。独立文件，类名前缀 `da-`；未被任何页面引用，接线时再在入口引入（放在 styles.css 之后）。 |
| `public/design-catalog.html` | 图鉴页：41 件全量陈列，顶部切换黑/白/极光三主题整页换貌。开发侧展示页（以仓库根起静态服务打开，页内相对引用 `../src/design-assets.css` 与 `./art/*` 演示图）。 |

## 设计纪律

- **母题**：织线（渐变 `--da-weave` = 青→紫→粉、缝线针脚、织线缎带）/ 星点（✦ 星结、星尘、角点）/ 书页（书封框、统计砖）。
- **全挂主题 token**：素材只消费主题变量（`--cyan/--violet/--pink/--ink/--dim*/--line*/--surface-solid/--selected-*` 等），同一骨架三主题各有其貌；不写死颜色。
- **§53 数值纪律**：blur 只用 22/20/14/12 档（经回退链取主题既有变量）；圆角只用阶梯 control 10 / selection 12 / card 16 / surface 20 / sheet 24 / glass-card 26 / 胶囊 999；发丝线走 `--line/--line-strong/--selected-line` alpha 体系；caps 标签 11px/.14em 与 §53 分区标签同口径。无野数值。
- **玻璃回退链**：`--da-glass-bg: var(--glass-card-bg, var(--glass))` 等——黑/白吃 §53 盐系玻璃值；极光未定义 `--glass-card-*`，自动回落到**极光自己的** `--glass`（rgba(148,178,255,.08)）与 `--blur-card`（blur 12px）。**极光既有规则零改动**，本库不含任何 `[data-shell-theme='aurora']` 选择器覆写。
- **动效**：只 transform/opacity；弹簧口径 `--ease-spring: cubic-bezier(.3,1,.4,1)`（ζ≥1 不回弹）；含 `prefers-reduced-motion` 全量关停（含 shimmer/spinner 动画）。
- **输入字号地板**：`.da-input-*` 字号 16px（DEVICE-FIX2 / iOS 防放大口径）。

## 清单（41 件）

### BTN 按钮族（7）

| 编号 | 名称 | 类名 | 用途建议 | token 依赖 |
|---|---|---|---|---|
| BTN-01 | 主按钮 · 织线渐变 | `.da-btn--weave` | 全站主行动：开始造世、保存、确认合流 | `--da-weave`、`--ink-on-weave`（黑/极光深字、白主题 `--action-ink` 白字） |
| BTN-02 | 玻璃次按钮 | `.da-btn--glass` | 压画作/封面/氛围面上的次行动：封面上的换封面、头图上的编辑 | `--da-glass-*`（§53 玻璃回退链） |
| BTN-03 | 发丝线幽灵按钮 | `.da-btn--ghost` | 弹窗与卡片内的取消/次级动作 | `--line`、`--surface-solid` |
| BTN-04 | 危险按钮 | `.da-btn--danger` | 删除线/注销/清空类破坏性动作（独立红系，不与珊瑚混用） | `--da-danger`（新色，值取站内既有红 #ff7d92/#e5484d） |
| BTN-05 | 胶囊 CTA | `.da-btn--cta` | 落地/空态/季终等单点大行动：开始造世、开启第二季 | 同 BTN-01 + 胶囊圆角 999 |
| BTN-06 | 图标钮 | `.da-icon-btn`（圆形变体 `.da-icon-btn.is-round`） | 顶栏与卡片角：分享、设定集、关闭、更多 | `--line`、`--ink` |
| BTN-07 | 悬浮动作胶囊 | `.da-fab` | 阅读器「介入」、书架「＋ 新建」等悬浮位；近实色面（SALT-3 裁定：压字不可辨笔画） | `--da-nav-bg`（回退链取 `--glass-nav-bg`，极光回落近实藏青） |

按钮基类 `.da-btn` 含 hover/active（scale .97）/disabled（含 `.is-disabled` 类）/focus-visible 全状态，统一高度 44px。

### FRM 窗口 / 边框（5）

| 编号 | 名称 | 类名 | 用途建议 | token 依赖 |
|---|---|---|---|---|
| FRM-01 | 弹窗框 · 四角线角 | `.da-frame-corners` | 设置窗、合流确认等正式弹窗的织界签名框 | `--surface-solid`、`--cyan`（角线） |
| FRM-02 | 弹窗框 · 星点角 | `.da-frame-stars` | 季终/成就/庆祝类轻弹窗（四角星点 + 顶边中央星） | `--surface-solid`、`--cyan` |
| FRM-03 | 渐变描边框 | `.da-grad-border` + 内衬 `.da-grad-border-in` | 世界圣经、官方公告等「重要内容」容器 | `--da-weave`（描边）、`--bg`（内衬） |
| FRM-04 | 双发丝线框 | `.da-frame-double` | 引文/开场白/题词位：详情页世界引言、章节扉页 | `--line-strong` |
| FRM-05 | 书封框 · 角标 tick | `.da-book-frame`（书签缎带 = `::before`、右下 tick = `::after`，均为无字伪元素） | 书城/书架/广场书卡的封面框：左上织线书签缎带 + 右下角 tick（状态文字另用 DTL-01 徽章叠放） | `--da-thread`（缎带，织线渐变）、`--da-corner`（tick，取 `--cyan`）、`--line` |

### DIV 线条分隔（5）

| 编号 | 名称 | 类名 | 用途建议 | token 依赖 |
|---|---|---|---|---|
| DIV-01 | 发丝线 | `.da-hr` | 通用段落/列表分隔 | `--line` |
| DIV-02 | 渐变隐线 | `.da-hr--fade` | 轻分隔：卡内分区、评论间 | `--line-strong`（中段） |
| DIV-03 | 缝线 · 针脚 | `.da-hr--stitch` | 织造母题签名分隔：造世步骤间、化身档案分区 | `--pink`（60% 针脚色） |
| DIV-04 | 星点结分隔 | `.da-hr--knot`（`.da-knot-star/.da-knot-dot`） | 章节扉页、季终页、空态上方的仪式感分隔 | `--line`、`--cyan` |
| DIV-05 | 带标签的分区线 | `.da-hr--label`（`.da-hr-label-text`） | 详情页「世界设定/主角与主线」等分区（与 TYP-03 同口径小字） | `--line`、`--dim-2` |

### TYP 字体效果（5）

| 编号 | 名称 | 类名 | 用途建议 | token 依赖 |
|---|---|---|---|---|
| TYP-01 | 渐变标题字 | `.da-title-grad` | 落地主标题、季终标题、空态大标题（字号由使用处定） | `--da-weave` |
| TYP-02 | 章节大数字 | `.da-chapter-num` + `.da-chapter-num-unit` | 阅读器章首、季终页「24」、篇幅选择面 | `--ink`、`--dim-2` |
| TYP-03 | 小灰 caps 分区标签 | `.da-caps` | 全站分区标签统一件（与 §53 `.section-label` 同参数） | `--dim-2` |
| TYP-04 | 统计大数字砖 | `.da-stat-brick` + `.da-stat-num` / `.da-stat-sub` / `.da-stat-delta` | 主页统计、作者数据、运营数字砖（大圆角定版式的砖体） | `--surface-solid`、`--line`、`--mint`（涨幅点缀） |
| TYP-05 | 描边字 | `.da-outline-text` | 橱窗装饰大字：加载屏、落地页背景字（`@supports` 渐进增强，不支持时回落 dim-2 实色） | `--dim-2` |

### FX 显示效果（6）

| 编号 | 名称 | 类名 | 用途建议 | token 依赖 |
|---|---|---|---|---|
| FX-01 | 玻璃面（+ 小玻璃片） | `.da-glass-panel`、`.da-glass-chip` | 广场玻璃卡、书城卡、详情面板的统一玻璃件；chip 为玻璃上叠的小玻璃片 | `--da-glass-*` 回退链（§53/极光自有档） |
| FX-02 | 光晕环 | `.da-halo` | 化身/徽章/头像位的星环底座：主化身展示、官方号头像 | `--selected-bg/--accent-dim/--line` |
| FX-03 | 星点尘 | `.da-stardust` | 卡面/空态/等待面的稀疏星尘点缀（纯 background，无额外 DOM） | `--ink/--cyan/--violet/--pink` 低 alpha |
| FX-04 | 细噪点 | `.da-noise` | 哑光面去塑料感：弹窗面、统计砖（SVG feTurbulence 数据 URI，opacity .05） | 无（`::after` 覆盖层，`pointer-events:none`） |
| FX-05 | 微光扫过 · 骨架 | `.da-shimmer` | 加载骨架统一件：列表/卡片/详情加载态（只动 transform） | `--surface-solid`、`--line-strong`（扫光带） |
| FX-06 | 氛围色晕 | `.da-ambient` | 页面氛围底取色：青/紫/潮绿三晕垫在玻璃之下（§53「玻璃须有物可折射」） | `--cyan/--violet/--mint` |

### DTL 角落细节（13）

| 编号 | 名称 | 类名 | 用途建议 | token 依赖 |
|---|---|---|---|---|
| DTL-01 | 徽章组 | `.da-badge`（`--official/--main/--serial/--done`） | 官方（金）、主化身（织线描边）、连载中（潮绿）、已完结（灰）——书卡/帖卡/主页统一徽章 | `--da-gold`（新色取站内金 #ffd166/#b97f10）、`--mint/--pink/--dim` |
| DTL-02 | Chips | `.da-chip`（`[aria-pressed=true]` 选中） | 书城分类、广场筛选、造世选项 | `--selected-*` 选中族、`--line` |
| DTL-03 | 开关 | `.da-switch`（原生 checkbox 驱动） | 设置窗全部开关（动效/提醒等），推钮走弹簧位移 | `--cyan`（开）、`--ink-on-weave`（钮）、`--line-strong`（关轨） |
| DTL-04 | 单选 / 勾选 | `.da-radio`、`.da-check` | 阅读设置（滚动/逐屏）、造世选项（带入化身等） | `--cyan`、`--ink-on-weave`（勾） |
| DTL-05 | 输入 · 下划线式 | `.da-field` + `.da-input-under`（`.is-error`） | 编辑资料（昵称/简介）等轻表单 | `--line-strong`、`--cyan`（聚焦）、`--da-danger`（错误） |
| DTL-06 | 输入 · 框式 | `.da-input-box` | 搜索框、介入输入、评论框 | `--bg-2`、`--line`、`--cyan` |
| DTL-07 | 焦点环 | `.da-focus-ring`（演示类） | 全库 `:focus-visible` 的静态展示件；接线时各组件自带同口径环（青环 + 2px offset） | `--cyan` |
| DTL-08 | 滚动条 | `.da-scroll` | 目录抽屉、长列表容器（6px 细条，thumb 走 line-strong） | `--line-strong`、`--line` |
| DTL-09 | 选区色 | `.da-selection-demo`（演示类） | 接线口径：全局 `::selection` 用 selected 族（图鉴内以局部类演示，避免图鉴页全局生效） | `--selected-bg/--selected-ink` |
| DTL-10 | Toast | `.da-toast` + `.da-toast-dot` / `.da-toast-action` | 保存/同步/失败反馈的统一 toast 体（近实色面 + 状态点 + 行动字） | `--da-nav-bg`、`--mint/--coral`（状态点）、`--cyan`（行动） |
| DTL-11 | 进度条 · 星结 | `.da-progress` + `.da-progress-fill` | 阅读进度、连载进度、生成进度：织线填充 + 头端 ✦ 星结 | `--da-weave`、`--cyan`（星结）、`--line`（轨） |
| DTL-12 | 织线 loading spinner | `.da-spinner` | 等待画面与行内加载：粉弧旋转 + 中央静星 | `--pink`、`--cyan`、`--line` |
| DTL-13 | 空态小标记 | `.da-empty-mark` + `.da-empty-glyph` / `.da-empty-text` | 各空态的统一小标记（虚线星环 + 一行小字），与平台素材库空态图互补 | `--line-strong`、`--cyan`、`--dim` |

## 接线须知（后续批次）

1. 引入顺序：`design-assets.css` 须在主题变量定义（styles.css）之后加载；本库不定义主题变量、只消费。
2. 玻璃件（BTN-02/FX-01）须压在画作/氛围底上才读得出（先铺 FX-06 或图片），平地使用回落近实面——与 §53 既有裁定一致。
3. 阅读正文面继续克制：本库仅 FX-05/DTL-11/DTL-12 等功能件可考虑，装饰件（FX-03/04、DIV-03/04）不入正文。
4. 极光主题：本库在极光下自动使用极光 token 值成貌，**不得**为素材库修改极光既有规则或守卫冻结断言。

## 验收记录（本批）

- 图鉴截图：`asset-lib-shots/`（不入库）——390 宽、三主题 × 8 段（top/btn/frm/div/typ/fx/dtl-a/dtl-b），共 24 张，逐张亲看无溢出无错位。
- 单测：`npm test` 835/840 通过；5 条失败为 worktree 缺未入库样本图的既有 ③a ENOENT（主树全绿），与本批无关；守卫未扫描本库文件（守卫只读指定文件），无需豁免、未动任何断言。
