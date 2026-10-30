# INTEGRATE-OCT31 — 今晚四批集成波处置笔记（2026-10-31）

基线：远程 main `c3cd883`（开工 fetch 核对一致）。集成分支 `integrate-oct31`，自 `origin/main` 新建 worktree、独立 `npm ci`。部署不在本批范围。

## 合并顺序与提交

| 序 | 分支（基线哈希） | 合并提交 | 结果 |
| --- | --- | --- | --- |
| 1 | stage-rebuild `58c68ec`（REQ-64 展台重建） | `ec79b86` | 零冲突；相关小集 61/61 |
| 2 | title-length `8680c4c`（REQ-63 书名 20 字） | `c34e0ef` | 零冲突；相关小集 60/60 |
| 3 | blurb-voice `8c26aa2`（REQ-65 简介语气） | `751a87c` | DESIGN.md 一处冲突（见下）；交叉小集 55/55 |
| 4 | billing-rules `3347b1f`（REQ-68 定价与法律页） | `6e973c5` | 零冲突；billing 小集 12/12 |
| 修 | Gemini 复核修复（见下） | `1263a08` | 新增回归测试 3 条全过 |

## 冲突清单与裁决（仅 1 处）

- **DESIGN.md**：title-length 在 §55 后追加 §56；blurb-voice 在 §55 末尾追加「语气附则（REQ-65）」条目，两边同锚点。裁决按各批笔记口径：附则归 §55 收尾（其文自带 supersede §55 篇幅带的关系），§56 整节随后。解法已逐字验损：§56 与 title-length 分支版 diff 为空、附则条目与 blurb-voice 分支版 diff 为空、无残留标记。
- `src/story-engine.js`（title-length × blurb-voice）、`src/main.jsx` 与 `src/styles.css`（三批共改）均为自动合并，靠交叉测试集验证语义（blurb/title/synopsis/forge/control 合跑 55/55；device-fix/shell-migration 在第 1、2 批后各复跑）。

## 主仓 node_modules 修复

- 主仓 `~/workspace/storyverse` 的 `node_modules` 是指向自身路径的坏符号链接（且该链接以 mode 120000 被 git 跟踪——仓库条目本身未动，属既存状态，特此备案）。处置：删坏链 → 前台 `npm ci` → 验盘（167 个包目录、pngjs 在位）→ `tests/billing-server.test.js` 实跑 9/9 通过。
- 教训复现：第一次修复放在后台 exec，进程自报成功但写入被沙箱回滚、目录实际为空；改前台重跑并逐项验盘后才成立。集成 worktree 的依赖同样验盘 + 基线测试实跑确认。

## 全量测试对账

- 合并后（修复前）：**1039 条 / 1034 过 / 5 败**。计数勾稽：基线 1019 − 守卫旧测 12 + 展台新测 8 + 书名 13 + 简介 8 + 计费新增 3 = 1039。5 败与基线失败集逐条一致（`tests/dedup-fix.test.js` ③a 样本图 ENOENT ×5，样本图只在主仓目录、worktree 缺失，环境类）。
- 修复后：**1042 条 / 1036 过 / 6 败**——5 条同上；多出的 1 条是 `tests/import-daylight.test.js` 的 backup merge 用例，即已知 flake 本体，单跑复跑 1/1 通过（本批修复未触其代码域）。
- `npm run build` 通过（修复前后各一次）；`dist/legal/` 四页（terms/privacy/member-rules/coins）齐全。

## Gemini 复核（agy，gemini-4-argon-high）与逐条处置

审查面按令聚焦三组交叉：发布路径（书名终检 × 简介禁令）、计费（织币 × 既有生成路径）、壳层（删守卫 × keep-alive）。结论 5 条实质发现，逐条以代码证据复核：

1. **存量章额度在天花板内被「只看不用」**：`server/index.js` 生成门在「用量未达日天花板」分支只判「织币为零且无章额度才拦」，持有章额度且织币为零时放行，却不置 `spendChapterCredit`，结算走织币路扣 0——留 1 章额度即可天天免费生成到天花板。修：同分支内织币为零且有章额度时置位走额度结算（与 429 条件严格镜像）。回归：billing 集成新例（会员保天花板余量 → 织币置 0 + 章额度 1 → 生成成功且额度真扣、织币 0 → 再生成 429 coins-exhausted）。
2. **合流书的介入/重掷漏乘合流系数**：`textSceneFor` 先按 mode 返回 intervention/reroll，`coinCostForText` 只对 fusion 场景乘 1.5/1.2，合流线的重演与重掷按 1.0 结算。修：系数跟线不跟 mode——`coinCostForText` 新增 `merged` 入参（场景标签保持原样只作记账），结算点按故事 kind 传入。回归：coin math 新断言三条（merged 的 intervention=21、会员 reroll=17、非合流 intervention 仍 14）。
3. **客户端不识 coins-exhausted**：`src/generation.js` 只映射 quota-exceeded，织币耗尽时用户看到通用限流文案。修：新增同级映射为织币文案（平台语言，与服务端文案同口径）。回归：generation-client 新例。
4. **改名镜像可把超限书名同步上架**：`server/plaza.js` 的 `syncTitleForStory` 两分支不查单位上限，而故事写入校验（persistence validateStory）只验非空——旧备份导入/直连 PUT 带来的超限名可绕过发布终检落到书城记录。修（守 TITLE-LENGTH「镜像永不抛错」口径）：镜像遇超限名跳过同步、书城保留上一合规名，库内写入照常成功；发布终检的硬拒不变。回归：title-length 新例（发布合规书 → PUT 超限名 → 写成功且详情页仍为合规名）。
5. **书主手改简介命中官方腔会在发布烘焙时整段回落**：行为属实但属既定口径——§55「发布优先（写死）」本就规定逐段过禁令、不合格段单独回落；REQ-65 笔记亦明示官方腔校验覆盖「发布烘焙」、不拦的是编辑动作本身。非集成引入，不改，理由在此备案。
- **交叉面三（壳层）Gemini 结论：未发现问题**，与本批 grep 预核一致（已删守卫模块与符号在 src/server/tests 无活引用，仅测试断言与注释提及；keep-alive 滚动恢复闭环于 App 壳层、从未依赖 ProfilePage 被删的三处 effect；他人主页窗口的冻结/恢复由壳层独立承担）。其顺带提到的根目录历史截图脚本 `poster-avatar-shots/run.mjs` 残留旧类名提及——非运行时代码，不在本批处置面，备案待后续顺手清理。

## 推送

- 推前 fetch 复核：origin/main 仍为 `c3cd88384d29093cb3975f8489305ccd89053239`，与开工基线一致。
- `git push origin HEAD:main` 成功：`c3cd883..8267d22`，回读 origin/main = `8267d22087b502c923675cf279465b9cc285aa5a`（含四合并 + 复核修复 + 本笔记首版）。
- 本节回填以一个收尾提交随后推送，最终 main 哈希以回读为准（见回报）。
