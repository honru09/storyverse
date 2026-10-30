# READER-PAGE 处置笔记（REQ-38 真翻页 + 逐屏默认 / REQ-39 封面→目录→正文）

基线 main aa1c098（线上 00045）。改动已全部落盘；**本地提交被沙箱写策略拦截**（git 写 .git/index.lock 报 EPERM，与 npm/服务器测试同因），须由主助手在其环境补提交。未 push、未部署。提交时文件清单：src/main.jsx、src/useReaderExperience.js、src/reading-preferences.js、src/reader-experience.css、src/reader-flow.css、tests/reader-page.test.js、tests/reading-preferences.test.js、e2e/reader.cjs、READER-PAGE.md。

## 实现要点

### REQ-38 翻页引擎（src/useReaderExperience.js）
- 机制：翻页时在 document.body 建舞台 `.page-reader.reader-turn-host`（复制阅读器根的主题/mode 属性与 --reader-* 变量），内含 track + 两张 sheet，各克隆一份 `.reader-layout`，克隆以 `translateY(docTop − sheetScrollY)` 对位（docTop = 捕获时 rect.top + scrollY），与真页像素一致；接缝处叠渐变阴影（`.reader-turn-shade-*`）给纸面深度感。
- 动画：WAAPI，300ms，站内弹簧口径 `cubic-bezier(.32,.72,0,1)`，fill forwards + watchdog 兜底；只动 transform/opacity，动画期间不重排分页。落定在动画结束帧做 instant scroll + capture + readProgress 同步，此刻目标 sheet 与真页重合，无闪跳。
- 连点：忙时进一深队列 `queuedTurnRef`，逐个 drain，不跳页不重页。
- 拖动跟手：横向 ≥9px 且 page 模式 + 动效开 + 未 blocked 才激活；章界方向不建台；track 1:1 跟手；完成判据 = 位移 > 26% 屏宽，或（速度方向对且 |v| > 0.45px/ms 且位移 > 36px）；收尾时长按剩余距离缩放，不过冲。
- 跨章：`beginCrossTurn` 先捕获旧章画面，换章后 `completeCrossTurn`（Reader 的 [index] layout effect 调用，内部再 defer 一帧等位置恢复先落定）把新章克隆为入页滑入；900ms watchdog 未完成则 fade 退化（如等待页换树）；`cancelCrossTurn` 兜底。
- 入口：点左右分区（既有 turnScreen）、键盘翻页都先走动画路径，失败回落原 instant 公式；chrome 上/下一章钮保持 instant 不变。动效关 / reduced-motion / 键盘输入法时 turnMotion=false，全部回落瞬时切换。

### REQ-38 逐屏默认（src/reading-preferences.js）
- `DEFAULT_READING_PREFERENCES.readingMode` 改为 "page"；偏好版本升至 5。
- 迁移判据（与主题 explicit 口径同理）：v<5 记录里的 `readingMode: "scroll"` 视为冻结的旧默认，迁为 "page"；v5 里显式存下的 "scroll" 永不迁。`update()` 写 version 5。

### REQ-39 前置页（src/main.jsx + src/reader-flow.css）
- Reader 每次挂载先进封面页（`frontStage: "cover" → "toc" → null`）；重置 effect 只依赖 [story.id, readOnly]，生成落章（revision 变）不会让封面重现。
- 封面页：既有封面优先级链（StoryCover 传 genreOf/coverSources）、书名、作者/主角行、进度文案（完结/无限连载/常规三分支）+「翻开目录」；点右侧/左滑或按钮进目录页（track 横滑 320ms，离开进正文整层滑出 330ms；动效关时瞬时）。
- 目录页：完全复刻阅读器内 ChapterDirectory 语义（章号 padStart、标题/「故事待续」、正在阅读/尚未分享/继续阅读后开启状态、锁定位）+ 主按钮「开始阅读/继续阅读 · 第 N 章」直达进度章；点已解锁章行直接进该章正文。
- 前置期间 Reader 的 blocked 追加 `frontStage !== null`：正文恒挂载于覆盖层之下，不触碰 prepare 效应、openedThrough 与预生成；前置页不计章节进度。返回落点仍走既有来源页规则；合流线/手写书同路（readOnly 时作者行显示作者名）。

## 测试

- 单测：**860/860 全绿**（基线 850 → +10：reader-page 源码 pin 6 条、迁移测试 4 条，另更新 3 条随版本/默认变更的旧断言），连续两轮全量 + 一轮回执确认。build 通过（仅 chunk 体积警告）。
- 其后本机沙箱策略变更（写文件 EPERM，npm 自身日志亦被拦），服务器类测试（gemini-server / release-safety 的 fixture 写文件）开始报 EPERM 失败——失败点在测试自身写 fixture，与本批改动无关；import-daylight 的 backup-merge 在高负载全量下偶发失败，隔离跑 8/8 通过，属既有负载 flake。
- e2e（reader.cjs，WebKit/WPE）：加了过前置页的 `passFrontMatter` 步（进书后与 reload 后各一次）与滚动偏好钉住（本套件的滚动行为检查是按旧默认写的，首次写入 v5 scroll，不覆盖后续检查自存的设置）。在浏览器栈失效前的一轮 WebKit 实跑中套件完成运行（12 条 PASS 输出，3 处 waitForFunction 超时，集中在按滚动默认写的位置恢复/章节末检查）；该轮与双开跑次资源竞争并行，超时定性未最终确认。**失效后未能重跑确认——见下节。**

## ⚠️ 环境阻塞（截图未完成，须复跑）

- 本地 WebKit（WPE）一度复活：配方 = noble 的 mesa/glvnd deb 解包至 /tmp/wklibs + 往 minibrowser-wpe 的 sys/lib 补 libEGL.so.1(.1.0)/libGLESv2.so.2(.2.1.0)/libGLdispatch.so.0(.0.0)/libEGL_mesa.so.0(.0.0)（原缺 libGLESv2.so.2 真身、只有断链）+ launch env 四件套（__EGL_VENDOR_LIBRARY_DIRS、LIBGL_DRIVERS_PATH 指向 /tmp/wklibs 对应目录、EGL_PLATFORM=surfaceless、LIBGL_ALWAYS_SOFTWARE=1）。/tmp/wklibs 的备份在 ~/workspace/webkit-libs-backup（VM 重启后可恢复）。
- 复活后 reader 套件真实跑过；其后 VM 浏览器栈整体失效：WebKit WPE、Chromium headless-shell、完整 Chromium 三种二进制均在启动/首帧静默死亡（无 stderr、data: 文本页可开、任何带合成的页面崩），同期沙箱写策略收紧（EPERM）。判断为 VM/运行时层变化，非本批代码问题。
- 因此验收要求的 **WebKit × 360/390/430 翻页帧序截图与封面/目录三主题截图未产出**。截图脚本已备好：/tmp/rp-seed.mjs（用仓库自身 createStory/buildChapter/saveLibrary 造《沉潮港纪事》24 章 + 无限连载《雾岭夜行人》种子）与 /tmp/rp-shoot.mjs（帧序以 .reader-turn-track 的 computed transform 实测值分类、含拖动跟手帧、默认值三案断言）。环境恢复后拷 rp-shoot.mjs 进仓库根目录直接跑即可（输出 reader-page-shots/，不入库）。
- 按阅读页验收终版标准，本批最终门仍是用户真机点验；部署前请先在健康环境补齐上述截图矩阵。
