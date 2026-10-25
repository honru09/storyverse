---
name: "织界 Storyweave"
description: "一条朱线织世界：瓷白与墨的安静界面，蓝染做动作，朱线做签名，正文保持实色。"
colors:
  canvas: "#f2f3ef"
  surface: "#ffffff"
  ink: "#1a201c"
  secondary-text: "#46524a"
  muted-text: "#5a675d"
  divider: "#d8dcd2"
  line-strong: "#a9b3a4"
  action: "#2f4bd2"
  action-hover: "#263fae"
  action-ink: "#ffffff"
  soft-indigo: "#e3e8fa"
  selected-text: "#22388f"
  selected-surface: "#e3e8fa"
  selected-border: "#2f4bd2"
  thread: "#c23a1e"
  thread-soft: "#f7ded4"
  thread-ink: "#1a201c"
  on-ink: "#f2f3ef"
  on-ink-muted: "#b9c4ba"
  error: "#b3261e"
  success: "#2e7d43"
  reader-light-bg: "#f8faff"
  reader-light-text: "#24304a"
  reader-warm-bg: "#f6f0e5"
  reader-warm-text: "#443e36"
  reader-green-bg: "#e9f1e9"
  reader-green-text: "#293c32"
  reader-night-bg: "#19202c"
  reader-night-text: "#dbe2ee"
  reader-night-accent: "#bed7ff"
  reader-night-soft: "#2d394e"
  reader-oled-bg: "#000000"
  reader-oled-text: "#d9dde5"
  reader-soft: "#e9f0fb"
  reader-border: "#d1dbe9"
typography:
  display:
    fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "clamp(2rem, 8.4vw, 3rem)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  headline:
    fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "clamp(1.6rem, 6.5vw, 2.2rem)"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  title:
    fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "20px"
    fontWeight: 750
    lineHeight: 1.3
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 2.05
    letterSpacing: "0em"
  body-serif:
    fontFamily: '"Songti SC", "Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", SimSun, serif'
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 2.05
    letterSpacing: "0em"
  label:
    fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "14px"
    fontWeight: 650
  action:
    fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "16px"
    fontWeight: 650
rounded:
  control: "10px"
  selection: "12px"
  card: "16px"
  surface: "20px"
  sheet: "24px"
  nav: "16px"
spacing:
  small: "8px"
  field-gap: "10px"
  control-gap: "12px"
  standard: "16px"
  inset: "18px"
  block: "20px"
  mobile-gutter: "22px"
  group: "24px"
  section: "28px"
  wide-gutter: "36px"
motion:
  press: "120ms cubic-bezier(.23,1,.32,1)"
  standard: "180ms cubic-bezier(.23,1,.32,1)"
  sheet: "240ms cubic-bezier(.32,.72,0,1)"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "14px 21px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "14px 21px"
  button-ghost:
    backgroundColor: "{colors.soft-indigo}"
    textColor: "{colors.selected-text}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "14px 21px"
  text-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  choice-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.selection}"
    padding: "10px 8px"
  choice-chip-selected:
    backgroundColor: "{colors.selected-surface}"
    textColor: "{colors.selected-text}"
  decision-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.reader-light-text}"
    rounded: "1.125rem"
    padding: "1rem"
  decision-card-selected:
    backgroundColor: "{colors.reader-soft}"
    textColor: "{colors.reader-light-text}"
  nav-bar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.nav}"
    padding: "7px"
  grouped-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
---

# Design System: 织界 Storyweave（2026-10-25 重构）

## Overview

**Design read：** 织界是一个由读者的选择一针一线织出来的故事世界；界面把「织线」定为全站唯一的签名，其余一切安静下来，让世界插画和故事正文做主角。

**Creative North Star：「一条朱线，织出一个世界」**

- **签名（boldness 只花在一处）：朱线 The Thread。** 一条 3px 朱红线以五种形态出现：首页主视觉标题上方的起针线、造世四步的线与结（stepper)、书架封面的书脊线、阅读进度的线、双书合流时两线并织。它是产品名字（织界）的字面兑现，不是装饰渐变。
- **底色安静：** 冷调瓷白画布 + 实白表面 + 墨绿黑文字。没有玻璃、没有模糊、没有环境渐变。层级靠 1px 边线、留白和一档平阴影。
- **动作单一：** 蓝染靛蓝只做可点的东西（按钮、链接、选中、焦点）。朱线永不做按钮底色，靛蓝永不做进度线。两个强调色各司其职，这是与「近黑+单一酸色」默认款拉开距离的结构。

**反默认审查（design-qa §A)：** 不是暖奶油+高对比衬线+陶土（画布是冷调瓷白，展示字体是系统黑体，衬线只作为读者自选的正文字体）；不是近黑底+酸色（浅底、双强调色分工、朱红非酸色）；不是报纸细线密排（圆角 10–20px、单列呼吸感排版）。旧版「全站 Apple iOS 毛玻璃」是通用 Reflex 默认，本次按用户 2026-10-25 指令整体退役，理由记录于 docs/REDESIGN-2026-10-25.md。

