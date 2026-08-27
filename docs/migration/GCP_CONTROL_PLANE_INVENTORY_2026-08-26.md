# GCP 控制面只读复审

复审窗口：2026-08-26 15:41–16:14（Asia/Shanghai）  
活动身份：`lihouyi7586@gmail.com`  
gcloud：`564.0.0`

## 1. 结论

本轮只执行了项目、服务、日志和元数据读取，没有部署、停止、删除、启用 API、
修改 IAM/计费或下载源码/对象；没有读取 Secret payload、token、私钥、完整
Webhook URL 或 VM metadata 值。所有资源命令均显式指定 `--project`。本机默认的
无关项目 `apt-decorator-473807-t1` 被明确排除，本轮没有向它发出资源查询。

当前不能把 GSYEN 或 HalfSphere 标记为脱离 GCP：

1. `gsyen-api-00007-fvk` 仍接收 100% 流量。UTC
   `2026-08-19T07:41:25Z` 至 `2026-08-26T07:41:25Z` 有 307 条 Cloud Run
   request log，最后一条距复审仅约 10 分钟。
2. 307 个请求中有 64 个 HTTP 500；最近 24 小时的 35 个请求全部为 500，
   User-Agent 显示为“输入法.网”的两个 CFNetwork 客户端版本，去除 query 后路径均为
   `GET /api/auth/me`。同一窗口的 ERROR request textPayload 经固定类别映射后为
   25 个 `billing_disabled`、10 个 `instance_start_failed`；当前直接平台原因是结算
   账号关闭导致实例无法启动，不是已证明的应用认证 bug。请求仍直接证明有活跃客户端
   依赖；owner 未确认前按生产消费者处理。
3. HalfSphere 当前前端指向项目号 `827638954474`，但活动身份对该项目号和历史记录号
   `827638954410` 均返回 `PERMISSION_DENIED`。真实生产 revision、image、source、
   数据、Secret 和部署身份仍是 P0 未知。
4. 项目 `halfsphere-api-7586` 中的同名 `halfsphere-api` 最近 30 天只有 3 个
   `curl/8.7.1` 探测请求且均为 500，没有观察到非 curl 请求。它不能据此被当作当前
   HalfSphere 生产源，也不能在 827 项目与数据未闭环前停止或删除。
5. 776 项目中的两个服务共享默认 Compute Service Account、Cloud Run source Bucket
   和 Artifact Registry repository。默认运行身份拥有项目级 Editor；因此这是实际的
   GSYEN/HalfSphere 共享高权限故障域，不是两个完全独立的部署空间。
6. `hs-v2ryan` 的证据继续支持“独立代理/输入法工具资源”：Cloud Run API 当前未启用，
   两台 VM 已停止，代理/ACME 防火墙规则已禁用；但磁盘、公网 IP、备份 Bucket 和
   监控仍保留。没有日志证明其属于 HalfSphere 生产链路，也没有证据授权删除，故完整保留。
7. 新发现项目 `gsyen-api-7586`（项目号 `560294832548`，名称 `GSYEN Production`）。
   它当前未绑定 billing、没有 Cloud Run/Compute/Artifact/Secret 等 API 或资源、Bucket/
   dataset/SA/monitoring 均为空；仍必须纳入 GSYEN 最终 GCP 清理/书面保留范围，不能因
   “当前为空”而漏掉。

## 2. 访问、计费与项目解析

| 输入 | 解析结果 | 当前结论 |
|---|---|---|
| `halfsphere-api-7586` | 项目号 `776196228503`，ACTIVE，组织 `1095097118355` | 可只读；GSYEN 与旧 HalfSphere 共享项目 |
| `gsyen-api-7586` | 项目号 `560294832548`，ACTIVE，同一组织；名称 `GSYEN Production` | 新发现的 GSYEN 空项目；当前无 billing/运行资源，仍纳入收尾 |
| `hs-v2ryan` | 项目号 `214548028016`，ACTIVE，同一组织 | 可只读；疑似无关 Tools Hub/代理/输入法项目，保留 |
| `827638954474` | `PERMISSION_DENIED` 或项目不存在不可区分 | 当前 HalfSphere 前端指向的真实生产项目号；P0 |
| `827638954410` | `PERMISSION_DENIED` 或项目不存在不可区分 | 历史记录号；不能视为已排除 |
| `apt-decorator-473807-t1` | 未查询 | 明确排除的无关项目 |

