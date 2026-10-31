# INTEGRATE-00053 — 集成处置笔记

集成时间：2026-10-31。基线 main `0a02800`（00052）。用户 2026-10-31 11:54 审批三批一起上线，另 11:59 追加 REQ-72 并入本波。

## 并入清单（按 merge 顺序）

| 顺序 | 分支 | 提交 | Merge 提交 | 内容 |
|---|---|---|---|---|
| 1 | showcase-visual | `f831d92` | `f9e21af` | REQ-70：展台同源同比例三层（采样填充 + 同几何光晕 + contain 前景，旧 cover backdrop 退役）、DESIGN §58 全站小头像位统一脸锚规格（`:root` 四变量单点定义，11 位点 CSS 收敛） |
| 2 | creation-motion | `c69c413` | `4949999` | REQ-71：18 题材家族专属卡图 + 自由创世三层主视觉素材、DESIGN §5 动效参数表（步进 420/后退 320/hero 入场 1200/辉光 5s 等）、造世步进 GSAP 接线、「已选：历史 · 历史」同名拼接去重 |
| 3 | bughunt-20261031 | `b1dc645` | `5db6282` | 每日自查 10 修 + 守卫：帖编辑上限口径、造世确认步单列、主页弹层 Esc/遮罩/滚动锁、退出登录失败反馈、合流权限读失败态、验证码空邮箱拦截、创世神世界名计数口径、详情化身卡文字列收缩、删评价两步确认、阅读器呼出菜单「下一章准备中」态 |
| 4 | （集成波追加）REQ-72 | `0985527` | —（独立提交） | 广场帖书卡去掉简介：删 PlazaPostBookCard 的 `cardIntroExcerptFor` 计算与渲染行、main.jsx 相应 import、styles.css `.plaza-post-book-intro` 死规则；`cardIntroExcerptFor` 本体保留在 plaza.js（device-fix3 单元与 §54 规格仍引用）。帖子正文不动、详情页「本书简介」不动。广场内其他位置核查：无独立书预览层渲染简介，帖内书卡是唯一渲染点（详情页 plaza-prose 属详情页本体）。新增守卫 tests/req72-plaza-card.test.js 4 条 |

## 冲突处置

三批均为基于 `0a02800` 的单提交，merge 顺序 showcase → creation → bughunt，**git 三方合并全部自动完成、零文本冲突**。预期冲突面逐面人工复核（自动合并只保文本不撞，语义另核）：

- **DESIGN.md**：creation 的 §5 动效参数行（第 141–148 行，`--dur-step-fwd` 等 8 行）与 showcase 的 §58（第 847 行）并存不互覆盖，逐行在位。
- **src/styles.css**：§58 脸锚变量（`--face-pos/--face-zoom/--face-origin/--face-plain-pos`）在 `:root` 单点定义（第 45 行），无后合入批次的重复定义/覆盖；静态核查中唯一的「重复定义」`--profile-panel`×3 是基线既有的三主题作用域写法（基线同为 3 处），非合并产物。creation 的 forge 动效类、bughunt 的 min-width/弹层样式各居其区，无同选择器互踩（守卫测试交叉印证，见下）。
- **src/main.jsx**：三批守卫测试合计 81 条先行全绿（showcase-visual / profile-showcase / shell-migration / genre-freedom / startflow-ui 含 REQ-71 接线断言 / bughunt-20261031），含 creation 首版 TDZ 前车之鉴对应的接线断言；全量与 build 进一步兜底（见测试对账）。

## Gemini 复核（agy gemini-4-argon-high）

复核范围为三批 merge 树（`0a02800..5db6282`），总判定 **PASS**，六个检查面全部「无问题」并附行号证据：

