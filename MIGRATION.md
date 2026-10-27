# MIGRATION — 全站风格迁移批（2026-10-28）

基线 729a098（603 测试）→ 本批本地提交，不 push、不 deploy：新风格上线前须用户看全套截图拍板（既定门）。参考功课留档 `MIGRATION-REFERENCES.md`（仓库根）；拍板截图在 `migration-shots/`（不入库，runner 为 `migration-shots/run.mjs`，fixture 服务器 `migration-shots/dev-server.mjs`，接线复用主页批次的真实服务模式）。

## A. 导航四令落实表

| 令 | 落实 | 证据 |
|---|---|---|
| ① 主页窗口化 | `App` 以 `baseRoute` 记住最近的非主页路由，底层页继续渲染（`.has-profile-window .main-shell` scale(.98)+brightness(.7)），主页以 `.profile-window` 浮层呈现：手机底部大弹层（96dvh、顶圆角 26），≥760px 居中卡（min(680px,94vw)×min(92dvh,1120px)）。关闭 = 返回底层路由（pushState 回 baseRoute 的 hash），滚动与焦点不接管（标题 effect 对 profile 开/关直接跳过）；Escape 与点击遮罩可关；深链 `#/profile/<uid>` 冷启动以广场为底层。主页内顶栏左钮在窗口态变「关闭主页」。 | main.jsx App/ProfilePage；styles.css `.profile-window*`；单测 shell-migration「profile is a window」；截图 `*-profile-window-open/closed.png` |
| ② 底栏换位 | 移动底栏 = **广场 / 造世 / 书城 / 我的主页（头像入口）**。理由：广场是默认落地与发现面；造世是核心动作；书城是消费面；主页是身份面——四者是「去哪/做事/看货/我是谁」的完整闭环。合流是低频的上下文动作（从某本书出发才有意义），占常驻位是浪费，故退出底栏：入口在书籍详情（设定集合流节）、书架 chip、广场详情（融合批已落）+ 我的世界页 hero「与另一条线合流」与页脚「世界合流」行（本批补）。桌面侧栏保留五目的地（宽屏不缺位），栏脚同加我的主页，口径一致。 | MobileBottomNav/Sidebar；单测 list-layout-ui 更新 + shell-migration |
| ③ 他人主页无加号 | 主页书架工具行的「新建故事」钮以 `isSelf` 门控渲染——他人主页 DOM 中不存在该按钮；排序钮对访客保留（只影响访客自己的视图）。加书/新建只在自己的表面：我的书架（新建故事行）、本人主页、造世入口。 | ProfilePage；单测断言 + 截图 runner 在他人主页窗口实测 count=0、本人主页 count=1 |
| ④ 头像≠化身 | 脸锚参数全站统一：裁切框 overflow hidden + `object-position:50% 12%` + 立绘时 `scale(2.05)/origin 50% 14%`（与主页头部既有参数一致）。落点：广场卡头像（PlazaAvatarThumb 改框+图结构，按 `pictureKind==='avatar'` 施加）、广场详情大头像、底栏/侧栏头像入口（`.nav-face-frame`，按本人 picture.kind 施加）、我的化身行（AvatarPortrait 包脸框）、主页头部（既有规则保留）。自定义上传图同规则只取顶锚不放大（上传图本为方形人像构图）。全身立绘唯一出口 = 主页「全身展示位」（3:4、顶锚、带名字与外观说明），不与头像混用。 | styles.css `.plaza-avatar-frame/.nav-face-frame/.home-avatar-face-frame/.profile-avatar-stand`；单测断言 |

## B. 三套主题

- 结构：一套层级物理、三种色板。共享 `:root` 只留布局/字阶/圆角/动效令牌与 var() 别名链；全部颜色令牌进 `:root[data-shell-theme='black'|'white'|'aurora']` 三块，每块同名全量（单测逐块断言核心令牌齐全）。
- 极光保全：aurora 块 = 迁移前 `:root` 的逐值原样（--bg #060d1f、--glass rgba(148,178,255,.08)、--surface rgba(13,24,52,.82)、阴影等），单测以 12 个钉值断言防回退；极光的漂移背景层 `.aurora-bg` 仅在 aurora 下显示。
- 黑夜（默认）：地面 #050507、铬件单色（白 5–10% 玻璃）、品牌色只给动作/选中/星图；主页 `--profile-*` 在黑夜下逐值 = §15（#000/#1b1b20/#26262b/#a7a7ad/发丝线 .08/柔影 .35）。
- 白昼：暖白 #f7f7f4、墨字 #17181c、品牌色加深（action #0891b2 等）保对比；`color-scheme:light`。
- 主页适配：主页全部硬编码黑值已令牌化（39 处规则转换，脚本逐项断言计数；黑夜值逐一与原文相等），三套主题下主页同构呈现；编辑资料白纸弹层为跨主题固定设计（纸面），不随主题变。
- 切换：账号面板「外观主题」分段（黑夜/白昼/极光），游客态同样可换；localStorage `storyweave:shell-theme` 设备级保存；首帧前落 `data-shell-theme` 由 index.html 引用的外置脚本 `public/theme-init.js` 完成（服务端 CSP script-src 'self' 封死内联脚本，详见「验收中发现」第 2 条）。
- 无障碍媒体块同步三分：prefers-reduced-transparency 与 prefers-contrast 的实色/高对比覆盖已按主题各备一份（旧代码是极光单份 :root 覆盖，会污染新主题，已修）。
- **红线守恒**：阅读器零触碰——`reading-preferences.css` 不引用 shell-theme（单测断言）；阅读主题、番茄 chrome 模型、阅读字阶均未改。

