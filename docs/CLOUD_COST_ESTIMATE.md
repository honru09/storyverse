# Storyweave 云成本估算

估算日期：2026-10-22。主表使用美元（USD），同时补充当前账单币种日元（JPY）的官方 Catalog 价格，均未含税。

## 结论先行

当前线上配置是 `gemini-3.8-flash`、Vertex AI `global` 端点、Cloud Run 东京区 `asia-northeast1`、1 vCPU / 512 MiB、请求计费、最小实例 1、最大实例 1。

- 一名用户不重试地完成一部六章 AI 故事，会调用模型 **6 次**。
- 项目真实首章的 Cloud Monitoring 数据是 **1,255 input + 1,864 output tokens**，按促销有效价约 **¥1.25 / 首章**。后续章节会携带更长的故事上下文，不能简单视为固定 ¥1.25。
- 按当前代码的章节长度、每次 `maxOutputTokens=6144`，以及 Gemini 3.8 Flash 默认的 `MEDIUM` thinking：若账号最终获得 50% 促销返还，单次完整流程约 **$0.05–$0.16（约 ¥7.9–¥25.2）**；若没有返还，则约 **$0.10–$0.32（约 ¥16–¥51）**。免费试用赠金可以支付用量，但官方没有保证被试用赠金覆盖的用量还能再次产生返还，因此试用期应按后一档做预算。
- 极端情况下，6 次调用单是输出和 reasoning 的硬上限就是 `6 × 6,144 = 36,864` tokens，即当前促销有效价下 **$0.13824**；再加输入、Cloud Run 活跃时间和重试。为了留有余量，商业侧可先按 **$0.20/完整流程** 做限额。
- 2027-01-01 起公开标价翻倍，因此相同流程建议预留 **$0.10–$0.32**，或按 **$0.40/完整流程** 做保守限额。
- 最小实例 1 是固定底费：完全空闲的 30 天毛成本约 **$9.72 / ¥1,528 每月**；若该账单账户的 Cloud Run 免费额度没有被别的项目消耗，按官方“spending-based discount”折算后约 **$4.50 / ¥707 每月**。按平均 730 小时月计算，对应约 $9.86 / ¥1,549 毛成本。
- Firestore 在当前小规模下大概率为 **$0**：默认数据库每天有 50,000 次读、20,000 次写、20,000 次删，另有 1 GiB 存储及每月 10 GiB 出站免费额度。

## 1. Gemini 3.8 Flash 定价与实际 SKU

`gemini-3.8-flash` 是公开、GA 的模型 ID，不是内部别名。Google 的模型页列明它支持 `GenerateContent`、thinking、结构化输出和上下文缓存；上下文窗口为 1,048,576，最大输出为 65,536。[Gemini 3.8 Flash 模型页](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash)

当前服务把 `GOOGLE_CLOUD_LOCATION` 设为 `global`，用 Standard PayGo，适用如下公开价格：[Google 模型定价](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing)

| 计费项 | 至 2026-12-31 的有效价 | 2027-01-01 起 | 当前对应 Vertex AI SKU |
|---|---:|---:|---|
| 输入（文本/图片/音频/视频） | $0.75 / 1M tokens | $1.50 / 1M tokens | Global Text Input – Predictions `2A35-AC68-14D6` |
| 缓存命中的输入 | $0.075 / 1M tokens | $0.15 / 1M tokens | Global Text Input Caching `8658-6939-8BEC` |
| 文本输出 + reasoning | $3.75 / 1M tokens | $7.50 / 1M tokens | Global Text Output – Predictions `90FD-DC5F-DC55` |
| 显式缓存存储 | $0.000001 / token-hour | 页面目前未列独立的 2027 调价 | Text Input Caching Storage `1173-9AA0-B77D` |

