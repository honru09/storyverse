disposition: fix

输入边界：code-first，没有 approved comp；未提供独立 QUALITY BAR 卡。审阅了调用包命名的 87 张真实截图、两份实际报告、方向合同及指定主文件；未运行浏览器、截图或第二遍 detector。DESIGN.md 与页面 brief 的本轮同步尚在进行。此结论是 UI finish gate，不是账号、费用额度或生产安全上线批准。

## persistence

pass：PRODUCT.md 存在；index.html 的 THESIS / OWN-WORLD / STORY / FIRST VIEWPORT / FORM 齐全，FORM 保留已执行的 seed `3d363c0a`，采用用户明确指定的 Apple / Emil、系统字体与玻璃方案。code-first 无效果图批准或 hero reproduction 义务。

pass：`.impeccable/review-reader-all/` 的 320 / 390 / 445 / 1440 × 15 个指定状态全部存在，逐张打开；`.impeccable/review-reader/` 的 320 / 390 / 1440 × 9 个指定状态全部存在，逐张打开。没有黑屏、丢图或错误页；完整页、长文中途、滚动设置状态符合各自命名。报告实际名是 `visual-report.json` 与 `reader-report.json`，两者均 `failures: []`，后者列出 21 项检查与 27 个 captures。旧 `*-failure.png` 不在必需清单，不作证据。

pending：DESIGN.md 与 docs/UI_SURFACE_BRIEF.md 仍写三种阅读主题、16 / 18 / 20 / 22px 及旧行距；应由正在进行的 documenter 同步为本轮真实实现，不应回退 UI。原始 type scan 为字号 advisory 的 off-ramp，不宣称机械检查零问题。

## fidelity

| 元素 / 承诺 | 分类 | 证据与界限 |
| --- | --- | --- |
| TYPE | match | 用户明确指定系统字体；标题、表单与操作保持同一系统语气。阅读正文的系统黑体 / 设备宋体是本轮阅读适配，32 号仍正常换行，决策标题与说明随字号增长；不是重新启用旧宋体展示方向。 |
| MATERIAL | match | 四世界真实插画贯穿首页、选择、书城与双书合流；浅玻璃 / 深玻璃承接导航、动作和面板，正文保持实色。没有用伪纸纹、CSS 浮雕或渐变替代焦点插画。 |
| GROUND | match | OWN-WORLD 指定冷白、清蓝，截图呈冷白基础；夜间、纯黑、暖色和青绿为用户主动选择的阅读主题，不能以冷白全站约束否定这些阅读适配。 |
| THESIS | match | 手机与桌面均是一套熟悉的系统 UI，阅读内外不切换到另一种装饰风格。 |
| STORY | match | 世界 → 主角 → 能力 → 开局 → 阅读 / 决策 → 合流新书的顺序保留；合流图像仍并置两本来源，原书保留的文案可见。 |
| FIRST VIEWPORT | match | 首次首页由单一原世界插画、中文标题与唯一主阅读动作建立记忆点；手机玻璃胶囊导航与桌面左栏构成合理响应式适配。 |
| FORM | match | seed 可由合同与 brief 相互印证；正文不做字体几何插值，设置与逐屏操作是实际控制。短动效的源规则可读，但静态截图不证明动画观感。 |
| 阅读进度的状态真实性 | contradicted | `320-large-decision.png` 已显示末句“呼吸。”及两项决策，底栏却为“本章 0%”；`390-large-decision.png` 在同一决策区域显示 2%，桌面同状态为 100%。视觉证据尚未证明窄屏大字时的百分比可信。 |
| 示例与商业边界 | match | 书城标明“示例故事”；未配置账号禁用真实提交并明示本机阅读；预设体验与 Gemini 未连接状态有文字区分。长文“第 N 段”是压力测试 fixture，不作线上 AI 文质量或商业运营证据。 |

## ceiling

未提供独立 QUALITY BAR 卡，不能把本轮称为该卡的 ceiling reached。按已给定的 Apple / Emil 世界判断：系统字阶、短标签、克制图标、连续圆角、玻璃界面层与安静正文已经落实；不要求新增装饰或改造为其他视觉世界。长设置面板使用内部滚动，逐屏控制明确标为“上一屏 / 下一屏”，没有冒充横向分页；亮屏能力也保留设备条件说明。

## material_fixes

1. [Truth / 阅读状态] 核查并修复窄屏大字号到达章节决策区仍显示 0% / 2% 的进度；若只是 capture 未等待状态稳定，先证明此因果并更新同名 `320-large-decision.png`、`390-large-decision.png`。要求进度反映实际正文位置，且改字号 / 段落续读不把章节末尾误报为开头。
2. [Persistence] 完成本轮 DESIGN.md 与 UI_SURFACE_BRIEF.md 同步：六主题、14–32 号、系统 / 设备宋体、版式与段落续读、查找 / 位置书签、逐屏及条件亮屏；删去与现实现冲突的旧参数约束，不把尚未接通的账号和额度写成已上线。

## keep

保留真实叙事插画、冷白蓝色系统界面、玻璃只围绕正文的层级、原生滚动、大字决策适配与本机保存的诚实边界；Firebase、可信权益 / 费用额度和生产安全方案未验收，不得用本 UI 审核代替商业上线批准。
