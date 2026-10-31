# PIXELFX-WAVE4 — 内容深度融合（第四波）

2026-11-01。用户 01:58 亲令「先不部署，继续几次融合升级」——**本波只合入 main，不部署**（与波三同候 00059，部署等 Google 登录解开后一并处理）。基线 main `5ea0426`（波三终点）。DESIGN 侧见 §60 第四波段。

工作区实情：网络 clone 经代理过慢被杀，本仓由 pixelfx3 的本地 clone 复制后 `reset --hard origin/main (5ea0426)` 得到，基线与 origin 逐字一致；本地坏 main `c3cd883` 未碰。

## 落点清单（6/6 全落地，零整项放弃）

| # | 场景 | pick（主选 / 色板） | 接线点 | 触发纪律 |
|---|---|---|---|---|
| 1 | rating-success | pickups/collect-burst · GOLD（白=深琥珀、极光=紫罗兰走条目 themes） | main.jsx BookRatingsSection，`.book-ratings-picker` 内 `.book-ratings-fx` | rateBook 成功 **且** 回读 load() 真拿到 payload 才放；编辑保存同放；失败/回读失败不放 |
| 2 | shelf-collect | holy/feather-burst | ReadingTools 收藏按钮内 `.reading-bookmark-fx`，组件以同谓词自守门 | 仅「收进书架」方向触发；取消收藏不放（与点赞/关注同纪律） |
| 3 | redeem-success | ui/coin-collect | BillingPanel 兑换区 `.billing-redeem-fx` 独立挂载 | 兑换落账、成功注记同刻；不走 celebrateToast（其只认三条发布文案的口径不动，BillingPanel 本就走内联注记） |
| 4 | season-finale | byFamily grand 表（修真/副本 holy-pillar、武侠 smite、科幻/电竞 emp-blast、末世/灵异 dark-explosion、悬疑/言情 star-fall、默认 firework-burst，seeds 170–179） | 认领面三处：主页 hero `.home-hero-fx`、木书架 `.wood-book-fx`、个人主页书架行 `.profile-shelf-fx` | 账本 `src/fx/finish-celebration.js`：App 监视器见证 false→true 翻转才打 pending 戳；首见即完结只播种不打戳；claim 原子 pending→done，每书每设备一次；动效关不认领、戳留待下次 |
| 5 | search-empty | critters/butterfly（循环氛围，opacity .45–.5） | 书城 `.store-empty`（仅 searching 时）`.store-empty-fx`；书架 `.shelf-empty-note` `.shelf-empty-fx`（z-index:-1 藏于文案之后） | 同 empty-shelf 口径：不抢文案、不压面板；分类为空（非搜索）不挂 |
| 6 | follow-success | pickups/collect-burst · ROSE（白=深玫瑰） | ProfilePage 关注按钮内 `.profile-follow-fx` | 仅关注落地放；取关不放。**此按钮原 §37 的 DOM burst（burstFromElement）就此删除并被 pixelfx 取代**——一个时刻只许一种特效；其余 §37 位点不动 |

placements alt 链：rating→ui/coin-collect、holy/feather-burst；shelf-collect→pickups/collect-burst；redeem→ui/quest-complete、collect-burst；search-empty→critters/wisp、holy/sunburst；follow→ui/coin-collect、holy/feather-burst。一次性新场景全部非循环、无 actor（fx-selfcheck 循环纪律 + 测试断言双守）。

**季终的第三认领面（复核驱动的增补）**：原设计只有书架两面，但木书架按设计排除「当前书」——而最常见的完结路径恰恰是读完终章、关阅读器回到主页，当前书就是刚完结的那本，只在 hero 呈现。故 hero 增为第三认领面（同账本同守卫），否则该路径的庆祝永远轮不到主页。

**取舍记录**：广场没有搜索框，search-empty 只落书城 + 书架两处；书籍详情面不做完结庆祝（详情是深读面，且广场详情的书不在观看者账本内——完结庆祝属于「我的书架」时刻，落在书架与 hero）。

## Gemini 复核处置（agy gemini-4-argon-high，过全波 diff）

