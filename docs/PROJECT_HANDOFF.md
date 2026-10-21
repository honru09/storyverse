# Storyweave 项目交接记录

更新时间：2026-10-21（Asia/Tokyo）  
本地路径：`D:\Projects\Novel`  
目标仓库：https://github.com/honru09/storyverse.git  
项目名称：织界 Storyweave

## 交接结论

当前代码是一个可以本地运行的手机优先互动小说原型。核心流程已经打通：

```text
首页 / 书架
  → 新故事
  → 造世向导（世界观 → 主角 → 能力 / 叙事温度 → 人生代入）
  → 世界线确认
  → 第一章阅读
  → 剧情选择
  → 下一章门槛与预取
  → 继续阅读 / 目录 / 改选
  → 书城分享预览
  → 两本单人书合流为独立第三本书
```

这是一份本地确定性演示，不调用真实 AI、不连接账号、不提供真实多人房间和支付。下一位 agent 可以直接从 `npm install && npm run dev` 开始，在现有流程上接后端和真实模型。

## 已完成

### 产品流程

- 首页只保留继续阅读、其他故事、新故事三个主入口，去掉重复 Hero 与营销噪音。
- 造世流程改成一个页面只问一个问题，步骤短、文字少，支持返回修改。
- 真实信息（姓名、成长地、学校、单位、职业、重要的人）全部选填，只作为本地代入素材。
- 生成故事后直接进入第一章，不人为制造等待。
- 阅读器保持正文优先，在真正的决策点停下；选择会改变后续分支。
- 第 N 章阅读时准备下一章，用户进入下一章时不展示技术化的生成提示。
- 改选会明确提示未来正文会被替换，旧选择与未来分支失效。
- 目录只开放当前可达章节；锁定章节不会误导用户可以点击。
- 合流页从两本单人书开始，创建独立第三本合流书，原书保持不变。
- 当前故事若已经是合流书，合流入口会回到原始单人故事，避免出现三个主角或重复合流。
- 书城使用本地只读分享快照；匿名发布时不公开现实代入信息。
- `storyweave:v2` 保存多本书、阅读位置、合流本和本地分享快照。

### 视觉与动效

- 手机端优先，暖白纸面、海松绿氛围、橘色主按钮、墨色 2px 粗轮廓。
- 触控卡片、按钮、底部导航遵循至少 44px 命中区和安全区适配。
- 阅读页隐藏主底部导航，保留正文、章节位置、决策卡和目录入口。
- 动效收敛为轻量入场与透明度变化：普通 GSAP 入场约 8px / 220ms / 30ms 间隔，阅读标题只做约 140ms 透明度变化。
- 手机、省流量、减少动态和 WebGL 不可用时使用静态潮汐背景；桌面宽屏才按需加载 Vanta / Three。
- Lenis 只用于非阅读页、宽屏精细指针设备；GSAP 统一驱动 ticker。
- Vanta、Lenis、GSAP、React Bits AnimatedContent 的职责和降级矩阵记录在 `docs/DESIGN_SYSTEM.md`。
- `prefers-reduced-motion`、键盘焦点、触摸按下立即反馈、模态 Escape 关闭和焦点恢复均已保留。

### 验证结果

- `npm test`：59 项通过（包含动效策略、阅读流程、持久化和边界检查）。
- `npm run build`：通过。
- 已检查 320px、390px 手机布局，以及桌面首页、书城、造世、合流、阅读、剧情选择、章节目录。
- 已修复 320px 合流卡片挤压、阅读页重复工具区、合流后活动书切换和 Vanta 开发环境 ESM 导入问题。
- 构建仍会提示 Three/Vanta 异步 chunk 超过 500KB；这是桌面增强模块，不影响手机首屏和主流程。

## 未完成 / 下一步

### 产品与后端

- 接入真实生成服务：世界线、章节、选择分支和合流计划需要服务端接口。
- 增加结构化 `WorldBible`、`CharacterSheet`、`StoryState` 存储，避免每章把整本小说重新塞进上下文。
- 接入章节预热、失败重试、取消生成、超时和成本统计。
- 加账号、云端书架、跨设备同步、多人房间、邀请权限和实时合流。
- 加订阅 / 点数 / 章节付费前先补充成本预算和服务端授权。
- 书城目前只在当前浏览器本地存在；还没有评论、点赞、关注、搜索和审核。

### 工程与验收

- 在真实 iPhone / Android Safari、键盘弹起、安全区和长时间耗电下验收。
- 继续压缩或拆分 Three/Vanta 桌面 chunk，必要时改为更轻的 CSS/SVG 氛围效果。
- 接入后端后补充网络错误、并发编辑、权限和数据迁移测试。
- 当前浏览器本地书架可能保留测试过程产生的演示书；如需干净演示，使用新的浏览器 origin 或清理 `localStorage` 的 `storyweave:v2`。

## 关键文件

