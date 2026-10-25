---
name: "织界 Storyweave"
description: "轻快 iOS 玻璃界面：原有叙事插画、清晰操作与安静阅读。"
colors:
  action-blue: "#0064d9"
  action-hover: "#0059bf"
  accent-blue: "#007aff"
  link-blue: "#005ac4"
  canvas: "#f5f7fb"
  surface: "#fff"
  text: "#172338"
  secondary-text: "#46566d"
  muted-text: "#526279"
  divider: "#d6dfea"
  soft-blue: "#e8f0ff"
  soft-lavender: "#edf0ff"
  secondary-action: "#e7effc"
  selected-text: "#0053b5"
  selected-surface: "#e6f0ff"
  selected-border: "#7bb3f8"
  glass: "rgba(255,255,255,.66)"
  glass-strong: "rgba(250,252,255,.86)"
  glass-dark: "rgba(17,30,48,.76)"
  glass-edge: "rgba(255,255,255,.8)"
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
  reader-glass: "rgba(248, 250, 255, .88)"
typography:
  display:
    fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "clamp(2rem, 8.4vw, 3rem)"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  headline:
    fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "clamp(1.6rem, 6.5vw, 2.2rem)"
    fontWeight: 750
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
  control: "14px"
  selection: "16px"
  grouped: "18px"
  card: "20px"
  overlay: "22px"
  surface: "24px"
  sheet: "28px"
  nav: "30px"
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
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.surface}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "14px 21px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "{colors.secondary-action}"
    textColor: "{colors.link-blue}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "14px 21px"
  button-ghost:
    backgroundColor: "{colors.secondary-action}"
    textColor: "{colors.link-blue}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "14px 21px"
  text-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  choice-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
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
  reader-dock:
    backgroundColor: "{colors.reader-glass}"
    textColor: "{colors.reader-light-text}"
    rounded: "26px"
    padding: "9px 10px 7px"
  reading-option:
    backgroundColor: "{colors.reader-soft}"
    rounded: "0.75rem"
    padding: "0.4375rem"
  reading-sheet:
    backgroundColor: "{colors.glass-strong}"
    textColor: "{colors.text}"
    rounded: "{rounded.sheet}"
    padding: "1.5rem"
  grouped-surface:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
---

# Design System: 织界 Storyweave

## Overview

**Creative North Star: "轻盈的 iOS 故事界面"**

以轻快、熟悉的 Apple iOS 材质承载个人故事：冷白画布、清晰蓝色动作、半透明界面层、系统字体与原有叙事插画。玻璃属于控件与导航，故事正文属于稳定实色页面；大圆角、细边界和柔和阴影表达层级，不恢复厚墨线的旧方案。

本规范记录已实现的界面，不是效果图提案。2026-10-22 用户明确指定的年轻、全站 iOS 毛玻璃方向覆盖旧「故事扉页」；系统字体、连续圆角与玻璃是明确选择。页面策略见 docs/UI_SURFACE_BRIEF.md，产品与上线边界见 PRODUCT.md。

**Key Characteristics:**

- 四个世界沿用原有插画；同一世界在首页、造世、书架、书城和合流中保持一致。
- 蓝色表达操作与选择，实色正文和清楚的文字反馈保证可读性。
- 手机优先、44px 触控、原生阅读滚动；专用阅读条与玻璃工具栏围绕实色正文，材质有实色替代。
- 一次性、可中断的短动效；键盘、关闭动效和减少动态时立即到达终态。

## Colors

冷白与深蓝灰构成基础，动作蓝提供清楚的操作方向，淡蓝／淡紫区分状态。frontmatter 是提取 token 的规范层；实际主题覆盖仍以样式源为准。

### Primary

- **动作蓝 / action-blue**：主要确认按钮；accent-blue 用于已选世界轮廓，link-blue 用于文字操作与焦点，action-hover 仅用于精细指针悬停。
- **选择蓝**：selected-text、selected-surface、selected-border 同时服务性格、出身、语气与合流规则。

### Neutral

