# READER-FIX3 — 阅读器紧急修复批 3（2026-10-28）

基线 cb30dc8（已上线 00028）。起因：用户 iPhone 真机验收 FIX2 不通过（2026-10-28 10:23 三张截图：呼出菜单态 / 沉浸态 / 章末态，均为新构建——章末按钮已是棕色素面）。本批以三张真机截图为唯一事实标准逐条取证；本地探针在 Chromium 以 iOS 视口 + 触摸 + **动效开启**（reducedMotion: no-preference）复现了与截图逐项吻合的几何，根因不靠猜。

## 缺陷 1 + 2：呼出菜单没有底部坞；章末顶部细线消失、正文钻状态栏

**截图证据**：图 1 呼出态只有顶栏、屏幕底部空空；图 3 滚到章末时顶部细线不在场，首行正文被 10:23 时钟与信号图标压住；图 2 中段时底部细线也不在视口内。

**根因（本地复现实锤）**：`.page-enter` 的进场动画 `page-in` 带 `transform` 且 fill-mode 为 `both`。动画播完后 forwards fill 让末帧 transform 永久生效，引擎把 computed transform 报成**单位矩阵** `matrix(1,0,0,1,0,0)` 而不是 `none`——而任何 transform（哪怕单位矩阵）都会使元素成为 fixed 后代的**包含块**。探针（动效开启）在修复前量到：阅读器全部 fixed 层锚在 `.page` 文档盒上——scrollY=1600 时顶栏 rect top = −1600、底部坞落在文档 6502px 处（视口外）；滚到文档末时顶部细线 top = −7381（随文档滚走）、底部细线恰好回到视口底（8225−7381≈844，所以图 3 里它「在场」纯属巧合）。三张截图的几何与此逐项吻合。前两批 e2e 全用 reduced-motion 上下文，动画从不生效，包含块从不形成，所以永远绿；FIX2 补的 motion-on 检查用的是单边断言（`bottom >= viewportH − 2`），元素锚到文档底（bottom=8286）时照样通过，且从不滚动——验了，但没验出来。

**修法**：`src/styles.css` 一处——`.page-enter` 的 fill-mode `both` → `backwards`，规则上方留根因注释。末帧本身就是自然态（opacity 1、无 transform），backwards 只保留入场前填充，动画结束瞬间元素回到无 transform 状态；320ms 入场期间的行为与旧版一致。无需 portal 改造：探针证明这是唯一的 transform 来源，移除后三档滚动位置几何全对（见验）。壳层其他页面同样受益（任何页面内的 fixed 元素都不再被进场动画绑架）。

**验**：探针（Chromium，动效开启，修复后）：`.page-reader` computed transform 恒 `none`；顶部细线在 scrollY = 0 / 1600 / 文档末三处恒 (0, 38)，底部细线恒 (819, 844)；scrollY=1600 呼出菜单时顶栏 (0, 59)、底部坞 (722, 844) 完整在视口内。e2e/reader-chrome.cjs 的 motion-on 段已整体改写为双边断言并新增：稳态 transform === 'none'、三处贴边、深入 3 屏点中央呼出坞 boundingBox 完整在视口内 + 五格标签单行、章末细线仍在。WebKit 层级见文末。

## 缺陷 3：正文仍然又粗又大

**取证**：对用户截图做像素测量——图 3 字距自相关 55 设备 px = 18.2pt、行距 102 设备 px = 34pt，即**字号 18px × 行高 1.9**，段距增量 ≈0.6em：FIX2 的新默认（行高/段距）在他真机上确实生效了，他仍觉「与修复前几乎无别」，说明 18px 字号本身与字重通道才是主项。本地探针默认 computed = 18px / 400 / 34.2px，与截图互洽。字重侧有两条实锤：①阅读设置存量记录的冻结机制——store 任一次变更都会把**当时**的全量默认值写进记录，此后默认值再改也不跟随；记录里若有旧字重 600，正文全员半粗体（探针验证：种入 600 后 computed 立即变 600）；②老样式 `src/styles.css` 的 `.article-lede{font-weight:550}` 是直接规则、压过继承，**每章首段恒 550**，与任何设置无关（探针 computed 实测 550）。

**修法（DESIGN §31）**：
- 默认字号 18 → **16**；字号梯收敛为 14/16/18/20/22/24（上限 32 → 24），有限数值的存量超限值就近钳制（26/32 → 24），不再原样放行。
- **正文字重与设置解耦、恒 400**：设置 UI 移除字重选项，normalize 只接受 400，存量 600 归一为 400。
- 删除 `.article-lede` 的 550 老规则，首段回归继承字重。
- 偏好记录升 version 3 并做**存量合理化迁移**：v1/v2 记录中恰好等于旧出厂默认的字段（字号 18 / 行高 2.05 / 段距 1）按「被冻结的默认值」处理，加载时跟随当前默认；用户自选的非默认值永不迁移；迁移只在内存发生，落盘等下一次显式变更。