## C. 接缝清单

| 接缝 | 实现 |
|---|---|
| 主题切换 | 铬件表面（topbar/sidebar/底栏/广场卡/弹窗）background/border 180ms 缓动 + html.theme-switching 一次性同色薄纱 320ms 淡出；动效关时不加薄纱类 |
| 壳层 → 阅读器 | 既有抽书入场（书架抽出 260ms 后开读）+ 阅读页 page-enter 令牌，未改 |
| 阅读器 → 壳层 | 状态细线返回键直达底层页，page-enter 令牌，未改 |
| 登录 → 主页 | 账号弹窗「我的主页」关闭弹窗后以同一窗口动效升起主页窗口（账号 → 主页无整页跳转） |
| 主页窗口开/关 | 底层 scale/brightness 320ms drawer 缓动 + 弹层 translateY/opacity；[data-motion=off]/reduced-motion 全局规则自动静默 |

## D. 广场与主页

- 广场改序：续读卡（有在读书时置顶：封面+书名+进度，点击直达阅读）→ 关注动态 → 官方示范行 → 我的世界行 → 发布卡 → 最新发布。发布卡折叠判定走真实门 `plazaGateFor`：任一故事线可发布才出整卡，否则折叠为一行入口（文案明示发布条件）。
- 角色先行卡：feed 首卡 `plaza-card-lead`——化身立绘左轨（整高、顶锚、名字胶囊）+ 外观行先行，世界封面与动作随后；无立绘时自动退回普通卡（PlazaLeadPortrait 失败/缺图即不渲染）。
- 扇面终修：前卡左锚铺满——卡宽 = 100%−(n−1)×18px，后卡逐张右移 18px 只露自身封面色边，层间只靠 `--profile-shadow`、无浅色边；常量 STACK_STEP_PX=18（旧 62% 宽居中版退役）。
- 身份零等待：骨架占位（136px 头像圆 + 名字/把手/计数条 + 行动胶囊 + 书架块，同尺寸、同位置，shimmer 受动效策略管辖）；身份块退出 GSAP 错峰（data-enter 只留在书架区），数据落地即时渲染。

## E. 可读契约

- 封面：生成封面统一顶锚裁切 `.story-cover>img{object-position:50% 28%}`（生成构图主体在上中部）；80px 缩略下主体可辨由该规则 + 断言钉住。生成中有诚实占位（世界图 + 「封面生成中」chip），失败静默回落（重掷在封面弹窗）。
- 星图：>16 节点聚合 ≤12 段（aggregateStates 移入 src/story-map.js 纯函数，单测覆盖 100 章情形）；段标签只留首/当前/末；小图（≤16）逐节点原样。

## F–I. 余项清账表