- **冷白画布 / canvas**、**实白表面 / surface**：普通页面与表单基底。
- **深蓝灰 / text**、**次级蓝灰 / secondary-text**、**辅助蓝灰 / muted-text**：正文、说明和元数据；divider 用于细边界。
- **淡蓝 / soft-blue**、**淡紫 / soft-lavender**：已完成选择、图标反馈与分组状态。
- **浅玻璃 / glass**、**强玻璃 / glass-strong**、**深玻璃 / glass-dark**：分别服务分组表面、浮层与插画文字区；glass-edge 是高光边界，不是文字颜色。
- **阅读主题**：浅色 light、暖色 warm、青绿 green、夜间 night、纯黑 oled，以及跟随设备浅／深外观的 system。颜色作用于正文、预览、阅读工具、面板与当前阅读视图外壳／桌面导航；离开阅读后不改其他页面。night 与自动深色共用夜间角色，纯黑有独立表面；完整角色见 src/reading-preferences.css，不将阅读主题升级为全站品牌配色。

**The Color Roles Rule.** 蓝色用于主要动作、链接与选中反馈；选中、错误和保存状态同时保留文字、勾选或语义属性，不只换颜色。

**The Alias Truth Rule.** 历史别名按当前值使用：--paper 是主文字，--ink 是页面底色，--serif 已指向系统 UI 字体；名称不是恢复旧视觉的理由。

## Typography

**Display / UI Font:** 系统字体。--font-ui 是 UI 字体栈，--serif 仍只是该栈的历史别名，不恢复旧宋体展示标题。

**Reading Font:** 正文默认系统黑体，可明确选择设备宋体栈；章节标题随正文选择。设备没有指定宋体时回退浏览器 serif，不下载额外字体；操作和决策仍用 UI 栈。

**Character:** 圆润、清楚、轻快。标题较紧，长文更松；这是一套按阅读任务形成的层级，不是固定比例字号阶梯。

### Hierarchy

- **Display**：首页插画上的书名；宽屏采用 clamp(2.6rem, 4.8vw, 3.4rem)，360px 及以下缩至 30px。已有书名另有更紧凑规格，允许长标题安全换行。
- **Headline / Title**：当前造世问题与重复分区标题；通用 h1 为 clamp(2rem, 5vw, 3rem)，具体场景可收紧。
- **Body**：frontmatter 记录实际阅读默认值。字号 14–32 号、每次 2 号，CSS 换算为 0.875–2rem，显示数值以 16px 根字号为基准，保留浏览器文字缩放；16／18／20／22 只是四个快捷预设。行高可选 1.6／1.8／2.05／2.3；字重 400／600。章节标题使用正文字体、650 字重、1.5 行高与 clamp(1.65rem, calc(var(--reader-font-size) * 1.45), 2.75rem)。
- **Label / Action**：字段与按钮保持短中文；输入文字为 16px，辅助说明通常 12–14px，紧凑元数据有局部 10–11px 规格，不提升为正文标准。
- **Wrapping**：标题 balance；标题与用户内容允许 anywhere 换行；只在书架摘要和阅读栏书名等紧凑位置截断，不截断正文。进度和章节编号用 tabular-nums。

**The One System Voice Rule.** 界面标题与操作使用系统字体；阅读正文及章节标题可切换设备宋体，不把这个偏好传播到导航和决策控件。书名和操作文字始终是 HTML，不烘焙进插画。

## Layout

手机单列优先，普通页上限 1120px、合流页上限 860px。常规横向留白是 mobile-gutter；360px 及以下为 16px，700px 起为 wide-gutter。顶部、底部、页边与面板保留 safe-area-inset。

