# 故事工坊知识库（knowledge/）

版本 v2 · 2026-10-26。v2 是融合修订：把 [research/](research/README.md) 对 80 本代表作的结构分析结论并入 8 个模板（科幻改星际/末世口径、各模板补可枚举标尺、第六章代价结算、四/五章升格点、古言制度清单、现言现实账清单、知乎大反转位），并完成服务端接线（加载、注入、worldBible 紧凑化、usageMetadata 计量，方案见 [TOKEN-PLAN.md](TOKEN-PLAN.md) 第 2 节）。本目录是给服务端生成管线用的**紧凑知识资产**：把网文题材的通用工艺（结构、原型、节拍、爽点、雷区）沉淀成结构化模板，生成时按章切片注入几百 token，让模型在既定骨架上填血肉，而不是每本书、每一章都从零发明世界观。

设计目标，按优先级：

1. **稳质量**：题材的及格线由模板兜底（冲突引擎不散、章末有钩、雷区有人守）。
2. **省 token**：模板替代的是模型在 thinking 里反复发明结构、以及 worldBible 在每章请求里整段重发的成本。测算见 [TOKEN-PLAN.md](TOKEN-PLAN.md)。
3. **可替换**：资产是纯 JSON + 文档，服务端只读不写；模板缺失或解析失败时静默降级为不注入，生成行为与没有知识库时完全一致（另有环境开关 `STORYWEAVE_GENRE_TEMPLATES=off` 可整体关闭，供 A/B 对照）。

内容纪律：全部为**题材层面的通用工艺提炼**，不对应任何具体作品的人物、情节、专有名词或句子。模板写的是"这一类故事通常怎么成立"，不是"某一本书怎么写的"。

## 资产类型

| 类型 | 存放 | 说明 |
| --- | --- | --- |
| 题材模板 genre | `genres.json` 的每个条目 | 一类题材的完整工艺包，是 v1 的主资产 |
| 人物原型卡 archetype | genre 条目内的 `archetypes` | 名位 + 欲望 + 缺陷 + 说话倾向；是"位置"不是具体人物 |
| 情节节拍表 beats | genre 条目内的 `beats` | 六章逐章一行：本章节拍 + 章末钩子类型，与引擎六章结构对齐 |
| 开篇钩子 hooks | genre 条目内的 `hooks` | 3 种开篇定格方式，第 1 章注入时供模型择一 |
| 爽点清单 pleasures | genre 条目内 | 5 条该题材的兑现型快感，续章轮换注入作参考 |
| 雷区 pitfalls | genre 条目内 | 3 条该题材最容易写崩的点，续章轮换注入作守则 |

后续版本可把 archetype / beats / hooks 拆成独立文件做跨题材复用（例如悬疑的知情人原型卡可借给都市题材）；v1 先内嵌，保证一个文件自包含、好审阅。

## genres.json 字段 schema

```jsonc
{
  "id": "romance-ancient",          // 稳定标识，接线后存进故事数据，勿改名
  "name": "言情·古言",
  "engineGenres": ["cultivation"], // 可选：与 src/story-engine.js GENRES 的近似对应，无对应留空数组
  "readerPromise": "一句话读者承诺：读者点开这类书是为了得到什么",
  "worldSkeleton": ["世界观规则要点，每条一句、可检验（v2 起 5–7 条，含一条可枚举成长标尺）"],
  "conflictEngine": {
    "want": "主角想要什么（具体到可判定得没得到）",
    "obstacle": "什么在挡（结构性的，不是某个坏人）",
    "cost": "往前走要付什么代价"
  },
  "archetypes": [                    // 恰好 3 张
    { "role": "名位，如 主角·谨慎型草根修士", "desire": "欲望", "flaw": "缺陷", "voice": "说话倾向" }
  ],
  "beats": [                         // 恰好 6 条，chapter 1–6
    { "chapter": 1, "beat": "本章必须完成的叙事动作", "hook": "章末钩子类型 + 一句说明" }
  ],
  "hooks": ["3 种开篇钩子，各一句"],
  "pleasures": ["爽点 5 条，每条写清兑现方式而非口号"],
  "pitfalls": ["雷区 3 条，每条是具体的崩法"]
}
```

六章节拍与现有引擎的硬约定对齐（见 `src/story-engine.js` 的 `storyBeatPlan` / `choiceAt` 与 `server/gemini.js` 的 SYSTEM_PROMPT）：

