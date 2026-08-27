# 阶段 0：保护现状与只读盘点

盘点时间：2026-08-26（Asia/Shanghai）  
工作目录：`/Users/Ethan/Desktop/Projects/gsyen`

> 时点说明：本文保留 2026-08-26 只读基线，后续追加使部分段落具有不同时点。
> 当前测试、依赖、邮件 migration 与恢复点数字以
> [`RESUMED_GOAL_STATUS_2026-08-27.md`](./RESUMED_GOAL_STATUS_2026-08-27.md) 和
> [`LOCAL_RECOVERY_CHECKPOINT.md`](./LOCAL_RECOVERY_CHECKPOINT.md) 为准；旧数字不得
> 用来覆盖当前代码或声称验收完成。

## 1. 结论

阶段 0 尚未完成。代码仓库、恢复快照、主要 GCP 项目、GitHub、Cloudflare 邮件控制面和阿里云 ECS 容量已有直接证据；以下关键阻断或差距仍存在：

1. HalfSphere 真实生产项目号 `827638954474` 的访问权与 revision/source commit。
2. 阿里云服务器必要配置正文的受控审计、云盘快照、离线备份与恢复演练；systemd、
   Caddy/Stalwart 文件元数据、目录、监听、安全组和现有备份已完成只读核对。
3. Cloudflare D1、R2、Queues、Email Routing 已完成只读清单，但生产还没有 Stalwart mirror
   队列/绑定，D1 也尚未应用仓库 `0016`—`0021` regular migration 与独立 `0022`
   contract migration；任何创建或发布仍需审批。
4. GCP 数据库、对象和 Secret 的可导出账本；项目 `halfsphere-api-7586` 因计费停用而无法读取部分对象。
5. 阿里云生产节点仍为 0 云盘快照；虽已有 18 个 ECS 文件备份版本，但从未恢复，且没有
   已验证的加密离线副本。
6. HalfSphere 最终平级源码整理；当前嵌套工作树有未提交修改，且 827 生产后端来源尚未闭环。
7. Vercel 生产 artifact 仍分别指向 776 Cloud Run、项目 827 或其疑似哈希 URL；HalfSphere
   根域的实际 Vercel owner/team assignment 尚未定位。

因此当前只能继续无生产副作用的代码审计、测试和模板化，不能开始生产修改或停用 GCP。

## 2. Git 与恢复保护

### 2.1 仓库基线

| 业务单元 | 分支 | HEAD | 仓库 |
|---|---|---|---|
| GSYEN Web/Electron（根仓库） | `main` | `313095e0a937f331b4524b15ccd58220fbb3660f` | `Christine3749/gsyen-web` |
| GSYEN API | `main` | `2ee79f9672a28b6789b5bb5d0438941d8442f7df` | `Christine3749/gsyen-api` |
| GSYEN Android | `main` | `a1085ad975bf0867eb3dd5d842a3613c9a67072f` | `Christine3749/gsyen-android` |
| GSYEN Model | `main` | `d83a0e7b01fa5f168b87ca13b5eb57954be18a5e` | `Christine3749/gsyen-model` |
| SGSYEN API | `main` | `acb6234c251d5107c1d9b4ce02089a685a56abf5` | `Christine3749/sgsyen-api` |
| SGSYEN Web | `main` | `569ae9ef80cc5ca6579b4cf7565dd7148c4f8840` | `Christine3749/sgsyen-web` |
| HalfSphere Web 生产源码 | `main` | `82b743a4546c3d92ff5f7c9291bb42974977b560` | `Christine3749/halfsphere` |

根目录中的六个子项目是独立且未跟踪的 Git 仓库，不是 submodule。阶段开始时根仓库已有 9 个修改文件和 30 个未跟踪路径；其中邮件迁移、部署文件和文档属于用户原有工作，均已保留。

