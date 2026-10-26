# TOKEN-PLAN：知识库接线方案与省 token 测算

版本 v1 · 2026-10-26。只写方案与估算，**不动代码**。资产说明见 [README.md](README.md)，价格口径见 `docs/AI_CLOUD_DECISIONS.md` 与 `docs/CLOUD_COST_ESTIMATE.md`（2026-10-22 快照，未返赠金原价）。

> **v2 更新（2026-10-26）**：接线已按第 2 节实现——服务端启动加载 genres.json、genreBrief/genreBeat 注入、续章 worldBible 紧凑化、usageMetadata 透传并在 `/api/generate` 落账，另有开关 `STORYWEAVE_GENRE_TEMPLATES`（默认 on）。同时 genres 融合修订为 v2，切片实测更新：开局 547–596 字、续章 127–183 字。下文第 2 节的实测数字与第 3 节的新增区间已按 v2 更新；成本结论区间不变。第 5 节清单中只剩固定种子 A/B 未做。

## 1. 现状：每次章节请求的提示词构成

依据 `server/gemini.js`（行号为本文件撰写时的版本）：

| 组成 | 位置 | 量级与说明 |
| --- | --- | --- |
| SYSTEM_PROMPT | L171 定义，L248 / L274 注入 | 662 字，固定开销，每次请求都发 |
| responseSchema | L23 定义，随请求以 responseJsonSchema 发送 | 按价格文档口径计入输入 token；开局版因含 worldBible 块更大 |
| contextFor JSON | L127 组装，L318 `JSON.stringify` 后作为 user 内容 | 见下拆解 |
| maxOutputTokens | L251 / L278 | 6144，输出上限（正文 + thinking 一起算） |

contextFor（L127–169）逐字段：

- `config`：经 compactConfig（L112）裁剪的用户设定，每字段 ≤240 字，单人故事约 200–400 字。
- `worldBible`：**每章全量重发**。premise ≤1000 字、rules ≤8 条 ×≤400 字、endingAnchor ≤1000 字、outline 恰 6 条 ×≤400 字（均为 clip 上限）。模型实际生成的 bible 远小于上限，典型约 600–1,300 字，但它在第 2–6 章每章都完整再发一遍。
- `summaries`：已完成各章摘要，每章 ≤600 字，随进度累积。
- `recentChapter`：上一章正文取尾部 ≤6,000 字（L144）。这是后几章最大的单项输入，知识库不处理它。
- `beatPlan`：`storyBeatPlan` 的输出（L145）——act、dramaticQuestion、prerequisites、mustGround、toneDirective、paragraphShape，约 300–500 字。
- `currentDecision` + `decisionSchedule`：本章及第 2/4 章的选择定义。
- 合流故事另加 `sourceWorlds`：两部原作的 bible（各自再裁剪一档）与摘要，是单人故事之外的大头。

实测锚点（`docs/AI_CLOUD_DECISIONS.md` 与成本记录）：真实首章一次调用 = **1,255 input + 1,864 output/reasoning tokens**。首章 context 里没有 recentChapter、summaries 为空，所以这 1,255 里系统提示 + schema 占大头，context 本体只有几百。官方六章预算基线：**20,000 input + 18,000 output/reasoning**，增量主要来自 bible 重发、摘要累积与 recentChapter。

## 2. 接线方案（v2 已按此实现）

在 `contextFor` 里增加两个互斥字段，其余流程（schema、校验、缓存键、并发限制）不变：

1. **模板解析**：服务端启动时读 `knowledge/genres.json` 进内存。按故事的 `genreTemplateId`（建议新落字段）取模板；无此字段时用模板的 `engineGenres` 与 `config.genreId` 映射兜底；再无匹配则不加字段，行为与今天完全一致。合流故事按 README 的合流规则处理。
2. **开局（index = 0）**：加 `genreBrief`，按 README 切片拼装（readerPromise + worldSkeleton + conflictEngine + archetypes 的 role/desire + 六章 beats），v2 实测 547–596 字。字段名本身即指令语义（"题材模板简报"），v1 不改 SYSTEM_PROMPT；若固定种子 A/B 显示模型没有据此实例化 worldBible，再考虑在系统提示加一句话（约 +40 字/请求，届时重算本测算）。
3. **续章（index > 0）**：加 `genreBeat`，按 README 切片拼装（本章节拍 + 章末钩子 + 轮换原型卡的 flaw/voice + 轮换雷区一条 + 轮换爽点一条），v2 实测 127–183 字。
4. **bible 压缩（省 token 的主要来源，与模板注入配套）**：模板在场时，续章 context 的 worldBible 改发紧凑形——premise、rules、endingAnchor 仍全文（它们是实例化的故事事实，不能丢），`outline` 只发当前章与下一章两条（其余章节的意图已由 genreBeat 的逐章节拍覆盖）。这一步需要改 contextFor 的组装与对应测试，是接线时最值得单独验收的一项。
5. **失败与回退**：模板文件缺失/解析失败时静默降级为不注入（等同现状），不让知识库成为生成链路的单点故障。
6. **计量**：按 `docs/AI_CLOUD_DECISIONS.md` 的既定顺序，先补 usageMetadata 落账，再做固定中文种子 A/B（人物一致性、伏笔回收、选择后果、schema 成功率、实际 token），达标才在生产开启注入。当前代码没有保留 usageMetadata（见决策文档"实现缺口"），所以本测算只能是估算，无法先实测后上线——这是接线顺序里要最先补的一块。

