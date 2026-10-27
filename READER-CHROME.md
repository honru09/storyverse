# READER-CHROME 批次处置记录（2026-10-28）

用户 2026-10-27 22:49 亲点番茄小说阅读器截图定案（P0）：现行常驻圆角顶栏卡（7 项）在真机宽度下标签被挤成逐字竖排、卡片压住正文第一行、底部常驻坞占屏。定案不是打补丁，而是整体照番茄模型重构。本批只做本地，未 push、未 deploy。

基线：HEAD `4d4e2d1`，单元测试 571 全绿。可靠性批的等待 overlay（portal + 视口固定）未动、未回退。

## 1. 目标模型落地

| 用户口径 | 落地 |
|---|---|
| 平时全屏沉浸，只留两行细字 | `.reader-status-top`（‹ 第N章 · 标题，‹ 可点返回）+ `.reader-status-bottom`（左进度、右实时时钟 20s 刷新）fixed 钉视口两缘，`pointer-events:none`（返回钮除外），随阅读主题着色 |
| 点中央三分之一呼出/收起 chrome | 根节点 pointerdown/click 分区判定：位移 >12px、scrollY 变化 >4、有选区、任一弹层打开、介入/重生成中、点在交互元素上，一律不算点按 |
| chrome 结构 | 顶栏：返回 + 书名/章节单行截断 + 图标钮组（设定集/封面/分享，非只读才有，热区 ≥44px）；底栏行一：上一章 — 本章进度滑杆 — 下一章；行二五等宽格：目录/设置/查找/专注/介入，图标在上标签在下、标签 nowrap 单行 |
| 点左右三分之一翻一屏 | 逐屏走既有 `pageBy`；滚动走平滑一视口；边界沿用既有翻章（含「下一章准备中」态） |
| chrome 展开滚动自动收起 | 滚动位移 >24px 收起；滑杆 seek 后 800ms 内只重设基线（防拖滑杆把菜单拖没，e2e 实测发现的真 bug） |
| 书签并入目录抽屉 | 故事级收藏迁入 ReadingTools 书签页签顶部（「收藏本书／取消收藏本书」，aria-pressed）；Reader 经 props 透传，只读线不渲染 |
| 专注模式 | 连两行细线也隐藏（visibility），点中央仍呼出 chrome，专注格 aria-pressed 自身即出口 |
| 功能零丢失 | 阅读设置全部项、目录、查找、设定集、分享、封面、保持亮屏、进度保存/恢复、前沿章卡、星图卡、章末区、介入全链路、只读线阅读态——由既有 e2e 逐项回归（见 §4） |

滑杆 seek 是新机制：`useReaderExperience.seekToProgress(percent)` 为 `readProgress` 的逆运算（同一 inset/bottomInset 口径），拖动即跳本章位置。

## 2. 逐文件变更与理由

- `src/useReaderExperience.js`：`inset()` 改测状态细线高度（兜底 38）+10；新增 `bottomInset()`；`readProgress` 用双 inset 界定可见带；新增 `seekToProgress`；`pageBy` 重叠量改 inset()+96。
- `src/main.jsx`（Reader）：删旧顶栏滚动隐藏 effect 与 `.reader-topline`、`.reader-floating-dock` 全部 JSX 与死变量（progress 字符串、chapterMetrics）；新增 `chromeOpen`/`clock`/`seekStamp`、点按分区、turnScreen、细线与 chrome JSX。状态细线内嵌 sr-only 进度节点（role=progressbar，aria-valuenow=章号）——既有 e2e 的章节身份契约靠它，不靠可见文字。返回钮 aria-label 沿用旧名（readOnly 时「返回书城」，否则故事的 backText/「我的世界」），旧 e2e 名字契约不破。
- `src/components/ReadingTools.jsx`：新增 `storyBookmarked`/`onToggleStoryBookmark` 两 props 与书签页签顶部收藏开关。
- `src/reader-experience.css`：细线/chrome 全套新规则（半透明先写实色回退、再 color-mix 88% + blur(16px)；reduced-transparency/contrast 时实色）；正文 scroll-margin-top 160px→76px；页面底部预留收紧为 54px + 安全区（page 模式同值，不再 151px）；删旧 dock/topline 规则。
- `src/reader-experience.css` 定位口径（§3 实锤）：顶部偏移进 `.page-reader` 的 `padding-top: calc(env(safe-area-inset-top) + 42px)`（≥1050px 为 48px），`.reader-layout` margin-top 归零。
- `src/reading-preferences.css`、`src/styles.css`、`src/reader-flow.css`：删 `.reader-topline`/`.reader-actions` 等已无引用规则；选择器 `:is(.reader-topline,.reading-dialog)` 改指 `.reader-chrome`；介入钮样式类名随新格子更新；弹层 × 钮钉死 44px（见 §3 §6a）。

