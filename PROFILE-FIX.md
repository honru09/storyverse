# PROFILE-FIX — 主页与底栏修复批（2026-10-28，DESIGN §33）

基线：本地 main `c7e2774`（线上 storyweave-00029）。执行依据：`~/workspace/regression-designer/PROFILE-FEEL.md`（割裂感四根因 + A/B/C 方案）与 `~/workspace/regression-persona/REGRESSION-PERSONA.md` 相关条目。产品口径为用户 2026-10-28 09:06/09:14 亲定：我的主页 = 底栏普通标签页、他人主页 = 窗口式、底栏四格统一图标+标签不放真人头像、头像与化身分开（小圆位脸锚、化身独立全身位）。

**状态：代码完成、本地提交；未 push、未 deploy——截图先过用户拍板门。**

## 逐项销账

### A. 主页模型落地
| 条目 | 改法 | 证据 |
| --- | --- | --- |
| 我的主页页面化 | App 路由分流：底栏「主页」与 `#/profile/<自己 uid>` 深链都落页面形态（`ownProfilePage`），他人仍窗口；页面形态标题「个人主页 · 织界」、无关闭钮、底栏常驻 | profile-fix-shots/own-page-{black,white,aurora}-390.png；harness 断言 ×3 主题（无 .profile-window、无 ✕、title、底栏可见） |
| 底栏统一制式 | 四格 21px 图标 + 11px 标签、等宽（390 下每格 94px）、无任何图片；桌面左栏同口径 | bottom-nav-closeup-390.png；几何断言（4 格/0 图/标签 13px 单行/等宽 ±1px）；360/430 标签单行断言 |
| 桌面左栏 | 撤自带品牌标（顶栏承载唯一品牌）与「世界合流」常驻入口（合流转上下文，§26）；脚部账号钮改 user 图标 | src/main.jsx Sidebar；e2e/visual 桌面端改走上下文合流路径后全绿 |

### B. 他人主页窗口修复（PROFILE-FEEL B 档）
| 条目 | 改法 | 证据 |
| --- | --- | --- |
| B1 退场对称 | 关闭改两段式：置 closing 态演 320ms 下滑+淡出（与进场对称）后才卸载；关闭钮/遮罩/Esc/下滑共用同一路径 | harness rAF 采样：animation-name = profile-window-down，opacity 1→0.87→0.72→0.52→0.32… ≥3 淡出帧 |
| B2 滚动保全（P0） | 开窗不 navigate、不 scrollToTop；baseScroll 记忆开窗位置、关窗 rAF 恢复 | 广场滚 520 开/关前后均 520；详情页 tap 进窗往返 40 → 40 |
| B3 进场 | 入场 keyframe 去 opacity 闪烁项（只位移） | 代码 + 窗口截图 |
| B4/A5 二访缓存 | src/profile-cache.js（新）：SWR 缓存 + 按 uid 的 view-state 记忆（分段/看板/查询/排序/滚动）；入场错峰仅窗口形态且每 uid 每会话首次，页面形态永不演 | harness：二访 MutationObserver 全程无 .profile-skeleton；tests/profile-cache.test.js |
| B5 遮罩与下滑 | sheet 96→94dvh 补足顶部可点带；sheet 顶 grab 区指针拖拽（阈值 90px 或快速 flick），松手走统一退场 | other-window-open-390.png（grabber 可见）；拖拽逻辑在 ProfilePage |
| B6 纸面接缝 | 见 C 档令牌收编：黑主题纸面与壳层同为 #050507 | own-page-black-390.png；断言 pageBg == bodyBg（三主题） |
| B7 身份去重 | bio 只留描述本体，拆除旧实现拼进 bio 的 `@handle · 身份`；窗口形态不改 document.title | own-page / quiet-profile 截图：bio 为纯描述句 |
| 计数即门（原「死文本」） | 粉丝/关注改可点按钮 → 服务端 connections 名单端点（server/social.js `connections()` + 路由）→ 名单层（行内关注切换回写计数、点行跳其主页） | other-window-followers-390.png（粉丝 1 人、真实行）；tests/social-server.test.js |

**本批追加发现并顺手修掉（不在原清单）**：键盘模态下退场会「冻 330ms 后蒸发」——`html[data-input="keyboard"]` 的输入模态规则把全站动画 `animation:none !important` 关停，而 requestCloseProfile 只判 reduced-motion / motion-off、仍傻等 330ms。修法：键盘模态与 motion-off 同判、立即关闭（与该模态「无动画」的设计意图一致）。harness 实测：Tab 后 data-input=keyboard、关闭耗时 19ms。**排查注记**：此问题一度被误判为退场动画失效——合成 `el.click()` 不产生指针事件、会把应用留在键盘模态里，量到的「不演」是测量假象；改用真实点按后退场动画完整（上表 B1 数据即真实点按采样）。后续一切动效验收必须用真实点按 + no-preference 上下文。

### C. 令牌收编
| 条目 | 改法 | 证据 |
| --- | --- | --- |
| --profile-* / --sheet-* 平行令牌 | 全部改壳层令牌逐主题别名（--bg/--surface-solid/--glass-2/--line/--shadow-flat/--ink/--radius-card 等），三主题同构 | tests/shell-migration.test.js 令牌钉更新；三主题 pageBg == bodyBg 断言 |
| 编辑纸面硬编码 | #fff/#f0f0f3/#e2e3e8 等全换令牌；遮罩 .55→.62 | own-edit-sheet-black-390.png；断言：黑主题编辑面 rgb(16,16,20)、极光 rgb(13,24,52)、白主题为白 |
| 圆角/尺寸 | 合集卡 24px→var(--radius-card)；搜索胶囊 52→44px；主胶囊 48→50px | 代码 + 主页截图 |

