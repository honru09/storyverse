# Storyweave 可用 Gemini 模型与价格比较

> 核对日期：2026-10-22。范围仅限 Google Cloud Gemini Enterprise Agent Platform（原 Vertex AI）`GenerateContent`、Global、Standard PayGo、文本输入/文本输出。Storyweave 需要 system instruction、structured output 和文本输出，因此排除了 Live、TTS、图片生成、Cyber/allowlist 等特化模型。

## 结论

- **主模型：`gemini-3.8-flash`。** 它是最新 GA Flash，中文长篇、指令遵循、推理和成本最均衡，且至少支持到 2027-09-02。当前项目已在线验证成功，不建议仅为了省极少费用退回 3.7/3.6。
- **省钱模型：`gemini-3.5-flash-lite`。** 六章基准约 **$0.051 / ¥8.02**，比 3.8 Flash 的保守账单成本约低 69%；应先做中文文风、伏笔一致性和 JSON 成功率 A/B 测试。极致省钱可用 `gemini-3.1-flash-lite`（约 **$0.032 / ¥5.03**），但创作质量风险更高。
- **最高质量：`gemini-4-argon`。** 六章保守约 **$0.44 / ¥69.17**；对于普通六章互动小说明显过度，适合“高级生成”或只用于终章整合、全书润色，不适合全流程默认。
- **不建议：** 3.7/3.6 与 3.8 同价但更早退休；3.5 Flash 比 3.8 更贵；3.1 Pro 和 3 Flash 是 Preview；2.5 系列已在 2026-10-20 退休。

## Standard PayGo Global 单价

单位均为“每 100 万 token”。输出价格包含最终回复与 reasoning/thinking token；response schema 本身也计入输入 token。

| 模型 ID | 阶段 / 默认 thinking | 文本输入 USD | 缓存输入 USD | 文本输出+reasoning USD | Cloud Billing Catalog JPY：输入 / 缓存 / 输出 | 上下文 / 最大输出 | 退休日期 | Structured output |
|---|---|---:|---:|---:|---:|---|---|---|
| `gemini-4-argon` | GA / Medium | **$2 / $4** | **$0.10 / $0.20** | **$10 / $20** | **¥628.779 / ¥31.438 / ¥3,143.899**（账单原价） | 1,048,576 总输入+输出；单请求通常 65,536 | 2027-10-13 或以后 | 支持 |
| `gemini-3.8-flash` | GA / Medium | **$0.75 / $1.50** | **$0.075 / $0.15** | **$3.75 / $7.50** | **¥235.792 / ¥23.579 / ¥1,178.962**（账单原价） | 1,048,576 / 65,536 | 2027-09-02 或以后 | 支持 |
| `gemini-3.7-flash` | GA / Medium | **$0.75 / $1.50** | **$0.075 / $0.15** | **$3.75 / $7.50** | **¥235.792 / ¥23.579 / ¥1,178.962**（账单原价） | 1,048,576 / 65,536 | 2027-01-28 | 支持 |
| `gemini-3.6-flash` | GA / Medium | **$0.75 / $1.50** | **$0.075 / $0.15** | **$3.75 / $7.50** | **¥235.792 / ¥23.579 / ¥1,178.962**（账单原价） | 1,048,576 / 65,536 | 2026-11-19 | 支持 |
| `gemini-3.5-flash` | GA / Medium | $1.50 | $0.15 | $9.00 | ¥235.792 / ¥23.579 / ¥1,414.754 | 1,048,576 / 65,536 | 2027-05-19 或以后 | 支持 |
| `gemini-3.5-flash-lite` | GA / Minimal | $0.30 | $0.03 | $2.50 | ¥47.158 / ¥4.715 / ¥392.987 | 1,048,576 / 65,536 | 2027-07-21 或以后 | 支持 |
| `gemini-3.1-flash-lite` | GA / Minimal | $0.25 | $0.025 | $1.50 | ¥39.298 / ¥3.929 / ¥235.792 | 1,048,576 / 65,536 | 2027-05-07 或以后 | 支持 |
| `gemini-3.1-pro-preview` | Preview / High | $2.00（>200K 为 $4） | $0.20（>200K 为 $0.40） | $12.00（>200K 为 $18） | 目录未找到可无歧义对应的 JPY SKU；按同批 Catalog 汇率估算 ¥314.389 / ¥31.439 / ¥1,886.334 | 1,048,576 / 65,536 | 未公布；Preview 短期模型 | 支持 |
| `gemini-3-flash-preview` | Preview / High | $0.50 | $0.05 | $3.00 | ¥78.597 / ¥7.859 / ¥471.584 | 1,048,576 / 65,536 | 未公布；官方迁移指南推荐换 3.5 Flash | 支持 |

表中带两组美元价格的模型，格式为“官网当前促销有效价 / 标准账单原价”。Argon 的促销截止 2026-11-30；3.8/3.7/3.6 Flash 截止 2026-12-31。Cloud Billing Catalog 的 JPY SKU 显示的是**未返赠金的账单原价**，这也是预算应采用的安全数字。

## Storyweave 成本计算

计算口径：

- 已测首章：1,255 input + 1,864 output/reasoning token。
- 六章完整故事预算：20,000 input + 18,000 output/reasoning token。
- 仅模型推理费；不含 Cloud Run 固定实例、Firestore、网络等费用。
- JPY 直接使用本项目账单币种的 Cloud Billing Catalog SKU；3.1 Pro 除外，已明确标为估算。
- 没有假定缓存命中。当前单章前缀短，显式缓存未必值得；缓存也只降低输入费，不降低占大头的输出/reasoning 费。