网络恢复后于同日再次执行 `projects describe 827638954474`，活动身份仍明确返回
`The caller does not have permission`；这排除了“仅因地铁断网导致盘点失败”的解释。
Cloud Run CLI 还要求项目 ID 而不能用项目号直接列服务，且当前身份无权从 Resource Manager
解析该项目 ID，因此没有绕过权限边界继续枚举。827 的 P0 访问缺口保持不变。

对组织可见 project metadata 使用名称/ID 精确过滤并显式排除 `apt-decorator-473807-t1`
后，除已知 776、`hs-v2ryan` 外新发现了 `gsyen-api-7586`。结合既有代码/全部 Git
refs/CI token-only 扫描与本轮 Admin Activity，没有发现其他 GSYEN/HalfSphere project
ID。该结论只是“本次可见范围未发现”，不能弥补 827 无权限，也不能排除第三方控制台、
Secret 值或不可见组织下仍有引用。

776 与 `hs-v2ryan` 的 billing info 都显示仍关联同一个结算账号且
`billingEnabled:true`，但结算账号本身为 `open:false`。Artifact Registry、
Secret Manager、GCR 和 GCS object describe 随后返回
`BILLING_DISABLED`/`delinquent`。因此 `billingEnabled:true` 只表示项目仍有绑定，
不能当作结算账号可用或资源清单完整的证据。恢复结算可能产生费用，仍受用户确认门控制。
新项目 `gsyen-api-7586` 则为 `billingEnabled:false`、无 billing account binding。

启用 API 数量：776 项目 30 个，`gsyen-api-7586` 23 个，`hs-v2ryan` 26 个。
与本次迁移相关的差异如下：

| 能力 | 776 项目 | `gsyen-api-7586` | `hs-v2ryan` |
|---|---|---|---|
| Cloud Run | enabled | disabled；无 Admin Activity | disabled；无 Admin Activity |
| Artifact Registry / Cloud Build / Secret Manager / Pub/Sub | enabled | disabled | disabled |
| Compute Engine | disabled | disabled | enabled |
| Storage | enabled | enabled、0 Bucket | enabled |
| Cloud SQL Admin | disabled | disabled | disabled |
| BigQuery / Datastore | enabled | enabled、未初始化 | enabled |
| Secure Source Manager | disabled | disabled | enabled |

`sql-component.googleapis.com` 启用不等于 Cloud SQL Admin 已启用。
`sqladmin.googleapis.com` 在三个项目均不在 enabled list；从各项目创建日至今的
Admin Activity 中也没有 Cloud SQL、Firestore/Datastore、Cloud Functions、
Cloud Tasks、Redis 或 Serverless VPC Access 的创建/修改事件。该日志缺失不能单独
证明历史资源绝对不存在，但结合项目创建时间、当前 API 状态与应用源码，当前没有
Cloud SQL 资源证据。

## 3. 项目 `halfsphere-api-7586` / 776196228503

### 3.1 Cloud Run

| 服务 | 当前 revision / 流量 | image digest | 运行边界 | 归属 |
|---|---|---|---|---|
| `gsyen-api` | `gsyen-api-00007-fvk` / 100% | `sha256:e0ce8c853e8605816a951e487e7bb917de20f59b762eec183e4b7249b8acb497` | 1 vCPU、512 MiB、concurrency 80、timeout 300s、maxScale 20 | GSYEN 生产 |
| `halfsphere-api` | `halfsphere-api-00003-ldn` / 100% | `sha256:8775d32ed6cac41847a609d54bd0312eb9d10347fd48925a8c746b0c6ecb0e29` | 同上 | HalfSphere 旧/未决，不是 827 生产闭环 |

可见 URL：

- GSYEN：`https://gsyen-api-776196228503.asia-east1.run.app`、
  `https://gsyen-api-chbkifdmmq-de.a.run.app`；
- 776 HalfSphere：`https://halfsphere-api-776196228503.asia-east1.run.app`、
  `https://halfsphere-api-chbkifdmmq-de.a.run.app`；
- 当前 HalfSphere 前端实际配置：
  `https://halfsphere-api-827638954474.us-central1.run.app`，但控制面无权读取。

776 项目在 `asia-east1` 的 Cloud Run native domain mapping 为 0；Cloud Run job 和
worker pool 也均为 0。因此业务域名/Cloudflare/Vercel 的指向必须在各自控制面另行
核对，不能从 Cloud Run domain mapping 推断已经没有外部域名或回调。

两个服务均：

