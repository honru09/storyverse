# REQ-71 参考功课（造世面动效升级 + 专属素材）

开工前查阅并留档。只借思路与参数口径，不复制任何站点的素材与代码。

## 主视觉（自由创世黑洞）

1. **Awwwards Elements — “Black Hole Interaction”**（收录于 Interactive Hero 元素页）
   https://www.Awwwards.com/inspiration/interactive-hero-joinercad
   借：黑洞主视觉的分层构成——亮光子环 + 引力透镜弧 + 吸积盘，不是平面漩涡贴图；
   hero 层与正文层分离、动效只动视觉层。

2. **NASA Goddard 吸积盘可视化**（APOD 2024-05-08）
   https://science.nasa.gov/image-article/apod-2024-may-8-visualization-a-black-hole-accretion-disk/
   借：写实口径——薄而亮的吸积盘、朝向观察者一侧因多普勒效应更亮（左右不对称）、
   光子球细环。生成素材的提示词按此写，避免生成成“紫色漩涡”。

3. **Codrops — Two Portfolios, One Process**（2025-12-02）
   https://tympanus.net/codrops/2025/12/02/two-portfolios-one-process-where-design-motion-and-code-come-together/
   借：GSAP 时间线让多层圆环以 stagger 0.12 依次淡入；每层不同转速；
   正弦“呼吸”（sin 驱动的周期伸缩）——对应本批：hero 分层错峰入场、
   环层差速慢转、辉光呼吸（全 transform/opacity）。

## 卡片入场与视差

4. **Codrops — Building an Infinite Parallax Grid with GSAP**（2025-06-11）
   https://tympanus.net/codrops/2025/06/11/building-an-infinite-parallax-grid-with-gsap-and-seamless-tiling/
   借：入场时瓷砖自中心向自然位错峰散开（stagger 0.05、expo 缓动）；
   多层以不同速度视差。本批取其“错峰 + 分层差速”口径，用在书架卡入场与
   hero 滚动视差（星云层慢、环层中、星尘层快）。

5. **Codrops — Sticky Grid Scroll**（2026-03-02）
   https://tympanus.net/codrops/2026/03/02/sticky-grid-scroll-building-a-scroll-driven-animated-grid/
   借：列内 stagger 0.06 的节奏感——本批步骤内容揭示的错峰步长取 60ms 量级。

6. **Godly / hoverstat 式卡片悬停口径**（卡片 hover 汇总惯例）
   借：卡片反馈只动 transform/box-shadow——抬升 translateY(-4px) 级、图 scale 1.04 级、
   250ms 量级。本批是移动端为主：落为 :active 按压 scale .97 回弹 + 选中态
   边框辉光呼吸一次，不做 hover 依赖。

## 落地约束（本仓既有纪律，优先于参考）

- GSAP 3.15（已装）；动效总开关 + prefers-reduced-motion 为上位约束
  （policy.animate=false 时全部静止、内容完整呈现）。
- 只 transform/opacity，保 60fps；弹簧口径 ζ≥1 默认不回弹（DESIGN §53）。
- §53 盐系/毛玻璃与渐进模糊不破；不碰 REQ-70 的 .profile-showcase 与小头像位。
