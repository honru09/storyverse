# PIXELFX-WAVE5 — 体验与性能升级（第五波）

2026-11-01。用户 04:23 令「继续加一些优化」，承 01:58 亲令「先不部署，继续几次融合升级」——**本波只合入 main，不部署**（与波三、波四同候 00059，部署等 Google 登录解开后一并处理）。基线 main `6926e9a`（波四终点，19 场景、自查 325 渲染）。本波不加新落点，做五件体验/性能升级。DESIGN 侧见 §60 第五波段。

工作区：由 pixelfx4 的本地 clone 复制后 `reset --hard origin/main (6926e9a)` 得到，基线与 origin 逐字一致；本地坏 main `c3cd883` 未碰。

## 五件清单（5/5 全落地）

| # | 件 | 做法（定版） | 量测/证据 |
|---|---|---|---|
| 1 | 自适应画质 | 播放器探针通过后按窗口（30 步）量测**负载率**（步进 CPU 秒 ÷ 播放秒），`createAdaptiveQuality` 防抖升降：>0.40 连 2 窗降一档、<0.12 连 4 窗升一档（不越设备基线）、中间区清零。阶梯 [{30, 原生}, {24, 192}, {20, 144=lite 定版}, {16, 120}]，标准基线 0、lite 基线 2；降档当帧重排背存+同 tick 重绘不露清屏；降档记 health `tierDrops`。控制器**按候选实例化**；循环挂载底档仍超预算 → slow 自愈，一次性骑底档播完。会话惩罚：slow 自愈 ≥3 次后新挂载自基线低一档起步（`pixelfxSessionTierPenalty`） | 控制器/阶梯/惩罚/计数全单测；接线源码断言 |
| 2 | 防频闪护眼 | grand pick（chapter-upgrade grand 变体 + season-finale 全部，placements 打 `flashGuard`）的播放器逐帧量测**预乘亮度**（rgb×alpha/255）：均值跳 ≥24 且 ≥20% 像素跳 ≥64 记 swing，滑动 1 秒内 >3 次升一级——光增益阶梯 [1, 0.6, 0.35, 0.2]，3/4 级另钳峰值预乘亮度 208/176；触发帧以新档重合成才上屏、不重复记账 | fx-selfcheck 新增闪光审计：56 个 grand 主选原始/守卫双跑逐个报告——**定版量测下全目录原始峰值 0 次/秒**（见下方旗标销账） |
| 3 | 等待换场 | 氛围（循环）挂载 pick 中途变化时，清理把旧帧存入快照，新挂载首个动画帧起 300ms（`PIXELFX_CROSSFADE_MS`）交叉淡入；时钟自首 blit 起算（慢 chunk 不吃窗口）；heal 清快照且 healed 帧不可再被快照、静帧路径丢弃快照、一次性场景不涉及 | 源码接线断言（快照条件/blit 混合/heal 顺序） |
| 4 | 省流与暂停复核 | **审计结论，无行为变更**：saveData 在三处一致生效（main.jsx `pixelfxMotionOn`、各组件自守门、画布内部 animate 判定）→ 任何表面只渲一张经探针静帧、无 rAF；Reader 预取同受 fxMotionOn 门。暂停构造性全覆盖：全仓只有 player-core/health/PixelfxCanvas 可驱动 `createPixelfxPlayer`（源码扫描断言钉死），PixelfxCanvas 内 IntersectionObserver 停离屏 + settings.visible 停隐藏页 | 接线测试含全 src 扫描 |
| 5 | 包体审计 | 见下节数字。结论：无 fx 效果模块被静态拉进主包（零静态 imports），无需改懒加载；播放器壳（player-core 运行时）静态在主包内一份属设计内 | 构建 + vite manifest 实测 |

## emp-blast 频闪旗标销账

初版自查曾以原始 RGB 亮度量出 scifi/emp-blast 在 chapter-upgrade/dianjing grand 峰值 6 次/秒、season-finale/kehuan 8 次/秒，列为待拍板重选候选。Gemini 复核指出该量测对 alpha 失明（见复核表 F1）：emp-blast 的脉冲全部活在半透明色层与光层里，原始 RGB 把 alpha 0.06–0.48 的像素按全强计。改预乘亮度后重跑全目录审计：56 个 grand 主选（含 emp-blast 全部家族×主题行）原始峰值一律 0 次/秒——该特效的实际发光从未频闪，旗标系量测假阳性，**就此销账，不换 pick**。守卫本身保留：合成光频闪夹具（不透明黑+全幅白光 4Hz）与纯光频闪夹具（无色、亮度全在 alpha 里）双单测证明它对真频闪仍会触发并把尾段峰值压低 40+。

## 包体审计数字（2026-11-01 本 clone 实测）

改前（基线 6926e9a 构建）：

