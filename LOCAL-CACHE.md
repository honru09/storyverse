# LOCAL-CACHE（REQ-50）处置笔记

用户报障（2026-10-30 23:32）：iPhone Safari / 桌面网页 App 每次打开本站都全量重新加载，图片、封面、素材每次重新下。要求：素材本地缓存、打开先用本地的；**总量不要太大**。

分支 `local-cache`，基线 main `1001e79`。本批只本地提交，未 push、未部署。

## 一、现状定案：为什么每次全量重下

开工实查（基线代码）结论，三条叠加：

1. **/api 图片零协商、只活 5 分钟**：全部 9 个图片端点（自有封面 `/api/cover`、自有立绘 `/api/avatar/image`、他人立绘/头像/头图 `/api/users/:uid/{portrait,picture,banner}`、书城/广场封面与立绘 `/api/{store,plaza}/:id/{cover,portrait}`）一律 `Cache-Control: max-age=300`，且**不发 ETag / Last-Modified**。5 分钟一过，浏览器手里没有任何校验器，只能整图重下——这是「封面每次重新下」的头号根因。
2. **静态文件只活 1 小时、无 immutable、无 ETag**：`serveStatic` 除 HTML（`no-cache`）外一律 `public, max-age=3600`。带内容哈希的 bundle（`index-*.js`，文件名即版本）本可永久缓存，也被拖成 1 小时后全量重下；`/sw.js` 本体同样吃 3600，SW 更新检查最长被拖 24 小时。
3. **SW 不管图片、壳只运行时填充、无上限**：既有 SW（F-18 离线壳，`storyweave-v2`）只 cache-first 了 `/assets /art /fonts` 与图标，**完全不接管 /api 图片**；壳无安装期预缓存（首次访问时边下边填）；所有缓存**无体积上限、无淘汰**。另：全站无 `navigator.storage.persist` 调用。

素材体积实测：`public/art` 全量 85 件共 5.9MB，`public/fonts` 160KB——静态素材本身不大，40MB 上限对 API 封面/立绘留有充足余量。

## 二、落码：三层策略

### 1) 服务端 HTTP 头分层（server/index.js）

统一图片出口 `sendImage()` + 内容 ETag 助手（`sha256 前 16 位-长度` 强 ETag；正文在每个出口本就全量在内存，哈希成本可忽略）：

| 对象 | Cache-Control | 协商 |
|---|---|---|
| `index.html`（含 SPA 回落） | `no-cache` | ETag，复访 304 |
| `/sw.js` 本体 | `no-cache` | ETag，复访 304 |
| `/assets/*`（哈希构建产物） | `public, max-age=31536000, immutable` | ETag 附带 |
| 其余静态（`/art/*`、fonts、图标、manifest、theme-init） | `public, max-age=604800`（7 天） | ETag，过期 304 续期 |
| 版本化公开封面（`/api/{plaza,store}/:id/cover?v=N`） | `public, max-age=31536000, immutable` | ETag 附带（URL 已含 cover version，见 server/plaza.js:300） |
| 其余公开图（portrait/picture/banner、无 v 封面） | `public, max-age=86400`（1 天） | ETag，过期 304 续期 |
| 私有图（`/api/cover`、`/api/avatar/image`） | `private, max-age=86400` | ETag，过期 304 续期；`private` 保证共享缓存永不存 |

原 9 处手写 `max-age=300` 响应块全部收敛到 `sendImage()`，代码净减。

### 2) Service Worker v3（public/sw.js）

