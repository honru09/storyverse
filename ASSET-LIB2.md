# 织界设计素材库 · 第二批（asset-lib-2）

用户 2026-10-30 16:47 令「继续生产素材并使用」+ 16:49 硬规「必须严格设计感、毛玻璃、渐进模糊」。
基线：第一批库 tip（asset-lib 874b78f，含 ASSET-PICK 选件提交）。
本批：**缺口 10 处核实成立（6 接入面 + 4 只产待集成）→ 生产 15 件 → 接入 13 件、只产 2 件**。
只动 design-assets.css / design-catalog.html / ASSET-LIB2.md 与自有接入点（main.jsx 的加载态/窗体/壳层点位）；不碰书城卡、阅读器、极光 token。

## 设计硬规（本批全件适用，逐件自检见文末）

1. 视觉语言一律以 §53 毛玻璃为骨：真 backdrop blur + 半透染色 + 发丝边线；不出实面哑光平行件。
2. 渐进模糊定版参数：backdrop-filter: blur + mask 线性渐变、模糊强度视觉 0→16、自悬浮元素上方约 120pt 起、背景必须半透明、只许小区域；悬浮元素保持在模糊层之上清晰。
3. 沿用第一批纪律：da- 前缀、主题 token 驱动、三主题成立（极光按 2026-10-30「看齐」后结构——玻璃 token 已补定义，仍保留 --da-glass-* 回退链兜底）；圆角阶梯；动效只 transform/opacity；reduced-motion 全关；lite-GPU 回落（html.is-lite-gpu 下模糊带退半透染色、骨架停扫）。

## 第一步：缺口清单（通读代码核实，不许凭空造件）

依据：ASSET-PICK.md「不接/留待」清单、AURORA-AUDIT.md 走查、main.jsx/styles.css 逐面核查。

| # | 缺口面 | 核实结论 |
|---|---|---|
| G1 | 渐进模糊无件、无落点 | 全站列表收尾仍是硬分割线/硬切。底栏上方信息流、他人主页窗、横向滚动行三处悬浮/滚动收尾裸奔 → FX2-01/02/03，本批接入两处（底栏上方、主页窗内底） |
| G2 | 壳层弹窗无专属框件 | 共壳问题**仍在**：ReadingDialog（main.jsx:3426）被壳层（删除书/分享/设置/会员/备份/封面…）与阅读器（目录/介入/编辑正文/设定集/阅读设置/查找）共用——框件若套 ReadingDialog 必污染阅读器（违「阅读面不接」），故**框件只落壳层自有窗**：.profile-edit-sheet（自有、::before/::after 未占用）、.profile-window-sheet → FRM2-01/02 |
| G3 | 加载态大面积裸文字 | 广场 feed、消息、好友、找人、名单、评论、评价全是「正在打开…」一行字；全站仅主页有成套骨架（.profile-skeleton）。tests/ 与 e2e/ 均无这些文案的断言（e2e/keepalive 只断言返回时 .plaza-loading 计数为 0，骨架同样不在场，安全）→ SKL2-01~04 + DTL2-02 接入 8 处 |
| G4 | 横向滚动行右缘硬切 | .plaza-following-row（overflow-x:auto）无收尾提示 → FX2-03 接入。（.store-filters 同病但在书城领地，本批不动） |
| G5 | 字数计数口径不一致 | 创世神背景设定有 .god-count，**世界名（maxLength=CUSTOM_WORLD_NAME_MAX）无计数** → DTL2-01 接入，与设定计数同式（.god-setting-meta 行内右对齐）。编辑资料显示名（maxLength 20）同缺，但 §54 宽单位口径与字符计数不一致，接字符计数会误导——**不接**，记账 |
| G6 | 弹层保存钮裸排 | 编辑资料窗保存钮直接排在窗尾、无吸底动作区，内容滚走后保存够不着 → FRM2-03 接入（sticky 玻璃条 + 上方渐进模糊带，一件覆盖硬规落点④） |
| G7 | 造世总览事实表无行分隔 | .preview-facts（题材/世界/篇幅…）只有 grid 间距 → DTL2-04 只加分隔与呼吸，不动其排版 |
| G8 | 书城格加载无骨架 | 书城加载行（main.jsx:5691）在 store-design 批领地 → SKL2-05 **只产，待集成**（其 grid/卡槽落定后替换加载行） |
| G9 | 详情页数据区无成件 | 详情元信息行（REQ-42 阅读量刚落 readcount 分支）形态未定 → DTL2-03 **只产，待集成**（readcount 集成后套详情数据区：阅读/评分/分享/篇幅） |
| G10 | 窗内顶带层叠冲突 | 主页窗抓手渲染在 ProfilePage 内（页本体 z-index 35 自成层叠上下文）；窗级顶带若压页上必糊抓手，违「悬浮元素保持清晰」→ FX2-02 **只产 + 图鉴演示，待集成**（待抓手上移窗级或页面层叠调整时落） |

