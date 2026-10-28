# READER-FIX2 — 阅读器修复批（2026-10-28）

起因：用户 2026-10-28 09:05 真机（iPhone）5 张截图亲报四处问题；外加老书虫最终回归的 N-07（同域，一并核掉）。基线 = 本地 main 4f64ff9（DESIGN §29）。定案写入 DESIGN §30。本批只提交本地 main，未 push、未 deploy。

## 1. 中央点按滚动态失效（P0）— 根因与修法

**症状（用户原话）**：得划到最上面才能点屏幕中间显示菜单，划到别处就点不了。

**根因（定案）**：点按判定走 click 路径，并带一条「pointerdown→click 之间 scrollY 变化 >4px 即作废」的守卫。iOS 上手指抬起后动量收尾与滚动锚定仍会让 scrollY 漂移远超 4px，合成 click 被系统性误杀；唯独滚到最顶端时 scrollY 被钳在 0、无法漂移——与症状严丝合缝。Chromium 探针（真实 touchscreen.tap）在 scrollY 0/1600/3200 均能开菜单，证伪了「感应区绑错位置」的初始假设、坐实 iOS 路径问题。本地 WebKit 因缺 libgstreamer 起不来，未能复现 Safari 本体，iOS 真机点验待上线后由用户完成。

**修法**（src/main.jsx Reader）：根节点改 onPointerDown/onPointerUp/onPointerCancel 配对判定——同 pointerId 配对、位移 ≤12px、时长 ≤800ms、down/up 任一端命中交互元素即作废、选区/弹层/介入中守卫保留；分区取 pointerup 的视口坐标。**scrollY 彻底退出点按有效性**，根因以注释留代码内。各 e2e 套件的合成点按助手（control/gemini/intervention/journey/reader 五个文件）统一补 dispatch pointerup；delete-book/edit-book 用真实 tap 不受影响。

**长期断言**（e2e/reader-chrome.cjs）：①「deep in the chapter」：滚 ≥3 屏后真实点按中央开/关菜单、点左/右翻屏；②「drift」：pointerdown 后页面漂移 12px 再 pointerup（手指不动）必须开菜单，位移 −122px 的拖拽必须不开——旧 4px 守卫在这条下必挂。

## 2. 顶部安全区遮字 — 修法

两行状态细线原本背景透明，正文可滑入 iOS 状态栏条被时钟切字。src/reader-experience.css 给 `.reader-status-top`/`.reader-status-bottom` 加 `background: var(--reader-bg)`：读感仍是细线，但状态栏条与底部横条区全程有纸面打底。e2e 断言两细线 backgroundColor 非透明、且贴视口上下沿。

## 3. 壳层底栏漏进只读阅读器 — 根因与修法

**根因**：App 的 `navView` 把广场阅读的导航语境映射成 `"plaza"` 喂给 MobileBottomNav，绕过了它内部 `view === "reader"` 的沉浸判断（Sidebar 高亮吃映射没错，错在底栏也吃了映射）。

**修法（共用层两处）**：① App 渲染处给底栏传真实 view（`view === "reader" ? "reader" : …`），映射只喂高亮；② CSS 保险规则 `.app-shell[data-view="reader"] > .main-shell > .mobile-bottom-nav{display:none}` 与既有 topbar 规则并列。e2e 断言三形态（自己的书沉浸检查 + 只读段）阅读器内 `.mobile-bottom-nav` 计数为 0；只读段另断言提示行字号 ≤12.5px、只读工具格为 4 格（无介入）、滚 3 屏点按成立，截图 390-readonly-chrome-open.png。

## 4. 排版专项 — 定案

参数表见 DESIGN §30。要点：默认行高 2.05→1.9、默认段距 1em→0.6em（与 2em 缩进叠加是截图里段落 cavernous 的主因）；行高档位改名 1.6 密集/1.8 紧凑/1.9 舒适/2.05 宽松/2.3 疏朗；章标题规则收并为一处（删 reader-experience.css 的第二条 h1 规则防漂移），字重 650→600、下距 1.5em→1.1em；`.page-reader .button-primary` 改 `var(--reader-action)` 实色无阴影（蓝紫渐变胶囊退场，含章末「下一章」）；剧情星图卡改纸面 surface/border、无玻璃无影；只读提示行改走 reader 令牌收安静。连带更新 tests/reading-preferences.test.js 与 e2e/onboarding.cjs 的行高期望（2.05→1.9）、e2e/reader.cjs 的行高 radio 名（宽松→疏朗，其 ×2.3 断言不变）。