- 入口 JS `index-*.js` = **1,144,846 B（gzip 363,887）**；CSS 283,230 B（gzip 49,736）；JS 总量 **2,405,628 B / 269 文件**。
- 懒加载池 267 个 JS chunk 合计 **1,102,930 B** = 244 特效 chunk + 20 分类 `_lib` + 3 共享 core chunk（particles/shapes/poses）。
- 入口 manifest：动态 import 注册 **266** 项、静态 imports **为零**——没有任何 fx 效果模块进主包；入口内 `drawBack`/`putImageData` 各仅 1 处（播放器壳一份）。firebase-sdk 本身亦动态 import。
- 首屏关键路径只有 index.html + theme-init.js + 入口 JS/CSS。
- 与第一波记录对比：主包 1,127KB → 1,144,846 B（**+1.6%**），增量全部来自二至四波的 placements/健康表/壳层代码。

改后（本波合入构建）：入口 **1,148,196 B（gzip 365,130）**，JS 总量 2,408,978 B / 269 文件不变——本波代码 **+3,350 B（gzip +1,243）**，chunk 数零变化。

## Gemini 复核处置（agy gemini-4-argon-high，过全波 diff）

复核报 4 bug + 1 risk + 1 nit，逐条回源码核验：核心机制全部成立（其中 F1/F3 是会让功能形同虚设的真设计错误），处置如下：

| # | 问题 | 处置 |
|---|---|---|
| F1 | 防频闪量测用原始 RGB 亮度、忽略 alpha：composite 在透明底上把纯光像素 RGB 按 alpha 归一化，光增益只活在 alpha 里——软化对量测失明、半透明像素被误报全强（自查里 raw 与 guarded 峰值相同即铁证）；钳制同病 | **修**：`measureFrameFlash` 与 `applyLuminanceClamp` 全面改预乘亮度；补纯光频闪回归单测（亮度全在 alpha 的夹具，守卫触发且尾段峰值被压低） |
| F2 | 升级帧重合成后再 observe 一次，把触发帧的 swing 记进已清窗的账，下次升级只需再 3 次 | **修**：删除第二次 observe，软化帧只作新的 prevFrame 基准 |
| F3 | 自适应量的是单步耗时中位：降档的收益（步数变少）它看不见，且模拟类特效降档后单步 dt 变大、120Hz 子步变多、单步更贵——13–23ms 灰区特效会被确定性推到 exhausted 误交 slow 自愈 | **修**：改判窗口**负载率**（步进 CPU 秒 ÷ 播放秒），阈值 DROP 0.40 / RISE 0.12；探针的 24ms 绝对 slow 线不动 |
| F4 | adaptive 控制器按挂载（effect）实例化：候选 0 exhausted 换人后，备选继承底档、两个坏窗即被 exhausted 误杀，没机会走梯 | **修**：控制器移入 tryCandidate 按候选实例化（自会话惩罚基线起步）。其附带指控「ok 与 slow 双计」**驳回**：健康表是事件计数（探针通过事件与后来自愈事件本就是两件事），非「每挂载单一结局」账本，波三口径如此 |
| F5 | （risk）heal 不复位 paintedAnimated：被清屏的画布会被后续清理当作淡化快照，新 pick 从空白淡入 300ms | **修**：heal 内 `paintedAnimated = false`（接线断言已同步钉死顺序）。其附带场景「初始 blit 以 progress=0 定格旧快照在离屏画布上」**驳回**：离屏期间无人可见，淡化时钟到期即设计的降级路径，滚动入视口后 startLoop 以过期时钟直接呈新帧——回源码核实后不成立为缺陷 |
| F6 | （nit）flashGuard 只进 pickKey 不进 chainKey/effect 依赖：仅 flag 翻转时 effect 不重跑（当前被 grand 与小 beat 的 fx id 必不同所掩盖） | **修**：chainKey 追加 `|fg` 后缀 |

复核另确认 saveData 门控、离屏暂停、槽位释放、一次性 onDone 契约无问题（Checked and Dropped 一节），与第 4 件审计结论一致。

## 验证计数

- pixelfx 两测试文件 **40/40 全绿**（波五新增 8 项：阶梯/控制器防抖与底档/会话惩罚与 tierDrops/flashGuard 打标范围/闪光数学含预乘用例/合成光频闪软化+平静特效不误伤/纯光频闪回归/目录源码接线断言组）。
- 全量套件 **1229 项 / 1224 过 / 5 败**——5 败全为 dedup ③a 族（新 clone 缺未跟踪的 fixture 图，波二至波四同基线）；另 import-daylight 的 backup-merge 在并行满载时偶发 1 败（单跑 8/8 全绿，波二至波四已知的时序 flake 族）。**零新回归**（1229 = 基线 1221 + 波五 8 新测）。
- `npm run fx:selfcheck`：**325 渲染全过**（19 场景 × 19 家族 × 3 主题，非空 + 步中位 ≤24ms + 循环纪律）+ **56 个 grand pick 闪光审计全 0 次/秒**。
- `npm run build` 通过（数字见上）。

## 未证项（如实）

- 自适应/换场/防频闪的真机手感（降档是否可见、300ms 淡化观感、守卫触发时的爆发柔和度）无浏览器实证——与波三、波四同候用户真机点验（部署仍被 Google 登录阻塞，本波按令只合入 main）。
- 负载率阈值 0.40/0.12 为工程定版，未在低端真机上标定；若真机出现氛围面频繁降档或该降不降，调 player-core 常量并同步 §60 与自查脚本（三处同源口径）。
