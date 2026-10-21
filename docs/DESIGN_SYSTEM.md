# 织界 · 纸页 × 潮汐

## 范围与目标

首页、四步造世、阅读器、书城、世界合流共用一套手机优先设计系统。主任务始终是读故事和作出选择，不是操作模型。背景与动效是渐进增强，不负责触发生成、存档或剧情分支。

## 视觉基础

- 画布：暖白 `#f5f3ee`；正文与粗轮廓：墨色 `#1e2423`；主要行动：橘色 `#e46c3c` 搭配深色字；世界氛围使用海松绿。
- `styles.css` 集中定义语义 token，页面不自行另建主题。旧变量 `--paper` 现在表示主文字，`--ink` 表示页面画布；新代码优先复用 `--surface`、`--muted`、`--line` 等语义 token。
- 标题使用系统无衬线粗体，小说正文使用系统衬线字体，18px 基准、2 倍行高。长标题允许换行，布局不依赖固定字数。
- 描边以 2px 为主，重要触控卡片有清晰选中轮廓。面板圆角 24px，控件采用更紧凑的圆角；阴影用于按键与悬浮导航，不铺满所有区域。
- 手机单列、700px 扩展卡片列数、1050px 展开桌面导航／预览。960px 只是重动效准入条件，不决定内容是否可用。

## 共享组件与边界

| 组件/模块                        | 职责                                                 |
| -------------------------------- | ---------------------------------------------------- |
| Button、Icon、Brand              | 主要/次要行动、统一粗线图标、品牌入口                |
| Sidebar、MobileBottomNav、Topbar | 世界 / 造世 / 书城 / 合流四入口；阅读时让出手机底栏  |
| ReadingDialog                    | 原生模态、锁定背景滚动、Escape 关闭、恢复触发焦点    |
| AnimatedContent                  | 来自 React Bits 的局部内容入场，不包裹全文或整个应用 |
| MotionProvider / policy          | 用户动效开关、系统偏好、省流量、设备能力、可见性     |
| WorldAtmosphere                  | 局部世界氛围与静态替代，无交互语义                   |

世界选项、小说决策、合流规则仍是业务组件，不提升为万能卡片。新增共用 token 或组件需证明至少两个真实页面需要，且检查手机、键盘、减少动态三种状态；不要用页面特例覆盖全局规则。

## 四层动效的实际接入

1. **Vanta WAVES**：仅首页/合流的独立空背景节点。动态加载 `vanta@0.5.24` 与 `three@0.134.0`，不进入手机/省流量/减少动态模式。离屏、隐藏页面、关闭动效和卸载都会销毁实例并释放 renderer；失败使用始终存在的静态潮汐 SVG。
2. **Lenis**：非阅读页、宽屏精细指针设备的滚轮增强。触控始终 `syncTouch: false`；不额外包一层 transform 滚动容器，不改变 sticky/fixed 定位。GSAP ticker 是唯一驱动时钟，秒转毫秒；通过 scroll 事件更新 ScrollTrigger，无需 `scrollerProxy`。
3. **GSAP / @gsap/react**：页头与步骤入场（8px / 0.22s，30ms 间隔），阅读标题仅 0.14s 透明度变化。用 `useGSAP` 限定作用域、依赖更新回滚，不让动画阻塞点击。切页清理并取消残留滚动惯性。
4. **React Bits AnimatedContent**：按官方源码接入世界卡片，8px 局部上移、0.22s 完成，不引入虚构的 `react-bits` npm 包。已增加减少动态、键盘聚焦和触摸按下立即显示及 scoped cleanup；移除了隐藏默认内容和延时消失行为。

首屏不等待 WebGL 下载；Three/Vanta 均为异步 chunk。`three-waves.js` 只导出 WAVES 需要的 11 个 Three 类型/常量，避免整体命名空间阻止摇树优化。使用 Vanta 包内的 ESM WAVES 源码入口，避免 Vite 开发预打包的 UMD 双重 default 包装。主流程即使完全关闭动效也能完成。不因库存在而添加视差、滚动锁页或阅读背景动画。

## 无障碍与反馈

- 手机控件最少 44px，输入字号 16px，安全区使用 `env(safe-area-inset-*)`。
- 按下立即反馈；选项状态同时用描边/勾选与 `aria-pressed` 表达。
- 常规文字目标对比度 4.5:1；不把灰字用于唯一行动提示。键盘焦点有外轮廓。
- `prefers-reduced-motion` / `prefers-reduced-transparency` / `prefers-contrast` 分别处理。右上角可暂停动态效果；偏好存于独立键 `storyweave:motion`，不改书架数据。
- 减少动态直接呈现内容；不让不可见卡片获取焦点。正文不逐字播放，不在动画完成回调中写入业务状态。

## 产品边界

这是本地确定性体验版：非真实模型输出，非真实多人联机，书城分享仅在当前浏览器。本次保留 `storyweave:v2` 数据与原有隐私/只读/决策门槛，不迁移或重写旧书。

## 来源与许可

- [Lenis 官方 GSAP 集成](https://github.com/darkroomengineering/lenis#gsap-scrolltrigger) · MIT。
- [GSAP React](https://github.com/greensock/react) / [GSAP 标准许可](https://gsap.com/community/standard-license/) · 并非 MIT。
- [Vanta 官方用法与 r134 示例](https://github.com/tengbao/vanta) · Vanta 与 Three 为 MIT。
- [React Bits AnimatedContent 源码](https://github.com/DavidHDev/react-bits/blob/main/src/content/Animations/AnimatedContent/AnimatedContent.jsx) / [安装方式](https://reactbits.dev/get-started/installation) · MIT + Commons Clause；完整许可随组件保留，不作为独立组件包转售。

响应式布局验证归 `responsive-design`；业务规则归 `reading-flow.js` / `story-engine.js`。未来真实 AI、多人权限、支付的设计与验证不在本次范围内。