**Key Characteristics:**

- 四个世界沿用原有插画与来源记录；同一世界在首页、造世、书架、书城和合流中保持一致。
- 手机优先、44px 触控、原生阅读滚动；阅读六主题与全部阅读偏好原样保留（功能 token，不随品牌重构变动）。
- 一次性、可中断的短动效；键盘、关闭动效和减少动态时立即到达终态。

## Colors

frontmatter 是规范 token 层，与 src/styles.css 的 :root 变量一一对应（历史变量名 --ink/--paper 语义反转的别名问题在本次重构中一并改正：--ink 回到文字墨色，--paper 回到画布）。

### Primary

- **蓝染 / action**：唯一动作色。主要按钮、链接、焦点环、选中边框。悬停只在精细指针下加深为 action-hover。
- **选择靛**：selected-text / selected-surface / selected-border，服务性格、出身、语气与合流规则的已选状态。
- **朱线 / thread**：只用于线形图形元素——进度、步进线与结、书脊线、标题起针线、导航当前项的结。永不做大面积底色，永不做正文文字色；thread-soft 仅作线结的浅色衬底。

### Neutral

- **瓷白 / canvas**：冷调（带极轻绿灰）页面底色，与暖奶油明确区分。
- **实白 / surface**：卡片、表单、面板基底。全部表面实色，`backdrop-filter` 全站退役。
- **墨 / ink**、**secondary-text**、**muted-text**：三级文字，均在 canvas 与 surface 上达到 WCAG AA（实测值记入重构报告）。
- **墨底 / ink 作为深色表面**：只用于三处——移动端底栏、首页主视觉文案板、桌面侧栏当前项。on-ink / on-ink-muted 是其上的文字对。

### Reader themes（功能 token，豁免品牌审查）

浅色、暖色、青绿、夜间、纯黑、跟随系统六主题的颜色对保持重构前数值不变。它们是读者偏好数据，不是品牌表面；阅读工具与面板继续按 reader-* 变量取色，但去掉玻璃模糊，改为实色 reader 表面。

**The Two Accents Rule.** 靛蓝 = 能点的；朱线 = 故事走到哪了。任何新元素先回答属于哪一类，不许第三种用法。

**The No Glass Rule.** 层级用边线、实色和阴影表达。降低透明度/高对比模式下不需要任何替代逻辑，因为本来就没有透明层。

## Typography

**Display / UI Font：** 系统字体栈，零下载。标题字重 800、字距 -0.03em，与旧版 750 拉开一档识别度；不使用衬线做展示（衬线展示+暖底是被禁的默认款）。

**Reading Font：** 正文默认系统黑体，可明确选择设备宋体栈；章节标题随正文选择。操作和决策控件永远用 UI 栈。

### Hierarchy

- **Display**：首页主视觉书名，clamp(2rem, 8.4vw, 3rem)；标题上方一条 36×3px 朱线（起针线）。
- **Headline / Title**：造世问题与分区标题。
- **Body**：阅读默认值沿用（14–32 号可调、行高 1.6/1.8/2.05/2.3、字重 400/600 等高级排版全部保留，见阅读偏好表，数值不变）。
- **Label / Action**：短中文；输入文字 16px；进度与章节编号 tabular-nums。
- **Wrapping**：标题 balance；用户内容 anywhere 换行；只在书架摘要等紧凑位截断，不截断正文。

## Layout

手机单列优先，普通页上限 1120px、合流页上限 860px。横向留白 mobile-gutter，360px 及以下 16px，700px 起 wide-gutter。安全区继续生效。

- **导航**：顶栏改实色 canvas + 1px 底边线，粘性保留。移动端底栏改墨底实色条（rounded nav 16px），当前项为白字 + 上方一枚朱线结（4px 圆点＋短线）。1050px 起 88px 左侧栏，实色 surface，当前项软靛底 + 左侧 3px 朱线。
- **造世**：四步一问不变。步进器改「线与结」：一条底线贯通四步，已完成段为朱线、当前结为朱红实心圆环、未到段为线色；主动作在移动端继续粘底并保留滚动空间。
- **书籍**：书架横向滚动与吸附不变；封面左缘加 3px 书脊线（该世界主题色或朱线）。书城两/三/四列断点不变。网格卡片固定几何：同行同高、槽位一致（design-qa §B)。
- **阅读**：实色区域、行宽三档（44/38/32em）、150px 底部预留、逐屏模式等全部数值不变。章节进度条改朱线（3px，thread 色），这是朱线在阅读中的唯一形态。
- **面板**：实色 surface + 1px 边线 + 平阴影；宽度/高度/贴底规则不变；把手保留为视觉提示。

## Elevation & Depth

