# READER-POLISH2（REQ-54）— 阅读器真机三修处置笔记

基线：origin/main `1001e79`（部署 00049-wsb 同点）。分支 `reader-polish2`，只本地提交、不 push 不部署。
来源：用户 2026-10-30 23:51 在 00049 真机读《从灵田杂役开始登天》第 1 章后亲提（截图存 `~/workspace/user/files/E0665F6F-*.jpg`）。

## 1. 删阅读器「只读版本 · 不会改变原作」横幅

- 删除 `src/main.jsx` ReaderWorkspace 里每章标题上方的 `{readOnly && (<p className="reader-readonly-note">…)}` 常驻横幅（连同注释说明去向）。
- 连带删除两条死 CSS：`src/styles.css` 的 `.reader-readonly-note{…}`、`src/reader-experience.css` 的 `.page-reader .reader-readonly-note{…}`（含其注释）。
- 「只读」只在详情页显示一次：详情页（`PlazaDetail` 封面文案区）此前没有任何只读标注，现于状态行（题材 · 章数 · 状态 · 作者 · 阅读量）之下加一行小字 `<p className="plaza-detail-readonly">只读版本 · 不会改变原作</p>`，样式在 `styles.css`：11.5px、opacity .78——是状态区的一部分、不是新横幅。详情页展示的都是他人已发布书（只读语义恒成立），故无条件显示。
- main.jsx 另一处「已保存匿名只读版本…」是匿名保存 toast，语境不同，不动。
- 单测钉死：`reader-readonly-note` 在 main / 两份 CSS 中零出现；文案在 main 中恰出现 1 次；`.plaza-detail-readonly` 规则存在。e2e 三处旧引用（journey ×2、gemini、reader-chrome）按新契约改写：阅读器内断言文案 count=0。

## 2. 卷页纸背透印（turnStyle=curl）

- 参数定案：**`filter: blur(1.6px); opacity: .5`**，只作用于纸背文字内容层：`.reader-curl-mirror .reader-curl-box { filter: blur(1.6px); opacity: .5 }`。
- 取舍：镜像层 `.reader-curl-mirror` 本身的纸面背景保持不透明（纸是实体，带内不透出下层页）；糊的只是字迹——19px 宋体在 1.6px 高斯下笔画粘连、字形可辨而笔画不可读，实拍（30%/60% 两帧）正是「看得出有字、看不清字」的真实透印感。若再加深（2px/.45）字形轮廓也开始溶掉、像渲染故障；再浅（1px）大字标题仍可读字，故 1.6px/.5 是甜点，不再回调。
- 正面（flat 层）与揭示页（under 层）不受影响（单测断言 blur 规则够不到它们）；平滑滑动模式无纸背层，不动。

## 3. 卷页全幅化（几何换坐标系，不碰分页）

根因：旧 `.reader-curl` 是 `position:absolute; inset:0`，被关在页盒内——页盒左右有 22px 内边距、上下被细线区扣掉（390×844 下页盒仅 346×738），折线、亮脊、投影到盒边即断，与全幅纸面错位。

改法（`src/components/ReaderPager.jsx` + `src/reader-experience.css`）：

- 舞台改全幅：`.reader-curl { position: fixed; inset: 0; z-index: 11; pointer-events: none }`（细线 z-12、呼出 chrome z-15 仍在其上；桌面 `@media(min-width:1050px)` 时 `left:88px`，与细线同口径避侧栏）。
- 折线几何全部换到**舞台坐标**：`applyCurl` 每帧量舞台 rect（W×H）与页盒 rect，折轴过 (m, H/2)、方向 (lean, H)；band 宽、shade/shadow 的 clip 与渐变都按 W/H 生成——折线自页顶贯通页底、纸页扫过整幅。
- 文字一像素不移：每层 article 外包 `.reader-curl-box`，由舞台上的 CSS 变量 `--curl-box-x/y/w/h` 钉到静态页盒位置（pager rect − stage rect），`overflow:hidden` 且内层 article 宽 100%。翻页首末帧与静止页逐像素重合（walk 实测 box 与 pager rect 四值全等）。
- `curl.m / completeM` 改舞台 x：起点/终点在舞台左右缘；新增 `pristine` 标记，首帧 `applyCurl` 把 rest 位置校正到实测舞台宽（挂载前用 `stageWidthGuess()` = 窗口宽 − 桌面栏 88 估算，`startCurl` / 回弹目标共用）。`lean` 仍按页盒宽算（手指抓握的倾斜感不变）、grab 仍按页盒 rect 算。
- **红线遵守**：`packPages`、分页安全带、post-pack 审计、slide 路径一律未动（REQ-47 刚验收的契约原样）；REQ-47 的一条 CSS 断言与一条拖拽公式断言按本批改造跟随更新（同 FIX3 当年先例：守卫跟随改造、不钉已退役实现），REQ-47 其余断言全数保留通过。

## 验收（390×844 WebKit，真实生产章节 fixture）

walk 脚本：`reader-polish2-shots/walk.mjs`（15/15 断言通过）+ `reader-polish2-shots/detail-shot.mjs`（详情页文案恰 1 次）。截图（均亲看判定）：

- `reader-polish2-shots/390-own-static-page1.png` — 自有书静止第 1 页对照：标题上方干净、无横幅、无卷页层。
- `reader-polish2-shots/390-curl-hold-30.png` — 拖拽定格 30%：折线/亮脊贯通全高；纸背字糊到不可读；正面与揭示页 crisp。
- `reader-polish2-shots/390-curl-hold-60.png` — 定格 60%：同上，折面扫过近半幅、边缘不露页盒框。
- `reader-polish2-shots/390-own-after-turn.png` — 释放落定第 2 页：无卷页残留，进度 0%→20%。
- `reader-polish2-shots/390-readonly-chapter-start.png` — 只读书章首：与自有书静止图逐像素一致（同哈希），标题上方无横幅。
- `reader-polish2-shots/390-detail-note.png` — 详情页封面区：状态行下一行小字「只读版本 · 不会改变原作」，全页恰 1 次，不溢出。

DOM 断言要点（walk 内）：舞台包围盒 == (0,0,390,844)；flap clip 多边形最大 Y == 844；`--curl-box-*` 与 pager rect 四值相等（<1px）；mirror box 计算样式 filter 含 `blur(1.6px)`、opacity == 0.5；两类阅读器内横幅 count 均为 0。

环境注记：本机无头 WebKit 的 rAF 只有约 2fps，卷页落定动画在 walk 里需数秒（真机 60fps 约 200ms）——walk 改为等 `.reader-curl` detach 而非固定睡眠；属环境伪影，非应用问题。

## 测试

- 阅读器相关单测（reader-page / reader-pager / reading-preferences）50/50，含新增 REQ-54 用例组 3 个。
- `npm run build` 通过。
- 全量 `npm test` 两轮：920 条。第一轮 914 过 / 6 败，第二轮 915 过 / 5 败——失败集与基线完全一致：dedup 样本图 ENOENT ×5（③a 去边带 ×4 + 旧图自愈 ×1，样本图文件本机缺失）+ import-daylight flake（首轮败、次轮过）。无新增失败。