这些 SKU 名称和 ID 可在 Google Cloud 官方 [Gemini 3.8 Flash SKU 组](https://cloud.google.com/skus/sku-groups/gen-ai-gemini-3-8-flash) 中核对。也就是说，实际调用会落到 Vertex AI 的 Gemini 3.8 Flash global 输入、输出及缓存 SKU，并没有指向另一个旧模型。

促销价需要特别解释：Google 将 3.8 Flash 的 $0.75 / $3.75 展示为截至 2026-12-31 的价格，但脚注说明它通过 **50% credits back on net spend** 实现，而不是调用时直接把 SKU 单价减半。页面明确展开的返赠金计划针对符合条件的预配吞吐量支出；赠金在次月 7 日发放、30 天后到期，可抵扣指定的按需或预配吞吐量 SKU。当前 Storyweave 使用 Standard PayGo，且账单由免费试用赠金覆盖，官方公开文字不足以保证这部分用量还能再次产生返还。因此 Billing 报表应以 $1.50 / $7.50 原价观察，收到活动赠金后才把有效成本按半价回算。[促销信用额规则](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing#promotional-credits)

通过官方 [Cloud Billing Catalog API](https://docs.cloud.google.com/billing/v1/how-tos/catalog-api) 以 `currencyCode=JPY` 查询同一批 SKU，当前公开日元原价为：global standard text input **¥235.792 / 1M tokens**、output + reasoning **¥1,178.962 / 1M tokens**。按上述 50% credits back 计算，至 2026-12-31 的有效成本约为 **¥117.896 / 1M input tokens**、**¥589.481 / 1M output tokens**。Catalog API 返回公开 SKU 的说明、区域、计价单位和公开价格；实际账单如有合同价，应以账号专属 Pricing API / invoice 为准。

## 2. Thinking 和缓存如何计费

当前代码没有显式设置 `thinking_level`，而 Gemini 3.8 Flash 的默认值是 `MEDIUM`；允许值为 `LOW`、`MEDIUM`、`HIGH`，不支持 `MINIMAL`。[3.8 Flash 开发者指南](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-flash)

Thinking token 不免费。Google 明确说明 reasoning 过程中生成的 token 会计费；定价表也把它归在 “Text output (response and reasoning)” 中。因此上表的 $3.75 / 1M 是可见正文和不可见 reasoning 的合计输出费率。[Thinking 计费说明](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking#pricing)

当前 Storyweave **没有创建 Vertex AI 显式 context cache**，所以不会产生显式缓存存储费。服务端只有 15 分钟进程内结果缓存：同一实例内完全相同的章节请求会直接复用结果，不再发出模型请求；实例重启或新修订后该缓存会消失。模型自身支持隐式缓存，若 Google 判定命中，命中的输入 token 按缓存输入价计费，但不应把未保证的命中计入预算。

如以后增加显式缓存，除每次命中按 $0.075 / 1M cached input tokens 计费外，3.8 Flash 的存储价格为 $0.000001 / token-hour。例如缓存 100,000 tokens 一小时约 $0.10。[显式 Context Cache 存储价](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing#context-cache-storage)

## 3. 一整套六章流程的模型费用

代码中一部故事固定六章，每章一次 `GenerateContent`；不重试就是 6 次。每次上限是 6,144 output tokens，因此：

```text
总模型费 = 输入 tokens / 1,000,000 × 输入价
         +（可见输出 tokens + thinking tokens）/ 1,000,000 × 输出价
```

可用于运营预算的三个档位：

| 六章合计用量假设 | 至 2026-12-31 | 2027-01-01 起 |
|---|---:|---:|
| 12k 输入 + 12k 输出/reasoning | $0.054 | $0.108 |
| 20k 输入 + 18k 输出/reasoning | $0.0825 | $0.165 |
| 30k 输入 + 36,864 输出/reasoning（输出到代码上限） | $0.16074 | $0.32148 |

### 当前项目的真实首章样本

项目的 Vertex AI Cloud Monitoring 指标 `aiplatform.googleapis.com/publisher/online_serving/token_count` 显示，已完成的真实首章调用消耗：

- input：1,255 tokens；
- output：1,864 tokens；
- 原价用量约 **¥2.49**；
- 只有账号最终收到 50% 活动赠金时，有效成本才约为 `1,255 × ¥117.896 / 1M + 1,864 × ¥589.481 / 1M = ¥1.24675`，即 **¥1.25**。

这个指标是 Google 官方定义的 PublisherModel 累计输入/输出 token 计数，可按 `type=input/output`、`source=global`、`shared_request_type=standard` 等标签分解。[Cloud Monitoring 的 Vertex AI token 指标定义](https://docs.cloud.google.com/monitoring/api/metrics_gcp_a_b)

如果后五章与首章完全相同，活动返还后的六章约 ¥7.48；但实际后续请求会带入世界设定、前文摘要和最近一章正文，input 通常增长，且 `MEDIUM` thinking 的 output/reasoning 也会波动。因此，收到活动赠金后可使用 **¥8–¥25 / 完整流程** 的有效成本区间；在免费试用阶段、活动资格尚未由账单确认前，应使用 **¥16–¥51**，并按约 **¥60 / 完整流程** 设置限额。

上述范围不含失败后重新生成。每重试一章都可能再产生一整次输入和输出费用；即使客户端最终没有接受该章，只要模型已处理请求，仍可能计费。

目前服务没有保存 SDK 返回的 `usageMetadata`，所以无法从应用日志还原精确单用户成本。若需要把估算变成可审计数字，应在服务端记录以下**数字字段**（不要记录用户正文）：`promptTokenCount`、`candidatesTokenCount`、`thoughtsTokenCount`、`cachedContentTokenCount`、`totalTokenCount`，再按 request/story ID 聚合。最终以 Cloud Billing export 中上述三个 SKU 的费用为准。

## 4. Cloud Run 固定与增量费用

东京 `asia-northeast1` 属于 Cloud Run Tier 1。请求计费下，最小实例空闲费率为 CPU $0.0000025 / vCPU-second、内存 $0.0000025 / GiB-second；处理请求时 CPU 为 $0.000024 / vCPU-second、内存仍为 $0.0000025 / GiB-second，每 1M 请求 $0.40。[Cloud Run 价格表](https://cloud.google.com/run/pricing)

同一 SKU 通过官方 Catalog API 查询到的当前日元价为：idle CPU **¥0.000392987 / vCPU-second**、idle memory **¥0.000392987 / GiB-second**、active CPU **¥0.003772679 / vCPU-second**、active memory **¥0.000392987 / GiB-second**。[Cloud Billing Catalog API 说明](https://docs.cloud.google.com/billing/v1/how-tos/catalog-api)

一个 1 vCPU / 0.5 GiB 的实例空闲 30 天：

```text
CPU:    2,592,000 秒 × 1 × $0.0000025     = $6.48
内存:   2,592,000 秒 × 0.5 × $0.0000025   = $3.24
毛合计:                                         $9.72/月
```

用日元 Catalog 价直接计算，同一个 30 天月为：

```text
CPU:    2,592,000 秒 × 1 × ¥0.000392987     = ¥1,018.62
内存:   2,592,000 秒 × 0.5 × ¥0.000392987   =   ¥509.31
毛合计:                                          ¥1,527.93/月
```

请求计费免费额度每月相当于 180,000 vCPU-seconds、360,000 GiB-seconds 和 200 万请求，并按 Tier 1 active 价格作为 spending-based discount；换算为最高约 $5.22、按当前 JPY Catalog 约 **¥820.56** 的 CPU + RAM 抵扣。因此账单账户没有其他 Cloud Run 消耗时，30 天月的空闲净成本约 $4.50 / **¥707.38**。免费额度是按**整个账单账户跨项目合并**计算，不能保证全部留给 Storyweave。[Cloud Run 免费额度规则](https://cloud.google.com/run/pricing#pricing_tables)

用户生成时，实例从 idle 切到 active。相对于已经支付的 idle CPU，每个活跃秒多约 `$0.000024 - $0.0000025 = $0.0000215`，日元 Catalog 价差为 `¥0.003772679 - ¥0.000392987 = ¥0.003379692`；若六章各占用 20–60 秒，Cloud Run 增量约 $0.0026–$0.0077，即约 **¥0.41–¥1.22**，另加极少的请求费。实际通常仍会被免费额度覆盖，单流程成本主要来自 Vertex AI。

## 5. Firestore

Firestore Standard 的默认数据库每项目可享受一份免费额度：[Firestore 定价](https://cloud.google.com/firestore/pricing)

- 存储 1 GiB；
- 每天 50,000 document reads；
- 每天 20,000 document writes；
- 每天 20,000 document deletes；
- 每月 10 GiB outbound data transfer。

东京单区超过免费额度后的标准价为：读 $0.03 / 100,000、写 $0.09 / 100,000、删 $0.01 / 100,000；存储约 $0.000205479 / GiB-hour（约 $0.15 / GiB-month）。同区 Google Cloud 数据传输免费。PITR、备份、恢复、克隆和 TTL 删除不在免费额度内。

如果只是每章保存一次进度，一名用户完成六章的数据库操作量远低于每日免费额度。当前线上应用仍以浏览器本地存储为主；创建 Firestore 数据库本身不会产生固定月费，只有发生读取、写入、存储或网络用量才计费。

## 6. 建议的用户额度

在拿到真实 `usageMetadata` 前，建议：

- 当前促销期：只有 Billing 报表确认获得活动赠金后，才按 **$0.20/故事**；免费试用赠金覆盖期间先按 **$0.40（约 ¥60）/故事**；
- 2027 年起：先按 **$0.40/故事**，收集 100–500 个真实样本后再调整；
- 服务端必须按登录用户做每日/每月配额，不能只依赖当前的全实例每分钟限流；
- 失败重试也计入用户 token 预算，但格式错误等服务端故障可单独补回额度；
- 在 Billing 中为 Vertex AI、Cloud Run 分别设置预算告警，并用 SKU ID 核对实际扣费。