新增的最终源码布局要求已单独建账：当前
`/Users/Ethan/Desktop/Projects/gsyen/halfsphere` 为约 687 MiB 的候选 Git 工作树，
HEAD `82b743a…`，当前有 31 个 tracked status line 和 5 个实际 untracked 文件（4 个
porcelain 顶层路径）；既有
`/Users/Ethan/Desktop/Projects/halfsphere` 是 0-byte 空目录且不是 Git 工作树。
目标空目录仍属于用户已有路径，当前不覆盖、不移动。详见
`HALFSPHERE_SOURCE_LAYOUT_FINALIZATION.md`。

### 2.2 可恢复快照

已创建本地恢复快照：

`/Users/Ethan/Desktop/Projects/gsyen-migration-snapshot-20260826.kMJkxJ`

权限与内容：

- 快照目录和 `sensitive/`：`0700`。
- Secret 文件的独立副本：`0600`，未读取值。
- 根仓库 `.git` 归档、tracked patch、untracked 文件归档。
- 根仓库及五个原有嵌套仓库 Git bundle。
- `SHA256SUMS` 用于校验快照文件。

HalfSphere 是盘点期间从正确 GitHub 组织克隆的仓库，不在盘点前快照内；其原始 HEAD 已记录在上表，且生产 Vercel 文件核对已证明该 HEAD 是当前前端源码。

### 2.3 Secret 文件保护

`deploy/aliyun/stalwart.env` 在阶段开始时为未跟踪文件且权限 `0644`。未读取内容，已执行：

- 权限收紧为 `0600`。
- 根 `.gitignore` 精确忽略 `/deploy/aliyun/*.env`。
- 版本管理只允许提交不含值的 `.env.example`。

## 3. GCP 控制面

### 3.1 访问边界

- `gcloud 564.0.0`，活动账号 `lihouyi7586@gmail.com`。
- 本机默认项目是无关项目 `apt-decorator-473807-t1`；所有后续脚本必须显式 `--project`。
- 备用账号 `Ethan7586@gsyen.com` 凭据已过期，需要交互式重新认证。
- 未修改 API、IAM、计费、服务、流量或数据；未读取 Secret 值。

### 3.2 项目 `halfsphere-api-7586`（项目号 `776196228503`）

项目状态 ACTIVE，但绑定的结算账号 `open:false`/delinquent，部分读取返回 `BILLING_DISABLED`。

| Cloud Run 服务 | 当前 revision | 证据状态 | 关键事实 |
|---|---|---|---|
| `gsyen-api` | `gsyen-api-00007-fvk` | 已证实 | commit `2ee79f9…`；100% 流量；仍有真实生产请求 |
| `halfsphere-api` | `halfsphere-api-00003-ldn` | 已证实但非真实生产归属 | 三个 revision 同一镜像 digest；无法证明与当前 HalfSphere 前端使用的项目相同 |

两服务均为 1 vCPU、512 MiB、concurrency 80、timeout 300 秒、maxScale 20、公开 invoker，并共用默认 Compute Service Account。该运行身份具有项目级 Editor，属于必须拆分的高权限共享边界。

2026-08-26 控制面复审确认：`gsyen-api` 最近 7 天仍有 307 个请求，其中 64 个 HTTP
500；最近 24 小时 35 个“输入法.网”客户端请求均为 `GET /api/auth/me` 且全部 500。
ERROR request log 经固定类别映射为 25 个 `billing_disabled`、10 个
`instance_start_failed`，直接平台原因是结算账号关闭/实例无法启动，不是已证明的认证
代码 bug。恢复 GCP billing 可能付费，仍需用户确认。完整证据见
[GCP 控制面只读复审](./GCP_CONTROL_PLANE_INVENTORY_2026-08-26.md)。

GSYEN 可见 Secret 名称：

- `gsyen-supabase-service-role`
- `gsyen-moonshot-api-key`
- `gsyen-mail-worker-internal-token`

HalfSphere 同名服务的 `DATABASE_URL` 引用 `halfsphere-database-url`。只记录名称，未读取值。

HalfSphere 同名服务可追溯到一次手工 source deploy：

