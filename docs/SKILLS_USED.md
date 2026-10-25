# 本轮 skills 记录

日期：2026-10-25。

## 十项核心 Skills 选型与应用升级（视觉设计 + 阅读体验 + 小说生成逻辑）

针对「织界 Storyweave」互动小说平台，本轮筛选并落地了最契合的 **10 个 Skills**，覆盖**网页视觉与交互工艺**、**深度阅读与性能体验**、**小说生成叙事逻辑与领域建模**三大维度：

| 维度 | Skill | 来源 | 落地的升级点 |
| --- | --- | --- | --- |
| 视觉与交互设计 | `apple-design` | `C:/Users/wangxr/.agents/skills/apple-design/SKILL.md` | iOS 材质层级、44pt 最小触控热区、阅读概览卡片毛玻璃与高对比度可访问性 |
| 视觉与交互设计 | `emil-design-eng` | `C:/Users/wangxr/.agents/skills/emil-design-eng/SKILL.md` | 同心圆角（`14px` 外框 / `10px` 内嵌按钮）、`scale(0.97)` 触控即时压缩反馈、`tabular-nums` 数字防抖 |
| 视觉与交互设计 | `interface-design` | `C:/Users/wangxr/.codex/skills/interface-design/SKILL.md` | 纸书/毛玻璃阅读器精细边框、简洁排版层级、阅读辅助工具箱分段面板 |
| 视觉与交互设计 | `interaction-design` | `C:/Users/wangxr/.codex/skills/interaction-design/SKILL.md` | 书内查找/位置书签/剧情概览三栏切换、章节摘要一键跳章与自动收起抽屉反馈 |
| 阅读与性能体验 | `ui-ux-pro-max` | `C:/Users/wangxr/.codex/skills/ui-ux-pro-max/SKILL.md` | 新增 `estimateReadingMetrics` 统计字数与预计阅读分钟数，在阅读器进度栏与工具箱提供阅读时长参考 |
| 阅读与性能体验 | `responsive-design` | `C:/Users/wangxr/.codex/skills/responsive-design/SKILL.md` | 响应式三栏工具分段与概览面板，在 `320px` / `390px` / `1440px` 视口保持零横向溢出 |
| 阅读与性能体验 | `optimize-web-animations` | `C:/Users/wangxr/.codex/skills/optimize-web-animations/SKILL.md` | 升级 `WorldAtmosphere.jsx`，结合 `IntersectionObserver` 与 `visibilitychange` 自动挂起离屏/后台 SVG 氛围滤镜 |
| 小说生成与叙事逻辑 | `writing-beats` | `C:/Users/wangxr/.codex/skills/writing-beats/SKILL.md` | 在 `storyBeatPlan` 中构建 `prerequisites`（前置已交代信息）与 `mustGround`（本章需交代要点），避免 AI 跳步设定 |
| 小说生成与叙事逻辑 | `writing-shape` | `C:/Users/wangxr/.codex/skills/writing-shape/SKILL.md` | 在 `storyBeatPlan` 中定义段落结构 `paragraphShape` 与写作风格说明 `toneDirective`，注入 `server/gemini.js` |
| 小说生成与叙事逻辑 | `domain-modeling` | `C:/Users/wangxr/.codex/skills/domain-modeling/SKILL.md` | 建立 `storyBeatPlan` 与无剧透 `storyNarrativeDossier` 模型，追踪分支选择结果（`unlockedConsequences`）并呈现在阅读器「剧情概览」面板 |

---

## 历史记录（2026-10-22）

最新一轮覆盖此前「故事扉页」：用户指定全站年轻 Apple iOS 毛玻璃。实际使用 `apple-design`＋`emil-design-eng` 主导材质/层级/短动效，`design-system` 统一token，`impeccable` 的new-work/onboard/craft-floor/polish及独立复核/文档流程，`playwright-skill` 做隔离流程回归，`writing-for-agents` 更新交接。本轮没有制作视频或新插画；视频skills不进入网页运行依赖。检测器只运行一次，报告大量与旧 DESIGN.md 不一致的色彩/字阶/圆角提示；此为用户批准的替换方向，最终文档按真实代码更新。复核证据见 [IOS_FINISH_REVIEW.md](IOS_FINISH_REVIEW.md)。下方为此前已做工作的历史记录。

