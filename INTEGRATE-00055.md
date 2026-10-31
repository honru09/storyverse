# INTEGRATE-00055 — REQ-73 化身衍生图 × hero-flatten 集成波处置笔记

日期：2026-10-31。基线：origin/main `ab438eb`（00054 生产版）。本地主仓 main（c3cd883）为坏基线，全程未动、未用；合并与提交全部走 GitHub API 服务端完成。

## 1. 合并链（main 提交序）

| 提交 | 内容 |
| --- | --- |
| `ab438eb` | 基线（00054） |
| `9ca61a5` | 服务端合并 avatar-derivatives（`b9d0617`，REQ-73）→ main，无冲突 |
| `cafe0ac` | 服务端合并 hero-flatten（`3b476fa`）→ main，无冲突 |
| `17e8ea9` | 复核修复 ISSUE 2-1（server/avatar-derivatives.js） |
| `ae736a2` | 复核修复 ISSUE 3-1（src/main.jsx） |
| `2e3d4b2` | 跨批漏 4b 修复（src/story-engine.js） |
| `00d93b5` | 跨批漏 4b 修复（server/gemini.js） |
| `2f30baa` | 4b 钉子测试（tests/fusion-integration.test.js） |
| （本笔记提交） | INTEGRATE-00055.md |

五个修复文件的远端 blob 与本地验证版逐字节一致（git hash-object 对账通过）。

## 2. 测试对账（全新 clone，内容与 main blob 级一致）

- 合并后未修：1181 测试 / 1176 过 / **5 败**。
- 全部修复后：**1183 测试 / 1178 过 / 5 败**（新增 2 颗 4b 钉子测试）。
- 5 败恒定为已知环境基线：tests/dedup-fix.test.js ×5，夹具图 `dedup-shots/fixture-*.png` 未入库的 ENOENT。
- 全量跑曾间歇出现第 6 败（import-daylight:180 / forge-trim:184 轮换）：对照实验——把本波修复全部还原、在 pristine `cafe0ac` 上跑全量同样出现第 6 败且文件不同；涉事测试单跑均全过。定性：全量并行下的时序/负载 flake，非本波回归。gemini-server 静态托管 EPERM 漂移族本波各轮均未出现。

## 3. Gemini 复核处置（gemini-4-argon-high）

第一轮单调用因 diff 过大撞 agy 10 分钟打印超时、零产出；拆为调用 A（本波 diff，事项 1–3）与调用 B（三处跨批漏）后完成。调用 A 总判定：**有条件上线**，条件即下列修复，均已处置。

- **事项 1（两批互相踩）：PASS** — 共享文件无冲突残留/重复定义/悬空引用；art-edges、`--face-*`、三层 hero 图名在运行时代码中已清净。
- **ISSUE 2-1（中）懒烘焙并发：FIXED**（`17e8ea9`）— 立绘路径：按 (uid, slot, sourceStamp) 进程内单飞 + 写回前重读源槽校验 stamp（源已变/已删则只答不写，杜绝旧图覆盖与孤儿槽复活）。上传头像 face 路径：只做单飞、不做写前重读——调用方（saveMyPicture 落盘后、picture() 读取后）传入的都是刚读/刚写的记录，且读路径恒按当前 picture 记录的 stamp 门控，残留竞态最坏是留下一条 stamp 不符的记录、下次读自动重烘；此点为有据的部分反驳。
- **ISSUE 2-2（低）`deletePictureFace` 未被调用：REBUTTED** — 产品内不存在删除上传头像的流程：deletePicture 与 deletePictureFace 同为存储层对称 API、均无调用点；pictureKind 切走只是显示选择，上传图按设计保留可再选回（server/social.js:966 以 getPicture 存在为再选前提）；face 记录恒按当前 picture 记录的 stamp 门控读取，不可能被串供。按 Gemini 原建议在切走时删 face 反而会给保留中的上传图留下无谓重烘，弊大于利。
- **ISSUE 3-1（低）hero 呼吸补间首帧覆盖：FIXED**（`ae736a2`）— `.genre-hero-baked` 的呼吸由 `gsap.fromTo` 改 `gsap.to`，承接入场落点 1.04，不再 immediate-render 压掉入场首帧。
- **hero 产物 404 担忧：REBUTTED（附部署后实测项）** — `public/art/hero-genesis-baked-1122.webp`（51,728B）与 `-640.webp`（23,916B）均在仓内、RIFF/WEBP 头校验通过；上线后仍按第 5 节清单实测线上 200。
- **§5/§59 令牌一致性** — DESIGN §5 动效表已按烘焙单图改写（--dur-hero-in、环体呼吸改整图缩放、星尘漂移退役留档）；§58 已标注退役、被 §59 取代；face 288×288 / portrait 3:4 口径在 §59、服务端实现与回填脚本三处一致。