- ingress `all`，`roles/run.invoker` 授予 `allUsers`；
- 使用 `776196228503-compute@developer.gserviceaccount.com`；
- 该 Service Account 在项目级拥有 `roles/editor`；
- 使用 startup CPU boost，未发现 VPC connector 或 Cloud SQL instance annotation；
- URL 同时有项目号式和 hash 式 `run.app` 地址。

`gsyen-api` 共保留 7 个 ready revisions，涉及 5 个唯一 image digest：

| revision | 创建时间 UTC | digest |
|---|---|---|
| `00007-fvk` | 2026-07-30 17:46:08 | `sha256:e0ce8c853e8605816a951e487e7bb917de20f59b762eec183e4b7249b8acb497` |
| `00006-kdx` | 2026-07-30 15:22:58 | `sha256:4c0c76443f84f9232f056026d673eb676200bb365b96158c19b9752f898033d4` |
| `00005-npx` / `00004-57m` / `00003-t6g` | 2026-07-30 | `sha256:47e25f38fcf7a5d482727c20fd9ee127a24f007f6c920e461d97514ef7727ec1` |
| `00002-d7b` | 2026-07-30 01:31:18 | `sha256:0b0b32b5d375a77d32f9318b4d1dc8e1464a8d2c8e71157f7bbbf9898d9dc2ca` |
| `00001-k8s` | 2026-07-14 20:37:33 | `sha256:7487de453f6dcf3fe957d407f2fe23ef9368b23342d8ad86f0d053f5e654460c` |

`halfsphere-api` 的 3 个 ready revisions 全部指向同一个 `8775d3…e29` digest。

这里的 revision `Ready=True` 只表示控制面 revision 状态；实际请求仍可因 billing
disabled/instance start failed 全部返回 500，不能把 Ready 或 100% traffic 当作业务健康。

当前 GSYEN revision 的 service label 精确记录 commit
`2ee79f9672a28b6789b5bb5d0438941d8442f7df`，`managed-by=github-actions`。
最近的 Cloud Build source build 只产生了 `4c0c76…33d4`；当前 `e0ce8c…b497`
是后续 GitHub Actions 推送并部署的镜像。因此不能把最近 Cloud Build source ZIP
误认为当前生产 revision 的唯一源码证据。

### 3.2 请求日志

本轮日志统计只读取 `timestamp`、service/revision、HTTP status/method 和用于识别
客户端类别的 User-Agent；没有读取 URL、query、remote IP、request/response body
或应用 payload。

#### `gsyen-api`

精确窗口 `2026-08-19T07:41:25Z` 至复审时间，结果未触及 5,000 条 limit：

| 维度 | 数量 |
|---|---:|
| 总请求 | 307 |
| GET / POST | 163 / 144 |
| HTTP 200 / 401 / 500 | 225 / 18 / 64 |
| revision | 307 条全部为 `gsyen-api-00007-fvk` |
| 首条 / 末条 | 2026-08-19 08:25:34Z / 2026-08-26 07:31:03Z |

最近 24 小时为 35 个 GET、35 个 HTTP 500；18 个来自“输入法.网/000”，17 个来自
“输入法.网/218”，均为 CFNetwork/Darwin User-Agent。所有 request URL 只在内存中
剥离 query 后映射路径，结果均为 `GET /api/auth/me`；未输出 URL/query/body/原文。
同一精确窗口、`severity>=ERROR` 的 35 条 request textPayload 只映射到固定类别：
25 条 `billing_disabled`、10 条 `instance_start_failed`。因此当前 500 的直接平台原因是
项目账单禁用及实例启动失败，不是已证明的 `/api/auth/me` 认证逻辑 bug；恢复 GCP
billing 可能付费，仍需用户确认，不能为了排障擅自恢复。

这些请求说明至少一个输入法客户端仍把该 Cloud Run 服务当作上游，但仅凭 User-Agent
不能证明 `hs-v2ryan` VM 发起请求，也不能把该客户端自动归入 HalfSphere。切换清单
必须新增这一消费者并确定 owner。

#### 776 项目中的 `halfsphere-api`

精确窗口 `2026-07-27T07:41:25Z` 至复审时间：3 个请求，均发生在本次迁移盘点日，
User-Agent 均为 `curl/8.7.1`，方法为 1 GET + 2 HEAD，全部 HTTP 500。没有观察到
非 curl 请求。这只支持“旧服务当前没有可见生产流量”，不构成停服或删除授权。

### 3.3 Cloud Build、Artifact Registry 与 source Bucket

