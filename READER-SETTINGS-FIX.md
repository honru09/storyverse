# READER-SETTINGS-FIX — 阅读设置只能看不能改（2026-10-29 用户真机直报）

## 症状
真机（iPhone Safari）阅读器里打开「阅读设置」，面板能开、选项都在，但点任何
选项都不生效：字号、行距、阅读方式、主题全部改不动。A−/A+ 步进钮是好用的
（见下），坏的只有 radio 选项组与保持亮屏开关。

## 复现（先复现，后修）
本地服务（AUTH_ENABLED=false）+ Playwright，390×844 触摸上下文，用
**真实坐标触摸**点在用户真正点到的**可见 span** 上，并记录
elementFromPoint 命中层与事件流（探针 /tmp/probe-settings.cjs）：

- Chromium：五项全部正常——命中 input、change 触发、正文 computed
  font-size 即刻变化、落盘正确。既有 e2e 因此一直全绿（它们点的是
  input 元素本身，不是手指点的位置）。
- WebKit（WPE，与 iOS 同 WebCore）：**五项 radio 全部复现失败**，
  A+ 按钮正常。量测（修复前）：

| 操作（真实触摸点可见 chip） | elementFromPoint | 事件 | 结果 |
|---|---|---|---|
| 字号「大」 | `span` | click@SPAN、click@INPUT（转发），**无 input/change** | pref 未写，正文 15.98px 不动 |
| 主题「夜间」 | `i.reading-theme-swatch` | 同上 | data-reader-theme 仍 light |
| 方式「逐屏阅读」 | `span` | 同上 | mode 仍 scroll |
| 行距「疏朗」 | `span` | 同上 | line-height 仍 1.9（30.37px） |
| A+ 按钮 | button 内 span | click 正常 | fontScale 1→1.125，正文 17.98px ✓ |

## 根因
`src/reading-preferences.css` 的选项 input 用
`position:absolute; inset:0; width:auto; height:auto` 想铺满整个 label
当点击面。**替换元素（radio/checkbox）在 auto 尺寸下不拉伸的引擎差异**：
Chromium 把它拉满（命中=input，可信点击直接激活），WebKit 保持原生
~16px 小框（命中=span）。于是 iOS 上点击落到 span，只能靠 label→控件的
转发点击；而 WebKit 对这记转发点击**不执行 radio 的激活行为**——click
到了 input，却不改 checked、不发 change，React 的 onChange 永远收不到，
整块面板「只能看不能改」。旧注释里「input 覆盖标签」的修法方向没错，
但 auto 尺寸在 WebKit 根本没覆盖住。

## 改法（一行 CSS，`src/reading-preferences.css`）
覆盖规则的 `width:auto; height:auto` 改为 **`width:100%; height:100%`**
（`.reading-preference-option input, .reading-toggle-row input` 共用规则，
保持亮屏开关同治），并把上述根因写进规则注释，防止后人改回 auto。
不加 z-index 蒙层、不改组件结构、不动事件接线——让可信点击在每个引擎
都直接落在控件本体上，由原生激活行为发 change。

## 修复后量测（同探针，WebKit，390×844）
| 操作 | elementFromPoint | 事件 | 结果 |
|---|---|---|---|
| 字号「大」 | `input` | input+change ✓ | pref.fontScale=1.25，正文 15.98→19.98px |
| A+ | button | click ✓ | 1.375，正文 21.98px |
| 主题「夜间」 | `input` | input+change ✓ | theme=night |
| 方式「逐屏阅读」 | `input` | input+change ✓ | mode=page |
| 行距「疏朗」 | `input` | input+change ✓ | line-height 2.3（50.55px） |

Chromium 同探针复跑行为与修复前一致（全通，无回归）。

## 回归（常驻）
`e2e/reader.cjs` 新增检查 **“settings respond to real taps on the visible
chips (WebKit forwarding regression)”**：用 touchscreen.tap（桌面宽度用
mouse）真点可见 chip 中心，并钉死命中层不变量（elementFromPoint 必须是
INPUT）；覆盖字号（滚动+逐屏两模式各改一次）、三主题连改（夜间→暖色→
浅色，逐个主题下都验证可改）、保持亮屏开关两次真点、翻章后字号保持、
重开面板选中态保持、恢复默认收尾。

验收结果：
- e2e/reader.cjs：Chromium 320/390/1440 共 33 项全过；WebKit 320/390/1440
  共 33 项全过（含新检查）。
- e2e/reader-chrome.cjs：Chromium、WebKit 各全过。
- 全量单测 798/798 全绿（无增减，纯 CSS 修复）。
- 截图（390×844，WebKit）：`reader-settings-fix-shots/settings-before-390.png`
  （100%/标准）与 `settings-after-390.png`（真点「特大」后 150%、选中态
  迁移、预览与正文同步放大，正文 computed 23.98px）。

## 环境备注
本机 WebKit 系统库又被 VM 清空（libgstreamer 缺失）；apt 默认源
mirror.cogentco.com 经中继基本不可达，已把 /etc/apt/sources.list.d/
ubuntu.sources 的 URIs 换成 archive.ubuntu.com 后
`npx playwright install-deps webkit` 一次装通。后续 WebKit 跑不起来先查这条。
