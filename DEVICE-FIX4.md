# DEVICE-FIX4 处置笔记（REQ-45 + REQ-44）

基线：main 5fc8823（线上 00046-gw9）。分支 device-fix4，不合 main、不部署。
截图证据在 `device-fix4-shots/`（仅 README；PNG 本体因本机沙箱写策略 EPERM
无法拷入 worktree，原件在会话 /tmp/fix4-shots 与 /tmp/req45-shots，下文逐项列名）。

## REQ-45（头号项）阅读器两侧翻页真机未生效

### 排查与根因
- 迁移探针（node 本地跑 loadPreferences 等价路径）：v4/v2 记录与无记录都落
  page；**只有 v5 记录带 scroll 才保持 scroll**。进书链路、turn 引擎、点按
  分区在 Chromium（生产）与 WebKit/WPE（本地）双引擎量测均正常（点右
  +708/屏、track 中间态位移、中央点按呼出 chrome 全通），合并 diff 对
  reader 相关文件为空，无第二阅读面。
- 设置面位置量测（生产，852px 视口）：各 legend 的 y —— 文字大小 226 /
  阅读背景 407 / 字体 616 / 行间距 955 / **阅读方式 1050**，超出视口约
  200px，埋在 sheet 折叠线之下。
- **根因定性（双因叠加）**：
  1. 结构性：阅读方式开关是设置面第 6 组、折叠线下 ~200px，用户找不到
     开关，无从自救；
  2. 语义性：v5 的「scroll 即本人选择、永不迁移」假设不成立——开关埋没
     时猎寻开关的滚动/点按误触即可写下 v5+scroll（具体产生路径不可从
     本机确证，但与全部实证相容），一旦写入，旧迁移规则永远放行，用户
     被永久锁死在滚动模式。

### 修法
- `src/reading-preferences.js` 升 **v6 + `readingModeExplicit` 标记**：
  load 时 scroll 仅在记录带显式标记时保留，**未标记的 scroll（v1–v5
  全部存量）一律再迁 page**；store 的 `update()` 在 patch 命名
  readingMode 时（即用户真点过模式控件）置标记为真并随盘持久化，
  无关字段的更新不清除标记；写盘 version 6。
- `src/components/ReadingPreferences.jsx`：**阅读方式组移到设置面顶部**
  （intro 之下、文字大小之前），选项序改为逐屏在前（默认在前），原位
  删除不留重复组（同页零重复）；page 模式提示行保留并补「点左／右
  两侧逐屏翻页」。
- 守卫测试（tests/reading-preferences.test.js）：未标记 v5-scroll→page、
  已标记 v5/v6-scroll→保留、UI 选择 scroll 跨 store 实例粘住且无关
  更新不丢标记、写盘 version 6+标记、sheet 顺序 pin（readingMode 在
  文字大小之前且全文件仅一组）。既有两条钉旧语义的测试按新语义更新，
  未知版本样本 6→7。

### 验收（WebKit/WPE × 393×852 × 本地新 build，真章节加长 fixture）
- 未标记 v5-scroll 记录进书：`data-reader-mode="page"` ✓
- 点右 25% 区：+130ms track transform −368.7px（中间态，截图
  req45-webkit-turn-mid.png）→ 落定 scrollY **+708**（恰一屏，截图
  req45-webkit-turn-settled.png）；点左 **−708**（req45-webkit-turn-back.png）
- 已标记 v5-scroll 记录进书：mode="scroll" 保留 ✓
- Chromium 拖动跟手：指针 300→185（−115px）时 track = **−115px**（1:1，
  截图 req45-chromium-drag-mid.png）→ 落定 +708
- 设置面 legend 量测：阅读方式 **top=238 为首组**（原 1050），文字大小
  372、阅读背景 552、字体 761（截图 req45-webkit-settings-top.png）

## REQ-44-1 化身展台大卡不见头（第三次复发；FIX3「滚动切片」定案作废）

### 实证
- **文件本体无罪**：honru 立绘经生产 portrait 路由取回 = 768×1052、
  57,970 字节，md5 与 FIX3 验过的 acan-real.jpg 一致；构图人物占
  y≈6%→96.5%，头在图内。
- **生产 DOM 量测**（探针号 persona_qa_1027，极光，393×852）：stage
  361×481（top 84 / bottom 565），img 同盒、`object-fit: contain`，
  natural 768×1052，全身入框（截图 stage-prod-aurora-393.png）；
  honru 本人主页窗（探针号视角）同为 361×481 contain（截图
  honru-stage-window.png）；黑/白主题同测均 361×481 contain（截图
  req44-stage-prod-black/white.png）。**两套真实数据 × 三主题全正常。**
- **用户原图像素量测**（1179×2556）：卡 top 177px（59pt）、bottom
  ≈1150px（383pt）→ 卡高 ≈324pt，而出厂 CSS 在 361pt 宽下只可能
  481pt；人物呈 cover+底锚定（头全无、鞋全在），与 contain 几何不
  符；同一张图的悬浮底栏胶囊位于 ≈410–470pt，而出厂 fixed bottom
  在 852 视口只能位于 778–842（书城截图同症：胶囊压在第一行卡上）。