| 模型 | 首章 USD | 六章 USD | 首章 JPY | 六章 JPY | 评价 |
|---|---:|---:|---:|---:|---|
| 4 Argon（账单原价） | $0.04230 | $0.4400 | ¥6.65 | ¥69.17 | 最高质量，默认使用不划算 |
| 4 Argon（若完整获得 50% 返赠金） | $0.02115 | $0.2200 | 约 ¥3.32 | 约 ¥34.58 | 不能作为普通 PayGo 的保证成本 |
| 3.8 / 3.7 / 3.6 Flash（账单原价） | $0.01586 | $0.1650 | ¥2.49 | ¥25.94 | 3.8 是三者中唯一合理选择 |
| 3.8 / 3.7 / 3.6 Flash（若完整获得 50% 返赠金） | $0.00793 | $0.0825 | 约 ¥1.25 | 约 ¥12.97 | 不能作为普通 PayGo 的保证成本 |
| 3.5 Flash | $0.01866 | $0.1920 | ¥2.93 | ¥30.18 | 比 3.8 贵，缺乏迁移理由 |
| 3.5 Flash-Lite | $0.00504 | $0.0510 | ¥0.79 | ¥8.02 | 推荐省钱档 |
| 3.1 Flash-Lite | $0.00311 | $0.0320 | ¥0.49 | ¥5.03 | 最便宜，需重点验收文风和一致性 |
| 3.1 Pro Preview | $0.02488 | $0.2560 | 约 ¥3.91 | 约 ¥40.24 | 已被 Argon 取代，不建议新接入 |
| 3 Flash Preview | $0.00622 | $0.0640 | ¥0.98 | ¥10.06 | Preview 且默认 High，不建议生产 |

## 50% 优惠到底适不适用于当前项目

官方价格页把 Argon 和 3.8/3.7/3.6 的较低数字称为 promotional/introductory pricing，并注明通过“50% credits back on net spend”实现；同页的优惠细则标题和正文明确写的是 **Provisioned Throughput Usage**，即按照“净符合条件的预配吞吐量支出”计算月度返赠金，次月 7 日发放，30 天过期，可抵扣部分 On-Demand 与 Provisioned Throughput SKU。

Storyweave 现在是 **Standard PayGo，没有购买 Provisioned Throughput**。因此：

- 不要把普通 PayGo、免费试用赠金覆盖的消耗自动当成还能再返 50%。
- 预算、限额和风控使用 Catalog 的 JPY 原价；只有 Cloud Billing 实际出现对应活动赠金后，再把它记作事后优惠。
- 即使获得返赠金，它也不是现金退款，不能按可提现余额理解。

## 推荐落地方式

1. 默认继续 `gemini-3.8-flash`，显式设置 `thinking_level: "MEDIUM"`；若实际章节 reasoning token 偏高，可 A/B 测试 `LOW`。
2. 增加低价档 `gemini-3.5-flash-lite`，固定同一批中文故事种子评估：人物一致性、伏笔回收、选项有效性、JSON schema 成功率和实际 token。
3. 4 Argon 只用于高级功能，例如“六章完成后的全书一致性检查/重写”，不要每章都调用。
4. 不接入即将退休的 3.6、3.7，也不再使用已退休的 2.5 系列。
5. 模型切换时移除不兼容/已弃用的 `candidateCount`、`temperature`、`topP`、`topK` 等参数，仅保留 schema、system instruction、`maxOutputTokens` 与 `thinking_level`；Argon 还要求近期 Google Gen AI SDK。

## 已排除模型

- `gemini-2.5-pro`、`gemini-2.5-flash`、`gemini-2.5-flash-lite`：生命周期表显示均于 **2026-10-20** 退休，价格页仍留有历史价不代表端点仍可用。
- Gemini 4 Argon Cyber Permissive、Gemini 3.8 Flash Cyber：安全特化/allowlist，不适合小说。
- Live、TTS、Nano Banana / Image、Omni、embedding：输出模态或调用方式不匹配当前 Storyweave 文本生成链路。

## 官方来源与 Catalog SKU

- [Google Cloud Agent Platform 定价](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing)
- [Google 模型版本与生命周期](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions)
- [Structured output 支持模型](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output)
- [Thinking level 支持与默认值](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking)
- [Gemini 4 Argon 开发指南](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-4-argon)
- [Gemini 3.8 Flash 模型页](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash)
- [Gemini 3.7 Flash 模型页](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-7-flash)
- [Gemini 3.6 Flash 模型页](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-6-flash)
- [Gemini 3.5 Flash 模型页](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash)
- [Gemini 3.5 Flash-Lite 模型页](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite)
- [Gemini 3.1 Flash-Lite 模型页](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite)
- Cloud Billing Catalog API，Vertex AI 服务 `services/C7E2-9256-1C43`，`currencyCode=JPY`。核心在线文本 SKU：Argon `3BAE-62B7-C9B9` / `3B3E-7322-E883` / `1E84-F91D-8B95`；3.8 Flash `2A35-AC68-14D6` / `8658-6939-8BEC` / `90FD-DC5F-DC55`；3.5 Flash-Lite `255D-4FF7-8DB3` / `D1E7-04AD-E5B2` / `EF3E-6ED9-3CD1`；3.1 Flash-Lite `7DDF-162F-B3F3` / `A0D7-CE97-949A` / `DA75-5E07-40DC`。