Cloud Build 在 `asia-east1` 有 3 个成功 source builds，global 为 0；Cloud Build
trigger 为 0，private worker pool 为 0：

| build | 目标 package | source object | image digest |
|---|---|---|---|
| `ea34c0bf-4b06-4adc-ac39-f4bde6df448a` | `gsyen-api` | `services/gsyen-api/1785424933.180399-71bcc5d919504f2b8707607638c20415.zip` | `sha256:4c0c76443f84f9232f056026d673eb676200bb365b96158c19b9752f898033d4` |
| `108ac15c-5be7-4b1d-9243-b0b2de3aed78` | `gsyen-api` | `services/gsyen-api/1784061416.530974-94798e031e5a410eb10c7ed8ece3a086.zip` | `sha256:7487de453f6dcf3fe957d407f2fe23ef9368b23342d8ad86f0d053f5e654460c` |
| `5337a02b-9a23-45e2-b384-be6bf4bbfdf4` | `halfsphere-api` | `services/halfsphere-api/1784058802.902359-e332ebbc2b1842a7a89d84c09ebd0468.zip` | `sha256:8775d32ed6cac41847a609d54bd0312eb9d10347fd48925a8c746b0c6ecb0e29` |

三次 build 都由默认 Compute Service Account 执行。当前只有一个可证实 repository：
`asia-east1/cloud-run-source-deploy`，其中至少有 `gsyen-api` 和 `halfsphere-api`
两个 packages。repository list、完整 image/tag/digest 清单和现行 repo IAM 因结算账号
关闭而被 API 拒绝；因此上表只是 Cloud Run/Build 可引用的下限，不是完整镜像账本。

GitHub GSA 不具有项目级 Artifact Registry role，但 2026-07-30 有一次针对该 repository
的 SetIamPolicy 记录，且随后 GitHub revision 部署成功。由此可推断它有 repo-level
写权限；当前精确 binding 仍因 billing blocker 未能直接读取，不能在停用时只看
project IAM 而遗漏 repository IAM。

Cloud Run source Bucket：

| 属性 | 值 |
|---|---|
| 名称 | `run-sources-halfsphere-api-7586-asia-east1` |
| 位置 / 边界 | `ASIA-EAST1`、UBLA enabled、无 public IAM binding |
| 当前对象 | 3 个、10,957,693 bytes |
| GSYEN prefix | 2 个、113,948 bytes |
| HalfSphere prefix | 1 个、10,843,745 bytes |
| versions | all-versions 仍为 3 个、同等 bytes；未见非当前版本 |
| soft delete | 7 天 |

对象 list 可读，但逐对象 describe 因 delinquent billing 返回 403。本轮没有下载任何 ZIP、
镜像或对象。此前盘点记录的 HalfSphere ZIP SHA-256 `aca86e60…59fba` 可继续作为已有
证据，但本轮没有重新下载或重新计算；当前 GSYEN GitHub image 则不由这三个 source
objects 完整覆盖。

### 3.4 Secret、IAM 与 WIF

当前 Cloud Run 只记录以下 Secret 引用名称，未读取版本值：

| 服务 | Secret 名称 |
|---|---|
| GSYEN | `gsyen-supabase-service-role`、`gsyen-moonshot-api-key`、`gsyen-mail-worker-internal-token` |
| 776 HalfSphere | `halfsphere-database-url` |

对全部 10 个可见 revisions 只读取 env key 名和 `secretKeyRef.name` 后确认：GSYEN
`00001`–`00003` 已引用前两个 Secret，`gsyen-mail-worker-internal-token` 从 `00004`
起加入；HalfSphere `00001` 只有 `SUPABASE_URL`/`ALLOWED_ORIGINS` 两个非 Secret
env key，`halfsphere-database-url` 从 `00002` 起加入。没有读取这些普通 env 或
Secret 的值，也没有发现其他 revision secret references。

Admin Activity 精确显示这 4 个 Secret 的 CreateSecret 事件和共 5 次 AddSecretVersion；
从项目创建日至今没有 DeleteSecret、DisableSecretVersion 或 DestroySecretVersion 事件。
然而当前 `secrets list`/IAM/版本状态读取被 billing blocker 拒绝，所以应表述为“当前
revision 引用且没有删除事件”，不能表述为已完整枚举所有 Secret 或已验证 payload。

身份清单：