两档：flat（0 1px 2px rgba(26,32,28,.06)）给卡片与分组；raised（0 8px 24px rgba(26,32,28,.10)）给主视觉、面板与底栏。深度不来自透明或模糊。

**The Thread Is Flat Rule.** 朱线永远是平面图形，不带阴影、不发光、不渐变。

动效 tokens 见 frontmatter motion：按下 120ms / scale(.98)，常规过渡 180ms（只动 transform/opacity 与颜色），面板 240ms。自旧版继承的 GSAP 入场（220ms/8px、间隔 ≤30ms）、章节标题 140ms 淡入等数值不变；排版、主题、跳转不动画；业务状态不等动画回调；prefers-reduced-motion 时立即终态。

## Shapes

圆角收紧一档以区别于旧玻璃语言：控件 10px、选择 12px、卡片 16px、表面 20px、面板 24px（顶部）、导航 16px。边线 1px 为常态，世界选中框 2px 靛蓝、书脊线与进度线 3px 朱线是仅有的加粗线。图标按钮圆形、命中区 ≥44×44px 不变。功能图标一律内联 SVG，不用 emoji（design-qa Floor）。

## Components

### Buttons

主要按钮：靛蓝底白字、最小 52px、圆角 10px。次要按钮：白底、1px line-strong 边、墨字（与旧版「secondary 与 ghost 同样式」明确分家）。ghost: 软靛底、选择靛字。焦点：3px 靛蓝外轮廓、4px 偏移。disabled 真实禁用。首页主视觉内的主动作是墨板上的白底墨字例外，其上方有起针线。

### Chips and grouped controls

白底细线、软靛选中态 + 勾选与 aria-pressed 并存；命中高度 46–48px。可选经历 switch 的开启轨道改靛蓝（动作语义），不用绿色冒充品牌色；success 绿只用于「已保存」等真实状态文字与图标。

### Cards / containers

实白表面 + 1px divider 边 + flat 阴影。能力列表用分隔线，不强拆成卡中卡。决策卡沿用 reader 变量（阅读上下文），选中同时有文字/图标语义。世界卡：插画满幅、底部文案改为实色墨板条（不再用深玻璃），选中时 2px 靛蓝框 + 左上朱线结标记。

### Inputs / fields

16px、最小 52px、实白底、1px 边线、10px 圆角。错误用真实 alert，进度与结果用 status。聚焦时边线变靛蓝 + 焦点环，不用发光阴影。

### Navigation and sheets

见 Layout。ReadingDialog 保持原生模态、焦点归还、Esc/遮罩关闭。阅读条与工具栏改实色 reader 表面 + 1px reader-border。

### Reading preferences / location / tools / account

功能、文案语义与数值全部不变；仅材质层跟随 No Glass Rule 改实色。账号面板的未配置禁用态、游客路径、本机书架提示保持诚实口径（见 PRODUCT.md)。

### Brand mark

品牌标记只有一个：「线装书」——墨色圆角底（ink，圆角 14/64）上一本打开的书（canvas 色线条），书脊由一道朱线（thread）三针缝住，线尾在书底下方收圆头。几何源文件为 `public/icon.svg`（64 viewBox），顶栏 Brand glyph 使用同一几何，不许另画近似版。它同时是朱线签名的源头：站内所有朱线形态都读作从这本书脊上抽出的线。颜色只许用 ink / canvas / thread 三色；不许改线色、不许省墨底直接压在插画或照片上、不许加文字进标记内。横式组合 = 标记 + 「织界」800 字重 + 起针线（标题上方 36×3px 朱线），英文小字 STORYWEAVE 只在品牌.lockup 场景出现，不进普通页面眉题。

## Do's and Don'ts

### Do:

- Do 让每个新表面先过 Two Accents Rule：能点的靛蓝，表进度的朱线，其余墨与瓷白。
- Do 保留 ≥44px 命中区、16px 输入文字、safe-area 与可见焦点。
- Do 让阅读偏好、段落定位、位置书签与故事数据分离保存，排版即时生效保持锚点。
- Do 让选择、生成、保存、失败与重试状态由真实业务数据驱动。
- Do 在 DESIGN.md token 之外不发明新颜色/圆角/时长；需要新值先改这里。

### Don't:

- Don’t 恢复毛玻璃、backdrop-filter、环境径向渐变或把玻璃变量名带回来。
- Don’t 把朱线做成按钮、底色块、渐变或发光效果；它永远是 3px 平面线。
- Don’t 用暖奶油底 + 衬线展示标题（被禁默认款）；衬线只做读者自选正文。
- Don’t 为每段文字套卡片，或把装饰性英文眉题变成规范。
- Don’t 对正文做装饰位移动画、循环粒子/WebGL 氛围或接管手机滚动。
- Don’t 把未配置账号按钮做成可提交假入口，或宣称云同步、支付、多人已完成。
