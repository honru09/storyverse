# Google Cloud 部署

本项目以一个 Cloud Run 服务同时承载 Vite 构建产物和 Node API。生产 AI 使用 Vertex AI 工作负载身份，不保存 API Key 或服务账号 JSON。

## 资源边界

- Cloud Run 服务：`storyweave`
- 运行身份：`storyweave-runtime@PROJECT_ID.iam.gserviceaccount.com`
- 推荐开发区域：`asia-northeast1`；Vertex AI 默认使用 `global`
- 首次部署：`min=0`、`max=1`、并发 `8`、超时 `75s`
- 模型：通过 `GEMINI_MODEL` 配置，发布前确认该模型已在目标 Vertex AI 项目开放

## 首次配置

```bash
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com

gcloud iam service-accounts create storyweave-runtime \
  --display-name="Storyweave Cloud Run runtime"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:storyweave-runtime@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

不要为 Cloud Run 创建或下载服务账号密钥。运行时通过绑定的服务身份获得 Application Default Credentials。

## 部署

```bash
gcloud run deploy storyweave \
  --source . \
  --region asia-northeast1 \
  --service-account storyweave-runtime@PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars GENAI_BACKEND=vertex,GOOGLE_CLOUD_PROJECT=PROJECT_ID,GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=gemini-3.8-flash \
  --min 0 \
  --max 1 \
  --concurrency 8 \
  --timeout 75s \
  --no-allow-unauthenticated
```

构建阶段由 Google Node.js buildpack 执行 `npm run gcp-build`，运行阶段执行 `npm start`。容器在 Cloud Run 中监听 `0.0.0.0:$PORT`，本地仍监听 `127.0.0.1`。

## 上线门槛

在 Firebase Authentication 或等价的应用层登录、用户配额和服务端 ID Token 校验完成前，不要把含付费生成能力的服务设为公开调用。公开后仍应保留 `max=1` 开始观察真实延迟、失败率和 token 成本，再逐步扩容。

## 验证

```bash
npm test
npm run build
curl -i https://SERVICE_URL/api/health
curl -i https://SERVICE_URL/api/status
```

`/api/status` 应返回 `provider: "vertex-ai"`、`configured: true`，且响应中不得包含凭据。