| 身份 | 权限/信任 | 结论 |
|---|---|---|
| 默认 Compute SA | 项目 `roles/editor`；两个 Cloud Run 服务运行身份；3 个 Cloud Build 执行身份 | GSYEN/HalfSphere 共用且过权，双系统切换前必须保留 |
| `github-actions-gsyen-api` GSA | `roles/run.admin`、`roles/serviceusage.serviceUsageConsumer`；可 `actAs` 默认 Compute SA | GSYEN 独立 CI 身份，仍 active |
| WIF pool/provider | pool `github-actions`；provider `gsyen-api` ACTIVE | condition 精确限定 `Christine3749/gsyen-api` |

GSA 的 `roles/iam.workloadIdentityUser` 只授予上述 repository principalSet。provider
issuer 是 `https://token.actions.githubusercontent.com`，mapping 为
`google.subject=assertion.sub`、`attribute.repository=assertion.repository`、
`attribute.ref=assertion.ref`，condition 为
`assertion.repository=='Christine3749/gsyen-api'`。

三个已发现 Service Account（包括 `hs-v2ryan` 默认 SA）均没有 user-managed key。
GitHub 仓库中旧
`GCP_SA_KEY` Secret 名称因此不对应当前可见的有效 user-managed GSA key；值未读取，
在阿里云 CI 和回滚观察完成前仍不能删除。

### 3.5 其他数据/队列服务

- Pub/Sub topic、subscription、snapshot、schema：均为 0。
- BigQuery dataset：0。
- Datastore index list 返回 database/project not found，且无 Datastore/Firestore admin
  activity；当前没有已初始化数据库的证据。
- Cloud SQL Admin API 未启用，项目创建以来无 Cloud SQL admin activity。
- Compute API 未启用，项目创建以来无 Compute admin activity。
- Bucket list 只有上述 1 个 Cloud Run source Bucket，未见业务 GCS Bucket 或传统 GCR
  backing Bucket；但 GCR/Artifact Registry 完整列表仍被 billing blocker 阻断。
- Cloud Monitoring alert policy：0。

迁移账本中的候选名称 `sgsyen-content` 没有出现在 776 或 `hs-v2ryan` 的 Bucket list；
当前可执行代码只要求运行时 `GCS_BUCKET`，并不含这个具体名称。因此该 Bucket 的存在、
owner project、对象数量与哈希仍是未知，不能把“三个可访问项目未发现”误写成已经迁移
或已经不存在。应从真实 SGSYEN 生产 env/数据库路径和有权控制面反向定位，仍不得读取
或打印 credential 值。

这不包含第三方 Supabase 数据面。源码与配置证据显示 GSYEN 和 HalfSphere 仍共享
Supabase ref/账号及表契约，详见
[资源归属矩阵](./RESOURCE_OWNERSHIP_MATRIX.md) 和
[代码 GCP 依赖审计](./CODE_GCP_DEPENDENCY_AUDIT_2026-08-26.md)。

## 4. 新发现项目 `gsyen-api-7586` / 560294832548

该项目名称为 `GSYEN Production`，2026-07-31 22:06:15Z 创建，ACTIVE，属于同一组织。
它当前 `billingEnabled:false` 且没有 billing account binding。组织项目过滤结果证明它是
本轮新增的 GSYEN 范围，而不是 776 的别名。

当前只读资源账本：

- enabled API 23 个，主要是 BigQuery/Datastore/Logging/Monitoring/Storage 的基础 API；
  Cloud Run、Artifact Registry、Cloud Build、Secret Manager、Pub/Sub、Compute 和
  Cloud SQL Admin 均未启用；
- Bucket 0、BigQuery dataset 0、可见 Service Account 0、Monitoring policy 0；
- Datastore index list 返回 database/project not found，当前没有数据库初始化证据；
- project IAM 只有 `user:lihouyi7586@gmail.com` 的 `roles/owner`，没有 GSA/WIF；
- Logging 只有 Access Transparency、Admin Activity、Data Access 三类 audit log，
  没有应用或运行资源 log；
- 从创建日至今的 Admin Activity 只有 project create/update、service enable/LRO 和两次
  billing account assignment 操作；当前最终状态仍为未绑定，未发现应用资源创建事件。

因此当前状态是“GSYEN 独立、可见资源为空、未绑定结算”，不是生产承载项目，也不是
HalfSphere 资源。它现在不构成运行迁移源，但最终“彻底脱离 GCP”清单必须明确选择：
经用户再次确认后删除空项目，或在书面允许清单中说明保留理由。未确认前只保留，不执行
项目删除、IAM 或 API 变更。

## 5. 项目 `hs-v2ryan` / 214548028016

### 5.1 Compute、磁盘、IP 与网络