### 定性
用户截图的几何与出厂 CSS/DOM **不可兼得**：卡高、拟合方式、胶囊位置
三项同时偏离，且受控环境（双引擎、双账号真实数据、三主题）全部量测
正常。唯一与全部证据相容的解释是**用户客户端侧异常**（陈旧/混合构建
缓存，或系统截图合成伪影）——本轮不以此为代码定案，只做代码侧机制
加固（下），客户端定性留给父级与用户复验（清缓存/重装 PWA 后若仍复
现，需用户提供当次打开方式与系统版本再定位）。

### 代码侧加固（已落）
- 展台 div 摘除旧 `.profile-avatar-stand` 双类名（src/main.jsx:9160）：
  其 `width:min(300px,84%)` 等规则（styles.css:1627）是贴在展台规则
  旁的级联地雷，现行级联下虽被 .profile-stage 后置规则压住，任何
  顺序/优先级扰动都会让展台改宽变形。
- `.profile-stage` 加 `flex:none`：杜绝 flex 列祖先把 3:4 盒压扁——
  这是 CSS 里与「卡变矮、图被迫裁切」症状同族的唯一真实机制。
- FIX3 的 scroll-margin-top 落位保留不动。守卫：shell-migration 钉
  stage 只带 .profile-stage 类、flex:none 在位、无 max-height；
  device-fix 的 hero 切片标记改指 profile-stage。

## REQ-44-2 主页化身缩略图行被悬浮底栏压半

### 量测（生产，探针号，极光，393×852）
- 锚定落位（scrollIntoView）：stage top 167 / bottom 648，化身行
  648–756，胶囊 `.mobile-bottom-nav` top 780 → **行完整让出 24px**
  （截图 req44-profile-anchored-prod.png）；persona 自主页落位
  （stage top 84）时行 565–673，让出 105px。
- 主页滚到底：末节 bottom 756 < 780 ✓（页面底部 padding 96 ≥ 胶囊
  带 74）。
- 顺手量测：广场发帖入口是信息流顶部输入条（「说点什么，或分享一
  本书…」，截图 req44-plaza-prod.png），不在胶囊区；书架工具行为
  页内顶部行。均无同病。
- 用户红笔图里行被压，与其胶囊位于 ≈410–470pt 的同一客户端异常
  一致；出厂几何下该行不可能被压（上列量测）。

### 处置
结构量测已达标，无独立代码改动；与 REQ-44-1 同根，随客户端复验
一并销账。

## REQ-44-3 书城两点

### ① 滚到底页脚让位 —— 已修
- 生产量测（max scroll）：末卡 bottom 756、评分行 bottom 741、胶囊
  top 778、渐进模糊带 `.da-fade-blur--nav` top 704（带高 148）、页面
  padding-bottom 96。页脚让出了胶囊（741<778）但落在模糊带内。
- 修法：`html[data-shell-theme] .page.page-store` 底部 padding
  96 → **222px**（= 胶囊带 74 + 模糊带 148，三主题同规则，紧跟共享
  规则之后）；共享 .page 规则保持 96 不动。本地新 build 计算值实测
  paddingBottom = **222px** ✓；部署后末卡页脚预计 bottom =
  852−222 = **630 < 704**，完整出带。守卫测试钉住 222 与 96 两条。

### ② 《沉潮港纪事》封面拼接 —— 定案：滚动截图撕裂伪影，不改码
- coverUrl `/api/plaza/pub-ff498576-b52/cover?v=1` 文件本体 = 单张
  连贯 JPEG 768×1052（钟楼+海港小镇+桥上人物，无拼接）。
- 生产卡渲染单个 img（box 153×114、object-fit cover、50% 50%、
  natural 768×1052），元素截图为连续画面（store-shencheng-card-prod.png）；
  PublicationArtwork 有 coverUrl 时只渲染一张 img（main.jsx:5918）。
- 真机所见上下双图 = 长截图/滚动截图撕裂伪影。

## 测试与构建
- `node --test tests/*.test.js`：**880 tests / 874 pass / 6 fail**。
  失败逐条定性（均为已定性类，非本批引入）：
  - 4× ③a 样本图 ENOENT（worktree 缺主树的 avatar-shots /
    phone-fix-shots / dedup-shots 样本图目录）；
  - 2× 服务端静态托管 / release-safety：在未改动的主树同基线复跑
    同样失败（环境 EPERM 类，本机 index.lock 亦报 EPERM）。
  基线 876，本批净增 4 条守卫（reading-preferences +3、
  shell-migration +1），改动文件自有测试全绿。
- `vite build` 通过（bundle index-Dlf9Wj6j.js）；本地服务
  （AUTH_ENABLED=false :8899）服新 dist 完成上述 WebKit/Chromium 验收。

## 红线自查
§53/§54 未动；极光深蓝值未动；阅读面仅动偏好存储与设置面（REQ-45
任务范围内）；无假数据（验收用探针号与本地 fixture）；收费逻辑未碰。
