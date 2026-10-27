# MIGRATION-REFERENCES — 全站风格迁移批 参考功课留档（2026-10-28）

用户硬要求「多利用」：视觉批次开工前先做参考功课并留痕。以下每条注明来源与**具体取了什么**，实现里必须能找到对应痕迹（MIGRATION.md 对照表逐条回指）。

## 1. Codrops — Creating Custom Page Transitions in Astro with Barba.js + GSAP
- 链接：https://tympanus.net/codrops/2026/04/08/creating-custom-page-transitions-in-astro-with-barba-js-and-gsap/
- 内容：六种页面转场；第六种用**下一容器的伪元素 + clip-path inset 动画**做「幕布升起」式展开；sync 模式让新旧容器在转场中共存。
- **取了**：主页窗口化的打开方式——窗口不是硬切全屏，而是从当前页上方以 clip/位移动画压入、底层页面同时压暗（curtain 的降级版：不用 GSAP 劫持路由，用 CSS transform/opacity + 底层 backdrop 实现同一语义）。关闭时逆向回原页，滚动位置零损失。

## 2. View Transitions API — shared element / cross-fade 模式（平台规范写法）
- 链接：https://www.cssshowcase.com/articles/animation/view-transitions-api ；要点整理亦见 https://webreference.com/css/view-transitions/
- 内容：`view-transition-name` 让同名元素在新旧状态间自动 morph（卡片缩略图→详情 hero 的经典共享元素）；无命名时默认整页 cross-fade；`types` 可区分转场类型；reduced-motion 须显式降级；Safari 支持有限，必须当渐进增强。
- **取了**：①主题切换的**交叉淡化**语义（旧色板淡出、新色板淡入），实现走全站兼容的 CSS 变量过渡 + 一个全屏色罩兜底，不单独依赖 VT API（Safari 无 VT 时仍成立）；②「封面→详情/阅读 hero」的连续性目标函数——本批以窗口/弹层入场方向（自触发点升起）表达，不做逐元素 morph（成本与 Safari 兜底不成比例，理由记 MIGRATION.md）。

## 3. Codrops HoverEffectIdeas 谱系 — Card fan（卡片扇）几何
- 链接：https://deepwiki.com/codrops/HoverEffectIdeas ；扇形变体参数见 https://wpdean.com/css-hover-effects/ 的 "Card fan" 一节（同尺寸卡叠放、hover 时 rotate/translate 展开、overshoot 缓动 cubic-bezier(.34,1.4,.64,1)）。
- 内容：叠卡的深度来自**统一尺寸 + 位移/微旋转 + 各自阴影**，不需要边框分隔；展开缓动带 overshoot 才有「纸牌」手感。
- **取了**：主页合集扇面终修的几何语言——前卡左锚铺满、后卡同尺寸右移叠放只露色边、层间只靠阴影分隔（承 §15 gate7「无浅色边」定版），后卡带 ≤1.5° 微旋转让色边读得出是「另一张封面」而不是阴影；静止态不旋转前卡（用户口径：左锚铺满 + 叠边露色）。

## 4. 暗色界面呈现原则 — dark website design 综述（Godly/Awwwards 画廊的通行做法）
- 链接：https://www.collectiveray.com/dark-websites （暗色设计要点综述：暗底对图像质量要求更高、需要更多留白、图像可用反射/融合沉入地面）
- **取了**：新黑底主题的壳层规则——**图像沉入地面、铬件单色克制**：卡片不给图像加第二层硬框，层级靠 1px 浅边 + 柔影（与 §15 主页层级公式同源，现推广为全壳层黑主题的层级物理）；身份/内容区留白加大，色彩只来自头像、立绘、封面本身。这也是「一套层级物理」的来源：黑主题层级公式 = §15 公式，白主题 = 同公式的亮面映射，极光 = 玻璃公式（历史保留）。

## 5. 主题预绘制脚本模式（防 FOWT）
- 链接：https://www.makuistudio.com/darkmode.html （完整实现：head 内联脚本在 CSS 绘制前读 localStorage 设 data-theme；变量双套；切换持久化）
- **取了**：首帧前把 `storyweave:shell-theme` 写到 `<html data-shell-theme>` 的预绘制思路，杜绝刷新时先闪错主题；React 只负责后续切换与持久化，不负责首帧。**落地修正（2026-10-28 验收发现）**：原文用内联脚本，但本站服务端 CSP 为 script-src 'self'、内联一律被拦——最终实现为外置经典脚本 `public/theme-init.js`（index.html 以 src 引用），机制等价、CSP 合规。

## 6. ssgoi — View Transition 的 blur 变体（详情打开时背景退后）
- 链接：https://ssgoi.dev/blog/view-transition-api-limitations
- 内容：Pinterest 式 zoom 之外，`blur` 变体让**背景页缩到 0.88 + 中间加一层 backdrop**，前景详情独立浮起，注意力交接明确。
- **取了**：主页窗口打开时底层页面 `scale(.98) + 压暗` 的交接（数值收敛为 .98 而非 .88——织界窗口是大弹层不是全屏详情，退后感够用即可），关闭时还原；transform 只作用于应用根容器的视觉层，不动滚动状态。

## 未采用（附理由）
- Spline 3D 场景：本批是壳层系统迁移、无橱窗位新增，按既有纪律不引入。
- GSAP Flip 逐元素 morph（Codrops grid hover 一类）：成本与 Safari 兜底不成比例；本批转场用 CSS/VT 语义等价物，GSAP 只沿用既有主页入场编排的收敛版（身份零等待后，错峰仅限书架区）。
- Figma 先行：用户 2026-10-27 已拍板「代码直做 + 截图拍板」，本批交付物即全套截图，沿例不走 Figma。
