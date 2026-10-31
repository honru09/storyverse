# PIXELFX-WAVE1 — pixelfx 全量融合第一波：地基 + 两个试点落点

用户 2026-10-31 20:45 亲令「全部融合进我们的平台，合理的位置」。本波立地基
（整库入库 + 目录 + 播放器 + 场景映射表）并落两个试点（生成等待氛围层、
介入瞬间一次性特效）。部署不在本波（父级派发）。

## 钉版与入库

- 上游：github.com/patch-gg/pixelfx（MIT，package pixelfx 0.3.0）。
- 钉版 commit：`a84159688af3ca37a4be05a0d422b94451b2e24e`（2026-10-31 克隆时 HEAD）。
- 入库位置 `src/fx/pixelfx/`：`core/` 15 文件 + `fx/` 266 文件
  （21 个分类、**244 个特效** + 20 个分类 `_lib.js` + index/categories）
  + LICENSE + NOTICE.md + 我方 VENDOR.md（钉版 SHA 与升级规程）。
  全部文件逐字拷贝、零改动；相对 import 结构（特效 → `../../core/index.js`）
  在新位置原样成立。未加 npm 依赖。
- 目录模块 `src/fx/catalog.js`：`import.meta.glob("./pixelfx/fx/*/*.js")`
  构建期枚举（排除 `_lib.js`），导出 `PIXELFX_CATALOG`（{id, category,
  name, load}，按 id 排序）+ `loadPixelfx(id)`。构建实证：dist 产出 269 个
  JS chunk，244 个特效各为独立懒加载 chunk（rune-circle/magic-circle-cast/
  wisp 等均可指名），首屏主包不含特效代码、体积与基线同量级（1,127KB）。

## 播放器（src/fx/player-core.js + src/fx/PixelfxCanvas.jsx）

- player-core（无 DOM 纯逻辑）：`createPixelfxPlayer(mod, {seed, palette,
  light, repeat})` 在特效原生 meta.size 帧上步进 + composite 到 RGBA 缓冲；
  `renderPixelfxStill` 出代表性静帧（单发取 45% 时刻、循环取 0.8s 处）；
  活动实例槽位上限 `MAX_LIVE_PIXELFX = 6`，满槽降级静帧。
- 组件：离屏 canvas putImageData → 可见 canvas drawImage 放大
  （image-rendering: pixelated，`pixelSize` 可压可见画布栅格长边）；
  步进按创作速率 30 步/秒累积真时差（60Hz 屏不双倍速/双倍 CPU）；
  IntersectionObserver 离屏暂停、页签隐藏（MotionProvider visible）暂停；
  卸载清 rAF/observer/槽位。动效关 / prefers-reduced-motion / 省流量 /
  无 Provider → 只画一帧静帧、永不启 rAF。
- **踩坑实录**：createFx 的 resolveOptions 是覆盖式合并——播放器最初把
  `palette: undefined` 显式传入，抹掉了特效自带色板，rune-circle 在
  `fit(o.palette)` 当场抛错。已在 player-core 守卫（只传调用方真给的
  option），并钉进 player 测试（空 options 必须能画）。

## 性能样本（本机 node、原生分辨率、60 步均值；VM 绝对值仅作量级参考）

| 用途 | 特效 | 原生尺寸 | ms/步 | 2s 时刻非透明像素 |
|---|---|---|---|---|
| 等待·玄幻修真 | arcane/rune-circle（金色板） | 136×100 | 2.69 | 7,574 |
| 等待·都市 | water/rain-splash | 176×80 | 4.39 | 8,012 |
| 等待·科幻 | scifi/energy-core | 112×100 | 2.22 | 5,318 |
| 等待·悬疑 | critters/wisp | 128×104 | 0.81 | 5,055 |
| 等待·种田 | weather/fireflies | 320×180 | 4.79 | 57,600（全幅） |
| 介入·默认 | arcane/magic-circle-cast | 200×220 | ~3.4 | 18,426 |
| 介入·灵异 | shadow/grasping-hands | 200×116 | 1.95 | 11,846 |

等待主选全部 ≤4.8ms/步（30 步/秒 ≈ 单核 15% 上限量级、且等待面是全屏
独占面）；320×180 weather 全幅场（rain 7.7ms / storm 12.3ms）已按此
口径降为候选、主选一律紧凑特效（种田萤火为唯一例外：粒子稀疏、4.8ms）。

## 场景映射（src/fx/placements.js）

纯数据 + `pickFx(scene, genreFamily)`；家族 = GENRE_SHELVES shelf id
（调用方以 `shelfForTemplate(模板 id)` 派生），未知/自定义回落场景默认。
本波映射两场景 × 18 家族（waiting 全家族主选 + intervene 9 个家族变体
+双默认），其余场景（发布庆祝/合流相遇/升格章/封面揭晓/空书架/登录欢迎）
已在 PLANNED_SCENES 注记待下波。每家族另列 `alt` 候选（含 palette 变体
思路），玄幻修真的 rune-circle 用 8 阶金色板变体、副本同特效保留原紫。

## 两个试点落点（接线点）

- **A 生成等待**：`GenerationOverlay` 新增 `family` prop，卡内挂
  `.generation-fx` 画布环绕 orb（aurora.css：绝对定位于卡顶居中 96px 高，
  卡内容层 z-index 在其上——特效像素永不压字）；动效政策不允许时
  **不挂载**。调用点：造世 `main.jsx` Forge（传 `draft.genreTemplateId`
  的家族）、广场带化身进入 PlazaEnter（传 `detail.genreTemplateId` 家族）。
  合流等待（kind="merge"）暂无调用点传家族，自动回落默认水灵珠。
- **B 介入瞬间**：`InterventionOverlay` 新增可选 `family` prop，仅阅读器
  介入调用点传入（`story` 的家族）；序列卡内 `.intervention-fx` 叠于
  weave 之上（148px 高），一次性播放（loop=false），onDone 即撤；
  动效关/reduced-motion 直接跳过走原流程。重掷章复用同 overlay 不传
  family，行为与从前逐字一致。

## 回归与验收

- 新增测试 12 项全绿：`tests/pixelfx-catalog.test.js`（钉版/计数 244/
  逐个 import 验形状/glob 源级钉/placements 全部 id 对磁盘存在/两 overlay
  与 main.jsx 接线源级断言）、`tests/pixelfx-player.test.js`（真帧像素
  抽样：一圈符文 >1000px、18 家族等待主选静帧 >300px、单发 done/repeat
  重生、槽位上限进出）。
- 全量：**1201 项 / 1195 过 / 6 败**。基线（本克隆改动前）1189/1184/5 败
  （dedup ENOENT×5，新克隆缺本地夹具图）。第 6 败 = import-daylight 的
  backup merge 一项，与 00055 集成波记录的并行时序 flake 同签名：单独
  跑该文件 8/8 连过三次、与本波改动文件无交集，定性为既有 flake，
  非新回归。零新回归成立。
- build 通过（2.07s）。
- **未证项**：本沙箱截屏已坏，视觉验收以无头 node 真帧像素断言代替
  （特效本体产出逐个验过非空）；两落点在真机上的实际观感（96px 带内
  构图、与 orb/weave 的叠放关系、30 步/秒在 iPhone 上的流畅度）以
  **用户真机为终门**，未过则按真机截图调 placements/尺寸再下波。
- 阅读正文面未碰；盐系参数未动；DESIGN.md 已追 §60。