| VM | 区域 | 状态 | 规格 | 停止时间 UTC | boot disk | 公网 IP |
|---|---|---|---|---|---|---|
| `twsh` | `asia-east1-c` | TERMINATED | e2-small | 2026-08-24 07:39:46 | 10 GB `pd-balanced`、READY、autoDelete=true | `104.199.170.162`，IN_USE |
| `hk` | `asia-east2-c` | TERMINATED | e2-small | 2026-08-24 07:41:11 | 10 GB `pd-balanced`、READY、autoDelete=true | `34.92.11.61`，IN_USE |

两个 VM 使用默认 Compute SA；该 SA 没有项目级业务 role，也没有 user-managed key。
实例 metadata 只读取 key 名称：`enable-osconfig`、`ssh-keys`；项目 common metadata 只有
`ssh-keys`。本轮没有读取 SSH key 或 startup-script 等值。

资源与保护状态：

- snapshot：0；custom image：0；因此不能把 VM 删除当作可回滚操作。
- 两个 boot disks 都 `autoDelete=true`，删除实例会联动删除磁盘，禁止执行。
- 两个静态公网 IP 在 VM 已停止时仍显示 IN_USE/绑定。
- 自定义 `hy2` UDP、`vless-reality` TCP 443 和 ACME TCP 80 规则均已 disabled；
  default SSH/RDP 也 disabled。default internal 和 ICMP 仍 enabled。
- Firewall Rules Logging 全部关闭；Logging 中只有 audit、Shielded VM integrity 和
  Network Analyzer，没有 guest/syslog/流量日志，故无法用日志证明历史业务流量为 0。
- 存在一个 active 监控策略：任一 VM 连续 5 分钟出站超过 1,000,000 bytes/s 时告警。

### 5.2 Bucket 与源码服务

Bucket `gyshurufa-backups-214548028016`：

| 属性 | 值 |
|---|---|
| 位置 | `ASIA-EAST1` |
| 当前对象 | 28 个、139,015,654 bytes |
| all versions | 28 个、同等 bytes；当前未见非当前版本 |
| 访问边界 | UBLA enabled、Public Access Prevention enforced、无 public IAM binding |
| 保护 | versioning enabled、soft delete 7 天 |

本轮没有读取或下载对象内容，也没有输出对象名称。对象名、业务记录、文件哈希与恢复
可用性仍未核对，所以只能确认容量账本，不能声称备份已验收。

Secure Source Manager 在 2026-08-03 至 2026-08-04 有 `tools-source`、`gyshurufa`
instance 的多次 create/delete Admin Activity；当前 `asia-east1` instance list 为空，
因此当前没有可枚举的 repository。BigQuery dataset 为 0；Datastore index list 返回
database/project not found。Cloud Run、Artifact Registry、Cloud Build、Secret Manager、
Pub/Sub 和 Cloud SQL Admin API 均未启用。

这些名称、端口、Bucket 与“输入法.网”客户端有产品族关联的可能，但控制面 IAM、日志
和资源引用中没有发现它直接依赖 GSYEN/HalfSphere 数据或项目 776/827 的证据。
因此归属仍是“疑似无关，保留”，不能升级为“可删除”。

## 6. 共享边界和停止约束

| 资源 | GSYEN | HalfSphere | 停止约束 |
|---|---:|---:|---|
| 776 GCP project | 是 | 有旧服务/资源 | 两方消费者与数据清零前禁止停项目 |
| 默认 Compute SA + Editor | 运行、Cloud Build | 旧服务运行、Cloud Build | 两方阿里云身份/回滚独立后才可撤销；用户确认 |
| GAR `cloud-run-source-deploy` | package `gsyen-api` | package `halfsphere-api` | 完整 digest 清单与 ACR 对账后再列待删除 |
| Cloud Run source Bucket | `services/gsyen-api/` | `services/halfsphere-api/` | 两方 source/commit/回滚证据闭环后再列待删除 |
| Secret | 三个 `gsyen-*` | `halfsphere-database-url` | payload 安全迁移、业务验收、双系统回滚后再停 |
| GitHub WIF/GSA | 是 | 否 | 阿里云 CI 成为唯一生产部署且观察期完成后再撤销 |
| `gsyen-api-7586` / 560294832548 | 空项目、名称属 GSYEN | 否 | 当前无 billing/资源；最终删除或书面保留仍需确认 |
| 827 项目 | 否 | 生产指向 | 全部资源按仍在使用保留，先取得只读权限 |
| `hs-v2ryan` | 未证实 | 未证实 | 无关/未决资源完整保留，不纳入 GCP 清理 |

