# REQ-41 极光主题全表面完整性审计（AURORA-AUDIT）

基线：aa1c098（worktree 分支 aurora-audit）。方法：390×844、真数据 fixture（生产镜像三书 + §54 顶格数据 + 真立绘），三主题同表面同内容对照；每条结论带 computed 实测值（`aurora-audit-shots/probes.json`）+ 截图（`aurora-audit-shots/`，未入库）。headless Chromium 的 getComputedStyle 对 backdrop-filter 恒回 none（既有定性），玻璃是否成立以截图为准、数值以背景色/圆角/边框为准。

**总判定：极光的硬漏实现只有 1 处——书城卡本体无卡面（A-01，本批按简报跳过，store-design 批处理中）。其余表面极光均有自有卡面/表面成立；另有 4 项盐系处理未入极光的「材质/排版分歧」（B 组，属极光身份，停手待主助手判）与 3 项冻结保留（C 组，前批已定案、本轮复验成立）。本批补齐落码 0 处——不是没查，是逐面实测后在范围内无其他硬漏项；强行给极光套盐系数值违反冻结口径，未做。**

## A. 漏实现（规则缺失 → 无面/破损）

| # | 表面 | 要求 | 黑 | 白 | 极光现状（实测） | 判定 | 证据 |
|---|---|---|---|---|---|---|---|
| A-01 | 书城卡本体（仅记录，本批跳过） | §53 卡面存在性 | bg rgba(24,27,33,.48)、radius 26px | bg rgba(255,255,255,.50)、radius 26px | **bg rgba(0,0,0,0)、radius 0px**（基规则无 background，玻璃壳规则仅黑/白作用域） | 漏实现 → store-design 批（e254a1a 已出方案）处理中 | 03-store-aurora.png（封面与文字直浮页面底）vs 03-store-black/white.png；probes.json store.bookCard |

除 A-01 外，逐面未发现第二处「基规则无面 + 增强规则仅盐作用域」的组件（全仓 grep 实证：`--glass-card-* / --glass-chip-* / --glass-nav-bg / --glass-modal-bg / --glass-panel-pad / --card-top-hi` 的全部消费规则均为黑/白作用域，JSX 与其余 CSS 零消费；其余组件的基规则都吃极光已别名定义的 token）。

## B. 打折/分歧（盐系处理未入极光；面存在、非破损——停手待判）

| # | 项 | 黑/白 | 极光实测 | 性质 |
|---|---|---|---|---|
| B-01 | 分区标题排版（广场「最新动态」.plaza-feed-heading h2 / .plaza-section-title / .section-heading h2） | §53 SALT-2 标签式：11px / line-height 1.5 / letter-spacing .14em / color dim-2 | **19px 粗体 ink**（基规则 .plaza-feed-heading h2 19px、.section-heading h2 18px/650）——极光全站一致的大标题式 | §53 明文作用域「仅黑/白」；改之动极光排版身份。截图对照 01-plaza-{aurora,black,white}.png |
| B-02 | 顶栏高光与 blur 半径 | §53：blur 20px saturate(1.45) + inset 顶高光 | 自有 --topbar-bg rgba(6,13,31,.93) + --blur-bar blur(16px) saturate(1.35)，无 inset 高光 | 极光顶栏有面且近实色，仅缺高光线；身份值 |
| B-03 | 卡面材质参数（帖卡/面板/续读卡/封面溶图 mask 等） | §53 玻璃组：bg .48/.50、blur 22px、radius 26px、封面下缘溶图 | 自有玻璃：bg rgba(148,178,255,.08)、blur 12px（--card-backdrop 别名）、radius 16px、封面硬边 | 面存在且可辨（01/02/05 截图）；参数差属极光材质身份，非缺失 |
| B-04 | 底栏形态 | §53 胶囊（left/right 16px、radius 999、--glass-nav-bg .98/.99） | 整幅栏：--nav-bg rgba(6,13,31,.94) + blur(16px)，选中 pill 制式同 | 极光自有形态；.94 深蓝底上滚入内容不可辨字（01-plaza-aurora.png），满足裁定②「不许透字」的实质 |

## C. 冻结保留（前批定案，本轮复验成立，不动）

