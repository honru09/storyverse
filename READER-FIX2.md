# READER-FIX2 — REQ-46：翻页引擎重做 + 本人主页展台复核（2026-10-30）

起因：用户在 00047-cqk 上录屏实锤克隆 sheet 翻页在真机 WebKit 过渡时两页文字叠印成糊，亲定改法「固定一个容器、每页文字量固定封顶、整页滑动+翻页动画」；另亲报本人主页化身大卡仍无头（上一批 FIX4 量的是他人主页窗口面）。基线 = main 233955f，分支 reader-fix2，未合 main、未部署。

## 一、翻页引擎重做（废克隆 sheet，换预分页整页滑动）

### 新结构
- `src/reader-pager.js`（纯逻辑）：`packPages(lines, pageHeight, {titleHeight, paragraphLengths})` 只在整行边界断页——段间距仅在同页跨段时计、页顶丢弃；`displayTotal`（含章末页）；`progressForPage`（首页 0%、末页 100%）；`pageForProgress`；`pageForAnchor`（锚点 {paragraph, offset 0..1} ↔ 页，双向）。
- `src/components/ReaderPager.jsx`：隐藏测量宿主 `.reader-pager-measure` 在 pager 视口内以真实排版类复刻整章（article.reader-article > h1 + .reader-prose > p.article-lede + .article-body > p，段落带 data-p），Range getClientRects 读行盒切页；每页是固定不透明盒 `.reader-pager-page`，内装该页的真实文本切片（按行边界切的段落，不是克隆）；章末家具是真页 `.reader-pager-end`。
- `src/useReaderExperience.js` 整文件重写：克隆引擎全删（buildStage/cloneIntoSheet/animateTrack/settleAt/drainQueue/旧 drag 全无）；page 模式的 capture/restore/进度/seek/翻页/拖动/跨章一律委托 pager API（registerPager 注册），scroll 模式走原 DOM 路径不变。
- `src/main.jsx`：章末家具抽为共享 `endMatter`（page/scroll 两模式同源）；page 模式渲染 `<ReaderPager>`，scroll 模式保留原 article；turnScreen 加 page 分支——章界即页界（末页再翻→下一章、首页再翻→上一章）。
- CSS：删全部 `.reader-turn-*`；`.reader-pager` 高 = 100dvh − 顶栏细线 − 进度细线 − 安全区（与番茄式 chrome 的几何一致）；page 模式舞台 `height:100dvh; overflow:hidden`。

### 分页参数（393×852 实测）
- 页盒：宽 349（视口 393 − 页边距），高 746。
- **行进给口径**：行高以「到下一行顶的距离」计，段末行用该段 computed line-height——WebKit/WPE 的 Range rect 是墨迹盒（16px 字回 22px），直接拿墨迹高打包会每页溢出约 200px（初版 28–30 行/页、maxBottom 948–983 > 盒 746），此为本批抓到的第 1 个真 bug，已按行进给口径修。
- 真章节（探针号《借火登天》3 章真生成正文，1976/2107/2104 字）分页结果：5 个内容页 + 1 章末页；每页 21–23 行（末内容页 10 行），每页内容底边 707.9–735.3 ≤ 盒高 746——末行完整、无半行裁切。

### 动画
- 点按翻页：WAAPI 300ms cubic-bezier(.32,.72,0,1) 整轨 translateX。
- 拖动：1:1 跟手（激活阈值 9px）；松手临界阻尼弹簧采样关键帧（ω=18、释放速度播种、无回弹）；完成判据 |dx|>26% 页宽 或 |v|>0.45px/ms 且 |dx|>36px（沿旧口径）。动画令牌防迟到回调覆盖新位置。
- 跨章：新章当前页自 ±视口宽滑入（armCrossTurn/completeCrossTurn 两段式：先还原落定、再滑入）。
- 动效关 / reduced-motion：瞬时切换（pager 内 turnMotion 关闭路径）。

### 验收中抓到的第 2 个真 bug（跨章锚点串章）
初版 paginate 在换章时沿用旧章锚点并抢先回写，把错误锚点写进新章的进度键（第 2 章曾落到轨位 −1047、75%）。修法：paginate 以 lastChapterKey 判换章——换章只取待还原锚点、不回写，由 hook 的 restore 落定后回写；同章重分页（字号/字体/缩放/字体就绪）才保锚回写。修后第 2 章落定轨位 0、进度 0%。

### 帧验收（WebKit × 393×852 × 真章节，reader-fix2-shots/，逐张亲看）
- f01 首页落定：纸面干净、行距均匀。
- **f02 拖动中：手指 −115px、轨 −115px 严丝合缝 1:1；相邻两页并排、均不透明、零叠印零糊字**（与旧引擎录屏实锤形成对照）。
- f03 落定轨位 −349 精确一页。
- f04 章末页：星图 + 下一章按钮 + 目录 + 保存提示齐整。
- 跨章帧采样：末页 −1745 → 新章 +349/+22 → 0，方向正确、无静态闪帧；f05/f06 为落定后的第 2 章首页，字迹清晰。
- f07 字号加大后重分页保锚（命中原阅读位置）。
- 滚动模式往返：切滚动 article 恢复、window 可滚；切回逐屏 pager 恢复。
- Chromium 同套 walk 全过（chromium-f02 同样干净）。

