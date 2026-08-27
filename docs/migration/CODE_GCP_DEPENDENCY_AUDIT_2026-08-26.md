# GSYEN / HalfSphere 代码与 GCP 依赖审计

审计日期：2026-08-26（Asia/Shanghai）  
工作区：`/Users/Ethan/Desktop/Projects/gsyen`  
性质：阶段 1 代码审计及其本地整改证据；不代表生产迁移或 GCP-off 验收完成

## 1. 结论

本地工作区的 GCP/Google 依赖已完成一轮逐文件分类，但 **GSYEN 与 HalfSphere 均未达到彻底脱离 GCP**：

1. `gsyen-api/.github/workflows/deploy.yml` 仍在每次 `main` push 后构建并部署到 GCP Cloud Run；Artifact Registry、WIF provider 和 Google Service Account 仍是有效的构建/部署链路。
2. `sgsyen-api` 仍编译并保留可运行的 GCS provider 与 `@google-cloud/storage`。它适合作为数据切换观察期回滚适配器，但在 GCP-off 验收前必须证明生产只选择 OSS，观察期结束后再移除。
3. HalfSphere 当前 Vercel 前端源码已闭环到 commit `82b743a4546c3d92ff5f7c9291bb42974977b560`，但生产 `/apply` 仍指向项目号 `827638954474` 的 Cloud Run；该后端的 revision、完整源码、数据、Secret 和部署身份尚未取得。不能用项目 `halfsphere-api-7586` 中的同名旧服务或历史 handler 推测替代。
4. 当前工作树已没有根 GSYEN/SGSYEN 应用运行时硬编码的 `.run.app` 地址，但当前 Vercel
   production artifact 仍有：GSYEN auth proxy 回退到 776 Cloud Run；SGSYEN bundle 直接包含
   哈希 `a.run.app` 报告地址；HalfSphere artifact 指向项目 827。源码集中配置只能算候选修复，
   不能证明已发布 Web/Electron/Android、DNS、Webhook 或第三方回调已经切换。
5. Cloud SQL 与 Secret Manager SDK/连接器在当前应用源码中零命中，但控制面权限、计费停用及项目 827 不可访问使“资源不存在”无法成立。必须继续以未知且仍在使用处理。
6. Gemini、Google OAuth、Google Fonts 和 Android/KSP 属于不同类别，不能机械删除。Gemini/OAuth 是允许候选外部 Google API；Google Fonts 是可替换的外部内容依赖；KSP/Google Maven 是构建工具，不是 GCP 生产托管依赖。

因此，本报告状态是：**本地代码审计完成；生产依赖闭环未完成；禁止停止或删除任何 GCP 数据、共享资源或身份。**

## 2. 范围、方法与分类规则

### 2.1 覆盖范围

本轮初审及 2026-08-27 续跑复审覆盖工作区全部非排除源代码、配置与迁移证据，包括：

- 根仓库 GSYEN Web、Vercel API、Electron、本地 Node 服务与共享 chat 模块；
- `email-worker`、D1 migrations、Cloudflare Worker 配置与测试；
- `gsyen-api`；
- `sgsyen-api`、`sgsyen-web`；
- `gsyen-model`；
- `gsyen-android`；
- 当前迁移期 HalfSphere 候选工作树 `gsyen/halfsphere`；
- 全部 GitHub Actions、Dockerfile、部署脚本、systemd、Caddy、env 示例、Supabase/Room/D1 migrations；
- 迁移文档中记录的控制面、日志、构建和生产 artifact 证据。

排除了 `.git` 对象、`node_modules`、`build`、`dist`、`.gradle`、`.next`、coverage、缓存、二进制和真实 `.env*`。只读取 `.env.example`、`*.env.example`、`.dev.vars.example` 等无 Secret 模板；没有读取、打印或写入任何真实 Secret 值。

检索词包括：`run.app`、`googleapis.com`、`storage.googleapis.com`、`@google-cloud/*`、`gcloud`、项目 ID/项目号、`gs://`/GCS/bucket、Cloud SQL、Artifact Registry、Service Account、WIF、Secret Manager、`GOOGLE_APPLICATION_CREDENTIALS` 及历史 credential 变量名。

### 2.2 续跑复审方法与结果

2026-08-27 在迁移任务恢复后对共享工作树重新执行了 token-only 扫描；该扫描是本地文件审计，不把外网状态当作前置条件或验收证据。扫描只输出命中的关键词、文件和行号，不输出整行，避免把同一行可能存在的 Secret 或完整回调 URL 带入日志。可重复命令的核心形式如下：

```bash
rg --hidden -n -i -o --no-heading \
  'run\.app|storage\.googleapis\.com|[a-z0-9-]+-docker\.pkg\.dev|gs://|@google-cloud/[a-z0-9_-]+|cloud[ _-]?sql|secret[ _-]?manager|workload[ _-]?identity|iam\.gserviceaccount\.com|google_application_credentials|\bgcloud\b|halfsphere-api-7586|gsyen-api-7586|hs-v2ryan|776196228503|560294832548|214548028016|827638954474|827638954410' \
  . \
  -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/build/**' \
  -g '!**/.gradle/**' -g '!**/.kotlin/**' -g '!**/.next/**' \
  -g '!**/.venv/**' -g '!**/venv/**' -g '!**/coverage/**' \
  -g '!**/.wrangler/**' -g '!**/.cache/**' -g '!**/__pycache__/**' \
  -g '!**/.env' -g '!**/.env.local' -g '!**/.env.*.local' \
  -g '!**/*credentials*.json' -g '!**/*service-account*.json' \
  -g '!deploy/aliyun/stalwart.env'
```

复审结果：

