# REQ-55 详情页信息顺序与阅读入口优化 — 处置笔记

基线：origin/main 1001e79；分支 detail-layout；只本地提交，不 push 不部署。

## 现状顺序（代码实查定案，src/main.jsx `PlazaDetail` @1001e79，自上而下）

1. 顶部行：返回链接 +「作者手写」标记（仅手写书）
2. 封面头部 `plaza-detail-cover`：封面图、《书名》、信息行（世界 × 模板 · 篇幅 · 连载中/已完结 · 作者 · 阅读量）、合流来源徽章（merged 时「由《A》×《B》融合而来」）、官方徽章
3. **评价区 `BookRatingsSection`**：平均分 + 条数 + 写评价表单（星选+文本）+ 评价列表 —— **紧贴头部排在所有内容之前**，与用户所报一致：第一次打开的人还没看到简介就先撞上写评价表单
4. 作者化身面板 `plaza-avatar-panel`（非手写书）：化身名 +「作者的化身」chip + 化身设定
5. 本书简介（有 synopsis 才显示）
6. 世界设定 `plaza-world-intro`（非手写书）：世界背景 / 核心规则 / 主角与主线
7. 主线节拍（非手写书）：前 4 章标题 +「其余 N 章节拍，进入后逐步展开」
8. **入口面板 `plaza-cta-panel`（页面最下部）**：标题「你想怎样走这条线？」+ 三张 `PlazaEntryOption` 大卡（读原作线 / 带我的化身进入 / 与我的线合流，每卡各带一句费用说明）+ 分享行（「分享到广场」ghost 按钮 + 一句说明文）
9. 底部行：作者本人=下架行；访客=举报按钮

问题定案：评价区在第 3 位（头部之后第一块内容）；阅读入口在第 8 位（全页最下），与用户报障逐项吻合。

## 定案目标顺序（自上而下）

1. 顶部行（不变）
2. 封面头部 + **评分一行摘要**（新增于头部信息行之下：星 + 均分 + N 条评价；无评价显「暂无评价」，与书城卡 REQ-40 P3 同口径；数据取 detail 自带 ratingAverage/ratingCount，不额外发请求）
3. **阅读入口组 `plaza-entry-panel`（紧跟头部）**：
   - 主按钮（primary、全宽、一个）：开始阅读 / 继续阅读（本机有该书阅读进度时显「继续阅读 · 第 N 章」，进度取本机 reading-locations 中该书最后一条位置，与阅读器封面页的开始/继续口径同源）
   - 次级行（统一小钮、图标+短词）：目录（有节拍时，滚动到主线节拍区）/ 化身进入 / 合流 / 分享
   - 一行费用事实：「读原作不消耗你的生成额度 · 化身进入与合流的新章节会消耗你的生成额度」（手写书换原手写说明句）
4. 本书简介
5. 作者化身面板（从第 4 位移到简介之后、世界设定之前：先讲这本书，再介绍走完它的主角，再展开世界）
6. 世界设定
7. 主线节拍（加 `id="plaza-detail-beats"` 作目录钮落点）
8. **评价区 `BookRatingsSection` 整体垫底**（组件内部结构不变：摘要+表单+列表）
9. 底部行（不变）

合流来源：基线只有头部来源徽章，无独立来源区（REQ-53 在 fusion-multi 分支做），本批不动其有无逻辑，徽章保留在头部。

## 按钮清单（留 / 降 / 删，逐个）

| 现按钮 | 处置 | 新形态 |
| --- | --- | --- |
| 读原作线（入口大卡） | **留·升格** | 入口组主按钮「开始阅读 / 继续阅读 · 第 N 章」，行为不变（onReadLine 打开阅读器，封面→目录→正文、自动续读） |
| 带我的化身进入（入口大卡） | **降** | 次级小钮「化身进入」，行为不变（onEnter） |
| 与我的线合流（入口大卡） | **降** | 次级小钮「合流」，状态行为不变（no-line→去造世；needs-enter/ready→去合流页预选本书），no-line 时弱化样式 |
| 分享到广场（ghost 按钮+说明文一行） | **降·并入** | 次级小钮「分享」同排；删其说明文「把这本书推荐给广场上的其他人」 |
| （无）目录 | **新增** | 次级小钮「目录」，滚动到主线节拍/目录预览区（阅读器内目录仍是打开书后封面页的下一页，不在此重复造全量目录） |
| 三卡各自的费用长句（读卡「不消耗…」+ 进入/合流卡各一句「新章节会消耗…」） | **删·合并** | 入口组下一行短句一次说清，两事实各出现一次 |
| 入口面板标题「你想怎样走这条线？」/「读这本书」 | **删** | 主按钮本身即标题级动作，不再单设问句标题 |
| `PlazaEntryOption` 组件 + `.plaza-cta-panel/.plaza-entry-options/.plaza-entry-option/.plaza-share-row` 样式 | **删** | 改版后无引用，组件与样式一并移除（e2e/write-mode 的旧定位器同步更新） |