核实后**确认无缺口、不造件**的面：空态（消息/评论/好友空态均已有平台 art 图+文案成套）、设置分组（.settings-card 已成套）、造世步骤指示（Stepper 胶囊步进 main.jsx:1707 已成套）、评分分布可视化（无数据源，不造假）。

## 第二步：生产清单（15 件，编号续编 FX2/SKL2/FRM2/DTL2）

实现位置：src/design-assets.css 第二批段；图鉴：public/design-catalog.html「第二批」段（#sec-batch2）。

| 编号 | 名称 | 类名 | 一句规格 |
|---|---|---|---|
| FX2-01 | 渐进模糊 · 底带 | `.da-fade-blur`（变体 `--nav` / `--sheet` / `--over`） | 两层 backdrop blur 阶梯 14px→5px（下层全高、上层下 58% 加密区）+ 半透染色 `--da-fade-tint`；默认高 148px（≈120pt 起 + 深度）；lite-GPU 退染色 |
| FX2-02 | 渐进模糊 · 顶带 | `.da-fade-blur--top` | FX2-01 的方向翻转，自顶边 16→0 |
| FX2-03 | 渐进模糊 · 横向边 | `.da-fade-x` | overflow-x 行右缘 mask 渐隐，尾 28px |
| SKL2-01 | 骨架块 | `.da-skel`（`--line`/`--circle`/`--media`/`--cover`） | 半透玻璃 tint + 发丝边 + 微光扫（复用 da-shimmer-sweep 关键帧） |
| SKL2-02 | 帖卡骨架 | `.da-skel-post`（容器 `.da-skel-feed`） | 广场帖卡玻璃骨替身（--glass-card-* 回退链） |
| SKL2-03 | 行骨架 | `.da-skel-row`（+`.da-skel-colline`/`.da-skel-rowline`） | 圆头像 + 双行 + 尾列槽的列表行 |
| SKL2-04 | 文行骨架 | `.da-skel-lines` | 纯文本面行组 |
| SKL2-05 | 书卡骨架 | `.da-skel-book` | 方封面 + 两行，与书城 v3 卡同槽位（只产） |
| FRM2-01 | 壳层弹窗框 | `.da-sheet-frame` | 织线顶饰（132px）+ 四角线角 + inset 高光，全走窗体 background 层：不占伪元素、不随滚动漂移 |
| FRM2-02 | 弹窗抓手 · 织线 | `.da-sheet-grab` | 44×5 织线渐变抓手 |
| FRM2-03 | 弹层底部动作条 | `.da-sheet-actions` | sticky 玻璃条 blur 14 + 发丝顶线 + ::before 40px 渐进模糊带 |
| DTL2-01 | 字数计数 | `.da-count`（`is-near`/`is-over`） | 等宽数字、三态色 |
| DTL2-02 | 加载行 | `.da-load-row`（+`.da-spinner--sm`） | 行内小织线 spinner + 文案 |
| DTL2-03 | 数据行 | `.da-data-row`/`-cell`/`-num`/`-label` | 玻璃行面 + 发丝分隔 + caps 标签（只产） |
| DTL2-04 | 键值行组 | `.da-kv-list` | dl 行间发丝分隔 + 行距呼吸 |