- build：`5337a02b-9a23-45e2-b384-be6bf4bbfdf4`
- source ZIP：10,843,745 bytes
- SHA-256：`aca86e60ba8823402699e34af7dcb4ebe0c94c14b5428560133b2a9c20e59fba`
- image digest：`sha256:8775d32ed6cac41847a609d54bd0312eb9d10347fd48925a8c746b0c6ecb0e29`

由于计费停用，当前不能读取 ZIP、完整 Artifact Registry 清单或 Secret 元数据。恢复计费可能产生费用，必须先获用户确认。

项目唯一可见 Bucket 是 Cloud Run source bucket，3 个对象、10,957,693 bytes、非公开。Cloud SQL Admin API 未启用，日志未见创建行为，但这不足以证明项目绝对没有 Cloud SQL。

### 3.3 HalfSphere 真实生产项目缺口

HalfSphere 前端版本已经精确闭环：`halfsphere.com` 当前 Vercel deployment `dpl_Dspy9DHmKQgWGzaYzhYVR8QhUw4E` 对应 commit `82b743a…`。对 97 个共同源码文件逐项核对，62 个原始 SHA-1 一致、35 个只有 CRLF/LF 差异且规范化后一致，实际源码差异为 0。部署额外环境/生成文件不用于推断 Secret。

当前 HalfSphere 公共前端 JavaScript 指向：

`halfsphere-api-827638954474.us-central1.run.app`

项目号 `827638954474` 与 `halfsphere-api-7586` 的项目号 `776196228503` 不同。当前账号对 `827638954474` 和历史号 `827638954410` 均无权限。因此：

- 不得把 776 项目的同名服务当作生产源代码。
- 不得用 GitHub 当前仓库或已删除的历史 `/apply` handler 推测替代后端。
- 必须取得 827 项目权限，核对流量、revision、镜像 digest、构建来源、数据库、Secret 和部署身份。

当前账号可访问的 21 个 GitHub 仓库已完成所有 refs/历史源码扫描，仍未找到该 `/apply` Cloud Run 后端。另发现 `sanyuanlou-api@386834ce…` 直接写共享 `registration_requests` 表；它不是 `/apply` 后端，但必须纳入共享数据库消费者和切换回归范围。

这是 HalfSphere 迁移的 P0 阻断，但不妨碍继续处理其他本地代码与模板。

2026-08-27 恢复 Goal 后再次只读复验：活动身份
`lihouyi7586@gmail.com` 对 `827638954474` 仍精确返回 `PERMISSION_DENIED`；公开
production chunk 仍调用同一 `/apply` URL，且 GitHub production deployment 仍闭环到
前端 commit `82b743a…`。旧 776 服务 latest ready revision 为
`halfsphere-api-00003-ldn`，image digest 为
`sha256:8775d32ed6cac41847a609d54bd0312eb9d10347fd48925a8c746b0c6ecb0e29`，
与 827/us-central1 生产项目不一致。最小解锁是项目管理员授予上述用户项目级
`roles/viewer`；该角色可读 revision/build/artifact/log/Secret metadata，但不含 Secret
version access。

### 3.4 Vercel 生产 artifact 与源码漂移

严格只读控制面盘点确认：GSYEN Vercel production commit `313095e…` 的 auth proxy 在缺少
`GSYEN_API_ORIGIN` 时仍回退到 776 Cloud Run，且 production env 名称清单没有该变量；
SGSYEN production bundle 仍包含哈希 `a.run.app` 地址，Git 历史支持它与项目 827 的关联，
但这仍是推断；HalfSphere commit `82b743a…` 已闭环，但根域不在当前可见 team 的项目域名
列表。完整证据见 [Vercel 生产控制面只读盘点](./VERCEL_CONTROL_PLANE_INVENTORY_2026-08-26.md)。

因此本地工作树的集中配置修复不能当作生产切换证据。Vercel env、deployment、alias/domain
变更仍属于生产动作，必须经确认并分别保留可回滚 deployment。

### 3.5 新发现项目 `gsyen-api-7586`（项目号 `560294832548`）

