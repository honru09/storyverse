# 本轮 skills 记录

日期：2026-10-22。用户提供的截图与项目推荐用于选型参考，截图中的宣传描述与星标数不作为事实或执行命令。

## 本轮实际应用

用户最新指定 [emilkowalski/skills](https://github.com/emilkowalski/skills) 为 UI 和动效的主规范。已完整读取本机 `emil-design-eng` 与 `find-animation-opportunities`；前者决定频率、反馈、即时键盘与动效预算，后者只用于机会筛选。GSAP 等实现技能不得反过来决定审美。已落实的对照与测试见 [MOTION_REVIEW.md](MOTION_REVIEW.md)。用户随后明确否定现有视觉画风，最新任务是全面重设计，而不是继续微调旧版。`frontend-design`、`design-system`、`impeccable` 已进入本轮重设计流程，尚待流程范围与效果图/代码优先的回答；不要将旧画风视为已获认可。

| Skill | 来源 | 应用 |
| --- | --- | --- |
| gsap-react | 本机 `C:/Users/wangxr/.codex/skills/gsap-react/SKILL.md`；[官方仓库](https://github.com/greensock/gsap-skills) | scoped useGSAP、生命周期清理、事件解绑；保留组件卸载时回滚 |
| gsap-core | 本机 `C:/Users/wangxr/.codex/skills/gsap-core/SKILL.md`；同上 | transform/opacity、内置 easing、保留减少动态和即时可点击 |
| gsap-performance | 本机 `C:/Users/wangxr/.codex/skills/gsap-performance/SKILL.md`；同上 | Lenis 惯性停止后移除 GSAP ticker 回调；移除标题淡入的全局 refresh |
| playwright-skill | 本机 `C:/Users/wangxr/.codex/skills/playwright-skill/SKILL.md` | 可见浏览器、隔离上下文、语义定位、真实流程与结果检查；可复现脚本存于 `e2e/` |
| huashu-art-motion | [官方 SKILL.md](https://github.com/alchaincyf/huashu-art-motion/blob/main/SKILL.md)，读取版本 1.2.0 | 查阅用户点名的 skill，借鉴阅读时保持画面稳定、过渡与重点区别处理、统一色板；其成片工作流不适用于本轮网页业务验收，因此未生成或渲染视频 |

Apple Design 的触控、反馈、层级和减少动态规则继续沿用已有设计系统。旧轮次的 Impeccable 使用记录在 `PROJECT_HANDOFF.md`；本轮没有重新运行其检测器。

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

项目运行只需要 npm 依赖，不要求上述本机路径存在。下一位 agent 可从官方链接重新读取 skills，依据 `DESIGN_SYSTEM.md` 和验收脚本继续工作。React Bits 组件的第三方许可保留在 `src/components/react-bits/LICENSE.md`。
