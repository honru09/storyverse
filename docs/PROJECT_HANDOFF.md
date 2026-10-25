# Storyweave 项目交接记录

更新：2026-10-22（Asia/Tokyo）

路径：`D:\Projects\Novel`

仓库：https://github.com/honru09/storyverse.git

## 下一位 agent 先做什么

**0.3阅读升级为最新候选。** 先读 [阅读升级验收](READER_UPGRADE_VERIFICATION.md) 与 [发布审计](READER_RELEASE_AUDIT.md)：完整设置、段落定位、位置书签/查找、专注/逐屏、常亮均已实现。208单元测试、原52浏览器检查、新21 Chromium及21 WebKit检查通过；87状态截图已生成。生产仍是storyweave-00002-cz4（本轮只读核验），尚未发布本候选。已询问用户“关闭公网付费生成先上阅读版”或“完成Auth/额度再上”，等明确答复；不要将默认预选视为同意。

本轮安全开关 `GENERATION_ENABLED=false` 会在付费调用前503，状态返回generation-disabled；缺省/true保留历史行为，**不是身份或累计预算控制**。线上Firebase配置查询为CONFIGURATION_NOT_FOUND。临时安全测试服务session32136：127.0.0.1:18877，Auth与生成关闭；原5173预览仍可用。两份成本文档未改。下方上一轮说明作为背景，遇到冲突以本段链接为准。

**最新用户要求覆盖旧视觉：年轻、轻快、全站 Apple iOS 毛玻璃。** 保留现有故事流程，代码优先，无效果图审批。本轮增加真实可配置 Google＋邮箱身份、游客继续、草稿恢复入口与本机阅读偏好；没有配置远端 Firebase，没有真实账号验收，也没有更改 Gemini 权益或生成接口的鉴权。详情见 [本轮升级验收](IOS_UPGRADE_VERIFICATION.md) 和 [账号接入](AUTH_SETUP.md)。不要重新询问已选方向或重新接一套 Gemini。

先读 [PRODUCT.md](../PRODUCT.md)、[DESIGN.md](../DESIGN.md)、[页面构成](UI_SURFACE_BRIEF.md) 与 [本轮验收](IOS_UPGRADE_VERIFICATION.md)。用户指定 emilkowalski/skills 为 UI 与动效主规范，Apple Design 主导材质/层级；按 [skills 使用记录](SKILLS_USED.md) 与 [来源](SKILL_SOURCES.md) 找到实际指令并读取。最新冷白/蓝色/系统字体已经替代朱红墨蓝粗轮廓。

插画原稿在 `assets/art-source/`；运行时只用 `public/art/` 的双尺寸 WebP。精确提示词、哈希、出处见 [ART_PROVENANCE.md](ART_PROVENANCE.md) 与 manifest。旧自托管宋体资产保留来源/OFL，现界面使用系统字体，不再加载该旧标题字。

## 当前事实

- 云端、AI分流、订阅额度或成本设计先读 [AI_CLOUD_DECISIONS.md](AI_CLOUD_DECISIONS.md)。这是来源任务2026-10-22同步的最新正式基线；成本原始资料保持原文，本次没有重复部署。
- 0.2 是本地优先内测客户端，保留本地六章预设体验，已加入可选 Gemini 服务端与前端异步生成。
- 来源任务已确认Cloud Run东京区公开部署（min=1/max=1）及真实首章用量；本任务自己的UI验证未调用收费模型。单次样本不代表完整故事质量和成本已验收。生产使用服务身份，无生产API Key不等于未接通模型。
- 分享是本机只读副本；合流是两本本地书生成独立第三本书。Firebase身份接入默认关闭且尚未真实环境验收；云书架、真实在线书城、多人和支付未实现。
- 最新检查到本地提交 `497f285`（Cloud Run健康检查，前序 `0739a34` 为Vertex AI / Cloud Run）。这是并行进入仓库的已有工作，不能覆盖；本轮未核验远端或云部署状态。此前已知推送为 `8b89f48`。
- 当前功能与上线边界以 [RELEASE_READINESS.md](RELEASE_READINESS.md) 为准；此文是接手入口。
- [CHAT_LOG.md](CHAT_LOG.md) 是压缩需求和执行摘要，不是完整逐字聊天导出；没有未掌握的历史原文，也不得补造。

## 必须保留的功能 checkpoint

1. 造世步骤、可选代入素材和草稿恢复；真实信息不是必填。
2. Gemini 异步首章、等待/取消/手动重试；取消或配置变更后旧结果不能添加书籍。
3. 进入第一章后最多领先预取一章，遇未决选择暂停；失败等待明确重试，不自动循环请求。
4. 目录、上一章、分支改选和终章；改选使未来正文失效，过期响应不能写回新分支。
5. 两本不同单人书合流为独立第三本书，两本原作保留；AI 合流携带有限来源世界规则、摘要和选择。
6. 本机只读分享；AI 正文预览与人工复核提示保留。不能声称自动脱敏保证清除所有身份线索。
7. Hash 导航/刷新恢复、JSON 备份恢复、损坏存档保护、容量失败重试、跨标签冲突处理和未保存提示。

UI 重设计可以调整表现和布局，不能将上述真实状态替换成假的成功动画。

## 启动与接口

Node.js 22.12+，推荐 24，使用锁文件：

```bash
npm ci
npm test
npm run build
npm run dev
```

本地预设无需密钥。Gemini 开发模式复制 `.env.example` 为本机 `.env`，填写服务端配置，另一终端运行 `npm run api`；默认 8787，Vite 代理 `/api`。不要在源码、前端变量或交接文档中保存密钥。