新增外部消费者：“输入法.网”客户端仍请求 `gsyen-api` Cloud Run。它不是项目级共享
资源，但属于切换时必须更新或验证的客户端契约；在 owner、发布渠道和新 endpoint
闭环前，不能停止 `gsyen-api`。

## 7. 当前保留、停止候选与待删除候选

### 立即保留（本轮没有执行任何停止）

- 三个可访问项目和项目 827/历史号的全部资源。
- 两个 776 Cloud Run 服务及所有 revisions。
- 776 默认 Compute SA、GitHub GSA、WIF pool/provider 和 repo-level GAR 权限。
- 4 个已知 Secret、Cloud Run source Bucket、GAR repository/packages、Cloud Build 记录。
- `hs-v2ryan` 的 VM、boot disk、静态 IP、Bucket、IAM、firewall 和 monitoring policy。
- 所有未知或因权限/计费无法枚举的资源。

### 验收后可进入“停止审批”的候选（尚未批准、尚未执行）

- GSYEN：Cloud Run `gsyen-api` 和 GCP GitHub Actions 部署链路。
- HalfSphere：只有确认 776 同名服务不再被任何业务使用后，`halfsphere-api` 才能进入
  停止审批；它不能替代或代表 827 服务。
- 只有双方均完成数据/Secret/image/hash、业务、回滚和无 GCP 出网验证后，才可停止
  共享默认 Compute SA 的相关授权或整个 776 项目。

### 可恢复删除前的“待删除清单候选”（必须再次明确确认）

- 776 的 Cloud Run services/revisions、GAR packages/repository、source ZIP/Bucket、
  Secret、WIF/GSA 和项目本身。
- 空项目 `gsyen-api-7586` 本身；当前无资源不等于已有删除授权。
- 827 项目的对应资源只有在取得权限并完成真实清单后才能列具体 ID。
- `hs-v2ryan` 当前不进入待删除清单。

以上只是候选分类，不表示已满足停用条件，更不表示删除授权。

## 8. 阻断与下一步证据

| 级别 | 阻断 | 所需证据/动作 |
|---|---|---|
| P0 | 827 真实生产项目无权限 | 由有权账号授予最小只读角色；重复本文件所有控制面类别，定位 revision/image/source/data/Secret/SA/log |
| P0 | GSYEN 仍有 `/api/auth/me` 请求且最近 24h 全部 500 | 平台原因已分类为 billing disabled/instance start failed；确定“输入法.网”owner，在不恢复付费 GCP 的前提下让阿里云影子环境按相同契约通过 |
| P1 | 776 billing account closed | 如需恢复计费才能补齐 GAR/Secret/GCR/object metadata，先列费用和范围并取得确认 |
| P1 | 完整 Artifact/Secret/GCS 哈希账本缺失 | 不下载数据前先补元数据；数据迁移窗口再做受保护导出、数量/主键/SHA-256 对账 |
| P1 | 776 默认 SA 为共享 Editor | 阿里云两业务使用独立最小权限身份；切换前不得直接收权造成双服务同时故障 |
| P1 | `hs-v2ryan` 没有 snapshot/guest traffic logs | 保持资源；若未来确认归属，先建恢复点并补流量/业务证据，仍需付费与生产确认 |

## 9. 可重复的只读命令类别

以下是本轮实际使用的命令形式。资源查询全部显式 project；format 只选择非 Secret
字段。项目/服务名按表中范围替换：