组织项目元数据过滤新发现名称为 `GSYEN Production` 的 ACTIVE 项目。当前
`billingEnabled:false`，Cloud Run、Compute、Artifact Registry、Cloud Build、Secret
Manager、Pub/Sub 和 Cloud SQL Admin 均未启用；Bucket、BigQuery dataset、可见 SA 和
Monitoring policy 均为 0，只有项目 owner IAM 和 audit log。它不是当前生产承载项目，
但属于 GSYEN 最终 GCP 收尾范围；删除空项目或书面保留仍需明确确认。

### 3.6 项目 `hs-v2ryan`（项目号 `214548028016`）

已证实资源：

- 两台 e2-small VM，均在 2026-08-24 手工停止。
- 两块 10 GB `pd-balanced` 磁盘仍保留。
- 两个公网 IP 仍绑定。
- Bucket `gyshurufa-backups-214548028016`：28 个对象、139,015,654 bytes、非公开。
- 防火墙名称与 `hy2`、`vless`、ACME 更吻合；日志未发现 GSYEN/HalfSphere 命中。

当前证据更支持其属于独立 Tools Hub/代理/输入法资源，而非 HalfSphere 生产链路。结论为“疑似无关，完整保留”，不是删除依据。

## 4. 阿里云华北 2（北京）

### 4.1 账号与资源

控制台 RAM 账号可用；本机没有阿里云 CLI 或 AK。通过已有且无需新增授权的 Workbench
入口完成了严格只读主机核对；没有使用 Cloud Assistant RunCommand，没有读取环境变量值、
Stalwart 配置正文、应用数据或日志正文。控制台显示：2 台 ECS、2 块磁盘、1 个安全组、
2 个弹性网卡、2 个 OSS Bucket、1 个 VPC/vSwitch。

拟迁移主节点：

- ECS `i-2zeewhay0farxq8lucrd`
- 8 vCPU / 16 GB（操作系统可见约 14 GiB）
- Ubuntu 24.04，100 GB 系统盘，5 Mbps 公网带宽
- 公网 `123.57.232.253`，私网 `172.27.70.38`
- 根盘已用 43 GB，剩余约 52 GB；无 swap
- 系统盘 `d-2ze9t48edu0hojhpho4q`，ESSD Entry、100 GiB；控制台显示 0 个快照
- 3 个 vmstat 样本约 99% CPU idle、0% iowait
- 约 355 个连接，TCP established 约 38
- 与无关供应链应用共用，存在故障域与资源争抢风险
- 系统提示需重启并有待评估更新

已观察监听：Caddy `80/443`，Stalwart `25/465/993/995/4190/8080/46477`，SSH `22`，
Redis 和 PostgreSQL 仅回环地址。Stalwart 绑定公网接口，但目标 UFW/安全组目前没有共同
放行邮件端口，因此尚不能据此证明公网邮件可达；`46477`/`8080` 的协议仍须在备份后
受控核对配置。

安全组 `sg-2zeid0k1op66p92f3qqr` 被两台 ECS 共用，12 条入方向规则来源均为
`0.0.0.0/0`，包括 SSH、RDP、MySQL、Redis、Jenkins 和多个管理端口。目标 UFW 入站默认
拒绝且只允许 `22/80/443`，只缓解本机风险；另一台无关 ECS 的监听和主机防火墙未知，
因此安全组列为 P1 待隔离风险，不能直接修改或误伤无关业务。

目标主机当前 `gsyen-web`、`gsyen-model`、`sgsyen-web` 和 Stalwart 运行；
`gsyen-api`、`sgsyen-api` 均 inactive/disabled，systemd 期望的两个完整 env 文件均不存在。
`/srv/gsyen` 存在，但 `/srv/halfsphere` 不存在；没有 HalfSphere unit、端口或 Linux 隔离空间。
应用单元仍在 `system.slice`，CPU/Memory 均无限制，部分应用以 root 运行，并与商城服务共机。

控制台明确显示零云盘快照，但 ECS 文件备份基础版已经保护目标 100 GiB，显示 18 个版本。
上一完成恢复点是 `2026-08-26 07:40:11`，从未执行恢复；本地同盘约 49 MiB 归档也未做
哈希或恢复验证。因此生产变更门仍关闭，不能再表述为“零文件备份”。