| 项 | 处置 |
|---|---|
| F 我的世界 | 化身行换脸框头像（露脸）；续读由 hero + 广场续读卡双落点；完结书按钮「重新阅读」（F-26 同批） |
| G 桌面双列 | 广场 feed ≥1050px 双列（lead 卡跨列）；书城既有 2→3→4 列阶梯经核查已达标（未动）；我的世界 ≥1050px 网格化：中段草稿行/化身行并排，其余通栏 |
| H 动效口径 | 本批新增动效只有：主页窗口升起/底层后退、主题薄纱、骨架 shimmer——全是状态/连续性类；无新增氛围动效；阅读正文零新增 |
| F-24 书架排序/搜索 | LibrarySwitcher ≥4 本时出搜索（标题/世界名）+ 排序（最近=updatedAt/进度=已读占比/标题），木架结构与抽书动效不变 |
| F-22 关注作者更新流 | 最小成立版：本人主页 payload 增加自有字段 `followingUids`（仅 isSelf 返回——这是本批第二处服务端增补，形状加字段不改既有字段）；广场「关注动态」横排 = 公开 feed 按该名单过滤、按 updatedAt 倒序取 6；未关注任何人时整段不渲染。不造数据、不加端点 |
| F-18 离线缓存 | public/sw.js：壳/静态缓存优先、导航网络优先回退壳、`/api/library` 与 `/api/plaza` 公开读网络优先回退缓存（仅存 200）；写请求与跨源请求永不接管。口径明示：离线可读 = 已到本设备的书（本机书架、已同步章节、打开过的广场线）；生成/发布离线不可用，应用照实报错 |
| F-33 帮助/FAQ/反馈 | HelpContent 七问（开始/额度/存储/离线/找回/广场规则/主题）+ 反馈走仓库 GitHub Issues（不编造客服邮箱）；入口：我的世界页脚 + 账号面板（登录前后都有） |
| F-26 | Home hero 完结书按钮 = 「重新阅读」（isStoryComplete 判定）；未完结仍「继续阅读/回看终章」 |
| plazaSnapshot 断言 | `snapshotSourceViolation`（src/plaza.js）：engine 缺失时，正文与 buildChapter 不一致 **且** worldBible 非本地模板（worldBibleFor 比对）才拦——单信号不拦（本地故事的版本漂移无罪）；发布端 400 明示。helper 行为单测 5 例 + 服务端路由用例（事故形 400 零落库 / 纯本地形 200 对照） |
| 章长调参 | 数据：冷启动官方季 24 章（指令 1500–2000）实际 mean 1539 / median 1494 / 带内 10/24（41.7%）/ 区间 1264–2046 → 落笔比 ≈ 指令中点 0.88、近半数跌破指令下限。改：指令带 1750–2150（schema + 系统提示同步）+ 地板句「不足 1700 字视为本章未完成，宁可多写一场完整的戏」。预测实际 mean ≈ 1720、带内率显著上升。上线后 A/B 复测协议：同组合（修仙×青岚宗）新季前 6 章 vs 旧季前 6 章比带内率与中位，结论回填本节——本批不花生成费（无授权），只动指令与断言 |
| e2e harness | onboarding/import/visual 统一加 `summonReaderChrome`（点阅读页中央呼出番茄 chrome 再点工具）；onboarding 的设置弹窗焦点断言按新 chrome 语义改（弹窗开时 chrome 自隐、触发钮卸载，焦点回文档——chrome 自身焦点行为归 reader-chrome 套件）；visual 的移动端合流路径改走 广场→我的世界行→「世界合流」（合流已退底栏），gemini/journey 的合流入口同步改走主页「世界合流」钮。visual 另修四处存量失效：截图等待的 `image.decode()` 在懒加载图上可永不返回（加 2.5s 上限）、fullPage 截图冻结动画（animations:'disabled'）、坏图判据收紧为「已完成且失败」（隐藏侧栏的未加载懒图不再误报）、summon 改状态感知 + 与自动隐藏赛跑的成对重试（summonAndClick）。 |

## 验收中发现并修复的真实缺陷（非规格内、由截图/e2e 逼出来）

1. **主页名字在窗口内被压成 0 高**：主页窗口化后 `.page-profile` 成为定高 flex 列滚动容器，`overflow:hidden` 的 flex 子项（`-webkit-line-clamp` 的名字首当其冲）自动最小高为 0、被压扁——全屏时代容器随内容长高所以从未暴露。修：窗口内 `.page-profile>*{flex-shrink:0}` + 全部壳层 clamp 规则补标准 `line-clamp` 属性；回归断言已钉（shell-migration）。
2. **主题预绘制脚本被 CSP 封死**：服务端 `script-src 'self'` 在任何配置下都拦截内联脚本，原 index.html 内联预绘制从未执行过（白/极光用户每次加载都会先闪黑底，且 React 无挂载期落属性）。修：预绘制改外置经典脚本 `public/theme-init.js`（CSP 合规、SW 缓存名单同步），断言钉住「index.html 不得再出现内联主题脚本」。
3. **拒绝存储时主题读取把应用打进 ErrorBoundary**：`readShellTheme(storage = globalThis.localStorage)` 的默认参数在 try 之外求值，隐私模式下连访问 localStorage 都抛错，recovery 的降级场景（存储被拒仍可临时阅读）被打回报错页。修：存储对象在 try 内解析；回归断言以抛错型 localStorage getter 钉住（与 recovery e2e 双保险，该套已恢复 4/4）。

## design-qa 门禁判定

