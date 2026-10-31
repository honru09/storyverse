# PIXELFX-WAVE2 — pixelfx 融合第二波：PLANNED 场景落地

用户 2026-10-31 21:14 亲令「再多融合一些」。第一波（整库 244 特效 +
播放器 + waiting/intervene 两落点，main `2a224d3`）之上，把 placements
的场景面扩到十个，落六类新点。部署不在本波（父级派发）。

## 落点清单（接线点 / 场景 / 选型）

1. **升格与季终**（`chapter-upgrade`）— Reader（src/main.jsx）：
   进入升格章正文（frontStage 落 null、章节已存在）那一刻，固定居中
   透明舞台 `.reader-open-fx` 放一次性庆祝，onDone 即撤；每书每章每
   次挂载只放一次（celebratedRef）。判定 = 引擎 `structureFor` +
   `chapterMilestoneKind`：season 6/12/18 小、24 grand；long 50 小、
   100 grand；endless 每 12 章弧收束小；custom/short 仅终章 grand。
   小 = arcane/mana-burst（玄幻修真金色板变体），grand 按家族：
   holy-pillar（修真/副本）、firework-burst（默认）、emp-blast
   （科幻/电竞）、dark-explosion（末世/灵异）、star-fall（悬疑/言情）、
   smite（武侠）。readOnly 线不放（不是观看者生成的书）。
2. **合流成功**（`merge-success`）— Merge 完成态：`.merge-stage` 上
   `.merge-fx` 一次性，默认 explosions/implosion（汇聚感），主导线
   家族变体（修真/副本 mana-burst、科幻/电竞 emp-blast），按
   mergedStory.id 只放一次。
3. **化身揭晓**（`avatar-reveal`）— AvatarPage `paint()` 成功路径：
   `.avatar-frame` 内 `.avatar-reveal-fx` 叠 spawn/summon-rise
   一次性（锚框底、占框高 48%），立绘本体与 §59 衍生图/脸锚零改动。
4. **造世氛围**（`forge-ambient`）+ **开书爆发**（`forge-open`）—
   Forge step 2/3 在步面板之下挂 `.forge-ambient-fx` 循环层，按
   **世界 id** 取表（mist=water/ripples、cultivation=rune-circle 金、
   neon=scifi/hologram、city=water/rain-splash、court=fire/candle、
   frontier=scifi/energy-core），key 含世界 id——切世界即换；自定义
   世界回落 pickForgeAmbientFx 的家族链（waiting 表）。开书：
   App.generate 落章后 sessionStorage 打标
   `storyweave:just-opened:<id>`（5 分钟过期），Reader 挂载时消费
   即焚，在封面页（frontStage）上放 arcane/star-fall 一次性——
   Forge 在导航时已卸载，标在 App、放在 Reader 是唯一活得下来的
   挂法；从书架重开新书不会重放（标已焚/已过期）。
5. **广场微交互**（`plaza-like` + `publish-celebration`）—
   PlazaPostCard 点赞落地（乐观更新为已赞）时按钮内
   `.plaza-like-fx` 放 pickups/collect-burst，1.5s 节流、取消赞
   不放、失败回滚不撤（已播完）。发布成功：App 的 `celebrateToast`
   精确匹配「已上架到书城。」「已发布到广场。」「已分享到广场。」
   三条文案（PlazaPublish/PlazaFeed/PlazaDetail 三处 onToast 已
   改走它），toast 上方 `.toast-fx` 放 ui/confetti 一次性——§37
   burstParticles 的像素版对应物。其余 toast 一律安静。帖子数据
   流与 REQ-72 书卡结构未动。
6. **书详情氛围**（`detail-ambient`）— PlazaDetail 既有
   `.detail-ambience` 层**之内**（与封面氛围图同层、全部玻璃面板
   之下、被该层 mask 渐隐收尾）挂 `.detail-ambience-fx`（top 290px、
   opacity .55）：默认 fire/spirit-flame，悬疑 wisp、灵异 ghost、
   末世/反派 shadow-flames、种田 fireflies。家族取 detail.shelfId，
   缺失时 shelfForTemplate(genreTemplateId)。

## 纪律核对

- 动效门统一 `pixelfxMotionOn`（main.jsx）：总开关 + reduced-motion
  + 省流量任一不过 → 新落点一律**不挂载**（与第一波 GenerationOverlay
  口径一致）；PixelfxCanvas 内部还会再降级静帧，双保险。
- 一次性场景主选全部实测 meta：非循环（loop=false，否则永不报
  done、画布永不撤）+ 无 actor（库存小人不进阅读应用），已逐个
  钉进 tests/pixelfx-catalog.test.js；氛围主选全部循环 + 无 actor。
  选型量测：summon-rise 176×116/4.6s、implosion 208×184/1.65s、
  confetti 200×140/3.4s、collect-burst 112×108/1.35s、
  spirit-flame 80×124 loop、candle 56×76 loop 等（node 直读 meta）。
- 阅读正文面未加常驻元素：升格特效只活在章节打开过渡的固定舞台
  上、播完即撤；盐系/毛玻璃参数未动（详情 fx 在氛围层内、面板下）。

## 放弃项与说明

- **无放弃项**：六类落点全部落地。
- PLANNED_SCENES 中 wave-1 留下的 cover-reveal / empty-shelf /
  login-welcome 三个不在本波任务枚举的六类之内，未动，仍列
  PLANNED 留下波（placements.js 注记已同步）。merge-encounter
  （wave-1 注记名）在本波以 merge-success 落地；publish-celebration
  沿用原名。
- 升格判定未用「章节生成完成」事件：预生成在后台静默落章，生成
  完成瞬间读者多半正读着上一章——在正文上弹窗违反红线。故取任务
  允许的另一选项「章节打开的过渡处」：读者真正打开该章时才放。

## 回归与验收

- 新增/扩充测试 5 项（pixelfx 两文件 13 → 18 项，全绿）：
  wave-2 全场景 × 18 家族 pick 对磁盘校验、forge 世界链与回落、
  一次性/氛围主选的 meta 纪律（非循环/循环 + 无 actor）、
  pickFx grand 变体语义、六落点接线源级断言（main.jsx + aurora.css
  类名齐全）、新主选真帧像素非空（19 个 pick 逐个 still >200px）、
  一次性主选 10s 步进内必 done。
- 全量：基线（本克隆改动前，装齐 node_modules 后）1201 项 / 1196 过 /
  5 败 → 改动后 **1207 项 / 1202 过 / 5 败**。5 败全部落在
  avatar-derivatives 的 ③a 项（本轮 5 项、上轮基线 4 项 + import-daylight
  backup merge 1 项，两轮构成略有出入）——两文件单独跑均全绿
  （avatar-derivatives 12/12、import-daylight 8/8），与第一波记录的
  并行时序 flake 同签名、与本波改动文件无交集，**零新回归**成立。
  `npm run build` 通过（约 2s）。
- **未证项**：本沙箱截屏已坏，视觉验收以无头真帧像素断言代替；
  六落点在真机的观感、时序与流畅度（升格舞台与章节打开动画的
  叠放、toast confetti 与底栏的位置关系、详情氛围在三主题下的
  明暗）以**用户真机为终门**，未过则按真机截图调 placements/尺寸。