```bash
gcloud projects list --project=QUOTA_PROJECT --filter='... AND NOT projectId=EXCLUDED' --format='yaml(...)'
gcloud projects describe PROJECT --project=PROJECT --format='yaml(...)'
gcloud services list --enabled --project=PROJECT --format='value(config.name)'
gcloud beta billing projects describe PROJECT --project=PROJECT --format='yaml(...)'

gcloud run services list --platform=managed --project=PROJECT --format='yaml(...)'
gcloud run services describe SERVICE --region=REGION --project=PROJECT --format='yaml(...)'
gcloud run revisions list --service=SERVICE --region=REGION --project=PROJECT --format='value(...)'
gcloud run revisions describe REVISION --region=REGION --project=PROJECT --format='value(...)'
gcloud run services get-iam-policy SERVICE --region=REGION --project=PROJECT --format='table(...)'
gcloud beta run domain-mappings list --region=REGION --project=PROJECT --format='yaml(...)'
gcloud run jobs list --project=PROJECT --format='yaml(...)'
gcloud beta run worker-pools list --project=PROJECT --format='yaml(...)'
gcloud logging read FILTER --project=PROJECT --limit=N --format='csv[no-heading](...)'

gcloud builds list --region=REGION --project=PROJECT --format='yaml(...)'
gcloud builds describe BUILD_ID --region=REGION --project=PROJECT --format='yaml(...)'
gcloud builds triggers list --region=REGION --project=PROJECT --format='yaml(...)'
gcloud builds worker-pools list --region=REGION --project=PROJECT --format='yaml(...)'
gcloud artifacts repositories list --location=all --project=PROJECT --format='yaml(...)'
gcloud artifacts repositories get-iam-policy REPO --location=REGION --project=PROJECT
gcloud container images list --project=PROJECT --format='value(name)'

gcloud storage buckets list --project=PROJECT --format='yaml(...)'
gcloud storage buckets describe gs://BUCKET --project=PROJECT --format='yaml(...)'
gcloud storage buckets get-iam-policy gs://BUCKET --project=PROJECT --format='yaml(...)'
gcloud storage ls --recursive --long --project=PROJECT 'gs://BUCKET/**'
gcloud storage ls --all-versions --recursive --long --project=PROJECT 'gs://BUCKET/**'
gcloud storage objects describe gs://OBJECT --project=PROJECT --format='yaml(...)'

gcloud secrets list --project=PROJECT --format='yaml(name,createTime,replication)'
gcloud iam service-accounts list --project=PROJECT --format='yaml(...)'
gcloud iam service-accounts keys list --iam-account=SA --managed-by=user --project=PROJECT
gcloud iam service-accounts get-iam-policy SA --project=PROJECT --format='table(...)'
gcloud iam workload-identity-pools list --location=global --project=PROJECT --format='yaml(...)'
gcloud iam workload-identity-pools providers list --location=global \
  --workload-identity-pool=POOL --project=PROJECT --format='yaml(...)'
gcloud projects get-iam-policy PROJECT --project=PROJECT --format='table(...)'

gcloud compute instances list --project=PROJECT --format='yaml(...)'
gcloud compute instances describe VM --zone=ZONE --project=PROJECT --format='yaml(...)'
gcloud compute disks list --project=PROJECT --format='yaml(...)'
gcloud compute snapshots list --project=PROJECT --format='yaml(...)'
gcloud compute addresses list --project=PROJECT --format='yaml(...)'
gcloud compute images list --no-standard-images --project=PROJECT --format='yaml(...)'
gcloud compute firewall-rules list --project=PROJECT --format='yaml(...)'
gcloud compute networks list --project=PROJECT --format='yaml(...)'

gcloud pubsub topics list --project=PROJECT --format='yaml(...)'
gcloud pubsub subscriptions list --project=PROJECT --format='yaml(...)'
gcloud pubsub snapshots list --project=PROJECT --format='yaml(...)'
gcloud pubsub schemas list --project=PROJECT --format='yaml(...)'
bq --project_id=PROJECT ls --format=prettyjson
gcloud datastore indexes list --project=PROJECT --format='yaml(...)'
gcloud alpha source-manager instances list --region=REGION --project=PROJECT --format='yaml(...)'
gcloud alpha monitoring policies list --project=PROJECT --format='yaml(...)'
```

对 disabled API 的查询只记录 `SERVICE_DISABLED` 后立即停止，没有接受 enable prompt；
Artifact Registry、Secret、GCR 和 GCS object describe 的 billing 错误原样归类为阻断，
没有尝试恢复计费。

## 10. 与既有证据的关系

- 项目归属、生产前端和源码 commit：
  [阶段 0 盘点](./PHASE0_INVENTORY_2026-08-26.md)
- 代码、workflow、GCP SDK 和外部 Google API 分类：
  [代码 GCP 依赖审计](./CODE_GCP_DEPENDENCY_AUDIT_2026-08-26.md)
- GitHub workflow/WIF/Secret 元数据/Webhook：
  [GitHub CI/CD 盘点](./GITHUB_CICD_INVENTORY_2026-08-26.md)
- 共享数据库、Bucket、身份和独立回滚约束：
  [资源归属矩阵](./RESOURCE_OWNERSHIP_MATRIX.md)

本文件补充的是 2026-08-26 15:41–16:14 的实时只读控制面快照。它不替代数据导出、
业务验收、回滚演练或 GCP 停止观察证据。
