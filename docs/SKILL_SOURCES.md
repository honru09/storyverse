# 用户补充的动效与视频 Skill 来源

核对日期：2026-10-22。本文是来源索引，记录可核对的原始仓库与入口路径；不表示这些 Skill 已安装、已应用或已生成视频。执行任务的主 Agent 应自行阅读对应 `SKILL.md` 及其要求的引用文件。

## 已核对的仓库入口

以下路径通过 GitHub 仓库 metadata 与 `git/trees/main?recursive=1` 核实；默认分支均为 `main`。

| 用户给出的名称 | 原始仓库 | 精确入口 | 身份判断 |
| --- | --- | --- | --- |
| Pixel2Motion | [nolangz/pixel2motion](https://github.com/nolangz/pixel2motion) | [SKILL.md](https://github.com/nolangz/pixel2motion/blob/main/SKILL.md) | 高：项目名称、Logo 栅格转矢量及动效用途吻合。 |
| video-shotcraft | [Vincentwei1021/video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) | [SKILL.md](https://github.com/Vincentwei1021/video-shotcraft/blob/main/SKILL.md) | 高：原始仓库 README 对应产品宣传片、镜头卡及 Remotion。入口位于仓库根目录。 |
| story-to-handdrawn-video | [gnipbao/story-to-handdrawn-video](https://github.com/gnipbao/story-to-handdrawn-video) | [skill-package/story-to-handdrawn-video/SKILL.md](https://github.com/gnipbao/story-to-handdrawn-video/blob/main/skill-package/story-to-handdrawn-video/SKILL.md) | 高：项目名与中文故事转手绘日记视频用途吻合。仓库还包含独立渲染器工程。 |
| LottieFiles motion-design-skill | [LottieFiles/motion-design-skill](https://github.com/LottieFiles/motion-design-skill) | [skills/motion-design/SKILL.md](https://github.com/LottieFiles/motion-design-skill/blob/main/skills/motion-design/SKILL.md) | 高：LottieFiles 官方组织仓库，官方文档直接链接该仓库。Skill 名为 `motion-design`。 |
| code-to-cinem | [softmutiny/code-to-cinema](https://github.com/softmutiny/code-to-cinema) | [SKILL.md](https://github.com/softmutiny/code-to-cinema/blob/main/SKILL.md) | 候选：用户给出的名称缺少结尾 `a`。搜索结果中该项目的代码绘制短片用途吻合，但不能仅凭近似名称确定用户指的就是此仓库。 |

LottieFiles 的身份佐证：[官方 Creator MCP 文档](https://docs.lottiefiles.com/en/creator/13_ai-tools/lottie-creator-mcp)。官方文档链接 `LottieFiles/motion-design-skill`，并给出同一安装来源。

## 本机已有的相关能力

最初核对时未发现四个确定项目。随后主 Agent 使用系统 skill-installer 将 `pixel2motion`、`video-shotcraft`、`story-to-handdrawn-video`、`motion-design` 及 `huashu-art-motion` 安装到 `C:/Users/wangxr/.codex/skills/`，全部返回成功，未覆盖既有技能。已存在的 `hyperframes`、`remotion-best-practices`、`product-launch-video`、`lemo-opuscar`、`animate`、`motion-foundations` 和 `motion-advanced` 保持不变。详见 SKILLS_USED.md；安装不等于已经制作过相关产物。

`lemo-opuscar` 的本机入口标注来源为 [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar)，与 `softmutiny/code-to-cinema` 是不同仓库。

## 核对快照

以下值为 GitHub Tree API 返回的树 SHA，用于标识本次路径调查的内容快照；它们不是安装说明，也不应当作发布版本号。

| 仓库 | 树 SHA |
| --- | --- |
| nolangz/pixel2motion | `e9faedb28930df0da2acf17da00c80730a78cfe8` |
| Vincentwei1021/video-shotcraft | `43bd349a136651865ecfa6ea1cf012f6e957d304` |
| gnipbao/story-to-handdrawn-video | `198aefa9b298af3a20d3bd757c93433623d38ccd` |
| LottieFiles/motion-design-skill | `f9a8a041b85185ee4881b3471d3415e939aac772` |
| softmutiny/code-to-cinema | `90c19a22d49d79e96bb3bfd722285bc2c97ccb62` |