- **导航**：非阅读页面保留粘性顶栏与四项悬浮胶囊底栏；底栏最大 480px，底部距安全区至少 12px。1050px 起切换为 88px 左导航。阅读时隐藏全局顶栏和手机导航，改用粘性阅读条与独立工具栏；桌面侧栏继续存在并服从当前阅读主题。
- **造世**：四步、每页一个问题；世界选项手机两列。1049px 及以下主动作粘在底部导航上方，必须保留正文与错误提示的滚动空间。桌面增加 250px 侧预览。
- **书籍**：书架横向原生滚动与 proximity 吸附；书城手机／700px／1050px 为两／三／四列。合流并置两本原书世界，不造第三主角。
- **阅读**：实色区域铺满可用宽度，外围最大 58rem；窄／标准／宽页边距分别为 1／1.375／2rem，同时将正文最大行宽设为 44／38／32em。安全区继续生效，不再沿用固定 68ch。字号、排版和颜色立即生效，保留段落锚点，不插值文字几何。阅读工具栏最大 460px，底部至少 10px；页面预留 150px 底部空间，逐屏模式增至 210px，均叠加安全区。
- **面板**：宽度 min(100% - 2rem, 480px)，通常最大高度 min(80dvh, 680px)；700px 及以下贴底，通常最高 85dvh，顶部圆角、底角接屏。内容较长的阅读设置单独允许 min(88dvh, 850px)，在面板内部原生滚动。
- **滚动**：手机和阅读页始终保留原生上下滚动。可选「逐屏阅读」通过上一屏／下一屏即时纵向移动，按可用视口保留重叠；不是横向分页、滑动翻书或锁定滚动。PageUp／PageDown 与左右方向键仅在非输入、非按钮、非模态上下文处理。Lenis 仍仅用于符合原有条件的非阅读宽屏精细指针滚轮，空闲无 ticker。

## Elevation & Depth

浅玻璃（16–20px blur）承载界面分组与导航，深玻璃承接插画文字，模态面板使用更强玻璃（24px blur）。深度来自透明层、1px 边界与软投影；首页和书封的投影略高，正文不制造悬浮感。阴影与材质精确值放在 .impeccable/design.json 的 extensions。

**The Glass Around Prose Rule.** 玻璃建立导航、面板、分组操作与插画标签的层级；正文不透出插画、不套玻璃卡、不参与位移动画。

**The Solid Fallback Rule.** 降低透明度、提高对比或不支持 backdrop-filter 时保留实色表面与清晰边界；任何信息都不能依赖模糊效果才可读。

动效是有限的操作反馈：常规按下 80ms／缩放 0.98，松开与颜色过渡 160ms；阅读偏好控件用 120ms 反馈，亮屏开关拇指 140ms，专注模式仅让阅读条 160ms／8px 收起。GSAP 入场 220ms／8px、最多 30ms 间隔，章节标题仅 140ms 淡入；面板打开为 200ms 透明度与 220ms／12px 位移，关闭立即完成。键盘、关闭动效、系统减少动态时直接终态；省流量停用 JS 入场。排版、主题、跳转与逐屏移动不动画，业务状态不等动画回调。

## Shapes

主语言为连续、柔和的大圆角：14px 控件、16–20px 选择与分组、22–24px 玻璃面板、28px 首页／模态、30px 浮动导航。一般边界为 1px，世界选中框保留 2px；不是把所有局部轮廓统一成粗线。图标按钮为圆形，命中区仍至少 44×44px。标准图标使用内联 SVG，书名和状态文字保持可选择。

## Components

### Buttons

主要按钮是蓝底白字、最小 52px；secondary 与 ghost 当前共享浅蓝底／蓝字，不代表透明按钮。首页深玻璃里的主要阅读动作是白底深字例外。只在精细指针下使用 hover；通用焦点为 3px 蓝色外轮廓、4px 偏移。disabled 真实阻止操作并降低透明度；等待状态保留文字。阅读目录行按下只换底色、不缩放。

### Chips and grouped controls

性格、出身与合流选项使用细线、白底和淡蓝选中态，保留勾选与 aria-pressed；命中高度 46–48px。步骤条、账号登录／注册和故事方式使用分段控件。可选经历是语义 switch：52×44px 外命中区，绿色开启轨道与白色拇指；状态位移无需等待动画。

### Cards / containers

分组表面使用浅玻璃和 soft shadow；能力是有分隔线的列表，不强制变成独立卡片。当前阅读决策卡最小 100px、1rem 内边距、1.125rem 圆角；高优先级主题规则让卡片使用 reader-surface／reader-soft，选中边界 reader-accent。说明与后果随阅读字号适度增大，但字体保留 UI 栈，选中同时有文字／图标语义。四个世界由 WorldArtwork 复用 640／1122 WebP，首屏 eager，其余 lazy；合流只并置两张来源图。

### Inputs / fields

16px 系统字、最小 52px、实白底、1px 边界、14px 圆角。标签在字段外，密码显示按钮保留可触达命中区。错误用真实 alert，进度和结果用 status；不凭文档发明未实现的通用错误字段变体。