- 第 2、4 章正文必须停在读者选择**之前**，所以这两章的 hook 统一为"选择前夜"型；
- 第 3、5 章开头必须兑现上一次选择的后果，beat 以"兑现选择后果"起笔；
- 第 6 章收束本卷核心冲突并回应 `worldBible.endingAnchor`。

## 注入时机与切片（token 预算）

计数口径：中文按约 1 token/字保守估算（与仓库成本文档的实测口径相容）。下表字数是按切片规则对 v2 全部 8 个模板逐个实测的范围（用服务端 `buildGenreBrief` / `buildGenreBeat` 同一实现测得），不是目标值凑数。

### 开局（第 1 章请求）：预算 ≤600 token，实测 547–596 字

注入字段拼成一个 `genreBrief` 文本块：

```
readerPromise（全文）
+ worldSkeleton（全部条目）
+ conflictEngine（三项）
+ archetypes（仅 role + desire，缺陷与说话倾向留给续章）
+ beats（六章 beat 全文——它同时是 worldBible.outline 的生成依据）
```

不注入：hooks 里只取与所选开篇最贴合的 1 条并入第 1 章 beat 的执行提示（或整组 3 条让模型择一，约 +60 字，仍在预算内）；pleasures / pitfalls 开局不发。

### 续章（第 2–6 章请求）：预算 ≤200 token，实测 127–183 字

每章只发与本章有关的一小片，拼成 `genreBeat` 文本块：

```
本章 beats[i].beat + beats[i].hook
+ 一张原型卡（按章轮换 archetypes[(i-1) % 3]）的 flaw + voice
+ 一条雷区守则（按章轮换 pitfalls[(i-1) % 3]）
+ 一条爽点参考（按章轮换 pleasures[i % 5]，可选）
```

原型卡的 desire 在开局已发，续章不重发；缺陷和说话倾向分散到各章，正好是当章写对白与冲突时要用的部分。

### 合流（merged）故事

两位主角各属一个题材时：开局注入以主导题材（merge.lead 对应一侧）模板为主，另一侧只注入其 archetypes 的 role+desire（约 +120 字，开局预算放宽到 ≤720）；续章仍按主导题材切片。第 3、5 章的"兑现合流选择后果"由现有 beatPlan 负责，模板不重复。

## 与 worldBible 的关系

- **模板是先验，worldBible 是实例。** 模板给的是题材的默认骨架；每本书的 worldBible（premise / rules / endingAnchor / outline）仍由模型在开局时结合用户 config（主角、性格、出身、能力、语气）实例化生成，schema 与校验不变（`server/gemini.js` 的 `responseSchema` / `validateOutput`）。
- 对应关系：`worldSkeleton` → rules 的来源与下限（实例 rules 应是骨架在本故事里的具体化，不少于骨架条数）；`beats` → outline 的对位表（outline 第 i 条应能看出 beats[i] 的影子，但写的是本故事的具体事件）；`conflictEngine` → premise 与 endingAnchor 的内核（premise 交代 want 与 obstacle，endingAnchor 回应 cost 的最终结算）。
- 开局之后，模板的使命基本完成：续章靠 worldBible + summaries + beatPlan 推进，模板只以 ≤200 字的切片提醒"这是什么题材、第几章该干什么"。这也是它省 token 的方式——不是每章重发整套世界观，而是让 worldBible 一次生成到位、之后长得紧凑（见 TOKEN-PLAN 的 bible 压缩项）。
- 故事数据上落一个 `genreTemplateId` 字段记录用了哪个模板（v2 已实现：服务端解析后随生成结果返回，客户端接受章节时写回故事并持久化）；字段不存在时按 `config.genreId` 经 `engineGenres` 映射兜底，再不行就不注入（回到现状，不报错）。

## 版本与维护

- 模板改动走 git：改 beats/雷区这类措辞属于内容修订；改 schema 属于结构修订，必须同步改本 README 与接线代码。
- 新增题材的门槛：能写满 schema 全部字段且每条都"可检验"（能据此判断一章写没写对），写不满说明提炼还没到位，不要先上架占位。
- 质量验证方式（接线后）：固定一组中文故事种子，同题材各生成一本六章，对照模板逐章核对节拍命中、钩子类型、雷区是否触犯；与无模板基线比人物一致性、伏笔回收与实际 token（仓库 `docs/AI_CLOUD_DECISIONS.md` 的切换前检查口径）。