| 文件 | 用途 |
| --- | --- |
| `src/main.jsx` | React 页面、导航、造世、书城、合流和阅读器主流程 |
| `src/story-engine.js` | 本地确定性世界、章节、分支、合流和分享快照生成 |
| `src/reading-flow.js` | 阅读推进、选择、改选、章节门槛和可达范围规则 |
| `src/persistence.js` | `storyweave:v2` 本地书架读写与旧草稿兼容 |
| `src/styles.css` | 全局视觉 token、布局、按钮、导航和响应式样式 |
| `src/reader-flow.css` | 阅读页、目录模态和阅读工具区样式 |
| `src/motion/MotionProvider.jsx` | 动效偏好、设备能力、页面可见性和 motion policy |
| `src/motion/useSceneMotion.js` | Lenis + GSAP ticker 与页面级动效接入 |
| `src/motion/WorldAtmosphere.jsx` | Vanta WAVES 动态背景与静态降级 |
| `src/components/react-bits/AnimatedContent.jsx` | 本地保留的 React Bits AnimatedContent 适配组件 |
| `docs/PRODUCT_FLOW.md` | MVP 范围、状态机、用户流程和产品边界 |
| `docs/DESIGN_SYSTEM.md` | Apple 风格视觉、动效分层、无障碍和第三方库接入决策 |
| `docs/MOTION_QA.md` | 动效与响应式验收记录 |
| `docs/PROJECT_HANDOFF.md` | 本文件，下一位 agent 的单一交接入口 |

## 已使用的 skills 与设计依据

以下是本项目目前明确使用或落实到代码 / 文档中的 skills：

### `apple-design`

用于手机端直接反馈、可撤回决策、空间连续的页面转场、减少动态、键盘焦点、触控命中区、系统字体和层级控制。落地位置主要是 `src/styles.css`、`src/reader-flow.css`、阅读器交互和 `docs/DESIGN_SYSTEM.md`。

### `impeccable`

用于低噪音重构和视觉检查。已执行一次检测，并修正了侧边装饰线、重复 Hero、重复阅读工具和过度装饰文案。当前页面保持一个主动作、少量文字和粗线条层级。

### GSAP / Lenis / Vanta / React Bits 相关实践

这些不是额外安装的虚构包，而是当前工程实际依赖与本地适配：

- `gsap` 与 `@gsap/react`：页头 / 步骤入场和 ScrollTrigger 生命周期。
- `lenis`：宽屏非阅读页滚轮手感，和 GSAP ticker 同步。
- `vanta` + `three`：宽屏首页 / 合流氛围背景，异步加载并可销毁。
- React Bits `AnimatedContent`：保留官方组件许可并做本地适配，手机和减少动态时立即可见。

完整接入边界、许可、版本、降级条件见 `docs/DESIGN_SYSTEM.md` 与 `src/components/react-bits/LICENSE.md`。

## 运行与交接命令

```bash
npm install
npm test
npm run build
npm run dev
```

Windows PowerShell 也可以执行相同的 npm 命令。默认开发地址通常是 `http://127.0.0.1:5173/`。

接真实 AI 时，建议先保持前端状态结构不变，再把 `src/story-engine.js` 的确定性实现替换到以下边界：

```text
POST /api/story/create
POST /api/chapter/next
POST /api/choice/apply
POST /api/story/merge-plan
POST /api/story/merge
```

每次请求只发送当前 `WorldBible`、`CharacterSheet`、`StoryState`、当前章节摘要、最近一到两章和用户刚做的选择。不要默认发送整本正文。

## 对话需求摘要

这是用户目前提出过的产品方向和执行要求，按时间顺序压缩记录：

1. 创建一个 AI 互动小说平台项目。用户先选世界观、角色、能力、家世等少量选项，系统实时生成小说；阅读中只在关键节点让用户决定剧情。
2. 需要支持用户代入：姓名、家乡、学校、职业、单位、朋友和家人等现实信息可选地成为主角素材。
3. 生成策略采用章节预取：生成第一章时准备下一章，阅读推进时继续准备后续章节，避免用户等待和出戏；同时控制 token 成本。
4. 后期加入联机合流：两个用户的不同世界线可以合并为一部独立第三本书，两个主角和配角共同存在，原书保持不变。
5. 需要书城：用户可以分享自己的世界观和作品，其他用户可以只读浏览；合流书也可以分享。
6. 产品核心留存点是开局的新奇感、长时间连续阅读、关键决策和后期联机合流；首页与中间流程要简洁、清楚、有吸引力。
7. 主要做手机端，页面逻辑简约，使用 Apple Design 思路，粗线条、明显触控反馈和安全区适配。
8. 用户要求参考 Lenis、GSAP、Vanta.js、React Bits，并采用分层架构：Vanta 背景、Lenis 滚动、GSAP 动画、React Bits UI 动效。
9. 用户随后要求减少文字噪音、继续优化动效、交互逻辑、UI、排版；当前已将页面收敛到少量文案和单一主动作。
10. 用户最新要求：把当前所有代码、计划书、已完成 / 未完成 / 进行中的内容、使用过的 skills 和聊天记录整理并上传到 `https://github.com/honru09/storyverse.git`，保证下一个 agent 能接上。

## 当前交接状态

- 交接文档：已完成。
- 代码与现有设计文档：准备提交。
- 远端仓库：已确认为空仓库，目标为 `main`。
- 真实 AI / 联机 / 支付：未开始，属于后续工作。
- 下一位 agent 的第一步：阅读本文件，再运行 `npm test`、`npm run build`，然后从 `src/story-engine.js` 和 `src/persistence.js` 设计后端替换边界。