## 实现

改动文件：

- `src/main.jsx`（PlazaDetail）：头部封面 copy 内新增评分一行摘要 `.plaza-detail-rating`；原顶部 BookRatingsSection 摘除并整体移至节拍区之后垫底（全页只挂一次）；新增入口组 `.plaza-entry-panel`（主按钮 `.plaza-entry-read` + 次级行 `.plaza-entry-action` × 目录/化身进入/合流/分享 + 费用事实一行）；简介面板移到入口组之后；节拍区加 `id="plaza-detail-beats"`；整块删除 `plaza-cta-panel` 与 `PlazaEntryOption` 组件定义；本机进度 `readProgress` 取自 READING_LOCATION_KEY 中该书最后一条位置（null=未读→「开始阅读」）。
- `src/styles.css`：新增 `.plaza-detail-rating`、`.plaza-entry-panel`、`.plaza-entry-read`、`.plaza-entry-row`、`.plaza-entry-action`（+.is-muted）；删除 `.plaza-cta-panel h2`、`.plaza-entry-options`、`.plaza-entry-option` 系列、`.plaza-entry-copy`、`.plaza-share-row`。§53 参数与三条硬裁定未动。
- `tests/entry-options.test.js`：页面接线用例改写为 REQ-55 口径（旧三卡断言→单主按钮+次级短标签+费用事实各一次）；其余用例（融合状态机/生成门/章名回落）不变。
- `tests/detail-layout.test.js`（新增，6 用例）：源码顺序断言（封面<入口组<简介<化身<世界<节拍<评价）、评分摘要取 detail 自带字段、主按钮文案读本机进度、目录落点 id 与融合状态保留、hooks 位置回归（见下）、样式留/删断言。
- `e2e/write-mode.cjs`、`e2e/bookstore-plaza.cjs`：定位器更新（`.plaza-entry-option`「读原作线」→`.plaza-entry-read`；「分享到广场」按钮→`.plaza-entry-action`「分享」）。
- `detail-layout-shots.mjs`（新增）：夹具播种 + 三主题截图 + DOM 断言脚本（可重跑）。

**实修一坑（hooks 顺序）**：初版把 `readProgress` useMemo 放在 PlazaDetail 的 loading/error 早返回之后——首渲染（detail 未到）钩子数少、书到后多一个，触发 React #310「Rendered more hooks than during the previous render」，整页被错误边界吞掉。已上移至 fusionEntry 旁（早返回之前），并在 detail-layout.test.js 加位置回归断言钉死。

## 验收

- 单元测试：`tests/detail-layout.test.js` + `tests/entry-options.test.js` 定向跑 16/16 通过；全量 `npm test` **911/917**——失败为 dedup 样本图 ENOENT ×5（基线已知环境集，worktree 无 dedup-shots 素材目录）+ `import-daylight` 的 backup-merge 用例 ×1（该文件已知偶发抖动，单跑 8/8 通过，与本批改动无关）。与基线 906/911 对账：总数 +6 = 本批新增 detail-layout 用例，无新增真失败。
- 构建：`npm run build` 通过。
- 截图（390×844，Chromium——本沙箱 Playwright WebKit 建页即崩，已探针回退并在脚本中注明）：夹具服务（ratings-shots/dev-server.mjs，内存存储）播种普通书《借火登天》（24 章完结）+ 合流书（沈砚×陆鸣，6 章完结）+ 读者一条 5 星评价；三主题 × 两本书 ×（首屏 + 滑到底）共 12 张，存 `detail-layout-shots/`，`results.json` 存断言明细。
- DOM 断言 30/30 通过（每主题×每本书 5 条）：评价区 top > 世界设定 top 且 > 节拍 top；入口组 < 简介（夹具书 synopsis 为空、简介面板不出，断言回落与世界设定比，仍成立）；主按钮 bounding rect 完全落在首屏 844 视口内（top 454.5 / bottom 504.5）；头部评分摘要行存在；主按钮文案「开始阅读」、次级行「目录 / 化身进入 / 合流 / 分享」。
- 截图亲看：黑色普通书首屏（评分行在封面图上、主按钮全宽紧跟头部、次级钮一行、化身面板随后）与底部（节拍→读者评价→举报）、白色合流书首屏（融合徽章+暂无评价+入口组）、极光普通书首屏、白色/极光合流书底部（节拍→评价表单→举报）均符合定案顺序与按钮层级；§53 玻璃面板边线与实体感保持，极光深蓝身份未动。
