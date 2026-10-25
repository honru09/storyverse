# 织界 Storyweave

一个由读者选择驱动的手机端互动小说客户端：选世界、建角色、读故事，在少量关键节点改变剧情。

当前0.3是阅读体验升级候选，保留本地预设体验及Gemini异步服务端。东京Cloud Run旧版本已经存在；本轮是否发布须查看 [阅读升级验收](docs/READER_UPGRADE_VERIFICATION.md)，不能把本地构建当成已上线。Google＋邮箱身份代码已实现但真实Firebase尚未初始化配置，见 [账号接入](docs/AUTH_SETUP.md)。可信额度、云书架、在线书城、真实多人和支付未实现，不能称为已可收费商用。

**最新视觉方向为年轻、轻快、全站 Apple iOS 毛玻璃，阅读内保持一致。** 六种阅读主题、14–32号、字体与高级排版、段落续读、查找/位置书签、专注/逐屏和设备支持时常亮已接线。玻璃用于工具栏和面板，正文保持实色。先读 [产品约束](PRODUCT.md)、[页面构成](docs/UI_SURFACE_BRIEF.md) 和 [交接入口](docs/PROJECT_HANDOFF.md)。

## 运行

Node.js 22.12+（推荐 24），使用锁文件安装依赖：

```bash
npm ci
npm run dev
```

不配置模型时仍可使用本地预设体验。需要 Gemini 时，复制 `.env.example` 为本机 `.env`，填写服务端密钥，并在另一终端运行：

```bash
npm run api
```

默认 API 端口为 8787，Vite 开发服务代理 `/api`。密钥不得放入前端变量、备份或提交记录。构建后的同源本地运行：

```bash
npm run build
npm start
```

当前接口为 `GET /api/status` 和 `POST /api/generate`。后者接收 `{ story, index }`，返回 `{ chapter, key, worldBible? }`；首章包含世界规则、结局方向和六章大纲。

## 已有流程

- 造世草稿可恢复；真实信息选填。AI 开局支持等待、取消、明确失败和手动重试。
- 阅读时最多领先准备一章；未决节点暂停预取。改选作废未来正文，旧请求不能写回新分支。
- 六章体验支持目录、回看、终章、刷新及浏览器历史导航。
- 两本不同本地单人书可合流成独立第三本书，原作保留；AI 合流使用两部原作的有限世界规则、摘要和选择。
- 分享保存本机只读副本。AI 分享展示实际正文并要求人工复核；自动替换不能保证删除所有可识别线索。
- JSON 备份恢复、损坏存档保护、存储失败重试、跨标签冲突提示及未保存进度提示已接入。
- 手机保留原生阅读滚动，支持减少动态和键盘焦点；有移动端 manifest，但没有离线 service worker。

## 验证与交接

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

2026-10-22 最新升级验证：183项单元测试、构建、36项原端到端与16项新增体验检查通过。60张截图覆盖320/390/445/1440px，检查图片、溢出、触控和造世动作遮挡。独立复核的夜间导航对比问题已修复并判定resolved，最终ship仅覆盖该修复。见 [升级验收](docs/IOS_UPGRADE_VERIFICATION.md)；这些结果不代替真实账号、真机、收费模型或云部署验收。

[交接记录](docs/PROJECT_HANDOFF.md) 是下一位 agent 的入口；[对话摘要](docs/CHAT_LOG.md) 不是完整逐字聊天导出；[skills 使用记录](docs/SKILLS_USED.md) 与 [来源](docs/SKILL_SOURCES.md) 区分实际使用和仅供参考的材料。

已知历史推送为 `8b89f48`。本地最新检查到 `497f285`（Cloud Run健康检查，前序为Vertex AI / Cloud Run支持）；本次重设计尚未提交或推送，也未核验云部署状态。

## Google Cloud

服务端支持两种后端：本地默认使用 Gemini Developer API；Cloud Run 使用 `GENAI_BACKEND=vertex` 和服务身份调用 Vertex AI，不需要生产 API Key。完整资源、权限、部署与验证步骤见 [Google Cloud 部署](docs/GOOGLE_CLOUD_DEPLOYMENT.md)。

来源任务已同步：东京Cloud Run公开访问、min=1/max=1，AI使用Global Standard PayGo。正式方案为付费3.8 Flash／免费3.5 Flash Lite，由可信服务端权益分流；当前代码仍是环境配置的单模型。涉及部署、模型或额度时先读 [正式决策基线](docs/AI_CLOUD_DECISIONS.md)，再读部署说明。本任务的本地模拟验证与来源任务的真实云验收分别记录，不能互相替代。

## 设计与素材

当前完整规范见 [DESIGN.md](DESIGN.md)。新素材的完整提示词、尺寸和来源见 [素材溯源](docs/ART_PROVENANCE.md)，字体许可在 `public/fonts/OFL.txt`。当前页面不再导入 Vanta/Three；GSAP、桌面 Lenis 与 React Bits 的输入降级仍保留。旧分层记录见 [设计系统历史](docs/DESIGN_SYSTEM.md)，不能覆盖本次选定方向。React Bits 的完整 MIT + Commons Clause 许可保留在 `src/components/react-bits/LICENSE.md`。
