# FUSION2 — 合流·无限融合批

用户两令落地：2026-10-27 17:16（连载中的线可融合、产物继承无限、活发布）+
2026-10-28 00:01（合流入口上下文式、预选当前线）。设计师审查 #8（选线/选化身改卡片）
同批执行。基线 687b07d（591 测试）→ 本批 603 测试全绿；只做本地，未 push、未 deploy。

## 组合规则表（写死，tests/fusion2.test.js 钉住）

来源状态二分：**连载中** = 无限连载且未手动完结（`fusionSourceStateFor`）；
其余一切计入**完结**侧——有限篇幅未走完的线（未写余量不带入产物，产物开全新短本，
与历史合流一致）、无限已手动完结的线，都不再传递无限。

| 来源 A | 来源 B | 产物篇幅 | 产物结构 |
|---|---|---|---|
| 完结 | 完结 | short，6 章封顶（历史口径不变） | 6 章收束，终章结算 |
| 完结 | 连载中 | **endless** | 无终局；每 12 章一弧小升格滚动；手动完结口径不变 |
| 连载中 | 完结 | **endless** | 同上 |
| 连载中 | 连载中 | **endless** | 同上 |

- 产物 config 钉死：`storyLengthMode` = 产物模式、`targetChapters: null`（endless）、
  `finishedAt: ''`；`storyLengthModeOf` 对 merged 只认 config 里的 endless，
  其余 merged 一律 short（旧融合档行为不变）。
- endless 产物世界圣经：endingAnchor 改开放式（「没有预设的终点……直到执笔人亲手
  为它画上句号」），大纲走 `outlineFor` 滚动 24 条窗口；节拍由 endless 结构接管
  （12/24 章是小升格点、永不是终章）。
- 修复既有潜伏 bug：merged 短篇的本地场景表只有 6 条，endless 产物第 7 章起
  `sceneFor` 越界必崩——新增 `mergedVariationSceneFor`（双主角变奏场景，索引 ≥6 走它）。

## 来源标注（derivedFrom）

- 融合时在产物上钉 `derivedFrom: [a.id, b.id]` 与 `sourceTitles: [a.title, b.title]`
  （标题在融合时定格，来源改名/删除后标注不漂）。
- 可见面：设定集「这本书的来历」（由《A》×《B》融合而来 + 产物模式一行）、
  合流完成卡、广场详情融合徽章（经 snapshot 的 `sourceTitles`，源 id 永不出服务端）。
- 持久化校验放行两字段（字符串数组）；云端书架/本地库均可往返。

## 双化身与伏笔并账

- 双方 `avatarId` + `avatarAppearance` 进产物 `config.protagonists`（字段名 appearance）
  与 `config.avatarId`（= lead 侧，供发布门/主页链）。
- `mergeSourceContext`（单来源）新增 `openForeshadowing`：该来源台账里全部未回收
  伏笔（后 8 条、每条 ≤300 字，带章号）；`server/gemini.js` 的 sourceWorlds 透传，
  SYSTEM_PROMPT 明令「必须在融合线里逐步回收，不得遗忘或与之矛盾」。
- 发布快照沿用分享脱敏线：主角真名保留、trait/origin/ability 匿名化、avatar id 与
  appearance 不出门；`enterTemplate` 带 endless 模式与 `targetChapters: null`，
  进入者得到一条同样无限的新线。

## 入口清单（上下文式，预选当前线）

| 入口 | 位置 | 预选 |
|---|---|---|
| 书籍详情 | 阅读器设定集顶部「合流」节 · 与另一条线合流 | 该书为来源（source） |
| 书架条目 | 木书架每本书右下「合流」chip（hover/聚焦显形，触屏常显）+ 首页 hero「与另一条线合流」 | 该书为来源 |
| 广场详情 | CTA 面板第三动作「与我的线合流」 | 见下方解析序 |
| 总入口 | 底栏/顶栏「合流」原入口保留 | 无预选（默认当前书 → 第一本其他书） |

路由：`#/merge/<storyId>`、`#/merge/plaza:<pubId>`（routeHash 编码为 plaza%3A…，
parseRoute 解码还原）。`Merge` 组件接受 `preselect`，由纯函数
`resolveFusionPreselect`（src/fusion.js）解析，Merge 与测试共用。

