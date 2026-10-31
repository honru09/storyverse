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

- pixelfx 两测试文件 **50/50 全绿**（波六新增 10 项：落盘三类事件+场景归属 / 环形上限 / 无存储降级 / 方法级拒绝降级（复核 F1 回归） / pick 场景戳 / PNG 编解码与 diff / 解码拒绝截断与隔行（F2 回归） / 19 场景留影非空+确定性 / 设置接线断言 / --compare 缺目录不崩（F3 回归））。
- 全量套件 **1239 项 / 1234 过 / 5 败**——5 败全为 dedup ③a 族（新 clone 缺未跟踪的 fixture 图 avatar-shots/sample-portrait-v1-black-hair.png 等，ENOENT；波二至波五同基线）。另 import-daylight 的 backup merge 在满载时偶发 1 败（单跑四次三过一败，与波二/三/五记录的同一并行时序 flake，与本波零交集）。**零新回归**（1239 = 基线 1229 + 波六 10 新测）。
- `npm run fx:selfcheck`：**325 渲染全过 + 56 grand 闪光审计全 0 次/秒**（与波五定版一致，本波未动 pick 与阈值）。
- `npm run fx:keyframes`：留影 19 张 + 对 wave6 基线自比对无变样（exit 0）。
- `npm run build` 通过。

## Gemini 复核处置（两轮，逐条回源码核验）

复核经历两轮：纯文本 pass（gemini-4-argon-high，只读代码 diff）先报 no defects found；随后完整 agent pass（同模型，迟到交付）报 3 个缺陷。逐条回源码核验后**三条全部成立**，已在跟进提交中逐条修复并各补回归测试——以第二轮为准，第一轮结论作废：

| # | 缺陷 | 核验与处置 |
|---|---|---|
| F1 | localStorage 对象存在但方法级抛错（配额满/SecurityError）时，append 的 catch 直接丢事件、read 永不回看内存环——「被拒/写满降级内存环」只在存储对象缺失时成立，违反 §60 写死口径 | **成立，已修**：health.js 加 `storageDegraded` 闩锁——getItem/setItem 一抛错即闩住，之后读写全走内存环；每次 append 先把（含盘上历史的）全量镜像进内存，闩住时不丢历史；reset 连闩一并清。补单测：setItem 抛错、getItem 抛错两路落盘降级后日志与汇总仍完整 |
| F2 | decodePng 不校验隔行字节与解压长度：截断 PNG 经 subarray 钳制静默零填充成黑图、Adam7 隔行流会被当扫描线解成乱码——坏基线读不出「坏」，只会报出天量假变样 | **成立，已修**：解码前校验 chunk 边界、IHDR 压缩/过滤/隔行三字节须为 0、IEND 须在场、解压长度须恰为 (stride+1)×height，任一不符抛错（compare 侧按「基线不可读」逐条列）。补单测：截断与隔行字节各一例必抛 |
| F3 | `--compare` 的基线目录不存在时 readdirSync 在 try 外直接 ENOENT 崩栈，与「基线缺失同列」的设计相悖（每日自查首跑前基线目录本就不存在，接线稿靠 cron 操作员先建基线绕开，但脚本自身不该崩） | **成立，已修**：readdirSync 包 try，缺目录时逐场景走「no readable baseline portrait」清单、exit 1 不崩栈。补单测：子进程跑 --compare 指向不存在目录，断言 exit 1 + 清单文案 + 无 ENOENT |

复核过程如实记：模型池不可用与进程被 Kill 各废掉一次调用，纯文本 pass 与 agent pass 结论不一致时以逐条回源码核验的结果为准——三条均在源码上复现成立后才动手。

## 未证项（如实）

- 设置页「特效健康」行的真机观感（高级组位置、汇总文案长度在窄屏的折行）无浏览器实证，与波三至波五同候用户真机点验（部署仍被 Google 登录阻塞，本波按令只合入 main）。
- localStorage 落盘在 iOS Safari 私有模式/存储被系统回收时的实际留存时长无真机实证；代码口径是被拒即降级内存环、计数表不受影响，最坏情况只是汇总回到「正常」。
- keyframes 的变样阈值（Δ24 / 0.5%）为工程定版，未经真实「有意变样」事件标定；首次基线刷新由每日自查接线后的人工确认兜住。