### Navigation and sheets

普通底栏／桌面栏以 SVG、短标签和当前态表达位置。阅读专用粘性条承载返回、书名、章节与收藏；底部玻璃工具栏保留章节／本章百分比和目录、Aa 设置、查找、专注四项，主要触控高 48px。专注模式隐藏阅读条并将四项操作替换为明确的「退出专注阅读」；工具栏进度与逐屏按钮仍保留，不宣称浏览器全屏。

ReadingDialog 使用原生模态、锁定背景滚动、Esc／遮罩／关闭按钮退出，并恢复触发焦点。手机把手只是视觉提示，不承诺拖拽功能。

### Reading preferences

基础设置直接显示字号、六主题、字体、双段落预览、行距、阅读方式与亮屏开关；更多排版放入原生 details，选项用真实 radio，亮屏用语义 switch。面板内先玻璃容器、再实色分组，不层层叠加模糊。高级排版真实范围如下：

| 设置 | 已实现选项 | 默认 |
| --- | --- | --- |
| 字重 | 400／600 | 400 |
| 页边距／正文行宽 | 窄 1rem／44em；标准 1.375rem／38em；宽 2rem／32em | 标准 |
| 段间距 | 0.6／1／1.4em | 1em |
| 首行缩进 | 2em／0 | 2em |
| 字间距 | 0／0.03／0.06em | 0 |
| 对齐 | 左对齐／两端对齐，末行从起始侧对齐 | 左对齐 |

偏好独立本机保存，兼容原三字段设置；失败时本页继续生效并告知，不改故事或章节进度。常亮默认关闭，仅在阅读页、浏览器支持且设备允许时请求 Screen Wake Lock；失败显示状态，离开阅读或关闭常亮开关时释放锁，不代替系统亮度控制。

### Reading location and tools

阅读位置按章节正文内容身份保存段落序号与段内比例，独立于故事书架；排版、窗口尺寸变化和返回阅读保留锚点。当前位置的「位置书签」可增删，与书籍「收藏」是两件事；只读副本与原作隔离，重写内容不复用旧分支锚点。存储失败明确提示，不影响正文。

查找使用与正文同一 chapterForReading 输出，只搜索已开启章节；结果提供章节标题和片段，定位到对应段落，不提前开放剧情。保留空查询、无结果、本机书签为空等真实反馈，不把查找包装成全书剧透或语义检索。

### Account

账号面板保留 Google、邮箱登录／注册、重设密码、验证状态、重试与游客路径。未配置服务时禁用提交并优先提供游客继续；登录后仍明确本机书架、不自动上传或跨设备同步。Firebase 接入存在不等于真实远程账号已验收；UI 不可宣称付费权益或在线多人已经完成。

## Do's and Don'ts

### Do:

- Do 复用当前系统字体、蓝色动作、细边界与大圆角；插画保持原文件与来源记录。
- Do 保留至少 44px 的操作命中区、16px 输入文字、safe-area 与可见键盘焦点。
- Do 把阅读偏好、段落位置和位置书签与故事数据分开；排版即时生效并保持锚点，搜索只用已开启的实际正文。
- Do 让选择、生成、保存、失败与重试状态由真实业务数据驱动；关闭面板后恢复触发点焦点。
- Do 在低透明度和高对比模式使用实色材质；六主题同时检查正文、阅读工具栏、面板和桌面导航。
- Do 保留游客路径、本机书架与草稿；合流创建独立第三本书，不改写两本原作。

### Don't:

- Don’t 恢复旧朱红／金黄粗轮廓或全站宋体展示标题；设备宋体只作为用户明确选择的阅读字体。
- Don’t 为每段文字套卡片，或把装饰性英文眉题、单次局部数值变成全站规范。
- Don’t 对正文做装饰性位移动画、逐字播放全文、添加循环粒子／WebGL 氛围或接管手机滚动；逐屏是用户发起的即时纵向导航，不是横向分页。
- Don’t 因玻璃底色好看而降低文字对比，也不要把侧车合成色阶当作运行时 token。
- Don’t 把未配置账号按钮做成可提交假入口，或宣称登录已经带来云同步、支付或多人书城。
- Don’t 以动画完成作为选择确认、导航或存档的前提。