## 3. 两项实测结论

**§6a 设置弹层 × 钮**：原截图中 × 钮骑在弹层圆角外。修法为把 `.reading-dialog.icon-button` 钉死 44×44、flex:none、align-self:center、margin:0 回到内边距网格。Chromium 390 实测：44×44，距 dialog 顶 34px / 右 21px，在网格内。

**§6b 预览缩进「视觉爆炸」**：逐像素实测推翻原假设——预览与正文字号（18px）、首行缩进（36px = 2em）、行高（36.9px）三项全等，用户真机截图量得两处缩进同 ≈40pt。观感差异来自预览框窄量尺 + 段距，不是字号放大。结论：不改 CSS，以 e2e 断言锁三项平价防回退。

**边距塌陷实锤（本批最重要的自查发现）**：首轮实现把顶部偏移放在 `.reader-layout{margin-top:42px}` 且页面 `padding-top:0`，子 margin 穿透塌陷把整个 `.page-reader` 盒下推 42px；壳层 page-in 动画又使 `.page` 成为 fixed 后代的包含块——动效开启时（真机默认）底部细线与 chrome 底栏整体落到视口下 42px（屏外），而 automated e2e 全部以 reduced-motion 运行、几何断言只查「正文不被覆盖」，双双看不见。此问题由交付前截图自查（沉浸态顶部出现来历不明的深色带）追出，探针实测坐实（pageTop=42、statusBottom bottom=886 > 视口 844）。修法见 §2 定位口径；验收新增视口边缘贴合断言 + 一次 no-preference 动效开启几何检查（见 §4）。教训与 AGENTS.md 顶栏验收教训同源：**验收口径必须包含真机等价条件（动效开启）下的边缘几何，只验内容不被覆盖不够。**

## 4. 验收结果

- 单元测试：571/571 全绿（与基线持平，无回退）。
- `npm run build`：通过。
- 新增 `e2e/reader-chrome.cjs`：360/390/430 三档 × 9 项 + 动效开启几何 1 项 = **28/28 连续两轮全绿**。含：收起沉浸（旧元素计数 0、首行 elementFromPoint 命中自身、细线贴视口两缘 ≤2px、底线含本章% + 时钟）、中央点按两态、三档标签单行 DOM 断言（spanH≤20、scrollWidth≤clientWidth+1、五格等宽差 ≤1px、图标热区 ≥44）、滚动收起、侧点翻屏（settle 后滚动量真变化）、滑杆 seek、逐屏翻页 + 设置内阅读方式往返、设置弹层几何（× 钮 40–48px、距边 ≥8px、预览三项平价）、专注模式全程。
- 既有 e2e 适配后全绿：reader 30/30（Chromium 三档）+ WebKit 390 10/10、journey 24/24、intervention 7/7、recovery 4/4、control 5/5、gemini 4/4、cloud-library 通过。适配点：各套件新增合成中央点按 openChrome 助手（在 article 上派发 pointerdown+click，绕开滚动位置与命中检测）；journey 的 revealTopline 退役（细线返回常驻可点）；control 的设定集、gemini 的分享/介入、journey 完成线介入各补一次 openChrome。
- 截图（390×844 viewport，非 fullPage）：`reader-chrome-shots/390-immersive.png`、`390-chrome-open.png`、`430-chrome-open.png`、`390-settings.png`（目录不入库）。沉浸态终验：深色带消失，细线直接落在纸面上，标题完整不裁切，底部细线左进度右时钟齐全。
- 已知抖动（挂账）：多 context 连跑时，个别时序敏感检查（滑杆 seek 落点、点按开关 chrome）曾在满载轮次偶发失败，隔离重跑与复跑均全绿；失败点随轮次游走、无固定复现，判断为 xvfb 合成环境下既有锚点恢复机制与点按/滚动的时序竞争，非本批逻辑回归。journey catch-all 的本地偶发超时为既有挂账，本批四轮全过。

## 5. design-qa 门禁判定

- Floor（可用性底线）：通过——全部阅读功能有 e2e 具名回归；热区 ≥44px、标签单行、首行不被覆盖均有 DOM 断言而非肉眼。
- Reflex（口径一致）：通过——参数全部落令牌/既有变量（42px 偏移、安全区、180ms 动效、blur 16px），无野数值新增；壳层主题与阅读主题边界不变（阅读器暖纸未被全站迁移统一）。
- Finish（成品质感）：有条件通过——本地 Chromium/WebKit 与截图自查全过；**真机（iPhone Safari）点验不在本批能力范围内**，上线后须按既有真机清单点验（细线贴合、点按分区、滑杆手感、专注进出）。