- **版本**：`storyweave-v2 → v3`（沿 REQ-35 教训：不 bump 则存量客户端永不换缓存）。activate 保留名单 = 壳 v3 + 数据 v3 + 媒体缓存；离线数据缓存随壳版本轮换（与 v1→v2 同口径，下次拉取自动重建）。
- **壳预缓存**：install 时整表重建壳缓存（保证恰好一份当前壳，不堆旧 bundle），抓 `/` 文档并解析其引用的 `/assets/*.js|css` 一并 `addAll`，加核心静态（theme-init、manifest、icon、默认头像）。失败自动退化为旧的运行时填充，不装坏。
- **媒体缓存 `media-v1`（不带壳版本，跨部署保留）**：公开图（`/art/*`、`/api/{plaza,store}/*/cover|portrait`、`/api/users/*/{portrait,picture,banner}`）走 **cache-first + 后台更新（SWR）**：命中先回本地、后台 fetch 换新并触发淘汰检查。
- **硬上限**：`MEDIA_MAX_BYTES = 40MB` 且 `MEDIA_MAX_ENTRIES = 300`，双限任一超标即从最旧开始删到达标。淘汰序按响应自带 `Date` 头（≈上次网络刷新时刻；SWR 刷新即续期）——近似 LRU，命中时零元数据写入、无写放大，取舍在此明示。
- **私有图不进 SW**：Cache Storage 按源隔离、**不按账号隔离**，同设备换账号会串图；私有图只走浏览器 HTTP 私有缓存（服务端 `private`+ETag 已保证复访走 304）。
- **JSON 数据**：F-18 既有 `/api/library`、`/api/plaza` network-first 数据缓存**维持现状未动**（本批只管壳与素材）。
- **更新接管取舍**：维持既有 `skipWaiting + clients.claim`；导航保持 network-first——新部署在下一次打开时必达（新 index.html + 新 SW 安装激活、清旧壳），**不强制 reload 正在阅读的页面**，不打断阅读；新壳在下一次导航/资源请求时自然接管。用户不会困在旧版，也不会读着读着被刷新。

### 3) 客户端（src/main.jsx）

SW 注册后调 `navigator.storage.persist()` 申请持久化存储（失败/不支持静默）。

## 三、iOS 真实边界（如实，不承诺）

- Cache Storage 与 HTTP 缓存都是**浏览器可回收存储**：iOS 在存储压力下会清；Safari 对长期不访问的站点脚本可写存储有清理策略。主屏幕网页 App 形态通常更宽松，`persist()` 在 Safari 上可申请但**授予不保证**（本机无头 Chromium 实测 `persisted=false`，属引擎按互动热度裁量）。
- 因此口径定死：**缓存是加速层，不是资产层**。被清掉后下一次打开自动重建、功能零影响，只是那一次重新下载。任何「永不失效」的说法都是假的，不写。

## 四、验收实测（CACHE-VERIFY.mjs，真构建 + 真 Chromium）

服务端协商（过期复访带 If-None-Match）：

| 资源 | 首次 | 复访 |
|---|---|---|
| `/art/city-1122.webp` | 200 · 331,046B | **304 · 0B** |
| `/assets/index-*.js` | 200 · 954,243B | **304 · 0B** |
| `/` | 200 · 2,285B | **304 · 0B** |

浏览器二次打开（同一 context 二次加载）：
- 首次打开：29 个响应，bundle 网络字节 1,227,661B。
- 世界图二次请求 3/3 由 SW 直接交付（city 331,046B / court 319,998B / banner 120,922B 均本地命中）。
- **第二次打开：28 个响应中 25 个由 SW 交付，壳资源打到网络的请求数 = 0。**
- 媒体缓存自然使用量：22 条 · 1,471,212B（≈1.5MB）；`storage.estimate` 总占用 ≈4.46MB。

淘汰实证（独立探针）：对同一世界图以 160 个不同 query 键连续写入（≈53MB）后，媒体缓存收敛为 **126 条 · 41,711,796B ≤ 41,943,040B 预算**，保留键 pad=34…159——最旧的先出、最新的全留，上限与顺序均成立。

## 五、测试

- 新增 `tests/local-cache.test.js` 3 例全过：静态三档头 + art 304；API 图（immutable/公开 1 天/私有 private）+ 304；SW v3 结构（预缓存、上限常量、淘汰函数、私有路由不进媒体名单、persist 调用）。
- `tests/device-fix3.test.js` 的 REQ-35 版本守卫断言同步 v2→v3（守卫意图=版本须随壳前进，不变）。
- 全量：**914 条，过 909，失败 5**——恰为基线既有环境失败集 `dedup-fix` 样本图 ENOENT×5（新 worktree 无 `avatar-shots/` 等本地样本目录）；`import-daylight` 首轮见一次、复跑通过（既有 flake 口径）。本批相关面（local-cache/device-fix3/shell-migration/import-daylight）复跑 43/43。
- `npm run build` 通过；验收脚本 `CACHE-VERIFY.mjs` 随批提交（跑法：build 后 `node CACHE-VERIFY.mjs`）。

## 六、未做 / 边界

- 未 push、未部署（派单口径，待主助手集成）。
- 离线数据（章节正文等）缓存策略不在本批：F-18 数据缓存原样保留。
- 生产 Cloud Run 前若有 CDN/代理层，其对 `private` 与 immutable 的处理上线后需按老规矩线上亲验（bundle 比对 + 头抽查）。
