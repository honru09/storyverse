# COPY-SCRUB（REQ-52）处置笔记

用户 2026-10-30 23:44 亲令：整个平台用户可见处不许出现 Gemini / AI / 模型之类的名字和说法，用户不需要知道背后用什么；一切对外说法用平台自己的语言。本批只改字符串，不改结构与逻辑。基线 main 1001e79，分支 copy-scrub，本地提交、不 push 不部署。

## 禁词表（用户可见面）

Gemini、Vertex、GPT、Claude、LLM、大模型、模型（指技术模型时）、AI（独立词及「AI 生成/AI 续写」类说法）、提示词 / prompt、token / Token（用户可见的计费与额度说法）。

## 命中与改写对照（共 15 处用户可见文案）

### src/main.jsx（7 处）
| # | 位置 | 旧 | 新 |
|---|------|----|----|
| 1 | 造世「故事方式」按钮 | Gemini 创作 | 在线塑造 |
| 2 | 同上说明 | 设定与剧情会发送给 Gemini。请使用昵称或虚构资料；每次续写会使用服务端额度。 | 设定与剧情会用于在线塑造。请使用昵称或虚构资料；每次续写会使用服务端额度。 |
| 3 | 同上未连接回落 | 预设剧情体验 · Gemini 尚未连接 | 预设剧情体验 · 在线塑造暂不可用 |
| 4 | 「自己写一本」入口小字 | 不用 AI——书名、简介和每一章都由你亲手写… | 纯手写——书名、简介和每一章都由你亲手写… |
| 5 | 带入人生经历提示 | 选择 Gemini 时，设定会发送给模型服务。 | 在线塑造时，设定会发送到织界处理。 |
| 6 | 帮助 FAQ「织界是什么」 | 织界是和 AI 一起写的互动小说：… | 织界是一部由你亲手塑造走向的互动小说：… |
| 7 | 帮助 FAQ「额度怎么算」 | 生成按 token 计量…当天的新生成会暂停…读已经生成的章节… | 塑造按量计量…当天的新塑造会暂停…读已经写好的章节… |

### src/components/AccountPanel.jsx（1 处）
| # | 位置 | 旧 | 新 |
|---|------|----|----|
| 8 | 账号页「我的消耗」总计标签 | 累计总 token | 累计总消耗 |

### server/gemini.js（7 处，经 server/index.js 的错误处理原样返回前端，属用户可见）
| # | 场景 | 旧 | 新 |
|---|------|----|----|
| 9 | 上游 429（Vertex 路径） | Gemini 当前请求较多或额度不足，请稍后重试。 | 世界线正忙，请稍后重试。 |
| 10 | 上游 4xx（Vertex 路径） | Vertex AI 暂时不可用，请检查项目、模型与服务账号权限。 | 塑造服务暂时不可用，请稍后再试。 |
| 11 | 上游 429（直连路径） | Gemini 当前请求较多或额度不足，请稍后重试。 | 世界线正忙，请稍后重试。 |
| 12 | 上游 4xx（直连路径） | Gemini 暂时不可用，请检查服务端模型与密钥配置。 | 塑造服务暂时不可用，请稍后再试。 |
| 13 | 上游无响应 | Gemini 暂时没有响应，请稍后重试。 | 世界线暂时没有回应，请稍后重试。 |
| 14 | 连接失败 | 连接 Gemini 失败，请检查网络后重试。 | 暂时连不上世界线，请检查网络后重试。 |
| 15 | 服务未配置 | 尚未连接 Gemini，请先在服务端配置密钥。 | 塑造服务尚未就绪，请稍后再试。 |

附带同步：e2e/control.cjs、e2e/gemini.cjs、e2e/import.cjs 中按按钮名定位的 'Gemini 创作' 改为 '在线塑造'（测试脚本随文案走，非文案本身）。

其余服务（avatar / cover / plaza / social / auth / billing 等）的报错与通知文案经全量扫描本就无禁词（如「立绘生成请求较多，请稍后再试」已是平台口径），未动。index.html 的 meta/og、manifest、sw.js、分享文案模板、邮件相关文案均无命中。

## 白名单（纯内部，不动）

- 持久化数据与内部标识：故事的 `engine: 'gemini'` 枚举、`provider` 字段、模型 ID（gemini-2.5-flash-image 等）与 server/billing.js 价格表——是数据与配置，不是文案；改名属结构迁移，不在本批。
- 发给模型的提示词正文：server/gemini.js 的 SYSTEM_PROMPT、文笔总则、server/avatar.js / cover.js 的图像提示词拼装、注入防护正则（gemini.js 278–281 行的清洗规则）。
- src/plaza.js 的 WORLD_INTRO_ENGINE_TERMS：这是「要从发布版世界设定里剔除的引擎术语」过滤清单，'提示词' 是被剔除对象、永不展示——守卫里显式白名单此行。
- 代码注释、内部日志（stderr 的 generation-upstream-error 等）、会话/访问 token 的鉴权管线（auth、email-code、usage 的 prompt/total 字段名）。
- docs/、knowledge/、仓库内 *.md：内部文档与生成侧文风素材，不经任何用户界面展示。
- public/design-catalog.html：内部图鉴页，其中的 token 指 CSS 设计变量（主题 token），与计费口径无关，不在禁词范围，守卫不扫此页。

## 防回潮守卫（tests/copy-scrub.test.js）

- 扫描范围：src/**（.js/.jsx，行级剥注释——纯 // 行与 /* */ 块行跳过，字符串与 JSX 文本全扫）、index.html、public/sw.js、public/manifest.webmanifest、server/**（gemini.js 只扫 ApiError/retryableError 报错行，其余服务模块扫全部非注释行）。
- 匹配口径：供应商名用专名大小写 + 标识符边界（小写技术标识如 engine id 'gemini'、模型 ID 天然不命中）；AI 用独立词边界；大模型/提示词/模型直查；token/prompt 只在与中文相邻（计费/技术口径的文案形态）时命中，`usage.prompt`、`getAccessToken()` 等代码标识不误报。
- 自带正反对照用例：8 条旧文案样本必须被拦下、7 条内部样本必须放行，守卫自身失效会先红。
- 白名单显式列在测试文件内（当前仅 WORLD_INTRO_ENGINE_TERMS 一条），新增白名单必须写明理由。

## 复扫与验收

- 守卫全量复扫：**零命中**（tests/copy-scrub.test.js 3/3 通过）。
- 全量测试：914 条、908 过。失败 6 条 = dedup 样本图 ENOENT ×5（基线既有环境失败）+ forge-trim「anchor and cards」×1（全量并行时出现；隔离跑该文件在本分支与基线 1001e79 均 11/11 通过，属既有 flake 家族，非本批引入）。
- build 通过（dist/assets/index-C9AoRYKy.js）。对构建产物抽查方法：按词逐个 grep 产物 JS/CSS/HTML 并看上下文——Gemini / Vertex / 大模型 / 模型 / 模型服务 / 累计总 token / AI 一起写 / Claude 均为 0；'提示词' 仅 1 处即白名单的 WORLD_INTRO_ENGINE_TERMS 过滤清单；裸子串 'LLM' 的 2 处命中在 firebase-sdk 厂商 chunk 内，是 ENROLLMENT 等错误码字符串的子串误报，非文案；新文案「累计总消耗」「在线塑造」已在产物中确认存在。