官方 ECS 实时定价页当前给出华北 2 标准快照 `0.148 元/GB/月`。按 100 GiB
整盘上限估算为 `14.80 元/月`；实际账单按快照占用容量和保留时间计费。费用与
执行范围已记录在 `ALIYUN_PRECHANGE_BACKUP_APPROVAL.md`，尚未取得创建授权。

### 4.2 目标隔离不变式

- GSYEN：`/srv/gsyen`
- HalfSphere：`/srv/halfsphere`
- HalfSphere Linux user/group：`halfsphere`
- HalfSphere systemd 前缀：`halfsphere-*`
- HalfSphere 端口：`18180-18189`
- 两方独立 env、数据库用户/schema、对象边界、Secret、日志、备份和回滚。
- 仅共享 ECS、VPC/vSwitch、Caddy 入口和系统监控；必须设置 cgroup 上限。

当前容量有静态余量，但 5 Mbps、单盘、无 swap、无云盘快照、文件备份未恢复、没有
cgroup 以及无关业务共机，使容量验收仍为“未通过”。当前负载不包含两个 API 和
HalfSphere，也没有历史峰值；在影子压测、故障隔离和恢复演练前不能认定该 ECS 足以
承载双方生产。完整证据见 `ALIYUN_CONTROL_PLANE_INVENTORY_2026-08-26.md`。

## 5. Cloudflare、GitHub 与邮件

- Cloudflare 控制面已完成严格只读盘点：生产 D1 为 3.08 MB、500 条 message，R2 为
  977 objects/34.98 MB；Email Routing 有 3 条 active 精确地址规则，根域 MX 保持
  Cloudflare。控制面只有 Resend 外发队列族，仓库声明的 Stalwart mirror、DLQ、terminal
  queues 与 `0016`—`0020` 新 schema 均尚未上线。详见
  `CLOUDFLARE_MAIL_CONTROL_PLANE_INVENTORY_2026-08-26.md`。
- GitHub 账号 `Christine3749` 可访问目标仓库。
- GSYEN API workflow 使用 WIF，但仓库 Secret 元数据仍有旧 `GCP_SA_KEY`；不能在切换前删除。
- HalfSphere GitHub 仓库没有 Actions workflow 或历史 run。
- Resend 保持唯一生产外发通道。
- 根域 MX 保持 Cloudflare，不做修改。

邮件代码审计发现的主要未闭环风险：

1. D1 durable outbox 已本地实现：message/attachment/outbox 同批提交，Queue send 在 `waitUntil` 中异步执行；具备幂等键、5 分钟 lease、退避、12 次 terminal、持久 dead-letter、重排和 scheduled drain。typecheck 与 20 files / 127 tests 通过，尚未迁移生产 D1 或发布 Worker。
2. `mail-ingest` 已加入稳定 delivery ID、raw SHA、持久 receipt/lease、SMTP 成功后的可恢复状态和冲突门禁；14/14 本地测试通过。真实 Stalwart/Queue 崩溃窗和跨进程重复投递仍须 E2E/故障注入证明，不能仅凭单测宣告闭环。
3. 必须以邮件数量、Message-ID、原始 EML SHA-256、附件和所有收件人为验收维度。

## 6. 已执行的只读/本地验证摘要