广场预选解析序：① 本地已进入线（config.sourcePublicationId 命中）→ partner 侧；
② 自有原作线（plazaMine 反查）→ source 侧；③ 都没有 → 提示卡「先带化身进入这条线，
它就会出现在下面的选择里」+ 直达进入按钮（广场线只有进入过、落到自己书架上，
才有资格作合流来源——与服务端资格口径一致）。

融合线自身在书籍详情不给合流入口，改为来历标注 + 「不能再作合流的来源」说明。

## 选线卡片（设计师审查 #8）

原生 `<select>` 全部退役：故事线卡 = 世界图缩略 + 书名 + 世界·模式·进度 +
状态徽章（连载中/已完结/进行中/示例）+ 选中勾，radiogroup 语义；
挑中来源时若与 partner 冲突，partner 自动让位到示例书（沿旧 select 行为）。
选择器上方有产物模式预告一行（无限继承 / 6 章短篇，明说规则）。
样式沿 `.avatar-bring` 卡片口径与既有令牌，不另起视觉；
网格列一律 `minmax(0,1fr)` + 链上 `min-width:0`（320px 溢出实测教训，见下）。

## 防线清单

- 防自融：`createMergedStory(a, a)` 抛 RangeError（文案：同一条故事线不能和自己合流）；
  UI 侧 partner 列表恒排除 source。
- 防套娃：任一侧为 merged → 抛 RangeError（合流故事是两条线的结晶，不能再作合流的来源）；
  候选/预选/发布全链同口径（`fusionCandidatesFor` 过滤 merged 与 readOnly）。
- 资格：服务端为准不变（自己的线 + 已进入的广场线）；本批 UI 预选只从本地书架解析，
  不新增任何服务端信任。
- 发布门：merged-short 维持拒绝（原文案 /合流/ 不变）；merged-endless 落入 endless 活发布
  规则（化身归属 + ≥1 章；连载中标 serializing，手动完结后转 finished）。
  服务端发布校验对 merged 放宽到任一 protagonist 的 avatarId 属发布者
  （双化身共演的产物，partner 侧化身也算数）——lead 检查仍在客户端 gate 先行。
- 快照防泄漏：merged 快照 config 走白名单口径（redactedSnapshotConfig），
  源 id、avatar id、appearance、私密 trait/ability 字面均不出门（测试逐项断言）。

## 验收记录

- 单元：603 全绿（591 基线 + fusion2 新增 12：四组合产物表、来源二分、
  endless 产物结构/滚动节拍、双化身入 config 与 gemini 上下文、伏笔并账、
  防自融/防套娃、发布门三态、快照脱敏、15 章融合线过 validateLibrary、预选解析、路由往返、卡片 meta）。
- e2e：journey 24/24（合流段已改卡片点选 + derivedFrom/sourceTitles 断言）、
  gemini 4/4（合流段已改卡片点选）、intervention 7/7、control 5/5、
  reader-chrome 28/28、avatars 8/8、cloud-library ✓、recovery 4/4（须带 TARGET_URL）。
- 既有失败（非本批，基线 687b07d 逐项同点复现，已挂账）：onboarding 12/14、
  import 的设定集直点、visual 在「阅读设置」步超时——三者同因：阅读器 chrome 批后
  设置/设定集须先点中央呼出 chrome，旧 harness 仍直点按钮；功能本身由
  reader-chrome 28 项覆盖。建议随全站迁移批一并修三处 harness。
- 本批实修一真 bug：卡片选择器初版在 320px 撑出横向溢出（隐式网格列被 nowrap
  标题的 min-content 顶宽）→ 网格列改 minmax(0,1fr) 后 journey 320px 恢复全绿。
- 截图 fusion2-shots/（390×844，不入库）：01 书架 chip+hero 入口、02 设定集合流节、
  03 卡片选择器（预选+徽章）、04 广场详情入口、05 融合线来历标注、06 广场预选待进入提示。
  其中 04/06 走 fusion2-shots/dev-server.mjs 夹具真发布了一条融合无限线
  （发布门全链实测 200）。