1. 排除 Markdown、测试、lockfile、workflow 与部署目录后，对全部可执行应用源码扫描，GCP 平台关键词只剩 `sgsyen-api/src/lib/gcs.ts:1` 的 `@google-cloud/storage`；连同 package manifest 与仍主动部署的 workflow，当前活动文件集合精确为 `sgsyen-api/src/lib/gcs.ts`、`sgsyen-api/package.json` 和 `gsyen-api/.github/workflows/deploy.yml`。前两项是明确保留的回滚适配器，后一项仍是生产 GCP 发布链。
2. workflow/部署配置扫描中，主动 GCP 路径只剩 `gsyen-api/.github/workflows/deploy.yml:8-56`；阿里云部署脚本中的 `.run.app`、`storage.googleapis.com`、`pkg.dev` 和项目 ID 命中均为 fail-closed 守卫或测试。
3. Cloud SQL connector/Unix socket/instance connection name、Secret Manager SDK/REST、Firebase、App Engine、Cloud Functions、Pub/Sub、BigQuery 与 Cloud Tasks 的应用源码命中均为 0。
4. 工作树仍只有 2 个 workflow：根仓库 R2/GitHub Release workflow，以及 `gsyen-api` 的 GCP Cloud Run workflow；未发现隐藏的 HalfSphere、Android、model、SGSYEN 或 email-worker GCP workflow。
5. 外部 Google 复扫单列了 Gemini、Google OAuth、Google Fonts、`next/font/google`、Android Google Maven/KSP；它们没有被计入 Cloud Run/GCS/Cloud SQL 等平台依赖。
6. 没有发现第三条活动 GCP 代码链，但发现两个配置审计差距：阿里云 SGSYEN Web 模板
   使用了与源码不一致的 Vite key；`gsyen-api/.env.example` 漏列默认 Gemini 路径需要的
   `GEMINI_API_KEY`。两项已在本地修正并加入模板断言；它们不是新增 GCP 调用。候选仍须
   用真实公开 origin 重建并扫描，不能因模板修复而复用仍含 GCP 的旧 artifact。
7. 新发现的空项目 `gsyen-api-7586`（项目号 `560294832548`）已加入扫描与收尾范围；
   `hs-v2ryan`（`214548028016`）和历史项目号 `827638954410` 在活动代码/CI 中均为零命中，
   但控制面归属未完全闭环，仍按 D 类保留。

### 2.3 分类

| 类别 | 含义 | 处理原则 |
|---|---|---|
| A — 必须迁移的平台依赖 | Cloud Run、GCS、Artifact Registry、GCP IAM/WIF/SA、Secret Manager、Cloud SQL 等 | 切换到阿里云并完成业务/数据验证；观察期后停用，删除另行确认 |
| B — 允许候选外部 Google 服务 | Gemini API、Google OAuth；Google Fonts 需单独决策 | 书面允许、独立密钥/回调、验证阿里云出网；不得混同 GCP 托管 |
| C — 测试/历史/文档/守卫 | 说明文字、旧架构文档、兼容字段、拒绝 GCP 地址的负向检查 | 不算运行时依赖；更新过时内容，保留必要审计证据 |
| D — 未知，必须核实 | 不可访问的项目、未取得源码、未能枚举的资源/Secret/回调 | 一律按仍被生产使用处理，禁止停用或删除 |

## 3. 按代码单元的审计结果