- **Floor（地板）**：通过。令牌三分无野值新增（新色值全部进主题块/既有令牌）；三档宽度（360/390/430）展开态截图 + 底栏标签单行由截图与 runner 断言覆盖；主页窗口开/关两态齐全。
- **Reflex（反射）**：通过。主题切换/窗口开合/发布卡折叠都是状态变化动效且受总开关管辖；无循环氛围动效新增（骨架 shimmer 为加载语义、1400ms 交替、reduced-motion 下由全局规则静默）。
- **Finish（收尾）**：通过。全套截图（见下清单）+ 单测/e2e 真退出码 + DESIGN §27 终章 + 本报告；未上线（等拍板）即为本批的 Finish 边界。

## 验证结果

- 单元：**623/623 全绿**（基线 603 + 新增 20：shell-migration 19 + plaza-server 守卫路由 1；另更新 list-layout-ui 2 条旧口径断言至四令新契约、gemini-generator 章长断言至新指令带）。
- 构建：vite build 通过。
- e2e（全部真退出码 0）：onboarding 18/18；import 8/8；visual 72 captures（4 视口全程走完，0 failures）；reader-chrome 28/28；reader 全套；journey 24 项（390+320，含整季与合流）；recovery 4/4；gemini 4/4；intervention 7/7；control 5/5；cloud-library 全过（自起 fixture，勿传 TARGET_URL）；avatars 8/8。注：`npm run test:e2e` 的串行链在同一 TARGET_URL 下 cloud-library 会误连普通服务器，该套按其文件头注释单独跑（自起 fixture）为准。
- 截图：35 张全套 + runner 的 DOM 断言全绿（migration-shots/report.json）。

## 截图清单（migration-shots/，不入库）

390 全套 × 三主题（每套 9 张）：`{black,white,aurora}-390-{plaza,forge,store,home,profile-window-open,profile-other-shelf,profile-window-closed,profile-own,settings}.png`；宽度抽查：`black-{360,430}-{plaza,profile-window-open,profile-window-closed}.png`；桌面：`black-1440-{plaza,home}.png`。合计 35 张。种子为真实 fixture 服务（真注册/真化身/真发布/真关注）：作者 mig_author（显示名 陆青禾）发布《借火登天》（修仙季）与《霓虹账本》两条线，读者 mig_reader（沈雾）关注作者并自带续读进度；立绘为样板真图（两位作者共用同一张样板立绘，仅布局验证用）。runner 内断言：底栏四格构成、续读卡、关注动态、角色先行卡、他人主页无新建入口、本人主页有新建入口、全身展示位、桌面双列——全绿（report.json）。

## 取舍与未做

- GSAP Flip 式封面→详情逐元素 morph 未做：成本与 Safari 兜底不成比例，接缝以窗口/薄纱/页面令牌覆盖（REFERENCES 第 2 条已注记）。
- F-22 未做「更新红点/未读计数」：无已读游标数据源，不造假信号；横排动态即最小成立版。
- 离线未缓存他人主页 payload（含 viewerState，缓存会串味）——只缓存公开广场读与本人书架。
- 章长 A/B 未实跑：需真实生成费，本批无授权；协议与预测已写明，上线后按协议复测。

## 章长 A/B 复测回填（2026-10-28 实测，全文 CHAPTER-AB.md）

按上表协议执行完毕（取舍：协议写的修仙×青岚宗与数据基线不符——基线逐值实为官方季玄幻×沉潮港，故以官方季组合为 A/B 组合，旧臂复用官方季前 6 章零花费，新臂在 3128df9 上线后同组合新开一季跑前 6 章，48,356 tokens ≈ 促销 ¥10.5 / 原价 ¥21.3，未越批复硬顶 ¥50）。

- 旧臂（指令 1500–2000）：1528/1280/1317/1662/1768/1718，均值 1545.5、中位 1595、跌破 1500 者 2/6、落笔比 0.88。
- 新臂（指令 1750–2150 + 地板句）：1598/2226/2104/1863/1948/2072，均值 1968.5、中位 2010、跌破 1500 者 **0/6**、≥1700 者 5/6、落笔比 1.01。
- 判定：预测（mean ≈1720）方向对、幅度低估——地板句把落笔比拉回 ≈1.0，整条分布按指令中点等比上移；undershoot 已治，但以产品目标带 1500–2000 衡量半数过冲上沿（中点 1950 贴上沿是算术必然）。
- 建议（未改代码、待排批）：指令带回收至 1600–1950 + 地板句改 1550，按落笔比约 1.0 预测 mean 约 1750、落回目标带中心；或产品侧若把目标带上调为 1750–2150，现行指令带可保留。