## 5. N-07 边缘补偿 — 实测与修法

**实测（390×844，修复前）**：菜单展开态顶栏下沿 59px，章标题行占 42–78px，顶栏压住标题上方 17px（约上半）——与老书虫报告一致；章末同样：底栏上沿 722px，目录行下沿 727.7px、页脚下沿 779.5px 被压。

**口径（定案，DESIGN §30）**：菜单于章首开启 → 顶 padding +62px（动效开时 180ms 缓动）；于章末开启 → 底 padding +124px 并 settle 顺滚到底；中段开启不补偿。实现为 Reader 的 chromeLift 状态（开菜单瞬间按 scrollY 判定 top/bottom/无），settle 滚动借 seekStamp 守卫防被菜单自身的滚动收起监听误读——第一版把 settle 排在 padding 渲染前滚到旧高度，已改为以 chromeLift 为键的独立 effect（渲染后执行）。

**修复后实测**：顶 — 标题顶 42→104px > 顶栏下沿 59px；底 — 页脚下沿 655.5px < 底栏上沿 722px。e2e 新增 N-07 几何断言（顶栏下沿 ≤ 标题顶 +1 且 ≤ 首行顶 +1；底栏上沿 ≥ 末元素下沿 −1），三档宽全跑，390 截图 390-chrome-open-lifted.png（亲看：顶栏与标题间留白干净、五格标签单行）。

## 6. 验证数字（本机，2026-10-28）

- 单元：`npm test` **635/635 全绿**（基线 635，本批改期望值未增减条数）。
- reader-chrome：全套 39 项（三档 × 12 项 + 只读 2 项 + 动效开启几何 1 项，其中 N-07/drift/deep/只读为本批新增或加固），收口轮 **39/39 全绿**。过程中的滑杆抖动见下条记录。
- 其余 e2e：journey 24/24、recovery 4/4、gemini 4/4、intervention 7/7、control 5/5、cloud-library ✓、delete-book ✓、edit-book ✓（自起 fixture 型不传 TARGET_URL，其余 TARGET_URL=http://127.0.0.1:8899）、onboarding 18/18、reader.cjs **33/33 两轮全绿**。
- 壳层主题衔接截图：reader-fix2-shots/390-reader-shell-{black,white,aurora}.png（390 宽，暖纸阅读页在三套壳层主题下边缘一致、无底栏残影；极光一张已亲看）。
- build 通过。

**滑杆抖动（如实记录，未放宽断言）**：reader-chrome 既有检查「chrome slider seeks inside the chapter」在本批 5 轮全套运行中 3 轮各挂 1 次，失败档位逐轮游走（360→390→430），签名恒定：seek 回 0 后 scrollY 停在约 75% 位（4793–5859）；其余 2 轮（含收口轮）全绿。READER-CHROME.md §4 在本批之前已记载同一检查在 pristine 基线上的同签名时序抖动（锚点恢复与合成滚动的时序竞争），本批新增的检查（drift/deep/N-07/只读）与套件其余各项在每一轮全绿。按验收指令不为签绿放宽断言，挂账留此，后续若在真机或非合成环境复现再定性。

**reader.cjs 390 滚动收起项（老书虫沙箱抖动）**：老书虫复跑 e2e/reader.cjs 时 390 档「滚动时 chrome 应收起」在沙箱等待超时且不稳定（320/1440 PASS）。本批复跑 reader.cjs 两轮 33/33 全绿，该项两轮均过；reader-chrome 的同行为断言（scrolling folds the chrome away）在三档每一轮全绿。以本批新断言结论为准：行为成立，沙箱时序抖动。

## 7. 剩余风险

- iOS 真机点验不在本地能力内（本地 WebKit 缺 libgstreamer 起不来）：上线后须用户在 iPhone 上亲验四点 — 滚动态中央点按开/关菜单、安全区细线贴边不遮字、只读阅读全屏沉浸、滑杆手感。
- 边缘补偿对超短章（一屏放得下整章）只取顶补偿，底栏仍可能浮在章末家具上；生产章节 1600+ 字恒为多屏，不触发。