| # | 项 | 复验证据 |
|---|---|---|
| C-01 | 详情氛围层 .detail-ambience 极光不渲染（盐系专属处理） | 实测极光 display:none、黑 display:block；DEVICE-FIX3 G2 定案 + tests/device-fix3.test.js 钉「aurora never un-hides the ambience」；--detail-amb-* 在极光未定义但惰性无渗色 |
| C-02 | 个人主页玻璃豁免（§53 裁定①） | 三主题同结果：主页作用域内 .profile-hero-id / .profile-stats 背景均为 transparent（黑/白由豁免规则清零盐玻璃，极光基规则本即如此）；probes profileSelf |
| C-03 | 玻璃组 token 极光未定义 | 全部消费点为黑/白作用域（见 A 组 grep 实证），极光零消费、零影响；§51 别名族（--surface-card/--card-solid/--blur-* 等）已覆盖共享组件实际消费的名字，守卫 tests/salt-theme.test.js 钉别名只许指向极光自有值 |

## D. 达标（逐面实测，极光有自有表面且行为一致）

| 表面 | 极光实测关键值 | 黑/白对照 | 证据 |
|---|---|---|---|
| 广场帖卡 .plaza-post | bg rgba(148,178,255,.08)（--glass）+ 1px line，radius 16px | 黑 rgba(255,255,255,.05) / 白 rgba(23,24,28,.045)，同 radius | 01-plaza-aurora.png |
| 广场书卡横条 .plaza-post-book | 边框+面成立、双按钮（读原作线/带化身进入）青字可辨 | 同结构 | 02-plaza-comments-aurora.png |
| 续读卡 .plaza-continue-card | bg rgba(148,178,255,.08) + --blur-card 别名 blur(12px)，radius 16px | 盐玻璃 .48/.50、radius 26（材质差见 B-03） | 01-plaza-aurora.png |
| 评论区 .plaza-thread | 分隔线 --line、行文字 ink/dim-2 分层、空态图+文案成立；评论输入 font-size 16px（styles.css:2122） | 同规则 | 02-plaza-comments-aurora.png |
| 点赞/评论动作行 | .plaza-post-action token 色，is-liked 动画三主题同规则 | 同 | 11-notify-aurora.png 上半 |
| 书城 chrome（顶栏/横幅/搜索/筛选/排序/空态） | 搜索 input 16px；筛选钮 bg rgba(148,178,255,.10)（基规则硬编码即极光青 tint）+ active --selected-surface .14；排序 active 同；空态 .store-empty 图+文成立 | 同结构同规则 | 03-store-aurora.png / 04-store-empty-aurora.png；probes store/storeEmpty |
| 详情面板 .plaza-panel（评价/世界设定等） | bg rgba(148,178,255,.08) + blur(12px) 别名 + 1px line，radius 16px，position static（盐的 ::before 垫层随氛围层冻结，见 C-01） | 盐详情作用域 .60/.72、radius 26（材质差 B-03） | 05-detail-aurora.png / 06-detail-ratings-aurora.png |
| 详情化身卡链接 .plaza-avatar-profile-link | 裸框规则三主题同（bg transparent、radius 20px），图满框 | 同 | probes detail.avatarLink |
| 详情 chips .plaza-chip | bg rgba(148,178,255,.14)（--glass-2），12px | 黑 .10 / 白 .55（盐玻璃 chips 组） | probes detail.chip |
| 个人主页（己） | hero-id/stats 透明（C-02）；头图默认织线图清晰呈现；统计/编辑资料钮成立 | 同 | 09-shelf-aurora.png（reader 己页） |
| 化身展台 .profile-stage | bg rgb(13,24,52) 实面、358×477、radius 24px；落位 scroll-margin 修复三主题同规则（DEVICE-FIX3 已验 g1-stage-landed-aurora-393.png） | 黑 rgb(28,30,34) 同几何 | probes profileSelf.stage |
| 他人主页窗 .profile-window-sheet | bg --profile-bg（极光 --bg）、radius 26px 26px 0 0、backdrop rgba(0,0,0,.45)；窗内 hero/统计/书架空态/上架区全渲染 | 同结构 | 08-profile-self-aurora.png（走查误触打开的 reader 窗，三主题同名文件） |
| 书架 | 书封面卡渲染、摆正（transform 无 rotate，REQ-20 三主题同规则）；空态虚线框+图成立 | 同 | 09-shelf-aurora.png / 08 内书架空态 |
| 造世流程 | 步进 chips 选中渐变、题材卡、随机组合卡、继续胶囊（position fixed、bg rgb(13,24,52) 实面、bottom 72px 为整幅栏留位，盐为 82px 胶囊位——各自成立） | 黑 rgb(28,30,34) / 白 rgb(250,249,246) | 12-forge-aurora.png；probes forge.actions |
| 消息中心 | 底部 sheet 深藏青实面、互动/公告/系统三 tab（active --selected-surface .14 青环）、通知行头像+文案+时间分层全渲染 | 同结构 | 11-notify-aurora.png；probes notify |
| 设置窗 .reading-dialog（壳内） | bg rgb(13,24,52)（--surface-solid）、radius 24px、position fixed；主题选择器「极光」选中青环、动效开关成立 | 黑 rgba(24,27,33,.66) / 白 rgba(255,255,255,.68)（盐玻璃 modal 组；极光走 --surface-modal→实面别名） | 10-settings-aurora.png；probes settings.dialog |
| 编辑资料窗 .profile-edit-sheet | 基规则 --sheet-bg（极光 --surface-solid）+ 输入 16px（styles.css:1402/1404） | 同规则 | 静态 + 同族 dialog 运行时证据 |
| 顶栏 .topbar | bg rgba(6,13,31,.93) + blur(16px)（B-02） | 黑 .88 / 白 .90 | probes plaza.topbar |
| 底栏 .mobile-bottom-nav | bg rgba(6,13,31,.94)（B-04） | 盐胶囊 .98/.99 | 01-plaza-aurora.png |
| 输入地板（全局） | 基规则 styles.css:484 全部 input/textarea/select font-size:16px 无作用域；评论/搜索/好友/编辑各专用规则同为 16px | 同 | 静态 + probes searchInput 16px |
| overflow 兜底 | 广场/书城/详情三面 docScrollW=390=innerW，无横向溢出 | 三主题同 | probes \*Overflow |
| 空态（书城搜索/书架/评论） | .store-empty / 书架空态 / .plaza-thread-empty 均图+文案成立、token 色 | 同 | 04-store-empty-aurora.png / 08 / 02 |
| 加载骨架 | .profile-skeleton 等吃 --profile-chip（极光别名已定义），token 驱动 | 同 | 静态（运行时拦截未命中 feed 接口，加载态截图未捕获，如实记） |
| 登录页 | 恒深色 B 式、三主题同（按简报注明） | 同 | 14-login.png（登出态广场+登录入口） |
| 阅读器 chrome | .reader-chrome 吃 --reader-* 阅读主题 token，与壳主题解耦（src/theme.js 明文 + reader-experience.css:59-63）；壳侧接触点只有 .reading-dialog（已实测） | 同 | 静态实证；运行时截图因本机浏览器环境故障未捕获（如实记，见下） |
| 第一规则·同页零重复 | 本轮走查各面未见极光专属的重复入口/内容（三主题同组件同结构） | 同 | 各截图 |

## 环境与未尽事项（如实记）

- 走查时段本机 Chromium 出现启动即 SIGTRAP（多 agent 争用期，walk 首轮成功、其后全灭，webkit/xvfb 亦不可用）：阅读器 chrome 与加载态两项运行时截图未捕获，分别以静态 token 实证 + 同组件实证替代，已在表中注明；待浏览器环境恢复后可补拍 13-reader-chrome / 15-loading。
- 本批代码改动：**0 处**（A-01 归 store-design 批；B 组停手待判；C 组冻结；D 组达标）。因此无「补后重截」环节；若主助手就 B 组任一项拍板要对齐，按极光自有值落码并重截即可。
- 测试：`node --test tests/*.test.js` = **842/850**。8 败归因与本批无关：5 条 ③a 立绘样本图未入库（worktree 既有基线，主树全绿定性在案）+ 3 条测试向 tmpdir 写 fixture 被本沙箱现行写拦 EPERM（release-safety / gemini-server 的 mkdtemp+writeFile，环境问题；npm 本体写日志亦同被 EPERM，故改直跑 node --test）。本批 src 零改动（git status 可证），无回归面。e2e 因同一浏览器环境故障（启动 SIGTRAP）未跑，量力注明。