复核共报 7 bug + 4 风险。其引用含个别虚构标识（followAuthor、book-ratings-error 类名在源码中不存在），已逐条回源码核验后才处置；7 个 bug 的核心在源码中全部成立：

| # | 问题 | 处置 |
|---|---|---|
| B1 | 子 effect 先于父 effect：书在呈现中翻转完结时，认领先于 App 打戳、且不再重跑 | **修**：三处认领统一 attempt + 一次 600ms 延迟重试 |
| B2 | 保活隐藏槽位的缓存页仍听得到动效 context 变化，会在看不见的地方把 claim 烧掉 | **修**：`fxHostVisible` 守卫（不在 [hidden] 槽内、有布局盒、不被主页窗口盖住；窗口内的表面豁免），不可见时不认领、戳保留 |
| B3 | 木书架按未过滤的 otherStories 认领：搜索过滤掉的书被无声领走；格子在播放中卸载还会把 finaleFxId 永久卡死 | **修**：只认领搜索后仍可见的书；认领槽 6 秒兜底释放 |
| B4 | 刚完结的当前书在主页 hero 无认领面（见上「第三认领面」） | **修**：hero 增认领 |
| B5 | 云端合入/备份导入的老完结书会因「本地旧副本未完结→合入已完结」的翻转被误打戳 | **修**：`finishStampEligible` 时近门——updatedAt 在 3 天活动窗内（引擎预生成门同口径）才打戳；无戳存量按旧例合格、未来戳视为他机时钟偏差 |
| B6 | rateBook 成功但回读 load() 失败时（load 吞错返回 null）仍放庆祝，与错误提示同屏 | **修**：以 load() 返回 payload 为放行条件 |
| B7 | 主页/详情组件跨 uid/bookId 复用不重挂：飞行中的关注/评分会在新目标上落特效（followFx 也不在 uid 重置名单内） | **修**：uidRef/bookIdRef 目标守卫 + followFx 入 uid 重置名单 + ratingFx 随 bookId 清空 |
| R1 | ReadingTools 在 store 提交校验前乐观触发 | **不修**：与第二波 plaza-like 既定纪律一致（乐观触发、回滚不撤已播完的节拍），记账备查 |
| R2 | await 期间动效被关掉时陈旧闭包仍 setFx，状态滞留 | **驳回**：PixelfxCanvas 在动效关时走静帧路径并照常回调 onDone（一帧静图即节拍的既定降级），从不返回 null，状态不会滞留——已回组件源码核实 |
| R3 | otherStories 未 memo 化使认领 effect 每渲染重跑 | **部分采纳**：认领 find 带 storyComplete 短路、成本可忽略；不做 memo 化改造 |
| R4 | .profile-shelf-fx 138px 在书架行滚动口内上下被裁 | **修**：118px / top 38%，顶边回到行内 padding 区内；行首尾的横向裁切是横向滚动口的固有边界，节拍主体可见，接受 |

## 验证

- `npm run fx:selfcheck`：**325 个唯一渲染 / 19 场景全过**（波三 263 → 本波 325，含 6 新场景全 pick + alt 链 × 19 家族 × 3 主题）。
- pixelfx 测试文件：**32/32**（本波新增 6 项：新场景纪律与具名 pick、rose/gold 主题变体、完结账本 stamp→peek→claim 只成一次、时近门七断言、六落点接线源级断言、复核守卫接线断言）。
- 全量套件：**1221 / 1216 / 5**——5 败全为 dedup ③a 夹具图缺失的既有基线族（全新 clone 缺未跟踪文件），零新回归；此前并行 flake 本轮未出现。
- `npm run build`：通过。
- DESIGN.md §60 已补第四波段（含复核守卫定版口径）。

## 未证项

- **未部署**（用户令）：本波与波三同候 00059；真机终门（白主题下新落点可见度、季终三认领面的实际观感、关注玫瑰火花）须待部署后由用户真机点验。
- 本波未做截图/录屏验收：落点均为既有表面的小尺寸图层，无版式变更；视觉终验随部署波次一并进行。
