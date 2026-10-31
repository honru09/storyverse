# REQ-71 处置笔记 — 造世面动效升级 + 专属素材

基线 origin/main `0a02800`，分支 `creation-motion`（worktree `storyverse-creation-motion`），**只本地提交、不 push 不部署**。用户令（2026-10-31 09:10 真机截图）：「动效再高级一点，生成专属素材优化」。全程未碰 REQ-70 的 `.profile-showcase` 与小头像位文件/类名。

## 参考功课（全文见 REFERENCES.md）

- Awwwards「Black Hole Interaction」类作品 + NASA 吸积盘可视化：黑洞主视觉不靠 CSS 圆环，靠**真实感吸积盘贴图**（光子环 + 引力透镜弧 + 左侧多普勒增亮）立住，分层做缓动。
- Codrops GSAP 两篇（分层视差 / 错峰入场）：层与层用不同周期同相缓动、块级错峰 30ms 起步、整场级联压在 ~180ms 内。
- Godly 式卡片反馈口径：点选只做 transform 按压 + 选中标记弹出，不加发光描边等廉价效果。

## 素材（生成 21 张，逐张亲看验收；落盘 40 个文件）

统一画风锚点：电影感数字绘画、8:5 横构图、主体小尺寸可辨、无文字；每张主色 + 主体互不相同。

**题材家族 18 张**（`public/art/family-<id>-{640,1122}.webp`，640×400 / 1122×701，libwebp q80；640 套合计 866,274 B、均 ~48KB/张，1122 套合计 1,916,416 B）：

| 家族 | 画面（一眼识别点） |
|---|---|
| 玄幻修真 | 翡翠浮岛 + 玉剑 |
| 武侠江湖 | 琥珀色水墨客栈屋顶 + 剑客剪影 |
| 穿越重生 | 古代宫门与现代霓虹被金色裂隙劈开 |
| 言情 | 粉樱下情侣剪影 + 红线 |
| 都市现实 | 钢蓝雨夜街道 + 伞下人 |
| 娱乐圈 | 品红金舞台 + 立麦 |
| 历史 | 赭土沙漠要塞 + 战旗 + 铜鼎 |
| 科幻 | 青蓝轨道环站绕行星 |
| 末世求生 | 锈橙废墟巴士 + 油灯 + 物资箱 |
| 悬疑惊悚 | 绿灰走廊半开门透光 + 皮箱 |
| 灵异民俗 | 暗青雾中祠门 + 空白符纸 + 红灯笼 |
| 副本竞技 | 蓝紫传送门 + 符文圈 + 小冒险者 |
| 游戏电竞 | 粉钴竞技场 + 金杯 |
| 军事 | 橄榄绿沙盘 + 电台 + 望远镜 |
| 体育 | 天蓝体育场 + 红跑道 + 起跑者 |
| 种田 | 翠绿梯田 + 农舍 + 菜摊 |
| 短篇 | 暖褐台灯书桌 + 信纸钢笔 |
| 反派 | 绯红黑王座 + 落地皇冠 + 倒下的王棋 |

其中 9 对是**全新文件**（chuanyue/dianjing/junshi/lingyi/moshi/tiyu/wuxia/yule/zhongtian——正是原先借图的 9 个），9 对是同名文件**整套换新**（旧家族图同为紫蓝极光山水系、彼此难分）。

**自由创世主视觉 3 层**（分层供视差/缓转）：星云底板（暗海军蓝紫、无中心物）+ 吸积环层（纯黑底 Gargantua 式光子环，screen 混合）+ 星尘层（纯黑底金色微尘，screen 混合）。落盘 4 文件共 90,970 B：`hero-genesis-nebula-640` 11,064 / `hero-genesis-nebula-1122` 27,664 / `hero-genesis-dust-1122` 29,530 / `hero-genesis-ring-640`（640×640）22,712。源图 1920×1200（环 1600×1600），ffmpeg 缩放 + libwebp q80 加工，不拿原图直塞。

**世界步盘点结论**：6 个世界各有自有图（沉潮港/青岚宗/霓虹下城/长宁街/长乐宫/七号前哨站互不相同），**世界步本身无雷同**。雷同源头在题材步：18 个书架中 9 个在 `GENRE_SHELVES` 里用 `art:` 借用世界/封面图（如 wuxia→cover-eastern、moshi→cover-scifi、zhongtian→mist），另 9 张自有家族图同为极光山水。修复：删除 9 处借用字段，书架一律解析到自己的 `family-<id>` 图（回落逻辑保留），并加测试断言「no shelf borrows art」。