## 3. 每步提示词变化（单本六章，估算）

| 请求 | 新增 | 减少（bible 压缩） | 净变化 |
| --- | --- | --- | --- |
| 第 1 章 | genreBrief +547~596 tokens | —（开局无 bible 可压） | +547~596 |
| 第 2–6 章（每章） | genreBeat +127~183 tokens | outline 6 条→2 条及生成更紧凑，约 −250~600 tokens | −67~−470 |
| 全书合计（输入侧） | +1,182~+1,511 | −1,250~−3,000 | **−1,800~+260** |

输出侧（估算，无实测）：骨架先行后，模型在 MEDIUM thinking 里用于"发明结构"的推理应减少，预期 output/reasoning −0%~−10%；失败重试若因一致性提升而减少，另有约 −0~−5% 的调用次数节省。recentChapter（≤6,000 字）与 summaries 的增长曲线不被知识库改变，这是本方案节省幅度的天然上限。

## 4. 成本测算（估算，非实测）

价格：gemini-3.8-flash 目录原价，输入 ¥235.792 / 1M tokens、输出（含 reasoning）¥1,178.962 / 1M tokens。基线取官方口径：单本六章 20,000 in + 18,000 out = **¥25.94**（付费档）；免费档 gemini-3.5-flash-lite 基线 **¥8.02**。

| 情景 | 假设 | 输入 tokens | 输出 tokens | 单本成本（付费档） | 对基线 |
| --- | --- | --- | --- | --- | --- |
| 基线（现状） | 官方预算口径 | 20,000 | 18,000 | ¥25.94 | — |
| 保守 | 只加注入、不做 bible 压缩、输出不变 | ~21,400 | 18,000 | ~¥26.3 | +1% |
| 预期 | bible 压缩 −2,000 输入；输出 −5% | ~19,400 | 17,100 | ~¥24.7 | −5% |
| 乐观 | bible 压缩 −3,000 输入；输出 −10%；重试减少约 0.3 次调用 | ~18,400 | 16,200 | ~¥22.4 | −14% |

结论区间：**单本六章约 ¥22.4–26.3（付费档），即 −14% ~ +1%**；免费档按相近比例约 **¥6.9–8.1**（基线 ¥8.02）。

要诚实说明的三点：

1. **模板本身不省钱，省的是 bible 的重复发送和模型的无效推理。**只注入不压缩，账单还会略涨（保守情景）。接线时 bible 压缩必须与注入同批上线。
2. **本方案的主收益是质量与稳定性**：节拍、钩子、雷区由模板兜底，减少写崩后整章重生成的浪费——那部分节省在"乐观"里也只敢估 0.3 次调用。
3. 以上全是**估算**：输入侧字数是按 1 token/字对 v1 资产实测的，输出与重试的变化没有实测数据支撑。上线前必须按第 2 节第 6 步，用固定种子 A/B + usageMetadata 落账验证，达不到预期情景就不开启，或只开启 bible 压缩。

## 5. 接线清单（v2 已实现前四项，A/B 待做）

- [x] 服务端加载 genres.json + 模板解析（含 engineGenres 兜底与静默降级）
- [x] 故事数据落 `genreTemplateId`（服务端随生成结果返回，客户端接受章节时写回；合流按 lead 侧）
- [x] contextFor 增加 genreBrief / genreBeat 与 bible 紧凑形，补单元测试（字段在场/缺失两路）
- [x] usageMetadata 落账（生成器透传 usage，`/api/generate` 输出结构化日志，只记数字与标识）
- [ ] 固定种子 A/B：质量四项 + 实际 token 对照本测算三情景，决定是否生产开启