## 第三步：接入表（13 件接入 / 2 件只产）

| 编号 | 落点 | 为什么 |
|---|---|---|
| FX2-01 `--nav` | App 底栏前（main.jsx MobileBottomNav 渲染点前，`!isReaderTop` 条件下） | 硬规落点①：信息流滑入底栏上方先化开再消失；底栏本体零改动（z 29 在底栏 z 30 之下，避开集成/极光在飞面） |
| FX2-01 `--sheet`+`--over` | 他人主页窗 sheet 内底（ProfilePage 之后的窗级兄弟节点） | 硬规落点②③的窗内形态：窗内书架/列表滚到底有模糊收尾；窗级渲染避开页内滚动容器锚定问题，--over 跨过页本体 z 35 层叠上下文（z 40 仍在 sheet 局部上下文内） |
| FX2-03 | 广场关注行 .plaza-following-row | 右缘渐隐替硬切，顺带提示可横滑 |
| SKL2-02 | 广场 feed 加载态（替「正在打开广场…」裸文字，保留 role=status + aria-label 文案） | 全站最显眼的加载面先有骨；两张骨架帖形态错开（带图/纯文字）不假 |
| SKL2-03 | 消息中心 / 好友 / 关注·粉丝名单 加载态 | 三处同为「头像+双行」列表，一件三落；均保留 role=status 语义 |
| SKL2-04 | 评论区 / 读者评价面板 加载态 | 纯文本面用文行骨，不套重型卡骨 |
| DTL2-02 | 化身页标题下「正在打开…」/ 名单人数行 / 好友搜索「正在找…」 | 轻量行内等待用加载行，不值得整屏骨架的三处 |
| FRM2-01 | 编辑资料窗 .profile-edit-sheet、他人主页窗 .profile-window-sheet | 壳层自有窗专属框：顶饰+线角+高光长在 background 层，不占伪元素（窗抓手 ::before 已占用）、不随滚动漂移；共壳 ReadingDialog 不套——阅读面零触碰 |
| FRM2-02 | 他人主页窗抓手 .profile-window-grabber | 素色小条换织线抓手，与 FRM2-01 同窗成套 |
| FRM2-03 | 编辑资料窗保存行（保存钮包入 .da-sheet-actions） | 硬规落点④：保存吸底常达 + 内容滑入条下先化开（::before 渐进模糊带）；错误提示行留在条外上方不被遮 |
| DTL2-01 | 创世神世界名计数（与背景设定 .god-count 同式：hint 左、计数右，.god-setting-meta 行） | 补齐同屏唯一缺计数的字段，与既有计数视觉同构、零新样式发明 |
| DTL2-04 | 造世总览 .preview-facts 的 dl | 只加行分隔与呼吸，总览排版零改动 |
| SK
...[truncated 2157 chars]
## 集成追记（第七批合入 main，2026-10-30）

- 合并提交 9d58e22（asset-lib-2 → main，ort 自动合并零冲突）；前六批改动核查无丢（第一批 da- 接入、书城卡 v3、阅读量、极光看齐 token 均在位）。
- **SKL2-05 已接入**（提交 c622558）：书城 `Store` 加载态由裸文字行换为 `.store-grid` 内 4 张 `.da-skel-book`（与 v3 卡同槽位，行宽交错 76/48·64/52·70/44·80/50），容器保留 role=status + aria-label「正在打开书城…」。
- **DTL2-03 保持只产（图鉴件），本批不硬接**：详情页数据已由两处既有表面承担——封面元信息行（世界×题材·篇幅·状态·作者·阅读量）与紧随其后的评价区（均分+条数，由 BookRatingsSection 独立取数）；套 `.da-data-row`（阅读/评分/分享/篇幅）必然与这两处重复，违同页零重复；且分享数不在详情载荷内、评分不在 detail 对象上。干净落点须先把封面元信息行与评价区并成一个头部数据区（信息架构合并），超出本批最小接线范围，留待详情头部改版批。