### D. 设计师四项
| 条目 | 改法 | 证据 |
| --- | --- | --- |
| 桌面左栏合流+重复品牌 | 见 A（已撤） | visual e2e 桌面路径更新后全绿 |
| 广场价值句上移 | PlazaFeed 价值句回到页首标题行；发布行副文案缩短（兼 N-06） | plaza-feed-bottom / pill 视口图（「完结的故事线，与连载中的无限长线」在标题行） |
| 造世压砖 | ≤1049px .forge-actions 改不透明全幅贴边带（--surface-solid、无 blur/圆角/阴影）；≤759 贴底栏上缘；.page-forge 底 padding 加至 190px+ 安全区 | forge-step1-390.png（修复后）/ forge-before-390.png（注入旧值复原的修复前对照；设计师原图存 profile-feel-shots/）；断言：带体不透明、带底与底栏顶贴合 ±2px、末砖全滚净空（brickBottom 433.7 ≤ barTop 532.7）。定性：砖从不透明带下滚过是 sticky 底带常态（同底栏），原缺陷的半透明+浮动+透字三者皆除 |
| 广场作者胶囊脸锚 | 小位（32px）纵图 scale 2.05→**3.4**、锚 50% 11%（大位仍 2.05）；现状「整个人缩在圆里」实测销账 | plaza-author-pill-closeup-390.png（圆内为清晰脸部）；断言：is-portrait 在场、computed scale = 3.4 |

**visual e2e 顺带逮到的真缺陷（320 宽）**：页面边距在 ≤360 时降为 16px，行动带出血仍按 -20px → 带体每侧探出 4px、整页横向溢出（scrollWidth 324）。已补 ≤360 规则（margin/padding-inline 改 -16/16px，出血恒等于当前边距，§33 写死此纪律）。

### E. 广场卡小账
| 条目 | 改法 | 证据 |
| --- | --- | --- |
| 主按钮断词 | .plaza-card-actions .button 加 nowrap | 断言：8 个动作钮 scrollWidth == clientWidth、高 50 单行（「读原作线」不断词） |
| feed 底部被压 | feed 底部留白 | 断言：全滚后末卡底 759.7 ≤ 底栏顶 781；plaza-feed-bottom-390.png |

### F. 老书虫小账
| 条目 | 改法 | 证据 |
| --- | --- | --- |
| F-09 标题与 @handle 重复 | 无显示名时（title == handle）整行不渲染 @handle | quiet-profile-390.png（标题 quiet_scout 独行、bio 纯描述）；断言 ×3 |
| 顶栏账号钮改脸图 | Topbar 接 faceSrc/facePortrait（有立绘走脸锚、无则回落字母） | 各截图顶栏右上圆形脸钮 |
| F-02 图标钮补标签 | ≥760px 顶栏书架钮带文字「书架与备份」 | 代码 + visual 桌面 captures |
| N-03 同名副信息 | src/list-layout.js `storyDistinguisherFor`：同组冲突时依次给世界·题材/进度/主角名，不冲突不给；书架卡与合流选线卡共用 | tests/list-layout-ui.test.js |
| N-04 快照设定句读不通 | src/plaza.js `plazaPublicPremise` + REDACTION_PLACEHOLDERS：展示层把脱敏占位符折为自然句读（不动存量数据） | 单元测试（plaza 域） |
| N-06 副文案 390 截断 | 价值句上移（见 D）+ 发布行副文案缩短 + .plaza-mine-row small 放行换行 | 390 截图 |

## 验证总账
- 单元：**643/643 全绿**（含本批新增 profile-cache、social connections、list-layout、shell-migration 令牌/双形态钉）；`vite build` 通过。
- 截图 harness（profile-fix-shots/run.mjs，真 fixture + 动效开启 + 真实点按）：**44/44 断言全过，16 张图**（三主题主页、底栏特写、窗口开关与滚动恢复、粉丝名单、作者胶囊特写、feed 底部、造世修复前后、quiet 主页、360/430 窗口）。
- e2e：visual **72 captures 全绿**（390/320/1440/445；含按新口径更新的两处过期期待——桌面合流改上下文路径、创作钮可见性阈值按 §33 带体几何改写并注明理由）；journey 24/24；onboarding 18/18；intervention 7/7；avatars 8/8；cloud-library 8；control 5/5；delete-book 9；edit-book 12。阅读器文件本批未动，reader/reader-chrome 套件未跑（代码路径零交集，git diff 可核）。

## 范围外观察（交下一批，不在本批修）
- **无化身账号没有公开主页**：`GET /api/users/:uid/profile` 以化身记录为存在性判据——注册后未建化身的账号被深链打开时回 404「这位用户还不存在。」（实测：建化身前 404、建后 200）。本人主页标签页走 /api/me 不受影响；公开面链接目前只出现在有化身的作者身上，故线上暂不可见，但语义与文案都不对，建议并入账号体验收尾批。
- 桌面左栏仍有「我的世界」入口（书架页）——与主页模型不冲突（那是书架不是主页），去留未定，维持现状。

## 交付状态
本地 main 已提交（见提交信息），**未 push、未 deploy**。等用户看 profile-fix-shots/ 截图拍板后，再按惯例部署并亲验线上。