| 单元 | owner | A：平台依赖 | B：允许候选 | C/D 与结论 |
|---|---|---|---|---|
| 根 GSYEN Web/Vercel API | GSYEN | 当前源码没有 Cloud Run/GCS SDK或 `.run.app` endpoint；服务端上游已集中为 `GSYEN_API_ORIGIN`（`api/gsyenApiOrigin.ts:1-13`） | Google OAuth（`src/auth/authService.ts:133-149`）；Google Fonts（`src/index.css:1`） | **生产 artifact 不同：** commit `313095e…` 的 proxy 因 env 缺失仍回退到 776 Cloud Run；必须切换 env、重部署并验证 bundle/日志；静态 `public/facts.html:83,89` 仍是过时展示内容 |
| Electron | GSYEN | API origin 已由生成配置/环境集中，`electron/gsyen-api-cors.cjs:9-44`；无 `.run.app` | Gemini endpoint 仅在 V2Ray LLM 路由列表（`electron/v2ray.cjs:64-69`） | `scripts/generate-electron-config.cjs:7-29` 生成发布配置；仍需对已发布安装包做字符串扫描和真实请求验证 |
| `email-worker` | GSYEN | 无 GCP SDK、项目 ID、GCS/Cloud SQL/Secret Manager 命中 | 无 Google API 运行调用 | 生产依赖是 Cloudflare Email Routing/D1/R2/Queue、Resend 和 Stalwart 镜像；这些不是 GCP，但仍需单独部署与邮件验收 |
| `gsyen-api` | GSYEN | **仍有主动 GCP CI/CD**，见第 4 节；Dockerfile 显式保留 `HOST=0.0.0.0` 以维持当前 Cloud Run rollback 可达性，阿里云 unit 单独覆盖 loopback | Gemini chat/agent（`gsyen-api/agentRoutes.ts:6,34-53,81-88`；`chatRoutes.ts:7,41-42,108-143`） | agent sandbox 已加入集中资源策略、原子 mutation lock、磁盘余量/readiness 和 38/38 测试；这只解除阿里云持久数据的本地配额阻断，生产 Cloud Run 仍有流量 |
| `sgsyen-api` | GSYEN 家族 | **GCS adapter 仍可运行**：`src/config.ts:14-16,43-57`、`src/lib/objectStorage.ts:9-15`、`src/lib/gcs.ts:1,9-31`、`package.json:14` | 无必须保留的 Google 外部 API | OSS provider 已改为 ECS RAM Role 临时凭证、严格 endpoint 和流式大小上限（`src/lib/ossClient.ts:46-165`）；`gcs_*` DB 字段暂为兼容名（`src/routes/reports.ts:35-39,71-79`），不能在数据核对前改名或删除 |
| `sgsyen-web` | GSYEN 家族 | 源码 API 地址集中为 `VITE_SGSYEN_API_URL`（`src/lib/apiConfig.ts:1-12`）；阿里云示例已修正为同一 build-time key，并移除误导性的 systemd runtime env | Google Fonts（`src/index.css:1`） | 精确 key/负向断言已通过；仍须用批准 origin 重建并扫描。production bundle 仍含哈希 `a.run.app` 地址；metadata 还误称存在 server-side Gemini 能力 |
| `gsyen-model` | GSYEN | 未发现 GCP SDK、项目 ID、GCS、Cloud SQL、Artifact Registry 或 Secret Manager | 无 | 调用链已收敛到认证 GSYEN API → loopback；ECS Python 3.12.3/56 项 lock/旧服务冒烟已闭环，候选新增数据模式/上海业务时区动态新鲜度/批准 SHA 与大小/单次 FD 读取/readiness 及 19/19 stdlib 契约测试；immutable dataset stage/promote/rollback 另有 5/5 fixture。真实数据、首次 legacy onboarding、candidate Linux/断电、Caddy/认证 E2E 仍未完成 |
| `gsyen-android` | GSYEN | 无 GCP endpoint/SDK；API/Chat 地址通过严格 HTTPS URI 校验后集中写入 BuildConfig（`app/build.gradle.kts:9-55,73-74`） | `com.google.devtools.ksp` 只是 Room 代码生成构建插件（`gradle/libs.versions.toml:51`）；`ChatApiClient.kt:74-79` 的 `gemini` 只是发给 GSYEN API 的模型标识 | 默认地址是 `https://gsyen.com`，不是 GCP；需对 release variant 与签名 APK 再做字符串/业务验证 |
| HalfSphere 当前候选源码 | HalfSphere | 当前源码用 `NEXT_PUBLIC_API_URL`（`halfsphere/lib/public-config.ts:1-11`），没有硬编码 `.run.app` | `next/font/google`（`app/layout.tsx:2-14`）和 CSS Google Fonts（`app/globals.css:2`）；`app/api/providers/route.ts:18-25` 的 `gemini` 只是允许存储的 provider 枚举，当前 usage fetcher 不调用 Google API | **D/P0：** 生产构建仍调用项目 827 Cloud Run，真实 `/apply` 后端源码缺失；本地 Next API routes 不能冒充该后端 |
| `deploy/aliyun` | shared infra，配置隔离 | 模板没有 GCP upstream；env/release/Stalwart/Caddy activation 守卫主动拒绝 GCP host、项目和身份标识 | release metadata 只允许 Gemini/OAuth 对应的 Google host/provider，其余 `googleapis.com` 拒绝 | 新增 mutable-content inventory、符号身份 fresh-host restore、模型数据事务和单服务 systemd 状态/依赖事务；Caddy 仍仅反代本机 loopback。全部只是本地 fail-closed 候选，不代表生产入口或真实恢复已通过 |
| DB migrations | GSYEN/HalfSphere 各自及 shared | 未发现 Cloud SQL connector 或 GCP SDK | Google 仅作为 `login_provider` 枚举值（`supabase/migrations/20260527000001_gsyen_teams_and_tiers.sql:13`） | `gcs_*` 是 SGSYEN 既有数据契约；共享 Supabase UUID/table 仍须双方校验，不能把字段名命中误判为实际访问 GCS |

## 4. 必须迁移的平台依赖账本

### A-01：GSYEN Cloud Run 自动部署链路（P0）

| 证据 | 运行/构建影响 | owner | 建议与验收 |
|---|---|---|---|
| `gsyen-api/.github/workflows/deploy.yml:1,3-11` | `main` push 自动部署；项目 `halfsphere-api-7586`、服务 `gsyen-api`、区域 `asia-east1` | GSYEN | 先新增独立的 ACR/ECS 或 SAE workflow 并影子部署；阿里云验收前不得关闭旧 workflow |
| `gsyen-api/.github/workflows/deploy.yml:34-40` | 使用 WIF `projects/776196228503/.../providers/gsyen-api` 和 `github-actions-gsyen-api@halfsphere-api-7586.iam.gserviceaccount.com` | GSYEN | 切换后撤销 WIF/GSA 需用户确认；先查 GitHub environments/repo vars/branch protection |
| `gsyen-api/.github/workflows/deploy.yml:42-56` | 推送 `asia-east1-docker.pkg.dev/halfsphere-api-7586/cloud-run-source-deploy/gsyen-api`，再 deploy Cloud Run | GSYEN | ACR image digest 与源 commit 建账；阿里云 workflow 成为唯一生产部署后才能禁用本 workflow |

控制面只读证据显示 `gsyen-api-00007-fvk` 100% 接流且仍有真实请求（`docs/migration/PHASE0_INVENTORY_2026-08-26.md:79-84`）。所以“代码已集中配置”不等于 Cloud Run 已脱离。

### A-02：SGSYEN GCS provider（P1，观察期内允许保留）

| 证据 | 运行/构建影响 | owner | 建议与验收 |
|---|---|---|---|
| `sgsyen-api/src/config.ts:14-27,43-58` | 运行时可选 `oss` 或 `gcs`；OSS 分支强制 `ecs_ram_role` 并禁用可能泄露凭证的 `ali-oss` DEBUG，GCS 分支需要 `GCS_BUCKET` | GSYEN 家族 | 生产 env 必须是 `OBJECT_STORAGE_PROVIDER=oss`，并用启动日志/出网日志证明未加载 GCS |
| `sgsyen-api/src/lib/objectStorage.ts:9-15` | GCS 模块是动态分支，但仍可被生产选择 | GSYEN 家族 | 数据哈希与回滚观察期结束前保留；结束后删除分支和依赖 |
| `sgsyen-api/src/lib/gcs.ts:1,9-31` | 使用 ADC/Google auth 对 GCS 签名 URL、流式下载文本 | GSYEN 家族 | 核对报告正文/PDF 数量、对象 key、SHA-256、签名 URL 权限后退役 |
| `sgsyen-api/package.json:14`、`package-lock.json:12,529-537` | 安装 `@google-cloud/storage` 及 google-auth-library 等传递依赖 | GSYEN 家族 | GCS rollback adapter 删除后同步清理 lockfile；此前不要机械删包 |
| `sgsyen-api/src/routes/reports.ts:35-39,71-79` | DB 字段仍叫 `gcs_content_path`/`gcs_pdf_path`，但实际由 provider 读取 | GSYEN 家族 | 先保持数据/API 兼容；字段重命名需单独 migration、双读/回滚和客户端验证 |

