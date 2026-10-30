# REQ-48 — 化身展台「无头」定案与修复

分支 `avatar-fix`（基线 main 49e0a66）。只落码，不合 main、不部署。

## 症状

用户在 00048（黑主题、Safari）打开自己的主页：半透明顶栏之后隐约透出
人物的头发和笑脸，亮卡内只剩脖子以下。看别人的主页（窗口）同样无头。
每次打开都这样，不是偶发。

## 真机制（实证，非推测）

主页有**两套滚动记忆**，都会把上次的停点逐字恢复，且都没有任何
防切片钳制：

1. `ProfileView` 的 view-state（`src/profile-cache.js`，内存 Map 按 uid
   记 `scroll`）——窗口打开与组件重挂时由 ProfileView 的恢复 effect
   恢复（窗口滚动体是 sheet 列身、页面形态是 window）。
2. 壳层 keep-alive 记忆（`scrollPositionsRef`，`KEEPALIVE_VIEWS` 含
   `"profile"`）——底栏标签往返时 ProfileView 不卸载，由壳层路由
   effect 用 rAF 把 `window.scrollTo(0, saved)` 恢复。

当记住的停点恰好让 481px 高的展台卡横跨固定顶栏，恢复就把卡精确
停回那个位置——每次回来都复现切片。锚点跳转路径本来有
`scroll-margin-top: 84px` 保护（实测 scrollIntoView 落位
stage.top = 83.8，安全）；**只有逐字恢复路径裸奔**。

像素取证（用户截图 1179×2556 @3x）：展台卡宽 361pt、卡顶 ≈ −68pt
（web 坐标），顶栏底边 ≈ 71pt（web）；立绘为 contain 绘制
351.4×481.3，头部带（图内 6%–24%）整段落在顶栏之后——顶栏黑底
.88 + blur 近不透明，所以头只「隐约透出」。与几何完全自洽。

fixture 量测（WebKit 393×852、黑主题、honru 式真实状态：默认织线
头图 + 阿灿真图 768×1052 + 5 位好友）：

- 顶栏高 71px；展台 361×481.3；page 形态 scrollHeight 1961、
  maxScroll 1109，展台 docTop 1010。
- 修复前复现（底栏真实导航 广场→主页，两轮）：停点 scrollY=1080
  被逐字恢复，stage.top = **−70.2**，头部带 −41.3..45.3 整段在
  71px 顶栏之后。截图 `avatar-fix-shots/repro-p4-cycle1.png` 与
  用户报障图同构。
- 窗口形态（393×667）：sheet top 40、高 94dvh；停 sheetScrollTop=973
  时 stage.top = **−0.2**，关窗重开后逐字恢复、仍切片（安全线 =
  sheet.top + 30 = 70）。852 高度下窗口内容短，展台最浅只能到
  top 166.9，切不到——所以窗口侧要在较矮视口才触发，这也是之前
  干净 fixture（无好友、内容更短）测不出来的原因之一。
- 两表面共用同一恢复裸奔机制，与账号数据无关——与用户「看别人
  主页也无头」的追加报障一致。

此前 FIX3/FIX4/REQ-46 的量测都没错（contain、scroll-margin 都
成立），只是都没测「带记忆停点的恢复」这一条路径。

## 修法

新增 `src/profile-stage-guard.js`，恢复后守卫：

- `stageParkScrollTop(...)`（纯函数）：展台横跨安全线（top 在线
  上方、卡身还在线下方）时，返回把卡顶恰好停到安全线上的滚动
  位置；不横跨（未到/已完全滚过）一律返回 null 不干预。停车位
  = 展台文档位 − 安全线，横跨时必然在滚动范围内（数学上可达，
  橡皮筋过冲时钳制到范围端）。
- `stageParkTarget({windowForm, root})`：量测安全线——page 形态
  = 顶栏底 + 8（量不到顶栏回落 84）；窗口形态 = sheet 顶 + 30
  （让开顶部抓柄浮层带）。
- `armRestoredStageGuard({windowForm, root, saved})`：在恢复后的
  200/600/1200/2000ms 检查；守卫记住预期位置，实际位置偏离
  >2px 即认定用户自己在滚、立即退场，绝不抢滚动。

武装点（两处恢复全覆盖）：

- `ProfileView` 恢复 effect：替换原地武装，page/窗口两形态共用。
- 壳层 keep-alive 路由 effect：view = 本人主页且 saved > 0 时
  同样武装（底栏往返不重挂 ProfileView，这是用户实际命中的
  路径，第一版只守 ProfileView 时实测仍切片，轨迹坐实后补上）。

不改布局、不改构图：展台仍可自由滚过顶栏（阅读中的普通滚动
位置不受影响），只修「恢复落点」。§53/§54、极光色值、主页豁免
毛玻璃均未动。

## 验收（最终构建，WebKit 393×852 / 393×667）

- `walk2.mjs verify`（底栏路径，两轮）：P4 cycle1/cycle2 轨迹
  1080 →（守卫）→ 930，stage.top −70.2 → **79.8**（= 顶栏底 71 +
  间隙 8），头部带 108.7..195.3 完整在顶栏下方、卡框内。
  `verify-p4-cycle1.png` 亲看：全头在卡内。W2（窗口 852）安全。
- `walk3.mjs verify`（窗口 667）：重开后安全（本沙箱窗口恢复有
  竞态、多次落到 0 的安全侧；切片侧的逐字恢复已在修复前同表面
  复现，守卫窗口分支的停车数学由单测按实测数钉死：973/−0.2/
  安全线 70 → 902.8）。
- `walk.mjs verify`（P0–P3 三主题矩阵，守卫 v1 构建下跑；几何与
  守卫内部无关）：加载位、锚点位、极光/白恢复位全安全。
- 单测：`tests/profile-stage-guard.test.js` 9 条全过（两表面的
  实测数、边界、钳制、常量钉死、main.jsx 双武装点源码断言）。

全量 `node --test tests/*.test.js`：898 条（基线 889 + 新增 9），
891 过、7 红，7 红全部与本批无关且已逐一溯源：

- dedup-fix ③a ×5：读未入库的 `*-shots/` 夹具图（ENOENT）；
  主树同码同夹具 13/13 全过。
- gemini-server 静态托管 ×1：测试自身写文件被沙箱写策略 EPERM；
  主树同测此刻同样 12/13、同点红。
- import-daylight 备份合并 ×1：全量并行时资源争用红，隔离跑 8/8 过。

## 环境备注

本会话后段 VM 内存被并行任务吃紧（可用 ~190MB），WebKit/Chromium
启动相继失败，walk4（窗口暖缓存双重开）未能在最终构建上补跑；
窗口守卫的实弹轨迹未拍到，靠单测实测数 + 同代码路径的 page 形态
实弹轨迹背书。父级合并前若浏览器环境恢复，建议补跑：
`avatar-fix-shots/` 下 `PORT=8963 node fixture-server.mjs` 起夹具、
seed 后 `node walk4.mjs webkit http://127.0.0.1:8963 verify`。
