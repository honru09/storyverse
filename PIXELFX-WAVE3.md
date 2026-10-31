# PIXELFX-WAVE3 — pixelfx 融合第三波：场景补齐 + 主题/画质升级 + 自纠错

用户 2026-11-01 00:04 亲令「继续融合，继续升级，并且自纠错」。基线
main `186b201`（00058 已上线）。本波四件：补齐 PLANNED 最后三场景、
主题适配与画质/预取升级、上游对表、自纠错（运行时自愈 + 审计自查）。
部署不在本波（父级派发）。

## 1. 三场景补齐（PLANNED_SCENES 清零）

- **cover-reveal**（封面揭晓）— `src/components/StoryCover.jsx`：
  组件以 `witnessedNonReady` ref 记录本挂载是否亲历过非 ready 状态，
  绘画落盘（url 解析成功）且本挂载亲历过等待时才放一次性
  `pickups/collect-burst`（`.story-cover-fx`，框心、46% 高、不挡图面
  主体）。模块级 `revealedCoverKeys` 登记 `${storyId}@${version}`：
  同一封面在书架/详情/阅读器多处同时挂载时只有先展示的一处放、
  每版本每会话只放一次；挂载时已 ready 的封面（库加载、切账号
  回访）不放。自动上漆、手动换封面、meta 对账采认三条落盘路径都
  经过 StoryCover 状态迁移，一处接线全覆盖。家族味由绘画本身
  承担，揭晓节奏家族无关（pick 仍按家族签名以便将来分化）。
  transitions/* 全幅 wipe 再次评估再次否决：320×180 横幅擦除会压
  在图面上，不是「叠封面框」。
- **empty-shelf**（空书架）— ProfilePage 书架区 `.profile-empty`：
  块内首子挂 `critters/butterfly` 循环（`.profile-empty-fx`，
  opacity .45，块 overflow hidden 收边），在插画与文案之下
  （同块其余子元素 z-index 1）。初稿曾选 `weather/fireflies`，
  Gemini 复核时读其源码实锤 drawBack 整幅填暗绿夜雾底
  （alpha .48–.62）+ 草叶——不是透明稀疏萤点，落在浅色空状态
  卡里必然是硬边色块（白主题最糟），已否决换蝶。动效关
  （fxMotionOn 不过）不挂载。他人主页的同款空状态同享此层
  （同一表面）。
- **login-welcome**（登录欢迎）— App 登录交接 effect：账号面板
  在「以登出态打开、用户落盘」时自关的那一刻（FINAL-FIX N4 的
  既有分支）顺手点亮 `welcomeFx`，App 根部固定顶部放一次性
  `holy/feather-burst`（`.login-welcome-fx`，pointer-events none，
  z 42）。登录与注册都经此路径；会话恢复（冷启动自动登录）不经
  此 effect，不重复欢迎；被中断的 forge 意图恢复逻辑原样不动。

## 2. 主题适配与画质/预取升级

- **主题维度**：placements 新增 `setPixelfxTheme`/`pixelfxTheme`
  （black/white/aurora，未知值回落 black）；App 把 `shellTheme`
  （src/theme.js 的设备偏好）**在渲染体内同步**发布——初稿用
  effect 发布，被 Gemini 复核指出子组件同轮渲染与子 effect 都
  先于父 effect、首轮与每次切换都会吃旧主题且在播实例永不重
  着色，已改同步调用（幂等、仅写模块变量）。pickFx 出 pick
  时调色：条目级 `themes` 变体优先（金色三条目——waiting 修真、
  chapter-upgrade 修真、forge 青岚宗——钉了 white=深琥珀板
  DEEP_GOLD、aurora=紫罗兰板 VIOLET）；无条目变体时保条目自带
  色板；无色板的发光类分类（arcane/holy/lightning/scifi/fire/
  shadow）在 white 套墨色板 INK、aurora 套蓝紫板 AURORA；非发光
  类（water/critters/weather 等）永不强加色板。black 主题零改动
  （已上线观感不动）。PixelfxCanvas 的 effect 依赖含 paletteKey，
  主题切换后在播实例会以新色板重挂——与主题切换本身的全树重渲
  同步发生。
- **画质分档**：player-core 新增 `pixelfxQualityTier(lite)`——
  lite（MotionProvider is-lite-gpu 同判据，组件从 `<html>` 类读、
  navigator 谓词兜底）：20 步/秒 + 可见背存长边上限 144px；
  标准：30 步/秒 + 原生背存。省 CPU 的实质是步数（每步一次全帧
  绘制+合成）；内部像素帧恒原生（pixelfx 的几何是绝对像素坐标，
  缩帧只会裁切不会缩放——故降档只动步频与终合成光栅，不动帧
  本身，此取舍已写进 §60）。调用点显式 pixelSize 优先于分档。
- **空闲预取**：新 `src/fx/prefetch.js`——会话级去重集合 +
  requestIdleCallback（timeout 2500；无则 setTimeout 600）；
  Reader 挂载 effect 按本书家族预热 intervene、chapter-upgrade
  （small+grand）、cover-reveal 四主选 chunk。catalog 的 import
  改为浏览器路径内动态 import（catalog 依赖 import.meta.glob，
  静态引会让 prefetch 在 node 工具链里不可加载）；失败全静默。

## 3. 上游对表

2026-11-01 实测：`git clone` patch-gg/pixelfx 最新 HEAD =
`a84159688af3ca37a4be05a0d422b94451b2e24e`，与钉版**逐字相同**
（0.3.0，顶提交 "pixelfx 0.3.0: give the effects a body that
performs them"）。**已对表，无更新**：VENDOR.md 的 SHA 与 244
计数不变，vendored 树零改动。

## 4. 自纠错

### 运行时自愈（src/fx/health.js + PixelfxCanvas 重构）

- PixelfxCanvas 改吃 placements 的 `pick`（含 alts 链）；旧
  fx/palette/seed props 保留兼容。全部 10 个既有接线点已迁移到
  pick（GenerationOverlay、InterventionOverlay、Reader 的
  forge-open/milestone、Merge、AvatarPage、Forge、PlazaPostCard、
  celebrateToast、PlazaDetail），新 3 点直接用 pick。
- 探针：动画路径在真实播放中采样前 45 步（一次性特效以播完为
  先），每 5 步数非透明像素、逐步计时；静帧路径上屏前验像素。
  阈值写死 health.js：blank = 采样像素全 0；slow = 步耗时中位
  > 24ms；error = 加载/构造/步进抛错。
- 换人：命中即沿 alt 链换下一候选（备选清 palette 用原生板），
  每挂载最多 2 次（PIXELFX_MAX_HEALS）；换人 console.info 记一行；
  链耗尽 → 清屏撤层 + console.warn + 健康表记 death。健康表
  `window.__pixelfxHealth`（mounts/heals/deaths + byFx 的
  ok/blank/slow/error/healed/dead）每次事件后刷新镜像。
- 宿主隔离：heal/tryCandidate 全程 try/catch 与 attempt 代际守卫
  （stale tick 自杀），特效故障不冒泡；卸载清理 rAF/observer/
  槽位与旧波相同。
- 单测（tests/pixelfx-player.test.js，node 直驱 health.js）：
  真 wisp 探针健康；假模块三连——空白 draw → 'blank'、create
  抛错 → 'error'、draw 每帧忙等 35ms 且真画一个像素 →
  'slow'；链裁剪/去重、judgeLiveSamples 三态、注册表计数、
  分档常量、prefetch node 无操作，共 +5 项全绿。

### 审计自查（scripts/fx-selfcheck.mjs）

- `npm run fx:selfcheck`（package.json 新脚本，独立于 npm test）：
  枚举 13 场景 × 19 家族口 × 3 主题 + forge 六世界链 + grand
  变体 **+ 全部 alt 链**，按 (fx, seed, palette) 去重后真帧
  渲染，断言非空像素、步中位数 ≤ 24ms、循环纪律（氛围主选步
  满 90 不 done、一次性主选与备选在时长×30+30 步内 done 且
  meta 非循环）。异常时逐条列出并 exit 1（本波含复核修复后的
  终跑：**263 个唯一渲染全过，一行汇总，约 52 秒**（含
  alt 链后由首跑 170 增至 263）。pixelfx 两测试文件 26/26；
  全量 1215/1210/5——5 败与基线 186b201 逐字相同
  （dedup-fix ③a 夹具图缺失 ENOENT，全新 clone 无该未跟踪
  文件，与本波零交集）；build 过。
- 每日自查 cron（storyweave-daily-bughunt）可在测试套件后调用
  `npm run fx:selfcheck` 做例行审计——已写进 §60；本波未改 cron
  本身（调度归父级）。

## Gemini 复核与处置（gemini-4-argon-high，逐条对源码核验后采纳）

- **确认 bug 1（主题时序）**：setPixelfxTheme 初稿走 App 的
  useEffect——采纳，改渲染体内同步调用（见上）。
- **确认 bug 2（alt 循环错配）**：plaza-like 的备选
  `pickups/power-star` 是循环 meta，heal 换入后永不 done、画布
  永驻点赞钮。全表审计后确认仅此一例错配，已换
  `ui/coin-collect`（非循环/无 actor）；同时给播放器加兜底
  （一次性挂载遇循环 meta 以其 duration 为完成线）＋自查与测
  试新增「一次性场景备选必须非循环」断言，防再犯。
- **确认 bug 3（StoryCover 跨书泄漏）**：无 key 挂载在书目切换
  时，`witnessedNonReady` 与旧 url 会冒充新书的揭晓——采纳，
  加 storyId 变更重置（重置 effect 声明在见证 effect 之前、
  同轮先生效）与 url 归属 ref 守卫（fetch 解析时记归属，
  reveal 前核对）。
- **确认 bug 4（一次性完成契约缺失）**：静帧落地与链耗尽两条
  路径不触发 onDone、死亡不释放槽位，宿主包装层永不卸载——
  采纳，立「完成契约」：loop={false} 任何方式结束都触发
  onDone，死亡即释放槽位（已写进 §60）。
- **风险 1（氛围 alt 混全幅 weather）**：采纳——waiting/detail
  两表的 alt 已剔除全部 320×180 weather 条目（fireflies/rain/
  storm/falling-leaves/cherry-blossoms/shooting-stars），换紧凑
  透明备选；种田萤火**主选**为既成定稿不动（主选不是 heal
  目标）。heal 换人另加「先清屏再加载」，不留失败冻帧。
- **风险 2（fireflies 底色）**：采纳并升级处置——空书架主选
  已换蝶（见上）。
- **风险 4（预取不看动效门）**：采纳——Reader 预取 effect 加
  fxMotionOn 门（saveData 时不预热）。
- **未采纳**：风险 3 的「keepalive 隐藏页占槽」部分——隐藏页的
  canvas 被 IntersectionObserver 停步、零 CPU，占槽只影响并发
  上限计数且现网同屏可见特效远低于 6 的上限，维持波一口径；
  其「heal 留冻帧」部分已采纳（见上）。风险 5（node_modules
  符号链接在工作区显示删除）为已知地雷，提交时显式排除、
  不随本波处置。
- 复核判 OK 的三处（TDZ/闭包、hooks 顺序、自愈代际守卫、画质
  分档）经我方复读源码无误，不动。

## 纪律核对

- 动效门：三新点与既有十点同门（总开关 + reduced-motion +
  saveData 不过不挂载；StoryCover 在组件内以同谓词守门，App
  欢迎点用 appFxMotionOn，空书架用 ProfilePage 的 fxMotionOn）。
- 阅读正文面零新常驻元素：cover-reveal 活在封面框（封面页/对
  话框/书卡）上、一次性播完即撤；login-welcome 活在 App 顶层
  固定层、一次性自撤；盐系/毛玻璃参数未动。
- pixelfx 两测试文件 18 → 26 项全绿（catalog +3：主题维度、
  alt 链、wave-3 接线；player +5：新主选真帧、自愈探针、链与
  注册表、分档、预取）。

## 未证项

- 真机终门不变：白主题墨色板在真实浅底上的可见度、极光蓝紫板
  与深蓝玻璃的调和、lite 分档在低端机的实际帧率、登录欢迎与账
  号面板关闭动画的时序叠放、自愈在真机弱网下 chunk 加载失败时
  的换人观感——均待用户真机点验。
- 本地全量测试与 build 结果见回报（与基线 1207/1202/5 对账：
  5 败须仍为 avatar-derivatives ③a 并行 flake 族且单跑全绿）。