## 4. 三处跨批漏核查（调用 B + 主执行方独立复核）

- **4a REQ-61×59（合流简报宿主世界草稿）：已不存在** — 合流按 REQ-61「融合新世界、不以任何原作世界为宿主」口径有意不带宿主草稿，代码注释明确（story-engine.js createMergedStory 世界名/设定清空处、storyBeatPlan merged 分支、gemini.js compactConfig/contextFor 的 merged 门控）；各源世界经 sourceWorlds + 各源 worldBible 等价传递。
- **4b REQ-61×57（融合线单人能力描述）：仍存在 → FIXED**（`2e3d4b2`/`00d93b5`/`2f30baa`）— 实锤：合流顶层 abilityDesc 按 REQ-61 裁定清空是对的，但逐人携带只做了 anchors/abilityBounds（REQ-69 W5），**每位主角的能力效果描述（abilityDesc）从未进入 protagonists**，合流简报只有全员能力名拼接与边界，模型不知道每个能力具体做什么。修法与 W5 同构：createMergedStory 的 protagonists 逐人带 abilityDesc；storyBeatPlan 合流分支逐人复述「能力·姓名：能力名（效果）」；compactConfig 逐人透传（clip 120，同单人口径）；顶层 ability 拼接加 filter(Boolean) 去空槽悬挂。钉子测试 2 颗（逐人描述进简报 + 空槽不悬挂）。Gemini 报告中「无单人在场章节分支、双人模板文案」的扩大化部分反驳：合流章节按产品定义即双主角共演，全员入简报是设计而非漏。
- **4c REQ-57×58（化身签名覆盖）：已不存在** — ability 三态（带键为准含 null 清除 / 无键保留存量）在 src/avatar.js validateAvatarProfile 与 server/avatar.js validatedProfile 双层实现；save/create/generate 全部写路径都经 validatedProfile(body, existing)，重绘 produce 的三次 commit 均以展开保留 ability。Gemini 与主执行方独立读码结论一致。

## 5. 部署与回填

部署（Cloud Shell，全新克隆，**绝不带 env 标志**）：

```bash
cd /tmp && rm -rf storyverse-00055-deploy
git clone https://github.com/honru09/storyverse storyverse-00055-deploy
cd storyverse-00055-deploy && git rev-parse HEAD # 须含 2f30baa 及其后本笔记提交
gcloud run deploy storyweave --source.
```

部署后核验（逐项留实测值回填本节）：

- [] 新 revision 接管 100% 流量：revision 名 = ______
- [] `curl -sI https://story.tabarcade.online/` → 200
- [] `curl -sI https://story.tabarcade.online/art/hero-genesis-baked-1122.webp` → 200
- [] 官方号 face：`/api/users/username%3Astoryweave/picture?variant=face` 实测 288×288（回填脚本覆盖此项）
- [] 任一本书 portrait 变体实测 3:4（回填脚本覆盖）

回填预热（部署核验通过后，在部署克隆内）：

```bash
npm ci --no-audit --no-fund
node scripts/backfill-avatar-derivatives.mjs
```

默认五账号（storyweave / qingshan_ke / beichen_09 / nanqiao_07 / jiangfeng_walk），逐账号核对 portrait 3:4 与 face 288×288，脚本以退出码与逐行 OK/FAIL 输出为准：结果 = ______

## 6. 未证项（如实留账）

- 部署与回填未在本波执行（环境通道所限），见第 5 节交接清单；**00055 尚未上线**。
- REQ-73 截图矩阵在最终代码上仍缺：他人主页窗口（极光主题）、书城/详情 ×3 主题、状态矩阵（切化身/切主题/后台回前台）。补跑脚本已随本波入仓：`avatar-derivatives-shots/accept-rest.mjs`（在 avatar-derivatives worktree 或新 clone 中、起 fixture-server 后跑）。
- hero/衍生图相关动效未录屏验收，仅按 DESIGN §5 令牌逐项对位实现。
- 桌面 ≥700px 宽度未单独截图（本波验收口径为移动三档）。
- 一切视觉最终以用户 iPhone 真机点验为准。
