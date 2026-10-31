# HERO-FLATTEN — 自由创世黑洞主视觉图层接缝修复（2026-10-31）

用户 13:58 指着小红书首图亲报「这里有很多 bug 显示，在平台也是，彻底修复」。本批把 REQ-71 的三层叠图结构换掉：离线烘焙成单张成品图，平台与海报同源同修。分支 `hero-flatten`（基线 origin/main ab438eb），只本地提交，未 push 未部署。

## 病灶（改前证据）

三层素材（星云底 + 吸积环层 screen 混合 + 星尘层）都是矩形画布、边缘无羽化，环图内容（吸积盘辉光）又一直延伸到画布四边——矩形边落在哪儿，哪儿就在星云上切出明暗台阶：

- 海报首图（旧 poster1.png，环层矩形 = x 46..1196 × y 427..1577）：
  - 左缘竖线：`hero-flatten-crops/before-poster-left-200.png`（裁 0,760,220,460 放大 200%）——x=46 处一条笔直竖台阶，左侧深蓝星云、右侧褐黑矩形场。
  - 上缘横线：`hero-flatten-crops/before-poster-top2-200.png`（裁 940,380,302,110 放大 300%）——y≈427 处横贯的明暗台阶。
  - 标题第三行「都翻烂了」正压在环的亮弧上，橙字被冲淡（旧 poster1.png 全图可见）。
- 平台造世界材步（REQ-71 渲染，`hero-flatten-shots/before/hero-white-390.png`）：环图矩形左缘（设备 x≈328）与下缘在卡内清晰可辨，盘面像贴在一块深色矩形上；`hero-flatten-shots/platform-before-left-200.png`（裁 240,20,240,240 放大 200%）可见笔直竖台阶。

## 修法（换结构）

`scripts/bake-hero-genesis.mjs`（新增，管线留仓可复现，重复运行产物字节一致）：在 Chromium canvas 里按现行构图离线合成——**环图先做 alpha 羽化**（四边外 16% 带 destination-out 渐隐到全透明）再 screen 混合，台阶在烘焙阶段就不复存在；成品图四边即星云自身。源图三张移入 `scripts/hero-genesis-src/` 保存，`public/art` 不再有分层素材。

成品图（2 张平台 + 1 张海报）：

| 文件 | 尺寸 | 体积 | 构图 |
| --- | --- | --- | --- |
| public/art/hero-genesis-baked-1122.webp | 1122×898 | 51,728 B | 平台母版 1600×1280 缩版：环居右上出血、星云满幅（复刻涡环几何 top:-64/right:-48 ×4.47） |
| public/art/hero-genesis-baked-640.webp | 640×512 | 23,916 B | 同上小版（srcSet 对位旧口径） |
| （海报）assets/hero-genesis-baked-poster.webp | 1242×1656 | 71,700 B | 环心下移至 (621,1260)、环径 1180，亮弧起点 y≈830，避开三行标题（止于 y≈774） |

旧三层合计约 80KB 且需三次请求，新方案单图 52KB 一次请求。

## 平台侧改动

- `src/main.jsx`：hero 改为单张 `.genre-hero-baked` cover 直铺（srcSet 640/1122 对位）；涡环容器只剩 CSS 辉光 + 两层轨道环（渐变与边框，没有矩形可漏）。GSAP 效果按 DESIGN §5 令牌逐项承接：入场 = 成品图 1100ms scale 1.12→1.04 + 涡环 1200ms .82/−10° 展开（`--dur-hero-in`）；缓漂 = 成品图 x +1.2% / 30s；环体呼吸 = 成品图在静息 1.04 上 scale 1.04↔1.09 / 7s（等效环自身旧 +5%）；辉光呼吸不变（5s）；星尘漂移退役（已在像素内）。动效关/reduced-motion 时成品图静置完整呈现，与旧口径一致。
- `src/styles.css`：删 `.genre-hero-nebula/.genre-hero-dust/.genre-hero-ring-img` 三条，新增 `.genre-hero-baked` 一条；涡环/辉光/轨道环/scrim 不动。
- `DESIGN.md` §5：hero 五行动效令牌按新结构改写（时长/缓动全部不变，星尘漂移行标注退役留档）。
- `tests/startflow-ui.test.js`：REQ-71 用例改写为 HERO-FLATTEN 口径——断言 baked 在位、三层名永不回潮。
- 素材：`public/art/hero-genesis-{nebula-640,nebula-1122,dust-1122,ring-640}.webp` 删除/移入 scripts 源目录（全仓 grep 确认无其他引用）。

验收（`hero-flatten-shots.mjs` 驱动目标树自身 dist + ratings 夹具服务，DPR 2）：

- 改前（creation-motion 树）/改后（本树）各跑三主题（black/white/aurora）× 360/390/430 共 9 组 hero 元素截图 + 390 全页图，结构断言全绿（改后：baked 在位、三层类为 0、轨道环 2、主题生效、hero 盒 358×260@390 与改前一致）。
- 放大自证：`hero-flatten-shots/platform-after-left-200.png` 与 before 同区对照——竖台阶消失，盘面辉光渐隐入星云；全图对（before/after hero-white-390.png）构图、文案、卡面尺寸不变。
- 全量测试 1173 测 / 1168 过 / 5 败，败集恰为基线 dedup 样本图 ENOENT×5（import-daylight 本轮通过），无新增失败；`npm run build` 通过。

## 海报侧改动（~/workspace/sw-prep/xhs-promo-20261031/）

- `poster1.html` 重写：三层 div 换成单张 `.bg`（烘焙图 cover）；标题区加双层**平滑**深色渐变罩（顶部 0.90→0 于 62% 处、底部 0.85→0 于 26% 处，无硬止点）。
- `poster1.png` / `thumb1.png` 已重渲染。改后自证（`hero-flatten-crops/`）：
  - `after-poster-title3-200.png`（裁 88,540,1066,300 放大 150%）：「都翻烂了」完整压在深色星云上，渐变字锐利，亮弧只在裁图最下缘 faint 出现。
  - `after-poster-left-final-200.png`（裁 0,980,220,460 放大 200%）：左缘辉光渐隐，无竖线。
  - `after-poster-top-200.png`（裁 300,640,620,200 放大 200%）：新环羽化带内光子弧自黑暗中平滑浮现，无台阶。
- `poster2` 经查只用 family-moshi 单张照片作底（poster2.html 内无 genesis 分层素材），无此病，未动。

## 未覆盖项

- 未部署、未 push：等主助手集成波合入后按既定路线上线，最终以用户真机点验为准。
- 动效为运行态行为，截图只证静帧构图与结构；入场/呼吸的动态观感未录屏取证（令牌数值与旧版逐项对位，风险低）。
- 桌面宽（≥700px，sizes 60vw）未单独截图：成品图 cover 逻辑与手机宽同源，环在右上出血的构图在宽卡下同样成立，但未实测留档。
