# PIXELFX-WAVE6 — 自纠错深化（第六波）

2026-11-01。用户 04:23 令「继续加一些优化」、05:03 汇总令承 01:58 亲令「先不部署，继续几次融合升级」——**本波只合入 main，不部署**（与波三、四、五同候 00059，部署等 Google 登录解开后一并处理）。基线 main `8741301`（波五终点，19 场景、自查 325 渲染 + 56 闪光审计）。本波不加新落点，做三件自纠错深化。DESIGN 侧见 §60 第六波段。

工作区：由 pixelfx5 的本地 clone 复制（rsync，排除 node_modules）后校验 HEAD 得到，基线与 origin 逐字一致；本地坏 main `c3cd883` 未碰。（注：首试的后台 `git clone` 与一次目录复制均被本机沙箱的写入回滚吞掉，最终以前台 rsync + 跨调用复验落盘为准，产物逐项从磁盘核对。）

## 三件清单（3/3 全落地）

| # | 件 | 做法（定版） | 证据 |
|---|---|---|---|
| 1 | 健康记录落盘 | `health.js` 新增 persisted event log：heal / death / tier-drop 三类事件在记内存表的同时追加 localStorage 环形缓冲（键 `storyweave:pixelfx-health-log`，上限 `PIXELFX_HEALTH_LOG_LIMIT=100`，每条 {at, fx, scene, type, result}）。场景归属走 placements 单点盖戳——`pickFx` 返回的 pick 自带 `scene` 字段（forge 链同经 `pickFx`，世界回落 waiting 时戳如实记 waiting），`PixelfxCanvas` 三处记录调用（heal 行 192、death 行 199、tier-drop 行 418）一律传 `sceneName`（显式 `scene` prop 优先、次取 `pick.scene`）。读取每次回源存储（无缓存），落盘被拒/写满时降级会话内存环且绝不抛错。设置页：`ProfileSettings`（main.jsx）新增「高级」组（渐进式披露最里层，关于组之后）一行只读静态行——`特效健康`，无事件显示「正常」，有事件显示「近 N 条记录 · 自愈 M 次 · 异常 D」（`pixelfxHealthLogSummary()` 聚合，异常 = 死亡数） | 单测：三类事件落盘字段/场景逐条断言、原始存储 JSON 冷读一致、汇总聚合、105 条冲环后剩 100 且最旧 5 条出环、无存储时内存环降级、pick 场景戳（含 forge 世界/回落两路）、设置接线源码断言 |
| 2 | 关键帧留影与比对 | 新脚本 `scripts/fx-keyframes.mjs`（`npm run fx:keyframes`，独立于 npm test）：19 场景主选 pick（黑主题、表中 seed）以 `renderPixelfxStill` 的代表帧（一次性 ≈45%、循环 0.8s——与动效关时读者所见同一帧）真渲染、压黑底导出 PNG；内置零依赖 PNG 编解码（编码 filter-0 RGB；解码支持 5 种行过滤、RGB/RGBA）。`--out <dir>` 写留影集 + manifest.json（fx/seed/尺寸）；`--compare <dir>` 逐图比对，单通道 Δ>24 计变、变样占比 >0.5% 列变样清单并 exit 1，尺寸变/基线缺失/基线多余同列 | 本波实跑：留影 19 张落 `~/workspace/sw-prep/fx-keyframes/wave6/`（manifest 同目录）；紧接着的 `--compare` 同目录自比对**变样清单为空**（exit 0）；waiting（water-orb）与 season-finale（firework-burst）两张留影已人工目检为真帧。单测另证：PNG 编解码往返无损、diff 阈值判定、19 场景留影全非空且二次渲染逐像素确定性一致 |
| 3 | 每日自查接线稿 | 见下节全文——只写稿，cron 本体由父级改，本波未动任何 cron | 本节即交付 |