### 验收中抓到的第 3 个真 bug（阅读器 DOM 契约在逐屏模式下丢失）
初版切片段只标了自造的 `data-pager-paragraph`，而阅读器的既有 DOM 契约是 `data-reading-paragraph`（滚动模式 article 一直在用，e2e 与查找/锚点按它寻址）——逐屏模式下按该属性寻址全部落空（e2e reader-chrome 首个等待即超时实锤）。修法：切片段落改标 `data-reading-paragraph={segment.p}`（与滚动模式同名同义），并加守卫断言钉住。

### 已知小差异（记录在案）
page 模式下切章的 h1 focus（titleRef）不执行（pager 内标题非同一节点），a11y 焦点不随章移动；scroll 模式不变。后续批可给 pager 首页标题补 focus。

## 二、本人主页化身展台（正确表面复核）

### 表面定性（先纠正前提）
ProfilePage 是同一组件两处渲染：主页标签页（is-page-form）与他人主页窗口（is-window-form）共用同一份展台 JSX 与 `.profile-stage` 规则，并非「另一套 markup」。FIX4 的量测数值（361×481、contain、flex:none）对标签页同样成立——本批在标签页表面重测，数值逐项一致。

### 复现矩阵（WebKit × 393×852，本人标签页，fixture 种子：真图主化身 + 标记图）
- 真图（用户本人立绘 768×1052）：舞台 361×481、object-fit contain、绘制区 351×481 满框，人物 6%→96.5% 全身入框、头在框内；落位后缩略图行 602–710，底栏胶囊顶 778——行不被压（余量 68px）。
- 9:16 标记图（576×1024，顶红带=头区/底蓝带=脚区）：绘制区 271×481 居中，红带与头盘完整可见、蓝带透过底部渐变可见——无裁切。
- 4:3 标记图（服务规范化为 768×576）：绘制区 361×271 居中，头带/脚带完整。
- 三主题（极光/黑/白）同盒同 fit，逐张亲看：头在框内、卡顶留白即画作自身头顶距（与海报构图一致、小而均匀），无额外空带。

### 结论（定性，非代码缺陷）
现行代码在正确表面、三种画幅、三种主题下均按 contain+模糊垫底口径工作，**无可复现的裁切机制，本批不对展台改码**——再改只会重复前三批「修了个不存在于该表面的问题」。用户截图症状（卡矮+cover 裁头）只与 DEVICE-FIX2（00044）之前的旧几何吻合，指向其一：
1. 客户端仍在跑旧构建：SW 已于 FIX3 升 v2 且导航 network-first、资产内容哈希，正常启动即自愈——请用户彻底关掉 PWA 重开一次（或删主屏图标重加）后复验；
2. 当时展台上选中的是收藏里的另一张早期画作（构图本身与现行海报契约不同）——contain 无法补出画里没有的头、也不会裁掉画里有的头，重绘该化身即可。
两条都留给父级在部署后请用户点验时一并核对。

## 三、测试与构建
- 新增 tests/reader-pager.test.js（6 条：整行打包/段间距/标题预留/锚点/进度数学）；tests/reader-page.test.js 的 REQ-38 三条换成 REQ-46 五条守卫（克隆引擎全层不存在、pager 接入、整行打包、弹簧+阈值、跨章两段式、章界=页界），净增 3 条。
- 全量 node --test：889 条，884 过，5 败——5 败全为已定性 ③a 类（tests/dedup-fix.test.js 读 dedup-shots/ 样本图，该目录未入库、worktree 不存在，ENOENT），与基线三类逐条对账无新增红项。（基线 880 + 本批新增 9 = 889 ✓）
- vite build 通过。
- 本批自备双引擎 walk（reader-fix2-shots/reader-walk.mjs、stage-walk.mjs）：WebKit + Chromium 全过（帧证据见上）。
- e2e 既存套件对账（reader-chrome.cjs / reader.cjs，基线 00047 构建与本批构建同口径实测）：**两套件在基线即已多点红，本批无新增红点类别**，逐项如下——
  - reader-chrome 场景 1「首行不被遮挡」：基线与本批同点同败（hit SECTION）。根因与本批无关：REQ-39 封面流程每次挂载必播，reload 后封面 SECTION 盖在已渲染正文上做 hit-test——套件写于封面流程之前。应用行为是用户亲定的进书顺序（封面→目录→正文），不动。
  - reader.cjs check 2「chrome 遇滚动让位」：基线能过、本批不过，机制已查实——基线的「逐屏」是混合体（正文 article 常驻可滚文档，翻页只是其上的克隆动画，window.scrollTo 真能滚、折叠监听真能响）；REQ-46 按用户亲定规格换成固定舞台后，逐屏模式 window 本就无可滚之物，该 check 的前提被规格废除。用户要的交互在本批均实测可用：点按开关 chrome（check 1 过）、显式切滚动模式后 window 滚动与 chrome 折叠如旧（walk 实测）、逐屏内一切按页走。
  - 其余基线红点（reader.cjs line 185 字号/滚动恢复族、reader-chrome 只读与动效场景的 chrome 等待超时）在本批构建上或同点、或因 DOM 契约修复而推进到更后面的断言才败，无一是本批引入的行为退化。
  - 建议（留给父级排期）：两套件按 REQ-39/45/46 的新世界观现代化（封面点击穿、逐屏深度按轨位移计、只读端逐屏化），不在本批范围内改。

## 四、红线自查
§53/§54 未动；极光色值未动；收费逻辑未碰；阅读 chrome（番茄式顶/底细线）只读取其几何常量，未改样式；不合 main、不部署（部署与用户真机点验由父级接手）。