审计初版发现的 provider/credential 阻断已在本地修复：代码与 systemd/env 统一为 `OBJECT_STORAGE_PROVIDER=oss`，并强制 `OSS_AUTH_MODE=ecs_ram_role`；`@alicloud/credentials` 2.4.7 通过 IMDSv2 取得自动轮换的 STS 临时凭证，不再要求长期 AccessKey。服务端正文读取使用北京内网 endpoint，给浏览器的 V4 签名 URL 使用公网 endpoint，避免把内网地址发给客户端；endpoint 必须是对应区域的 HTTPS 标准地址，正文经流式读取并受 5 MiB 默认/10 MiB 绝对上限保护，`ali-oss` credential DEBUG fail closed（`src/lib/ossClient.ts:46-165`；`src/lib/objectStorageContract.ts:6-68`；`deploy/aliyun/env/sgsyen-api.env.example:6-12`）。复审实跑 17 个存储测试、typecheck 和 build 全部通过；此前 loopback `/health` 实启也已通过。直接依赖中的 Hono、node-server、ws 安全版本已更新，`npm audit --audit-level=high` 通过。官方依据：[OSS Node.js ECS RAM Role 凭证](https://help.aliyun.com/en/oss/node-js-configure-access-credentials)、[北京 OSS 内外网 endpoint](https://help.aliyun.com/en/oss/user-guide/regions-and-endpoints)。

这仍是**本地阻断解除，不是阿里云验收**：独立 RAM Role/Policy 与 OSS Bucket 尚未创建，ECS IMDSv2/内网读/公网签名 URL 尚未在线验证。2026-08-27 已确认本地、Dockerfile、CI 和既有 ECS 盘点均为 Node 22 基线，因此观察期 GCS rollback adapter 已最小升级到 `@google-cloud/storage@8.0.1`；typecheck、21/21 tests 和 build 通过。该可选回滚链仍有 `gaxios`/`uuid` 的 2 个 moderate 传递告警，且仍须以实际阿里云 env/日志证明生产选择 OSS；在数据哈希、回滚观察和 GCP-off 验收完成前不机械删除适配器。

### A-03：HalfSphere 真实生产 Cloud Run `/apply`（D/P0）

- 当前 `halfsphere.com` Vercel deployment 对应前端 commit `82b743a…`；97 个共同源码文件内容核对为零差异（`docs/migration/PHASE0_INVENTORY_2026-08-26.md:105-107`）。
- 当前公共前端 artifact 指向 `halfsphere-api-827638954474.us-central1.run.app`（同文件 `:109-117`）。这是 **生产 artifact 证据**，即使当前工作树已改为 `NEXT_PUBLIC_API_URL`，依赖仍未消失。
- 项目号 `827638954474` 不同于 `halfsphere-api-7586` 的项目号 `776196228503`；当前身份无 827 权限。21 个可访问 GitHub 仓库的全部 refs/历史扫描也未找到该 `/apply` 源码（同文件 `:113-121`）。
- 当前 `halfsphere/app/apply/page.tsx:20-29` 只定义前端请求协议；本地 Next API routes 中没有等价 `/apply` handler。不得推测实现。
- 恢复所需最小权限：项目 827 的 Cloud Run Viewer、Artifact Registry Reader、Cloud Build/Builds Viewer、Storage Object Viewer（仅构建源对象）、Secret 元数据查看权限及相关日志只读；Secret payload、计费恢复和任何写操作另行审批。

在 revision、image digest、build source、commit、数据库、Bucket、Secret 名称、SA、域名/Webhook 与流量全部闭环前，HalfSphere 不具备可验证的阿里云部署物或独立回滚点。

### A-04：`halfsphere-api-7586` 共享项目与身份（D/P0）

控制面证据（`docs/migration/PHASE0_INVENTORY_2026-08-26.md:75-103`）：

- 项目号 `776196228503`；有 `gsyen-api` 和同名 `halfsphere-api` 两个 Cloud Run 服务。
- 两服务共用默认 Compute Service Account，且该身份具有项目级 Editor。它是高风险共享边界，不能只按 GSYEN 或 HalfSphere 单方停用。
- 可见 GSYEN Secret 名称：`gsyen-supabase-service-role`、`gsyen-moonshot-api-key`、`gsyen-mail-worker-internal-token`；同名 HalfSphere 服务引用 `halfsphere-database-url`。本报告没有读取值。
- HalfSphere 同名服务的 source ZIP/build/image digest 已建账，但无法证明它是项目 827 的真实生产版本；计费停用阻断 ZIP、完整 Artifact Registry 和 Secret 元数据读取。
- Cloud Run source bucket 可见 3 个对象；对象导出与哈希尚未完成。

停止规则：只有 GSYEN 与 HalfSphere 都完成独立 GCP-off、共享消费者为零、回滚演练通过并取得用户明确确认后，才可停共享服务/身份；不可恢复删除仍需再次确认。

### A-05：Secret Manager、GitHub Secret 与身份漂移（D/P1）

- 当前应用源码没有 `@google-cloud/secret-manager` 或 Secret Manager API 调用；Cloud Run 通过控制面引用 Secret，证据见 A-04。
- 当前 workflow 使用 WIF，不使用 JSON key（`gsyen-api/.github/workflows/deploy.yml:34-38`）。
- 审计初版发现 `gsyen-api/AUTH.md` 仍描述旧 GSA `github-deploy@halfsphere-api.iam.gserviceaccount.com` 与 `GCP_SA_KEY` JSON Secret。该 runbook 已在本地更新为现行 WIF/GSA，并明确禁止复制/新建 JSON key；控制面仍发现 GitHub Secret 元数据中保留旧 `GCP_SA_KEY`（`PHASE0_INVENTORY_2026-08-26.md:178`），所以身份漂移尚未在生产控制面闭环。
- 不得因 workflow 未引用就直接删除旧 key：先查 key ID、最后使用时间、GitHub workflow/history、Cloud Audit Logs 和其他 repo consumers，再按审批撤销。

### A-06：Cloud SQL（D/P1）

当前应用源码没有 Cloud SQL connector、Unix socket、instance connection name 或 `cloudsql` package 命中。项目 776 的 Cloud SQL Admin API 未启用，已查日志也未见创建行为（`PHASE0_INVENTORY_2026-08-26.md:103`），但这不是全局不存在证明：

- 项目 827 不可访问；
- HalfSphere 的 `DATABASE_URL` 来源尚未闭环；
- Supabase 是双方当前明确的共享第三方数据平面，不应被误标为 Cloud SQL。

必须逐项目列出 SQL Admin API/instances/backups/connection logs，再决定“无 Cloud SQL”或导出计划。

### A-07：`hs-v2ryan` 必须排除出停服范围

项目 `hs-v2ryan`（项目号 `214548028016`）当前证据更像独立 Tools Hub/代理/输入法资源：Cloud Run API 从未启用；两台已停止 e2-small VM、两块磁盘、公网 IP，以及 `gyshurufa-backups-214548028016` bucket 均应保留（`PHASE0_INVENTORY_2026-08-26.md:123-133`）。

结论是“未证实属于 HalfSphere，完整保留”，不是删除依据。任何 GCP 自动化必须显式 `--project`，避免本机默认的无关项目 `apt-decorator-473807-t1`（同文件 `:68-73`）。

### A-08：`gsyen-api-7586` 空项目收尾（D/P1）

GCP 项目 `gsyen-api-7586`（项目号 `560294832548`）属于 GSYEN 收尾范围；只读控制面
当前显示项目 ACTIVE、未绑定 billing，未发现运行资源。它不是当前活动生产链，但必须进入
最终“停止/保留/待删除”清单，并在 GCP-off 后再次只读复核。删除项目是不可恢复动作，
仍须用户针对这个精确项目再次确认，不能因“空”而自动清理。

历史项目号 `827638954410` 只有审计/拒绝守卫命中，归属仍未知；项目 827 控制面不可访问
使零代码命中不能升级为“资源不存在”。

## 5. Google 外部服务允许候选清单

| 服务 | 代码证据 | 是否 GCP 平台依赖 | 建议 |
|---|---|---|---|
| Gemini API | `gsyen-api/agentRoutes.ts:6,34-53,81-88`；`chatRoutes.ts:7,108-143`；`agentTools.ts:7`；`package.json:14` | 否；代码显式用 API key 调 Gemini Developer API；`VertexAI`、`aiplatform.googleapis.com`、`GOOGLE_GENAI_USE_VERTEXAI` 均为 0 命中 | 允许候选。密钥只放阿里云受保护 env/Secret；验证阿里云出网、超时、限流、审计和 provider fallback |
| Electron Gemini 路由 | `electron/v2ray.cjs:64-69` 的 `generativelanguage.googleapis.com` | 否 | 只是 LLM 代理规则；若保留 Gemini 必须保留，若禁用 Gemini则可删 |
| Google OAuth | `src/auth/AuthModal.tsx:48-52`、`authService.ts:133-149`、`types/auth.ts:7-10` | 否；经 Supabase Auth 发起外部 OAuth | 允许候选。把 Aliyun/自定义域名 redirect/callback 加入 Google 与 Supabase allowlist，并回归账号 UUID、邮箱和 cookie |
| Google Fonts — 根 Web | `src/index.css:1` | 否，但浏览器运行时访问 Google CDN | 建议 P2 自托管到 GSYEN 静态资产/OSS，减少中国网络与隐私风险 |
| Google Fonts — SGSYEN | `sgsyen-web/src/index.css:1`、`public/temple-street-alley/plan.html:7`、`slides.html:8` | 否，但浏览器运行时外联 | 同上；静态报告也需离线字体验证 |
| Google Fonts — HalfSphere | `halfsphere/app/globals.css:2` 为浏览器外联；`app/layout.tsx:2-14` 的 `next/font/google` 为 build-time 下载后自托管 | 否 | 阿里云无 Google 出网时 build 可能失败；统一改为本地字体更稳妥 |
| Android Google Maven/KSP | `gsyen-android/settings.gradle.kts:3-20`、`gradle/libs.versions.toml:51` | 否；构建仓库/代码生成插件 | 允许作为构建依赖；不应计作生产访问 GCP |
| Google Play / Firebase | Android manifest、Gradle 依赖及全部 workflow 复扫均为 0 个 Play publishing、Firebase SDK、Google Services plugin 命中 | 当前不存在这类运行或发布依赖 | 不需要迁移；未来新增 Play 发布时应单独记录签名、服务身份和商店回滚，不得借用 GCP 部署身份 |
| Android `gemini` 模型标识 | `gsyen-android/app/src/main/java/com/example/data/ChatApiClient.kt:74-79` | 否；客户端把模型名发给 GSYEN API，没有直接访问 Google | 最终应以 API 日志验证调用仍由阿里云 `gsyen-api` 代理 |
| HalfSphere `gemini` provider 枚举 | `halfsphere/app/api/providers/route.ts:18-25`；`app/api/usage/sync/route.ts:13-20` | 否；可存储 provider 名，但当前 fetcher map 没有 Google/Gemini 实现 | 作为数据/UI 兼容枚举保留，不列为当前外部 Google 生产调用 |
| `sgsyen-web` 的历史 `@google/genai` | 初次审计时包清单存在、源码无 import/调用 | 当前无运行作用 | 已在本地移除依赖及无效 `GEMINI_API_KEY` 示例；3 tests、typecheck、build 和 npm audit 0-vulnerability 验证通过 |

只有 Gemini 与 Google OAuth 建议进入最终书面允许清单；Google Fonts 应优先自托管。KSP/Google Maven记录为供应链构建依赖，不作为生产 Google 服务保留项。

## 6. GitHub Actions 与部署身份全量清单

本工作区仅发现 2 个 workflow：

| workflow | 生产作用 | GCP 分类 | 动作 |
|---|---|---|---|
| `.github/workflows/release.yml` | 构建 Electron Windows/macOS；发布到 Cloudflare R2（`:149-173`） | 非 GCP；Cloudflare 可暂保留 | 迁移 release 下载链路时再决定 R2→OSS；当前不得误停 |
| `gsyen-api/.github/workflows/deploy.yml` | test/build → WIF auth → Artifact Registry → Cloud Run | A/P0 | 建立阿里云 workflow；切换验证后禁用旧 workflow，撤销身份另行确认 |

当前工作区没有 HalfSphere、SGSYEN、model、Android 或 email-worker 的其他 GitHub workflow。HalfSphere 当前 README 指向 Vercel Git integration（`halfsphere/README.md:60-85`），但本地没有可审计的 HalfSphere GCP/阿里云 CI 文件；Vercel 项目设置、Deploy Hooks、Git integration、build env 和 cron 必须从控制面另行导出。

## 7. 关键字与硬编码地址逐项结果

### 7.1 `run.app`

应用运行代码：**0 个硬编码地址**。现存命中均为证据或负向守卫：

- `docs/migration/PHASE0_INVENTORY_2026-08-26.md:111`：HalfSphere 当前生产 artifact 的真实 Cloud Run 地址，D/P0 证据；
- `sgsyen-web/DEPLOYMENT.md:106`：验收条件要求日志无 `run.app`，C；
- `deploy/aliyun/libexec/validate-env-file.sh:62`：拒绝 env 中 `.run.app`，C/安全守卫；
- `deploy/aliyun/libexec/render-caddy-fragment.sh:23`：拒绝 `.run.app` 域名，C/安全守卫；
- `deploy/aliyun/tests/validate-templates.sh:105`：负向模板扫描，C；
- `deploy/aliyun/README.md:234`：守卫说明，C。

### 7.2 Artifact Registry 地址、项目 ID 和部署身份

当前代码/CI 中唯一 Artifact Registry 地址：

- `asia-east1-docker.pkg.dev/halfsphere-api-7586/cloud-run-source-deploy/gsyen-api` — `gsyen-api/.github/workflows/deploy.yml:11`。

发现的 GCP 项目/项目号：

| 标识 | 来源 | owner/状态 |
|---|---|---|
| `halfsphere-api-7586` / `776196228503` | workflow `:8,11,37-38`；控制面盘点 | GSYEN 使用；HalfSphere 同名旧服务未决；共享项目 |
| `827638954474` | `PHASE0_INVENTORY:105-121` | HalfSphere 真实生产 Cloud Run 项目号；当前无权限，P0 |
| `827638954410` | `PHASE0_INVENTORY:113` | 历史号/未知；当前无权限，需核实，不得假定可删 |
| `hs-v2ryan` / `214548028016` | `PHASE0_INVENTORY:123-133` | 疑似无关 Tools Hub；完整保留 |
| `apt-decorator-473807-t1` | `PHASE0_INVENTORY:68-73` | 本机默认但无关项目；明确排除 |

当前 WIF/GSA：

- WIF provider：`projects/776196228503/locations/global/workloadIdentityPools/github-actions/providers/gsyen-api`；
- GSA：`github-actions-gsyen-api@halfsphere-api-7586.iam.gserviceaccount.com`；
- 历史文档 GSA：`github-deploy@halfsphere-api.iam.gserviceaccount.com`，状态未知，不能据文档操作。

### 7.3 GCS、bucket 与 Google Service Account credential

- 当前实际 GCS SDK/adapter：仅 `sgsyen-api`，见 A-02。
- 当前源码没有硬编码 `storage.googleapis.com` 或 `gs://` 生产地址；`validate-env-file.sh:62` 是拒绝该地址的守卫；`objectStorageContract.test.ts:19` 的 `gs://bucket/file.pdf` 是无效 key 负向测试。
- `sgsyen-content` 仅在资源归属账本中出现（`RESOURCE_OWNERSHIP_MATRIX.md:21`）；真实 bucket 元数据、对象数量和哈希仍需控制面导出确认。
- `gyshurufa-backups-214548028016` 属 `hs-v2ryan`，不是当前迁移删除目标。
- `sgsyen-web/docs/sgsyen-api-optimized.md:55-59,137-160` 含 `GCP_PROJECT_ID`、`GCS_REPORTS_BUCKET_NAME`、`GCP_SERVICE_ACCOUNT_KEY` 和示例 `@google-cloud/storage`；这是未执行的历史设计规格，不是当前 `sgsyen-api` 实现或 env 模板。更新文档前保留为迁移证据，禁止从中恢复/猜测真实凭据。

### 7.4 Cloud SQL、Secret Manager、`googleapis.com`

- Cloud SQL：当前应用源码 0 命中；控制面结论仍为 D，见 A-06。
- Secret Manager SDK/REST：当前应用源码 0 命中；Cloud Run 控制面 Secret 引用仍为 A/D，见 A-04/A-05。
- `googleapis.com` 应用命中只有 Google Fonts 与 `generativelanguage.googleapis.com`；均已在第 5 节单独分类。没有应用硬编码 `storage.googleapis.com`。
- `deploy/aliyun` 中 `googleapis.com`/`storage.googleapis.com` 字符串均用于 fail-closed 拒绝规则，不是出网目标。

### 7.5 `gcloud`

- 执行性命中：`gsyen-api/.github/workflows/deploy.yml:40,43`，A/P0；
- 其余命中是旧 `gsyen-api/AUTH.md` 操作说明或 `PHASE0_INVENTORY` 的只读工具版本记录，C；
- 阿里云 runtime/systemd/Caddy 中没有 `gcloud` 命令。

## 8. GSYEN / HalfSphere 共享耦合矩阵

| 共享/耦合项 | GSYEN | HalfSphere | 风险 | 隔离/验证要求 |
|---|---:|---:|---|---|
| GCP 项目 776 | 生产 `gsyen-api` | 同名旧 `halfsphere-api` 未决 | 项目/默认 SA 共因故障与误删 | 双方消费者清零前不停止项目/SA |
| 默认 Compute SA（Editor） | 是 | 可能 | 过度权限且无法独立撤销 | 阿里云各用独立 RAM Role；核对 GCP audit logs 后拆分 |
| Supabase ref 与 `auth.users`/tier/subscription | 是 | 是 | UUID、账号、权限和表 migration 交叉影响 | 独立 DB 用户；共享表先建消费者清单、双写/核对，禁止单方 DROP |
| `registration_requests` | 间接/未知 | `/apply` 与 `sanyuanlou-api` 消费 | 未知外部写入者导致切换丢请求 | 找到 827 后端与所有消费者，冻结窗口做记录数/主键核对 |
| GCS/OSS 报告字段 | SGSYEN 使用 | 否 | 字段名与 provider 混合易误删数据 | 保留字段兼容；对象 SHA-256 后再退役 GCS |
| API/domain 回调 | 根 Web/Electron/Android/SGSYEN | Vercel frontend `/apply` | 已改源码但旧 artifact/控制面仍可能指 GCP | DNS、bundle、Webhook、OAuth、Vercel env 分别取证；双方可独立回滚 |
| Secret | GSYEN `gsyen-*` | `halfsphere-database-url`/加密 key | 共享项目但业务密钥必须隔离 | 禁止复用；只迁移原值，不打印；分别备份/轮换 |

## 9. systemd、Caddy、env 与 migrations 复核

### 9.1 阿里云模板

- GSYEN systemd：`gsyen-web`、`gsyen-api`、`sgsyen-web`、`sgsyen-api`、`gsyen-model`、`gsyen-mail-ingest`、Stalwart、backup/health timers 与 `gsyen.slice`。
- HalfSphere systemd：`halfsphere-web`、`halfsphere-api`、backup/health timers 与 `halfsphere.slice`。
- Caddy：`deploy/aliyun/caddy/gsyen.Caddyfile.template:13-49` 与 `halfsphere.Caddyfile.template:13-29` 全部只反代各自 loopback 端口；没有 GCP upstream。
- HalfSphere API unit 在真实 launcher 缺失时 fail closed（`systemd/halfsphere-api.service:17-21`），符合“不得用推测代码替代”。
- `bash deploy/aliyun/tests/validate-templates.sh` 于 2026-08-27 续跑通过，包含对 `.run.app`、`storage.googleapis.com`、`pkg.dev`、项目 ID、端口、用户、目录、资源 slice、content inventory、模型数据和单服务 systemd transaction 的正负向检查；6 项 inventory、5 项 dataset transaction 与 19 项 model stdlib 测试另行通过。

尚未完成：这些文件只是本地模板；没有证据表明已安装到 ECS、真实 env 已满足校验、Caddy 已加载、服务已启动或业务已通过。SGSYEN 的代码/模板契约已在本地统一，但独立 RAM Role、OSS 与 ECS 在线验证尚未执行；HalfSphere 真实生产源码未知，其对象存储契约仍不得猜测。

### 9.2 migration

- 根 Supabase migrations 包含 GSYEN auth/chat/team/tier/profile；`20260616000002_drop_legacy_tables.sql` 已隔离共享表删除风险。
- HalfSphere migrations 包含 provider/tier/network/permissions/membership/authz hardening；它们属于当前 Vercel frontend commit 的 Next API 数据模型，不能证明项目 827 `/apply` 后端只使用这些表。
- `email-worker/migrations/0001-0021` 是 Cloudflare D1 邮件数据与 Stalwart mirror outbox/DLQ；独立 `contract-migrations/0022_*` 用于发布契约门，二者都不是 GCP。
- Android Room v2→v3 migration 是本地账号 ownerId 隔离，不是 GCP。
- SGSYEN 仍依赖远端现有报告表及 `gcs_*` 字段，但本仓库没有相应数据库 schema migration；迁移前必须从真实数据库导出 schema、row count、PK/FK/UUID 与字段非空分布。

## 10. HalfSphere 源码布局与生产源码缺口

最终规范源码布局是两个平级独立 Git 工作树：

```text
/Users/Ethan/Desktop/Projects/gsyen
/Users/Ethan/Desktop/Projects/halfsphere
```

当前 `/Users/Ethan/Desktop/Projects/gsyen/halfsphere` 仅是迁移期候选；最终不得长期嵌套。目标 `/Users/Ethan/Desktop/Projects/halfsphere` 已存在为空目录，仍是用户已有路径，禁止直接覆盖。复制、哈希、测试、原子落位与旧副本保留门槛见 [`HALFSPHERE_SOURCE_LAYOUT_FINALIZATION.md`](./HALFSPHERE_SOURCE_LAYOUT_FINALIZATION.md) 的“执行门槛”“安全整理流程”和“验收证据”。

文档或 Git 历史中引用当前嵌套路径，只是审计/恢复证据，不构成应用运行时依赖。生产源码未闭环前不得整理路径。`HALFSPHERE_SOURCE_LAYOUT_FINALIZATION.md:25-27` 的结论与本报告一致：它只闭环了当前前端部署源码的等价性，并明确说明这不等于项目 827 `/apply` 后端 revision 已闭环；**该后端来源仍是 P0 未知**。

## 11. 未完成项与优先级

### 已消除项（仅限当前本地工作树）

1. 应用运行时硬编码 `.run.app`、`storage.googleapis.com`、GAR 地址、项目 ID/项目号、WIF provider 和 GSA 地址已为 0；这些 token 的主动配置仅剩现行 GCP workflow。
2. Cloud SQL connector、Cloud SQL Unix socket、Secret Manager SDK/REST、Firebase、App Engine、Cloud Functions、Pub/Sub、BigQuery 与 Cloud Tasks 应用命中为 0。
3. GSYEN Web/Electron、SGSYEN Web、Android 与 HalfSphere 前端的 API origin 已集中配置；Android 对 release 地址执行 HTTPS URI 校验；模型调用已通过认证 GSYEN API adapter 转发到 loopback，不再由浏览器直连内部模型端口。
4. SGSYEN 的阿里云模板明确选择 OSS + ECS RAM Role，不再要求长期 OSS AccessKey；读取 endpoint、签名 endpoint、对象 key、流量大小和 credential 日志均有 fail-closed 校验。
5. `sgsyen-web` 未使用的 `@google/genai` 和无效 Gemini env 已移除并通过测试、typecheck、build。

以上是**源码整改证据**，不是生产发布证据。旧 bundle、workflow、Cloud Run revision、Vercel env、DNS、Webhook 或第三方回调仍可能访问 GCP。

### P0

1. 取得项目 827 的最小只读权限，恢复 HalfSphere `/apply` 的真实 revision/image/source commit、数据、Secret 名称、SA、日志和所有回调。
2. 为 `gsyen-api` 建立阿里云影子部署与 CI，恢复 Secret 后完成业务健康检查；当前 GCP workflow 和 Cloud Run 不能停。
3. 导出所有 GCP/Supabase/对象存储的数据账本并完成数量、PK、UUID、时间、附件/文件 SHA-256 校验；当前没有这些证据。
4. 验证当前生产 Web/Electron/Android/Vercel bundle、DNS、OAuth、Webhook 和第三方回调，而不只检查源码。
5. 建立 GSYEN 与 HalfSphere 可独立执行的回滚点；任一方失败不得污染另一方数据/Secret。

### P1

1. SGSYEN provider/凭证契约本地修复已完成；剩余 P1 是创建独立 RAM Role/OSS、在 ECS 验证 IMDSv2/内外网 endpoint，并以生产出网证据证明不再访问 GCS。
2. 枚举 GitHub repo/environment Secrets、WIF、GSA key、Artifact Registry images 与 Cloud Run revisions；形成“停止/保留/待删除”精确清单。
3. 旧 `gsyen-api/AUTH.md` 的 JSON key/GSA/发布说明已在本地纠正；剩余 P1 是验证文档随下一次安全发布生效，并核对历史 `GCP_SA_KEY`/key ID/消费者。当前 GCP workflow 在阿里云切换前仍不能关闭。
4. 对项目 776、827、`hs-v2ryan` 逐项目确认 Cloud SQL、Bucket、Secret、disk/snapshot、build source 和隐藏资源；未知按仍使用处理。
5. SGSYEN Web 的 `VITE_SGSYEN_API_URL` 构建模板和 `gsyen-api` Gemini 配置键已在本地
   修正；剩余 P1 是用批准的公开 origin 重建 candidate、核对 BUILD manifest/产物字符串，
   并发布验证。阿里云 runtime env 不能冒充 Vite 构建注入，也禁止复用旧 ECS/Vercel bundle。
6. 将 `gsyen-api-7586`/`560294832548` 纳入逐项目终态复核和最终资源清单；当前“空项目”
   只降低迁移复杂度，不构成删除授权。
7. 在隔离 Linux 影子主机执行 candidate/disabled/inactive/absent unit 的 systemd 激活与自动
   恢复、MainPID/loopback/业务健康、依赖状态和断电测试；当前静态事务不得直接用于生产。
8. 用真实停服一致性 hook 生成加密异地 GSYEN/HalfSphere 归档，在 fresh host 映射符号
   owner/group 并恢复；数据库/OSS 导出、Stalwart quiesce 和恢复后数量/hash 仍须独立闭环。

### P2

1. 自托管 GSYEN、SGSYEN、HalfSphere 的 Google Fonts。
2. 数据切换观察期结束并取得确认后，删除 SGSYEN GCS adapter/dependency，再做全工作区零命中与出网验证。

### P3

1. 清理不执行但会误导维护者的 Cloud Run 描述：`ANDROID.md:20`、`MAC.md:15`、`CLAUDE.md:6`、`gsyen-api/clients.ts:39`、`gsyen-api/server.ts:4,34`、`gsyen-api/sandbox.ts:4`、`sgsyen-api/src/index.ts:42`。
2. 在新架构正式上线后更新产品/展示文本 `public/facts.html:83,89` 与 `sgsyen-web/src/translations.ts:6,161`；切换前保留现状描述并不构成 GCP 请求。
3. `sgsyen-web/metadata.json` 声称存在 server-side Gemini capability，但当前代码没有该
   consumer/fetcher；更新元数据或补真实来源说明，避免维护者误判为必须迁移的 Google 调用。

## 12. 验收口径

本报告只能证明“当前本地源码中依赖在哪里、属于哪一类”。下列证据齐备前不得标记 GCP-off：

- 两个系统的生产日志均无 Cloud Run/GCS/Cloud SQL/Artifact Registry/Secret Manager 请求；
- GCP 停止后 GSYEN 与 HalfSphere 各自完整业务测试通过；
- 数据数量、主键、UUID、附件与对象哈希全部一致；
- CI、DNS、OAuth/Webhook、Vercel、Electron updater、Android release 均不再指向 GCP；
- 独立备份/恢复和单方回滚演练通过；
- P0/P1 清零；
- 所有保留 Google 服务进入书面允许清单；
- 停止与不可恢复删除分别获得明确确认。

审计结论：**阶段 1 本地依赖分类完成；GSYEN 未脱离 GCP；HalfSphere 未脱离 GCP；联合迁移未完成。**