- **styles.css §58 级联**：脸锚四变量仅 `:root` 单点定义（styles.css:48），后续主题块与第二处 `:root`（1308–1315）均未重复定义或覆盖；11 个消费位点未被另两批触碰。
- **styles.css 正交性**：creation 的动效变量/类（`--dur-step-fwd` 等、`.genre-hero-*`、`sel-mark-pop`）与 bughunt 新增（`.forge-layout.is-confirm`、`.plaza-avatar-panel>div`、弹层）无同选择器踩踏；`.forge-layout.is-confirm`（外层网格列宽）与 `.forge-step-panel`（内层面板位移动效）作用于不同节点与属性。
- **main.jsx TDZ**：Forge 区段 `step`(2115)/`forgeAnimate`(2122)/`prevStepRef`(2123)/`rollFx`(2124) 均声明在三段动效 effect（2131–2208）之前，无 TDZ；bughunt 各区（Reader、PlazaPostCard、BookRatingsSection、ProfileSettings、EditProfileSheet）声明顺序逐一核过，Esc 回调仅异步调用、无同步求值风险。
- **art-edges 采样时机**：`samplePortraitEdges` 在 `ShowcaseFill` 的 `useEffect([url])` 中触发、带 `live` 守卫与模块级缓存，另两批未触碰 `art-edges.js`/`ShowcaseFill`/`ProfilePage` 展示区，不受影响。
- **行为互扰**：帖编辑 500 字口径、阅读器「下一章准备中」态、退出失败反馈、合流权限失败态四处 bughunt 守卫均完整未被绕过；creation 的 `twoSegmentTemplateName` 同名去重（main.jsx:603–609）四处消费点与 bughunt 的 Forge 改动零交集。

注：REQ-72 提交（`0985527`）在复核启动后落入，其改动限于 PlazaPostBookCard 单个组件的删除型修改，与上述检查面无交集，由其自有守卫测试（4 条）+ WebKit 夹具验收（见下节）单独兜底。

## 测试对账

- 三批守卫定向：81/81 全绿；REQ-72 相邻套件（req72 + cover-fix + device-fix3 + bughunt）：32/32 全绿。
- 全量（合并树，REQ-72 前）：1156 测 / 1150 过 / 6 败 = dedup ③a 样本图 ENOENT×5 + import-daylight「backup merge identical stories」×1；后者单跑 8/8 通过，属既有毫秒抖动 flake（台账有记录）。
- 全量（最终树，含 REQ-72）：**1160 测 / 1155 过 / 5 败**，败集恰为基线 dedup ENOENT×5（import-daylight 本轮通过）。
- Build 通过，新 bundle：**`index-CEFanNIn.js`**（dist/index.html 引用一致）。

## REQ-72 验收证据（WebKit 390，夹具实证）

夹具 = REQ-70 同款 fixture server + seed（作者 sv70author 发布带 50 字 synopsis 的《借火登天》并 book_share 发帖），脚本与截图在 `req72-shots/`：

- API 层先证种子书 synopsis 非空（50 字），取探针串「的人（身世成谜）的陆鸣。陆鸣以碑」；
- 渲染断言全绿：`.plaza-post-book-intro` 节点 0、探针串不入卡面文本、卡含《借火登天》+作者行+封面+读原作线/带化身进入、**卡高 127px**（极简两行卡，布局不塌）、帖正文「新书上架，第一季写完了，欢迎来读。」逐字在；
- 截图 `req72-shots/plaza-post-390.png`、`req72-shots/plaza-feed-390.png` 已亲看：卡面只剩封面/书名/作者行/操作行，无简介段。

## 部署后线上核验点（部署由主助手另走 Cloud Shell，本笔记只交接）

1. 线上 bundle 须 ≠ `index-B2m36OEE.js`（应为 `index-CEFanNIn.js` 或更新构建名），站点 200；
2. 未登录 `/api/status` 只回 `{"configured":true}`，无模型/供应商名；
3. 造世界材步：分类卡为新家族图（18 张互不相同）、自由创世主视觉为三层素材（星云/吸积环/星尘）；
4. 我的主页展台：三层结构在位（`.profile-showcase-fill` 采样渐变 + `.profile-showcase-halo` 与前景同 src 同 contain 几何、无 `.profile-showcase-backdrop` 元素）；
5. 广场信息流：带书卡的帖卡面无简介段（无 `.plaza-post-book-intro`），卡高呈极简形态；
6. bughunt 抽查：帖编辑超 500 字保存置灰、造世确认步桌面单列、阅读器呼出菜单「下一章准备中」态。

## 备注

- 本地 worktree 的 node_modules 为仓库跟踪的坏符号链接，集成期间以真实目录 + npm ci 替代完成测试/构建，收尾已恢复符号链接，提交范围内无 node_modules 异动（根治另案）。
- 未部署、未动生产数据；部署走既定 Cloud Shell 路线。
