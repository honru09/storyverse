# REQ-58 处置笔记：新建化身在个人主页不显示

- 报障：2026-10-31 00:02，用户（honru/@hongrun01，主化身「阿灿」）在生产 00049
  新建了一个化身，回到个人主页（主页标签页）化身区里没有它；同日 00:07 真机截图
  再次实锤：化身排只有「阿灿 + 新建化身」。
- 分支：`avatar-profile-missing`，基线远程 main `1001e79`。本地提交，不 push 不部署。

## 根因定案（客户端档案缓存失效线缺失）

个人主页标签页（page-form `ProfilePage`）化身区读的是**公开档案 payload** 的
`profile.avatars`，payload 经 `src/profile-cache.js` 的内存 SWR 缓存获取。而：

1. 主页标签页在 keep-alive 壳内常驻不卸载，数据 effect 依赖 `[uid, getToken,
   viewerUid]`，切回标签页永不重跑，只能靠 `subscribeProfile` 的通知更新。
2. `loadProfile` 全应用只有两个调用点（主页挂载、App 空闲预取），都发生在化身
   创建**之前**。
3. 化身一切变更（创建+生成立绘、保存资料、设为主化身、删除）只更新
   `useAvatarProfile` hook 的本地 state，从不触发本人档案重新拉取；其他写穿缓存
   的路径（关注切换、资料编辑保存）都是展开旧 profile 对象，`avatars` 照样是旧的。

于是档案缓存整场会话停在创建前那一帧，新化身不显示；整页刷新（缓存是纯内存态）
即恢复——与报障现象完全吻合。

### 证据

- 代码走查逐段对位（创建写 `avatars` 集合记录 → 档案接口 `social.profile()` 读同一
  记录的 `avatars` 全量摘要 → 主页 payload 驱动渲染），断裂点只在客户端缓存失效。
- 服务端集成测试（真实 avatar 服务 + social 服务共享内存 store）：建第 2 个化身后
  `profile()` 的 payload 立刻含两人——服务端无责（tests/avatar-profile-missing.test.js）。
- 真实应用走查复现（fixture 服务器 + Chromium 390×844，用户原路径）：修复前包体上，
  应用内建完「沈砚」不刷新回主页，化身排仍只有 [阿灿、新建化身]
  （`avatar-missing-shots/repro-*`）；修复后同路径为 [阿灿、沈砚、新建化身]，
  零 pageerror（`avatar-missing-shots/verify-*`）。

## 排除的怀疑面

- ① 主页只读主化身/单个 avatar 字段：否。主页化身区由 payload.avatars 合成，
  服务端 payload 本就含全部化身。
- ② 创建云端同步失败被静默吞掉：否。服务端集成测试证明创建即落记录、档案即读出。
- ③ keep-alive 视图不刷新：**部分成立**——视图本身有订阅机制，是「没人通知它」
  而非「它不听」；根因记在失效线缺失。
- ④ 立绘未生成完被展示过滤：否。主页对无立绘画身有字母回落 tile，不按立绘状态过滤。
- ⑤ 老账号旧结构没迁移：否。`collectionFromRecord` 读时迁移旧单化身记录，兼容用例
  已钉（同测试文件）。
- SW 缓存：`public/sw.js` 只缓存 /api/library 与 /api/plaza*，不碰档案与化身接口。

## 修复（最小，两处）

1. `src/avatar.js` 新增纯函数 `avatarCollectionSignature(avatars, mainId)`：以
   `id:名字：立绘状态：立绘版本` 逐行 + 主化身 id 拼成内容签名；内容相同、数组
   换新引用时签名不变。
2. `src/main.jsx` App 内新增 effect：签名变化且本人档案 hook 已加载时，对本人
   payload 调一次 `loadProfile({ viewerUid, uid: viewerUid, … })`——其后台重拉会
   写穿缓存并 notify 订阅者，常驻的主页标签页就地更新。无循环：loadProfile 不碰
   avatarState；refresh 回相同内容时签名不变、effect 不重跑。此线同时覆盖创建、
   重画立绘落地、改名、设为主化身、删除五种变更。

与 REQ-57 错开：不新增化身字段、不动能力逻辑，只修显示链。

## 用户存量自愈

陈旧数据只存在于会话内存（档案缓存不落盘）。修复上线后，用户下次打开应用，
任何一次化身变更即触发重拉；即便不做任何变更，整页冷启动本来就会拉新 payload。
本人账号无需任何数据迁移或手动处理。

## 测试

- 新增 `tests/avatar-profile-missing.test.js` 5 条，全过：
  服务端链钉死（建第 2 个化身 → 档案 payload 立刻两人）、旧单化身记录兼容、
  签名函数语义（新增/切主/重画/改名变、内容等价不变）、客户端链（真实
  profile-cache/avatar/users 模块 + 假后端：创建本身不达缓存 → 修复所接的
  重拉调用使订阅中的主页收到两人）、main.jsx 接线源码断言。
- 全量：916 条，911 过，5 败 = 既有环境基线（dedup 样本图 ENOENT×5，worktree
  无样本图，与本批无关）；`npm run build` 通过。
- 截图（390×844，worktree `avatar-missing-shots/`）：
  `verify-avatar-zone.png` 化身排 [阿灿、沈砚、新建化身]；
  `verify-step1/step2` 全页对照；`repro-*` 为修复前同路径复现（只有阿灿）。

## 待办（不在本批）

- 本批只本地提交；随下一波集成部署后，用户真机复验：新建化身 → 回主页应即时出现。