分工口径（写死）：`fx:selfcheck` 管「活没活/快不快」（非空、步中位、循环纪律、闪光审计），`fx:keyframes` 管「样变没变」（留影比对）。两者都是独立脚本、不进 `npm test`，由每日自查在测试套件之后调用。

## 每日自查接线稿（给 storyweave-daily-bughunt cron 追加的指令段落，原文）

> ## 特效自查（PIXELFX-WAVE6 接线，2026-11-01）
>
> 在当日测试套件跑完之后，追加两步（仓库根目录执行）：
>
> 1. `npm run fx:selfcheck` —— pixelfx 全表体检：全部场景 × 家族 × 主题的真帧渲染断言（非空、步中位 ≤24ms、循环纪律）+ grand 闪光审计报告。
> 2. `npm run fx:keyframes -- --compare ~/workspace/sw-prep/fx-keyframes/latest` —— 19 场景关键帧留影与基线逐图比对。基线目录 `~/workspace/sw-prep/fx-keyframes/latest` 尚不存在时，先 `npm run fx:keyframes -- --out ~/workspace/sw-prep/fx-keyframes/latest` 建基线，本日不判变样。
>
> 处置口径：
>
> - 任一步出异常（selfcheck 退出码非 0，或 keyframes 报出变样清单），把异常原文逐条写进 `~/workspace/sw-prep/bug-hunt/LOG.md` 的「特效自查」段（无此段则新建），并计入当日待修清单按常规流程决定是否修复；特效异常不许静默吞掉，也不许因特效问题阻断当日其他修复。
> - 两步全过时，只在「特效自查」段记一行：日期 + `fx:selfcheck OK · keyframes 无变样`。
> - 变样不等于故障：有意换 pick、换色板、升级 vendored 库都会变样。清单里的场景先人工确认新样子可接受，确认后才用 `npm run fx:keyframes -- --out ~/workspace/sw-prep/fx-keyframes/latest` 刷新基线并在 LOG 里注明刷新原因；未确认前不许刷新基线。

## 验证计数

- pixelfx 两测试文件 **47/47 全绿**（波六新增 7 项：落盘三类事件+场景归属 / 环形上限 / 无存储降级 / pick 场景戳 / PNG 编解码与 diff / 19 场景留影非空+确定性 / 设置接线断言）。
- 全量套件 **1236 项 / 1231 过 / 5 败**——5 败全为 dedup ③a 族（新 clone 缺未跟踪的 fixture 图 avatar-shots/sample-portrait-v1-black-hair.png 等，ENOENT；波二至波五同基线）。**零新回归**（1236 = 基线 1229 + 波六 7 新测）。
- `npm run fx:selfcheck`：**325 渲染全过 + 56 grand 闪光审计全 0 次/秒**（与波五定版一致，本波未动 pick 与阈值）。
- `npm run fx:keyframes`：留影 19 张 + 对 wave6 基线自比对无变样（exit 0）。
- `npm run build` 通过。

## Gemini 复核处置

agy（gemini-4-argon-high）过本波代码 diff（health/placements/PixelfxCanvas/main/package/tests/fx-keyframes），结论 **no defects found**，无条目需处置。前两次调用分别因模型池不可用与进程被系统 Kill 未产出，第三次以纯文本模式完成——过程如实记此。

## 未证项（如实）

- 设置页「特效健康」行的真机观感（高级组位置、汇总文案长度在窄屏的折行）无浏览器实证，与波三至波五同候用户真机点验（部署仍被 Google 登录阻塞，本波按令只合入 main）。
- localStorage 落盘在 iOS Safari 私有模式/存储被系统回收时的实际留存时长无真机实证；代码口径是被拒即降级内存环、计数表不受影响，最坏情况只是汇总回到「正常」。
- keyframes 的变样阈值（Δ24 / 0.5%）为工程定版，未经真实「有意变样」事件标定；首次基线刷新由每日自查接线后的人工确认兜住。
