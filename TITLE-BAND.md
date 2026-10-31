# TITLE-BAND — 章节标题分档校验接线（REQ-69 走查挑剔①处置）

## 问题

00052 KB 接入（DESIGN §57）把章节标题字数带按家族分三档，但只落在提示词
`chapterTitleStyle` 里，无任何校验。REQ-69 普通用户走查实测：都市书生成出
19–20 字标题，超出其长解说档 8–16 字的定档。本批给分档口径补上校验环节。

## 覆盖路径（全部汇入一个校验点）

生产侧所有章节生成都走 `server/gemini.js` 的 `createGeminiGenerator().generate()`
→ `requestChapter` → `validateOutput`，校验钩子就坐在 `validateOutput` 之后、
两条后端（Vertex / 开发者 API）各一处，因此下列路径天然全覆盖，无第二入口：

- 开篇章（index 0，含世界圣经同次调用）
- 续章（index > 0）
- 预生成（客户端为下一章发的同一种 generate 请求，与续章同一形状）
- 介入重写（mode: 'revise'）
- 换一版（mode: 'reroll'，走 contextStory 的同一 generate 流程）
- 合流章节（story.kind === 'merged'，同一 generate 流程）

已核实无旁路：`server/fusion.js` 只裁书名不产章节；客户端 `src/` 无本地章节
生成器（本地只有骨架 `buildChapter` 的占位标题，不经模型、不落为正式章节标题）。

## 校验口径

- 档位判定单一事实源不变：`CHAPTER_TITLE_BANDS` + `chapterTitleBandIdFor`
  （src/story-engine.js）。本批新增 `chapterTitleBandRangeFor`（含升格升档后的
  有效 min/max）与 `chapterTitleBandDistanceFor`（离档距离，0 = 在带内），
  `chapterTitleGuidanceFor` / `chapterTitleFitFor` 改为共用 range，输出与返回
  形状逐字不变（kb-integration 的 deepEqual 断言钉住）。
- 服务端校验侧的档位计算与提示词侧逐字同式：`generate()` 里按
  `resolvedTemplates?.primary?.id || storyTemplateIdFor(story)` 取写作模板
  （自由题材取借用家族，与 contextFor 的 styleTemplateId 同源），升格标记取
  `storyBeatPlan` 的 `isUnitEnd || isFinale`，与 contextFor 859 行的
  `chapterTitleStyle` 计算完全一致——引导和校验不可能对「本章是哪一档」
  得出不同结论。
- 字数以码点计（`[...title].length`），与 `chapterTitleFitFor` 及提示词口径一致。

## 重问与兜底规则

1. 章节通过既有全部校验门（纯数字标题等硬闸不变）后，标题按本章档位核对；
   在带内 → 零额外调用，直接落盘。
2. 违规 → **同请求内只就标题重问一次**：一次小调用（maxOutputTokens 256），
   带本章摘要、首段、本章档位引导原文与明确的 min–max 数字、原标题及其字数。
   候选先过硬事实清洗（非空、非纯数字、≤80 字、剥书名号/引号包裹）。
3. 重问答案在带内 → 落盘；仍违规 → 按离档距离比较，**较近的一条落盘**
   （同距时取重问答案——它是带着明确档位写的）；候选为空/清洗不过 → 原标题落盘。
4. **绝不阻断交付**：重问整段 best-effort，任何异常（含供应方报错、超时随
   章节 attempt 的 AbortController 一并中止）都吞掉并保留原标题；`settleChapterTitle`
   整体再包一层 try/catch，永不把错误抛进韧性循环、永不触发整章重生。
5. 可观测：每次违规落一条 stderr JSON（type: `chapter-title-band`，含 storyId、
   章号、档位、升格标记、原/候选/最终三方字数、outcome ∈ reasked-fits /
   reasked-closer / kept-original）——只记字数不记标题原文，沿
   generation-upstream-error 的既有日志惯例。重问调用的 token 用量经
   `mergeUsage` 并入本章 usage，账面不漏计。

## 口径变更记录

- DESIGN §57 原句「校验函数只供 canon QA 与测试」就此更新为：`chapterTitleFitFor`
  供 canon QA、测试与生成侧章后校验共用；生成侧硬闸仍只有纯数字标题一条，
  字数带靠「章后校验 + 同请求重问一次」落地，不许卡章——§57 当初写的
  「靠重问，不许卡章」本批才真正接线。

## 测试

- 新增 `tests/title-band-check.test.js` 13 条：
  - 引擎层：三档 range（含升格）与 distance 边缘、未知模板回落标准档。
  - 标准档：在带内零重问；超带重问命中落盘 + usage 合并 + stderr 记录内容断言；
    候选为纯数字被拒、原标题落盘。
  - 长解说档（走查原案）：20 字原标题 → 重问 17 字仍超带但更近 → 落更近一条；
    重问 25 字更远 → 原标题落盘。
  - 对仗档：2 字低于下限 → 重问 8 字命中落盘。
  - 升格豁免：标准档终章 12 字标题（平档必违规、升格带 6–14 在带内）→ 零重问。
  - 路径覆盖：开篇、续章（预生成形状）、介入 revise（标记与介入事件不断言丢失）、
    开发者 API 后端（fetch 路径）各一条；重问抛错 → 整章照常交付原标题。
- 全量：1173 测 / 1168 过 / 5 败，失败集恰为基线 dedup ENOENT×5
  （import-daylight 本轮通过，属既有 flake）；基线同口径 1160 测 / 5 败。
  受影响面（gemini-*/kb/intervention/frontier/blurb/content）先行单跑 122 测全绿。
- `npm run build` 通过。

## 环境注记

- 本 worktree 的 node_modules 是仓库跟踪的坏符号链接（指向主仓），已按既往
  惯例删链后在 worktree 内 `npm ci` 重装；该删除**未入本次提交**，根治（删仓库
  里的坏链条目）仍属另案。