**验（固定口径阶段）**：单元 tests/reading-preferences.test.js 18/18（新增冻结迁移、自选保留两条）；e2e 新增端到端断言——种入完整 v2 冻结记录（18/2.05/1/600）后进阅读器，computed 必须为 16px / 400 / 行高 30.4px / 段距 9.6px；motion-on 段断言默认正文与首段 computed 均为 16px/400。设置 UI 的预设（小 14 / 标准 16 / 大 20 / 特大 24）与步进器随新梯联动，reader.cjs、onboarding.cjs 的相关流程已按新梯改写并通过。

**流式演进（本批内追加，用户亲令 supersede 上文固定口径）**：上述 16px 定案落码当日，用户追加指示——字号改自动规格、不锁单一机型（原话见 DESIGN §32）。字号部分随即重做，字重解耦与存量迁移纪律不变：
- 字段 `fontSize`(px) → `fontScale`（倍率），记录升 version 4；基准 `clamp(0.9375rem, 2.56vw + 0.375rem, 1.1875rem)` 写死在 reading-preferences.js 令牌（根 16px 时即 15–19px），最终字号 = 基准 × 倍率，倍率梯 {0.875, 1, 1.125, 1.25, 1.375, 1.5}，有效范围 ≈13.1–28.5px。
- 存量 px 按 px/16 就近落档（旧梯 14/16/18/20/22/24 恰好精确落六档），旧默认 18px 的冻结值直接落标准档；设置 UI 档位改 小 0.875 / 标准 1 / 大 1.25 / 特大 1.5、读数显示百分比、字重行已删除。
- 四档实测（探针 + WebKit 矩阵，两处互洽）：360 → 15.22px / ≈21 字每行；390 → 15.98px / ≈21；430 → 17.01px / ≈22；768 → 19.00px（上限）/ 版心 38em=722px / ≈38。**诚实注记**：30–45 字/行的目标带只在 768 靠版心封顶达成；手机宽 20–22 字是约 11px 字号才可换来的物理界外值，与主流阅读 App 密度一致，不粉饰为达标（详见 DESIGN §32）。
- e2e 相应改断言：reader-chrome motion-on 段改为「默认正文 computed = 当宽流式值（容差带）/ 400、首段同」，冻结 v2 记录端到端迁移断言改查 fontScale=1 的流式值；reader.cjs / onboarding.cjs 的字号流程改倍率档位与数值容差断言。

## 缺陷 4：右侧粗黑滚动条

**取证**：像素测量——黑条宽 9 设备 px ≈ **3.0pt**，正是 iOS 原生滚动指示的厚度；图 2 中它位于滚动中段、图 3 中位于底部（跟随滚动位置），**图 1（静止、菜单呼出）中完全不存在**——只在滚动时出现，是系统指示的典型行为。全仓审计：页面主滚动区没有任何 `::-webkit-scrollbar` 定制（仅设置弹层 `.reading-dialog` 有 thin 样式、书城/广场横滑行是 `scrollbar-width:none`），本站没有样式能画出这条 3pt 的条。

**结论**：**iOS 原生滚动指示，非本站样式**。它只在滚动时短暂出现、静止即消失，无法也不应由网页去除（强行隐藏滚动指示反而伤可用性）。本批不改代码；阅读体验不受影响。

## 缺陷 5：顶栏对齐与构成

**取证**：图 1 像素测量——返回键、标题块、三个图标的垂直中心同在 ≈86.7pt 一条线上；图标字形横向位置（261/306/352pt）与本地探针的成簇几何（44px 钮、2px 间距、右缘贴边，rect 244/290/336）吻合——**图标组本身没有散、没有歪**。真正与 §24 定案不符的是标题占了两行（书名粗行 + 章名小行）：图标与返回键的中心线正好落在两行文字的夹缝里，对不齐任何一行，看着就是「没对齐」。

**修法**：按 §24 定案改单行——顶栏标题 = `书名 · 第N章 · 章名` 一行截断，返回键、标题、图标组共用同一垂直中心；`.reader-chrome-title` 的 column 堆叠 CSS 退役。

**验**：e2e 断言标题容器单行（clientHeight ≤ 24 且 scrollHeight 不溢出），motion-on 段在深滚动呼出态重复该断言；图标组 44px/成簇断言沿用既有检查并通过。