**体积总账**：`public/art` 5.9MB → 7.79MB（净增 ~1.9MB）。首屏口径：题材步首屏（390px/DPR2）hero 三层 ≈ 80KB；分类墙展开时 640 套 18 张共 866KB 按需随墙加载。

## 动效（参数已落 DESIGN.md §5，代码无野数值）

| 项 | 参数 |
|---|---|
| 步骤前进过渡 | 420ms（`--dur-step-fwd`），y +16→0 + 淡入，power3.out |
| 步骤后退过渡 | 320ms（`--dur-step-back`），y −8→0 落定 |
| 块级错峰 | 30ms 间隔、380ms 单块、级联上限 ~180ms |
| hero 入场 | 1200ms（`--dur-hero-in`），星云 scale 1.12→1.04、环 .82/−10°→1 expo.out、星尘 1400ms 淡入 |
| 辉光呼吸 | 5s sine.inOut yoyo（opacity .38↔.62、scale ↔1.12） |
| 环体呼吸 | 7s sine.inOut yoyo（scale 1↔1.05） |
| 星尘漂移 | 26s（xPercent −2.5 / yPercent 1.5） |
| 星云缓漂 | 30s（xPercent 1.2，常驻 scale 1.04 兜边） |
| 轨道环 | 46s 反向 / 32s 正向，linear 匀速（CSS） |
| 掷骰落定 | 3×90ms steps(1) 闪烁 + 300ms 落定（随机组合/题材/世界三处入口） |
| 选中标记 | sel-mark-pop：scale .5→1 + 淡入，`var(--dur-pop)` |

实现要点：①步骤过渡走 `.forge-step-panel`（key=step），方向由 prevStepRef 判定；§53 禁整页横滑，方向感走纵轴（前进上浮、后退落定）。②全部 GSAP 接线过 `useMotionPolicy("forge")`——动效总开关关或 reduced-motion 时所有 effect 整体不跑、内容以终态完整呈现（截图 + DOM 断言双证：两态下 hero 图层无 inline style 残留）。③所有 tween 带 clearProps + cleanup kill，不留残影；只动 transform/opacity。④卡片按压反馈（shelf-brick :active .98 等）为既有资产，本批未重复造，只补了选中标记 pop。

**中间帧证据说明（如实）**：power3.out 前载太陡 + 本机截图管线延迟 ~200ms，静帧在视觉上已近终态。证据以两件替代：`step-transition-midframe-390.png` 为录屏（screencast）在点「继续」后约 150ms 抽出的真实帧（世界步首帧、图未载完）；另有计算样式采样实测过渡中段值（opacity 0.9997→1、y 矩阵 0.63→0.0005、结束后 clearProps 归 none）与环体呼吸采样（scale 1.0001→1.005 随 7s 正弦爬升）。

## 「已选：历史 · 历史」核查结论

**展示拼接 bug，非数据问题**。`twoSegmentTemplateName` 把 `shelf.name + template.name` 拼接，而 lishi 的书架名与模板名同为「历史」。已修：同名时只返回模板全名。该函数 4 个使用点（事实行/已选行/选中说明/汇总步）改一处全修。实证：改前截图脚本在基线复现「已选：历史 · 历史。…」，改后为「已选：历史。低位入局，用事功改掉已知的败局。」

## 过程事故（如实记录）

首版接线把三个动效 effect 插在 `const [step, setStep]` 声明之前，依赖数组在 render 期求值触发 TDZ（`Cannot access 'step' before initialization`），造世页落错误边界。截图脚本对基线的对照探针第一时间暴露（基线正常、本支崩），用 sourcemap 解码定位到行，整块 effect 移到状态声明之后修复；修复后 build、双测试文件（32/32）、造世探针、全部截图重跑通过。今后纪律：新 effect 一律放在其依赖的 state 声明之后再插。

## 验收结果

- 截图组 `creation-motion-shots/{before,after}/`（同脚本同角度成对）：390 hero/分类墙/点选历史/世界步、360 hero、430 分类墙、motion-off 390、reduced-motion 390（两静止态与 motion-off 逐字节一致），逐张亲看通过——卡片互不雷同、标签单行、无溢出。
- 全量测试 1137 个：1132 过、5 败，失败集与基线**完全一致**（③a band-trim 样本图 ENOENT ×5，即已知 dedup 集；import-daylight flake 本轮通过）。`npm run build` 通过。
- REFERENCES.md 随仓留档；截图脚本 `creation-motion-shots.mjs` 随仓（SHOTS_TAG=before/after 复跑）。