用户指定 [emilkowalski/skills](https://github.com/emilkowalski/skills) 为 UI 和动效的主规范。`emil-design-eng` 决定频率、反馈、即时键盘与动效预算，`find-animation-opportunities` 用于机会筛选；GSAP 负责实现。用户已确认保留流程、直接改可操作页面，并选择「故事扉页」。`frontend-design`、`design-system`、`impeccable` 已指导完整页面替换，不再处于方向待选状态。对照见 [MOTION_REVIEW.md](MOTION_REVIEW.md)。

| Skill | 来源 | 应用 |
| --- | --- | --- |
| emil-design-eng | `C:/Users/wangxr/.agents/skills/emil-design-eng/SKILL.md` | 主规范：选择即时确认、封面短收束、正文稳定、键盘与减少动态优先 |
| impeccable | `C:/Users/wangxr/.codex/skills/impeccable/SKILL.md` | 产品约束、方向选择、code-first合同、素材制作、两轮截图与独立复核/文档流程 |
| frontend-design / design-system | 本机对应 skills | 全页面对齐书封视觉、共享 WorldArtwork、色彩字体控件原语 |
| imagegen | 系统 imagegen skill | 原生工具生成四组叙事插画与一次细节修正；完整原文提示词见 ART_PROVENANCE.md |
| writing-for-agents | 本机对应 skill | 将当前事实、完成证据、来源和后续上线工作分开交接 |
| gsap-react | 本机 `C:/Users/wangxr/.codex/skills/gsap-react/SKILL.md`；[官方仓库](https://github.com/greensock/gsap-skills) | scoped useGSAP、生命周期清理、事件解绑；保留组件卸载时回滚 |
| gsap-core | 本机 `C:/Users/wangxr/.codex/skills/gsap-core/SKILL.md`；同上 | transform/opacity、内置 easing、保留减少动态和即时可点击 |
| gsap-performance | 本机 `C:/Users/wangxr/.codex/skills/gsap-performance/SKILL.md`；同上 | Lenis 惯性停止后移除 GSAP ticker 回调；移除标题淡入的全局 refresh |
| playwright-skill | 本机 `C:/Users/wangxr/.codex/skills/playwright-skill/SKILL.md` | 可见浏览器、隔离上下文、语义定位、真实流程与结果检查；可复现脚本存于 `e2e/` |
| huashu-art-motion | [官方 SKILL.md](https://github.com/alchaincyf/huashu-art-motion/blob/main/SKILL.md)，读取版本 1.2.0 | 查阅用户点名的 skill，借鉴阅读时保持画面稳定、过渡与重点区别处理、统一色板；其成片工作流不适用于本轮网页业务验收，因此未生成或渲染视频 |

Apple Design 的触控、反馈、层级和减少动态规则继续沿用。本轮 Impeccable 检测器执行一次：报告桌面侧栏的2px右边线，已删除该冗余边线；没有用循环扫描代替独立设计复核。图片制作、独立复核和最终文档是对应skill明确要求的三个子任务。复核唯一触控区发现已resolved；文档代理在最后UI修复之后从最终代码提取根DESIGN.md及schemaVersion2侧车，记录10个实际组件原语。

## 补充安装与职责

通过系统 `skill-installer` 安装到 `C:/Users/wangxr/.codex/skills/`，没有覆盖已有技能；没有运行第三方渲染或发布脚本。已完整读取以下入口。具体仓库与路径见 [SKILL_SOURCES.md](SKILL_SOURCES.md)。

| Skill | 当前状态 | 使用边界 |
| --- | --- | --- |
| motion-design（LottieFiles） | 已安装、读取及比较；还读了 context-adaptation 与 quality-checklist | 作为节奏、移动降级及信息反馈的辅助校验。它的“三层动效”“长过渡”配方与 Emil 高频即时规则冲突时，以用户指定的 Emil 为准，不增加阅读背景循环。不是 Lottie 播放器依赖。 |
| pixel2motion | 已安装、读取 | Logo 位图转矢量与独立片头。当前没有用户提供的待动画 Logo，不把通用片头强加进启动流程。 |
| video-shotcraft | 已安装、读取 | 产品视频镜头与素材流程，不用于驱动阅读导航。尚未开始成片。 |
| story-to-handdrawn-video | 已安装、读取 | 后续经用户授权可把选定章节做故事视频；它需要独立 renderer 项目，不是安装完就已有视频生成功能。 |
| huashu-art-motion | 已安装、读取，版本 1.2.0 | 画风、镜头和成片 QA 备用；不以视频镜头数量要求网页持续运动。安装来自下载而非 git clone，因此跳过版本标签检查。 |
| HyperFrames / Remotion | 本机已有、入口已读取 | 保留为宣传/导出任务能力；未给小说应用增加视频渲染运行时。 |

这是分层使用而不是叠加效果：Emil 决定是否动、怎么响应；Apple 负责熟悉的触控与层级；GSAP 实现有需要的时间线；LottieFiles 辅助校验节奏；视频技能仅在对应产物任务中启用。当前没有生成 MP4，也没有把安装成功描述成应用已拥有视频功能。

用户写的 `code-to-cinem` 未提供完整仓库地址，本轮未以近似同名仓库代替。没有执行不明安装脚本。没有把当前机器可用的全部 skills 误记为已经使用。

## 可移植性

项目运行只需要 npm 依赖，不要求上述本机路径存在。下一位 agent 可从官方链接重新读取 skills，依据 PRODUCT.md、UI_SURFACE_BRIEF.md、最终 DESIGN.md 和验收脚本继续工作。DESIGN_SYSTEM.md 的旧绿橙风格仅作历史。React Bits 第三方许可保留在 `src/components/react-bits/LICENSE.md`。