- GSYEN API：独立 typecheck、32/32 tests 和 build 均通过；含 auth/signup 并发、幂等/回滚，以及模型 loopback origin、Bearer、超时/大小/schema、限速和并发边界，没有改变外部 API 协议。
- GSYEN Model：仅 7 个 Python 文件 `py_compile` 和静态审计通过。当前机器缺少 9 个未锁定运行依赖；现有演示指标来自过期模拟数据，真实模型 runtime/source/data 与生产 E2E 均未闭环，审计列出 4 个 P1。不得把旧 AUC 或进程健康当作迁移验收，也不得公开 `18083`。
- SGSYEN API：已加入显式 OSS/GCS provider 接口和对象键校验；typecheck、21/21 tests、build 通过。GCS 回滚 adapter 与依赖在数据切换验证前暂时保留，尚不能计为完全脱离 GCP。
- SGSYEN Web：typecheck/lint/build 已在占位环境验证通过；生产构建必须用批准的稳定域名重建。
- HalfSphere Web 候选源码：typecheck、Next build、6/6 安全回归和全量 lint（0 error/0 warning）通过。三份可删除表/schema 的手工重建 SQL 已增加默认拒绝的事务门禁，emergency 脚本不再允许用户更新自身 tier；它仍只是候选源码，不能替代项目 827 生产 revision/source 证明。
- Android：已安装本地 JDK 21/SDK 36.1，完整 `test lint assembleDebug --no-configuration-cache` 通过，lint 为 0 error/26 warning。真实 `/api/auth/login`、`/api/auth/me` 刷新和 `/api/auth/logout` 已替代假登录；session 使用 Android Keystore AES-GCM 且不保存密码。Room v2→v3 为非破坏迁移，旧数据保存在 `__legacy_unowned_v2__`，会话/消息读写按稳定 `ownerId` 隔离，并已移除 destructive fallback。发送链路一次捕获不可变的 `ownerId`/access token，不再在流式响应期间重读当前账号；新增账号切换竞态测试。BuildConfig 地址强制 HTTPS、有效 host、无 userinfo/query/fragment/control/backslash，API base 仅允许 origin，并有 Gradle 黑盒负向测试。当前共 13 tests；debug APK SHA-256 `edc10d28c6f2746325c3e6721ba12aa983252a2a19d466f682cf15614b01b7fb`。这仍是本地候选证据，尚未完成真实账号/阿里云 API 端到端验收和发布签名构建。
- 根 Web/Electron：类型检查、33 个测试文件/163 tests、38 个 Electron 安全测试、Sharp 冒烟和 production build 均通过。生产依赖 audit 为 0 high / 5 moderate；完整树仍有 Excalidraw 固定 nanoid 的 1 high 条件项和 React 19/旧 Radix peer 告警。设计锁测试因盘点前已有的视觉改动失败，作为独立基线问题保留，未覆盖用户修改。主 JS 为 2,641.33 kB（gzip 774.08 kB），保留性能 warning。
- 本地恢复：format-v2 checkpoint 脚本经独立复审和 10/10 fixture 通过；真实 `20260826-continued-goal-v2` 完成 7 repositories / 9 scopes preflight、首次 apply、同 ID `already-complete`、73 项 SHA 与 0700/0600 权限复算。加固前 v1 仅保留为辅助证据，禁止覆盖或删除。
- 隔离部署模板：双空间 sysusers/tmpfiles、systemd slices/units、端口、Caddy 候选、健康 timer、加密备份/恢复与静态负向测试已落盘；未应用生产。

以上是局部证据，不能替代业务验收。

## 7. 阶段 0 退出条件

- [x] 记录所有已发现 Git 仓库、HEAD、原始 dirty 状态和恢复快照。
- [x] Secret 文件未读值、未提交，权限已收紧。
- [x] 主要 GCP 项目与已知 Cloud Run/身份/日志完成只读盘点。
- [x] `hs-v2ryan` 暂定为独立保留，禁止误删。
- [ ] 取得真实 HalfSphere 生产项目 827 的只读访问。
- [x] 补齐阿里云 systemd/Caddy/Stalwart 文件元数据、目录、监听、安全组和现有备份实况；
  配置/Secret/数据/日志正文按安全边界未读取。
- [x] 补齐 Cloudflare D1/R2/Queues/Email Routing 控制面只读清单；生产镜像资源/迁移/发布
  属于后续审批动作，不能与盘点完成混同。
- [ ] 用户确认并创建阿里云快照、验证现有文件备份并制作加密离线副本后，再允许生产修改。
- [ ] 生产来源闭环后，将 HalfSphere 安全整理到平级目录并验证全部引用；旧副本清理需再次确认。

阶段状态：**进行中，不具备生产切换或停用 GCP 的条件。**