构建后 `npm start` 提供静态页面和 API。接口已实现，不要再按旧版建议创建另一套未接线接口：

```text
GET  /api/status
GET  /api/auth/config
GET  /api/account  (Firebase bearer token，服务端校验)
POST /api/generate
     请求：{ story, index }
     响应：{ chapter, key, worldBible? }
```

首章返回世界规则、结局方向及六章大纲。服务端保留应用的章节与选项协议，模型填写标题、正文和摘要。生成上下文使用摘要与最近一章，不反复发送整本书。

仓库已有Vertex AI / Cloud Run支持、`@google/genai`依赖、`gcp-build`脚本及 [部署说明](GOOGLE_CLOUD_DEPLOYMENT.md)。来源任务已报告云端成功；本地模拟测试不作为其证据。旧首次部署命令与当前公开访问、min=1状态不同，后续先核对正式基线，不直接重跑。

## 已有验证与复验

最新验证：183 项单元测试、构建、主流程28/28、恢复4/4、Gemini模拟4/4、账号降级/游客/偏好16/16。视觉覆盖320×740、390×844、1440×960及用户窗口445×621，共60张页面/状态，额外检查44px触控和造世动作不被底栏遮挡。付费模型、真实账号、真机和云端未在本轮验收。

```bash
npx playwright install chromium
npm run test:e2e
```

该脚本包含 `e2e/journey.cjs`、`e2e/recovery.cjs` 和 `e2e/gemini.cjs`。说明见 [e2e/README.md](../e2e/README.md)。视觉捕获单独运行 `node e2e/visual.cjs`。使用全新浏览器上下文，不清空用户原有 origin 的存档。恢复测试已显式从阅读返回主页再开书，不再依赖旧版隐藏工具栏的副作用。

当前构建预览为 `http://127.0.0.1:5173/`（本轮会话12079），进程内明确设置developer后端/空模型与Firebase key，直接运行 `node server/index.js`，没有读取 `.env`。保留原origin，不修改用户存档；源码修改后需重新构建。端口/会话仅临时记录，先核对PID/命令/监听，不结束其他服务。没有发起收费生成。

## 关键文件

| 文件 | 负责内容 |
| --- | --- |
| `PRODUCT.md` | 最新产品、已选设计方向与数据保留边界 |
| `src/main.jsx` | 页面、向导、异步生成交互、书城、合流、阅读器 |
| `src/styles.css`、`src/reader-flow.css` | iOS 玻璃 token、响应布局、控件及正文 |
| `src/auth/client.js`、`server/auth.js`、`src/components/AccountPanel.jsx` | Google/邮箱身份、后端token验证与账号面板，默认关闭 |
| `src/reading-preferences.js`、`src/components/ReadingPreferences.jsx` | 独立本机字号、行距、阅读背景 |
| `src/components/WorldArtwork.jsx` | 双尺寸封面、合流双画面，图片保持装饰性，文字仍是 HTML |
| `src/generation.js` | API 调用、预取位置、过期响应检查、合流来源上下文 |
| `src/story-engine.js` | 本地剧情骨架、分支、合流、公开快照 |
| `src/reading-flow.js` | 阅读推进、选择、改选与章节门槛 |
| `src/library-store.js` | 存储状态、冲突、保存重试、备份恢复协调 |
| `src/persistence.js` | 书架校验、序列化、旧数据兼容和备份格式 |
| `src/navigation.js`、`src/downloads.js` | 路由解析、下载与导航辅助 |
| `src/components/ErrorBoundary.jsx` | 渲染失败后的可恢复入口 |
| `server/gemini.js`、`server/index.js` | 模型适配、上下文、API 与静态服务 |
| `src/motion/` | 输入与设备降级、GSAP / Lenis 生命周期；Vanta 文件保留但未被新页面引用 |
| `tests/`、`e2e/` | 纯逻辑、服务端、主流程、恢复和模拟 AI 验收 |

产品流程历史见 [PRODUCT_FLOW.md](PRODUCT_FLOW.md)；旧视觉和动效边界见 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)、[MOTION_QA.md](MOTION_QA.md) 与 [MOTION_REVIEW.md](MOTION_REVIEW.md)。这些历史设计文档不能覆盖 PRODUCT.md 的最新重设计要求。

## 当前验收与后续边界

- 方向选择、页面实现、三种宽度检查、两种引擎的流程回归已完成；独立设计复核的唯一发现已resolved，范围见 [验收记录](UI_REDESIGN_VERIFICATION.md)。
- 数据协议没有因换皮改变。阅读工具栏保留备份入口；造世动作随内容排列，不盖住待选项或模型告知。
- 新页面构建不再含 Three/Vanta chunk；主 JS 约 454KB、gzip 153KB。图片按需要选择640w/1122w，不使用原始 PNG 运行。
- 本轮源码与素材未提交或推送；保留已有外部 Vertex/Cloud Run 提交，不据本地结果宣称远端部署成功。

账号、可信套餐分流、usageMetadata持久化、云书架、真实公开发布、双方在线合流、token额度、支付和运营监控仍待实现。公开生成入口缺少可信身份及用户成本额度是优先费用风险；现有单实例限流不构成账单上限。云部署已由来源任务确认，后续变更仍需独立验收，详见 [上线边界](RELEASE_READINESS.md)。

## 历史 checkpoint

0.1 是纯本地确定性原型，当时记录 59 项测试、暖白/海松绿/橘色及 2px 轮廓，提交 `8b89f48` 已知曾推送。这些属于历史；“真实 AI 尚未开始”和“不要先重做手机 UI”均不再是当前任务状态。