## 逐项销账表（用户三图缺陷 → 对照图 → 实测值）

对照图目录 `reader-fix3-shots/`（不入库）：WebKit 引擎、390×844、DSF 2、动效开启；全矩阵 24 格（自有/只读 × 滚动/逐屏 × 章首/章中/章末 × 沉浸/呼出）+ 360/430 呼出抽查 2 格，逐格几何见同目录 `matrix-manifest.json`。

| # | 缺陷（出处） | 修复后对照图 | 几何 / computed 实测值 |
| --- | --- | --- | --- |
| 1 | 呼出菜单无底部坞（图 1） | `390-own-scroll-mid-chrome.png`（深滚 3000 呼出）、`390-own-scroll-start-chrome.png` | 底部坞 rect (722, 844) 完整在视口内、顶栏 (0, 59)；`.page-reader` 稳态 computed transform = `none`；五格标签单行（e2e 断言 + 目检）。基线 cb30dc8 同测（WebKit）：坞锚在文档 6947–7069px 处、视口外 |
| 2 | 章末顶部细线消失、正文被状态栏压（图 3） | `390-own-scroll-end-immersive.png`、`390-own-scroll-end-chrome.png` | 文档末（scrollY 5839）顶部细线仍 (0, 38)、底部细线 (819, 844)；基线同测顶部细线 top = −7825；章末家具（星图卡/下一章钮）与两线零重叠（e2e 几何断言 chapterEndClearOfStatus） |
| 3 | 正文又粗又大（图 2/3，图测 18px × 1.9、首段 550 通道） | `390-own-scroll-mid-immersive.png` | computed 15.98px / 字重 400（390 宽、倍率 1，流式值）；首段同为 400（`.article-lede` 550 已删）；四档实测 360→15.22 / 390→15.98 / 430→17.01 / 768→19.00px，每行字数 ≈21 / 21 / 22 / 38 |
| 4 | 右侧粗黑滚动条（图 2/3） | `390-own-scroll-mid-immersive.png`（静止帧右缘无条） | 定性为 iOS 原生滚动指示：厚度 9 设备 px ≈ 3.0pt、仅滚动中出现（图 2 中段 / 图 3 底部）、静止的图 1 完全不存在；全仓主滚动区无 `::-webkit-scrollbar` 定制。不改代码 |
| 5 | 顶栏对齐与构成（图 1） | `390-own-scroll-start-chrome.png`、`430-own-scroll-mid-chrome.png` | 标题改单行截断（容器单行、scrollHeight 不溢出，e2e 断言），返回键/标题/图标组共用同一垂直中心；图标组 44px 钮、2px 间距、右缘贴边（本地探针 rect 244/290/336 与用户图字形位置 261/306/352pt 成簇吻合，本就不坏，未动） |
| 6 | 呼出态 chrome 半透明：沉浸细线与正文透印（**父代理截图亲验**，矩阵原图 `390-own-scroll-end-chrome.png`：顶栏上方有细线「‹ 第 1 章 · 雨幕备份 · 初声」淡影、顶栏下缘透出一行正文、底部坞下缘透出「第 1 / 24 章 · 本章 100%」与时钟淡影） | `390-own-scroll-end-chrome-v2.png`（及全部 *-chrome-v2 共 14 格，几何见 `matrix-manifest-v2.json`） | chrome 改纸面实色：computed background `rgb(255, 253, 246)`（alpha 恒 1、无 backdrop-filter）；呼出期间细线按状态不在场：全部 chrome 格实测 `opacity 0 / visibility hidden`（收起后恢复 1 / visible）；e2e 新增断言（reader-chrome motion-on 深滚呼出 + 只读呼出两处，Chromium 与 WebKit 双引擎、动效开启均过）；reader.cjs 的旧半透明断言（§24 口径）已按本条 supersede 改写为实色断言 |
| 7 | 正文左右边距不对称、右侧多出约 27pt（**用户看图指出 + 父代理像素实测**：矩阵原图左内容边 22.5pt 合令牌，右内容边 max/p90 同为 340pt、正文被卡在 340pt 宽） | `390-own-scroll-mid-immersive-v2.png`、`390-own-scroll-start-immersive-v2.png`、`390-own-scroll-end-immersive-v2.png` | 根因 = `.reader-prose` 的 `text-wrap:pretty`：WebKit 的 pretty 为匀尾行从每行偷走一个字（实测满行恒 20 字、墨迹右缘 341.4px），已删除该声明；修复后盒边距两侧恒 22px（盒 22→368），最满行墨迹右缘 359.7px（距盒右缘 8.3px < 1 个字进 15.97px，为左对齐下的字形量化残差，两引擎同值）；e2e 新增行盒断言（360/390/430：盒左右边距差 ≤1pt、最满行填满至 1 字内），双引擎全过 |

