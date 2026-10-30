# REQ-64 — 主页化身展台推倒重建（2026-10-31，用户亲令）

用户在生产 00050 真机上报两症：①「在我的主页滑到最下面会自动往上
滑回去一点」；②「化身的头像还是没有解决」；原话「把原容器直接删
了，重新新建一个新规则容器」。本批按令执行：旧展台容器与全部滚
动守卫删除，新建 `.profile-showcase` 容器；只本地提交，不部署。

## 旧症复现（删前实测，390×844 WebKit、白主题、真实种子）

基线 = 远程 main `c3cd883`（生产 00050）。同夹具同种子量得：

- 可见带：顶栏底 71 → 悬浮底栏顶 770 = **699px**。
- 旧展台：docTop 1009.8、宽 358、**高 477.3**（3:4 整卡即图框，
  铭牌绝对定位压图）。
- 文档高 1952、maxScroll 1108；展台安全线 = 79。
- 命令滚到页底（1108）后静止态停在 **930** —— REQ-62 落定守卫
  把页面往上抢了 **178px**，机制与 JUDGE 推演一致：本页长度下
  页底停点恰让展台横跨安全线，settle 检查（停 180ms）即触发
  停车。与用户原话逐项吻合，复现成立后才动手删除。

## 删除清单

代码：

- `src/profile-stage-guard.js` 整文件（REQ-48 恢复守卫 + REQ-62
  落定守卫 + 停车数学）。
- `src/main.jsx`：guard import；ProfilePage 的逐字滚动恢复
  effect、REQ-62 settle 守卫 effect、滚动记录 listener effect、
  `restoredScrollForRef`；壳层路由 effect 中 REQ-48 的守卫武装
  块。ProfilePage 自此零滚动记账（只保留化身 id 的视图记忆）。
- `src/styles.css`：`.profile-stage*` 全部规则（grep 计数 0）。
- 展台 JSX 整段：`.profile-stage`（含 backdrop/img/铭牌绝对层）
  换为新容器（下节）。

边界说明：壳层通用 keep-alive 滚动恢复（全视图共享、ProfilePage
只是其一）不是守卫武装点，保留不动 —— 本批删除面 = 守卫模块及
其在主页面的全部武装点，主页代码自此没有任何 scrollTo / 滚动
停车 / 滚动监听改位逻辑（新测试按 ProfilePage 函数体钉死）。

测试（12 条删除、逐条去向）：

- `tests/profile-stage-guard.test.js` 整文件删除：停车数学 ×7
  与常量 ×1 随模块作废；双武装点存在性 ×2、settle 存在性 ×1、
  生命周期武装 ×1 —— 契约反转，由新文件以「不存在」断言接管；
  其中 REQ-62 的设置副标题 pin ×1 **搬入新文件保留**（该裁定
  不回退）。
- 改指新容器：`avatar-ability.test.js`（ability class 名）、
  `device-fix.test.js`（hero 切片边界）、`device-fix3.test.js`
  REQ-35 两条（contain 与 scroll-margin 改指 showcase，裁定不
  变）、`shell-migration.test.js`（全身图唯一住所 / poster /
  boards 三处改 showcase 口径并加尺寸新规断言）。
- 新增 `tests/profile-showcase.test.js`（8 条）：守卫文件与武装
  符号不存在、旧容器不存在、ProfilePage 零滚动记账、图框 4:3
  + contain + backdrop 锚、铭牌流内非覆盖、信息齐全、设置副标
  题 pin（搬入）。

## 新容器规则与定数（.profile-showcase）

结构：图框 `.profile-showcase-figure` + 流内铭牌
`.profile-showcase-plate`（在图框下方正常排版，不再压图）；
backdrop 模糊副本与星尘保留；无图回落改图框内居中呈现。

- 图框 **aspect-ratio 4:3**（旧 3:4），立绘 contain、backdrop
  cover 50% 8% 锚 —— REQ-28/35 的入框裁定原样继承。
- 卡宽 `min(100%, 420px)`、`flex:none`、无 max-height；保留
  scroll-margin（仅锚点落位，非滚动干预）。
- §53 盐系与三主题口径不变：卡面 var(--profile-panel)，个人
  主页不用毛玻璃的硬裁定不变。
- 信息不减：名字 + 主化身徽章 + 简介 + 专属能力 + 世界行在
  铭牌内；切换缩略行紧随卡后。主页标签页与他人主页窗口共用
  同一 ProfilePage，两种形态同容器同规则（窗口安全线 = 窗口顶）。

实测定数（390×844、同种子）：图框 268.5px + 铭牌 89px =
**整卡 357.5px**（他人窗口形态 339.5px，简介行数差），对 699px
可见带余量 341.5px；旧卡 477.3px → 新卡 357.5px。

「整卡落在可见区」的口径（与 REQ-62 笔记 C 行同裁定）：化身区
在页面中的位置不变（化身区段在书架/上架之后，docTop≈1010），
scroll=0 时卡在折线下属正常版式；承诺面 = 卡高 ≤ 可见带 +
锚定停点（卡顶贴顶栏底）整卡同屏，此二者实测成立。页面顺序
不属本批用户诉求，未动。

## 验收量测（accept.mjs，同夹具同种子，状态驱动等待）

- A 锚定停点：卡 78.8..436.3 全在带内（71..770）；绘制立绘
  78.8..347.3 头→鞋全在卡内。
- B 页底静置（标题断言）：滚到底后 4.5s 采样，scrollY 恒 =
  maxScroll 988，**drift = 0**（旧版同动作被抢 −178px）。
- C 冷启直达：静止 scrollY = 0；锚定停点整卡同屏；底栏切走
  切回（离开时 scroll=0）回来静止 scrollY = 0。
- W 他人窗口（#/profile/ 路由开窗）：卡 339.5px；锚定后卡
  300.4..639.9 全在窗口内（50.6..844）；绘制立绘全在卡内。
- 截图（worktree `stage-rebuild-shots/`，已逐张亲看）：
  before-bottom-rest.png（旧症）、after-A-anchored.png、
  after-B-bottom-rest.png、after-C-cold-top.png、
  after-C-anchor-landing.png、after-W-window.png。

承诺边界：浏览器原生滚动恢复停在页中属用户自己的滚动位置，
本批不管、也不许再为此加任何守卫 —— 这一面自此禁止滚动守卫
类修法（台账 REQ-64 已记）。

## 测试与构建

- 全量 `npm test`：1010/1015 通过，5 败 = 基线 dedup 样本图
  ENOENT ×5（与基线同构；总数 1019 − 守卫旧测 12 + 新测 8
  = 1015）。
- `npm run build` 通过。