## 验证层级（老实话）

- 单元：643 测 642 过。本批域（reading-preferences 18/18）全过；唯一失败是并行 PROFILE-FIX 批自家未同步的断言（其 MobileBottomNav 新源码已无 `bottom-nav-profile`、其测试仍在期望），非本批文件域，未代改。
- e2e（TARGET_URL 指本地服务）：本批三套——reader-chrome 43/43（Chromium，流式构建）、reader 全过（Chromium 与 WebKit 两引擎各一遍）、onboarding 18/18。其余套件：control / gemini / intervention / journey / recovery / cloud-library 全过；avatars / delete-book / edit-book / import 在**纯 cb30dc8 基线构建上同形态失败**（注册端点在本沙箱环境回 503 等），与本批及并行批的在飞改动无关；visual 在基线绿、当前树红，卡点是并行批移除桌面侧栏「世界合流」入口后 visual 的过期期待（导航域，非阅读器）。以上均如实列账，不冒充全绿。
- WebKit：系统库已补齐并**真跑**（先后缺 libgstreamer / libevent / libavif 等与 libGLESv2，均 apt 装齐）。探针双向对照：基线 cb30dc8 在 WebKit 下同病（transform 单位矩阵、章末细线 top=−7825、坞锚文档外），修复版 WebKit 下 transform 恒 `none`、细线三处贴边、深滚呼出坞 (722, 844)；reader.cjs 全套在 WebKit 通过；26 格对照矩阵以 WebKit 出图。
- 对照截图（修复后，动效开启）：`reader-fix3-shots/`（不入库）——WebKit 390×844 全状态矩阵 24 格 + 360/430 呼出抽查（见销账表），三张关键格已由本批逐张目检（章首呼出：顶栏单行 + 底坞五格；章末沉浸：细线钉顶 + 章末家具清线；章末呼出：滑杆 100% + 顶栏让位后正文不压条）。
- **未验**：iOS 真机仍是最终裁判——根因与修复已在 Chromium 与 WebKit 两引擎实测成立（WebKit 与 iOS Safari 同引擎族），但真机观感（流式字号在用户机型上的实际密度、PingFang 字重观感、滑杆手感）只能等用户亲眼确认；本批不自称通过真机验收。

## 收尾小修（2026-10-28，父代理亲看矩阵截图后追加，销账表第 6/7 条）

- **改动落点**：`src/main.jsx`（Reader 根节点加 `data-chrome-open` 状态属性）、`src/reader-experience.css`（chrome 去 96% color-mix 与 backdrop-filter、改实色；`data-chrome-open` 时细线 `visibility:hidden;opacity:0`；`.reader-prose` 删除 `text-wrap:pretty` 并留根因注释）、`e2e/reader-chrome.cjs`（新增细线不在场 + 栏体 alpha=1 断言、边距行盒断言、引擎可选 `PW_BROWSER`、专注检查按新语义改写、motion-on 滚动改落稳等待、WebKit 无 mouse.wheel 时回退程序化滚动）、`e2e/reader.cjs`（半透明旧断言改实色断言、专注检查同口径改写）。
- **e2e 实测（本轮全绿）**：reader-chrome 46/46（Chromium 与 WebKit 各一遍，含新增 3 档边距断言与两处透印断言）；reader 30/30（两引擎各一遍）。本轮初跑曾复现三处旧检查与新语义的冲突（两处专注检查等细线在 chrome 呼出期间恢复、motion-on 平滑滚动 250ms 竞速），均属检查口径问题、已按新定案改写并复跑通过，非产品回归。
- **重拍**：全部 *-chrome 格 14 张 + 390 自有滚动沉浸三格，WebKit / DSF 2 / 动效开启，`-v2` 后缀存同目录，逐格几何（细线显隐、栏体底色、盒左右、墨迹右缘）见 `matrix-manifest-v2.json`；章末呼出与章中沉浸两格已逐张目检（无淡影、无透出、行宽回右缘）。
- **诚实注记**：边距项的盒级对称是精确的（两侧恒 22px）；墨迹右缘在左对齐下仍有 ≤1 个字进的字形量化残差（390 宽实测 8.3px，两引擎同值），不是盒子缩进——若日后要墨迹级贴边，须动 textAlign 默认值（justify），属产品口径变更，不在本小修内。环境注记：本轮开工时 VM 刚重启、WebKit 系统库被基建 replay 清空，经本地 apt 缓存 deb 直装恢复（libgstreamer 等 46 包），WebKit 方得真跑。
