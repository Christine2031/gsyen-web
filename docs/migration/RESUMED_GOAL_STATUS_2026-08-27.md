# GSYEN / HalfSphere 统一迁移 Goal 恢复状态

更新时间：2026-08-27（Asia/Shanghai）  
性质：恢复后的阶段性执行证据；不是生产切换或迁移完成声明

## 1. 当前结论

统一 Goal 已恢复执行，本地代码、邮件链路和阿里云部署候选继续推进；生产侧仍未达到
可切换条件。当前没有执行 DNS/MX、生产回调、GCP 停服、数据删除、Secret 写入、阿里云
付费资源创建或 ECS 配置修改。

两个系统均仍依赖 GCP：

- GSYEN 生产流量和旧 Cloud Run/GitHub Actions 尚未停止；阿里云实机上的
  `gsyen-api`、`sgsyen-api` 均为 inactive/dead/disabled，所需正式 env 文件不存在，
  因此当前没有阿里云 API 可承载生产请求。
- HalfSphere 当前 Vercel 前端仍调用项目号 `827638954474` 的 Cloud Run `/apply`；
  当前有效 GCP 身份对该项目无 IAM，真实后端 revision/source/data/Secret 尚未闭环。
- 旧项目 `halfsphere-api-7586`（项目号 `776196228503`）的同名
  `halfsphere-api` 服务与当前生产 URL、区域和项目号不一致，禁止当作生产源码替代。

因此总状态仍是：**迁移进行中，禁止声称已部署完成或彻底脱离 GCP。**

2026-08-27 对公开 production artifact 的重新下载与 SHA-256 证明当前依赖仍在：

| 站点 artifact | SHA-256 | 仍包含的活动地址 |
|---|---|---|
| `gsyen.com/assets/index-DJ_dA7eA.js` | `d35cd8f08aec9e596a478afeeac5aafd01ed606ea8dd73a2dab9df69db04ae86` | `gsyen-api-776196228503.asia-east1.run.app` |
| `sgsyen.com/assets/index-ukiCtp5a.js` | `34b3e3dc53e0d93a415b19dfbd632b910b1be0d4a1b82e35a06a01880d5840dc` | `sgsyen-api-ocjwdme54q-de.a.run.app` |
| `www.halfsphere.com/_next/static/chunks/16kh7-1r9e.k..js` | `a7b1f409696b02a97cd932060a1b7163a39fb0384100c81112d057c4bab4b333` | `halfsphere-api-827638954474.us-central1.run.app/apply` |

三站响应均来自 Vercel。本地候选的 Web/Electron/Android build 与 HalfSphere `.next`
复扫没有 GCP 平台 token，说明集中配置改造已进入候选代码；但候选尚未发布，不能用它
抵消上述生产 artifact 证据。

目标 ECS 的只读 Workbench 盘点还确认：`gsyen-web`、`sgsyen-web` 和 `gsyen-model`
虽然在 loopback 端口运行，但当前 Caddy 配置没有任何 GSYEN/SGSYEN 路由；ECS 上两份
Web artifact 仍分别硬编码上述 GSYEN/SGSYEN Cloud Run 地址。HalfSphere 目录、用户、
unit 与 `18180-18189` listener 均不存在。因此“应用进程存在”不能解释为“已部署到
阿里云生产”。

## 2. 保护现状与恢复点

- 旧迁移快照的 11/11 校验和已复核通过。
- 7 个 Git 仓库 `git fsck` 通过，未发现 conflict；所有用户已有 tracked/untracked
  修改均保留。
- 2026-08-27 当前 v9 恢复点捕获 7 个仓库、9 个显式 scope、177 个符合条件的未跟踪
  文件；73/73 SHA-256 通过，目录权限 `0700`、文件权限 `0600`，符号链接为 0，同 ID
  复跑返回 `already-complete`。精确路径为
  `/Users/Ethan/Desktop/Projects/gsyen-local-checkpoint-20260827-resumed-goal-v9`。
- 恢复点排除 env、Secret、密钥/证书、数据库 dump、构建目录和嵌套仓库内容；未执行
  `git add -A`、`git clean`、覆盖恢复或提交真实 Secret。

该恢复点只用于保护当前工作树；最终仍要在批准的版本管理流程中分别保留各仓库
Git 历史、remote、dirty 状态和 release manifest。

## 3. 2026-08-27 本地复验结果

| 单元 | 结果 | 证据与限制 |
|---|---|---|
| GSYEN Web/Node | PASS | TypeScript；33 files / 163 tests；生产 build；主 JS 2.64 MB，仍有分块性能告警 |
| Electron 安全 | PASS | 38/38；未执行签名发布、升级链或最终安装包出网扫描 |
| 根生产依赖 | PARTIAL | 0 critical / 0 high / 5 moderate；Fortune/Excel 的 `uuid` 上游链暂无直接补丁 |
| `gsyen-api` | PASS（本地） | typecheck、38/38 tests、build（`dist/server.cjs` 84.2 kB）；生产依赖 0 vulnerability；agent sandbox 已迁入受保护的持久路径并加入逐用户/逐文件/逐操作/磁盘余量配额、全局 mutation lock、原子写和 5 秒 readiness 缓存；未连接真实 Supabase/Gemini/model/mail |
| `email-worker` | PASS（本地） | TypeScript；20 files / 159 tests；独立 release-contract 2/2；development/production Wrangler dry-run；未发布 |
| `mail-ingest` | PASS（本地） | 26/26 tests、语法检查、lockfile 与 audit 0；未连接真实 Queue/Caddy/Stalwart |
| `sgsyen-api` | PARTIAL | typecheck、21/21 tests、build；OSS 为活动目标、GCS 动态适配器仅作回滚；GCS SDK 升到 Node 22 基线后仍有 2 moderate transitive 告警 |
| `sgsyen-web` | PASS | typecheck、3/3 静态服务器测试、build、audit 0；主 JS 1.23 MB，仍有分块性能告警 |
| HalfSphere 前端候选 | PASS（候选源码） | lint 0 error/0 warning、typecheck、8/8 tests、24 routes build；只用 `.invalid` 公开占位配置；不能代替项目 827 后端 |
| HalfSphere 完整依赖 | PASS | 687 项完整依赖与 170 项生产依赖分别复审，均为 0 advisory / 0 vulnerability；覆盖升级后的 lint、typecheck、8/8 tests、24/24 static generation 和 production build 全部通过 |
| `gsyen-model` | PARTIAL | ECS Python 3.12.3 真实 venv 的 56 项完整依赖已精确锁定，`pip check` 和旧版本 `/ask` 冒烟通过，freeze SHA-256 为 `2eb726b9252ba840f305cf4fe405a809ffd889d12f592ab1c907eec8b8ac3c20`；候选已有 demo/production、上海业务时区动态新鲜度、批准 SHA/大小、单次 FD 读取、路径/uid/gid/mode 边界、ISO 日期、内存释放、`/healthz`/`/readyz` 和 19/19 stdlib 测试；另新增 immutable dataset stage/promote/rollback 事务并通过 5/5 fixture。仍缺真实新鲜数据、首次 legacy onboarding、同构 Linux/systemd/断电事务演练及 commit release，实机旧版本仍以 root、无 cgroup 上限运行 |
| 阿里云部署模板 | PASS（静态） | `validate-templates.sh`、foundation `--check`、mail-ingest `--check`、6 项 content inventory、5 项 model dataset transaction 与 fail-closed 单服务 systemd transaction 检查均通过；未执行 `--apply`、Linux `systemd-analyze verify` 或真实恢复 |

部署空间边界本轮另关闭两个本地 P1：`/srv/gsyen/data` 与 `/srv/gsyen/logs` 的模板父级
改为 `root:gsyen-space 0710`，避免共享 `gsyen` UID 替换模型/邮件/Stalwart 子树；仅
`gsyen-api` 的 `/srv/gsyen/data/gsyen-api/agent-sandboxes` 保留显式写权限，Web/SGSYEN
units 不再取得整个 data/logs 的写挂载。真实 legacy ECS metadata 不符合目标模板时 foundation
会在任何系统写入前失败，仍须等快照与备份批准后迁移，不能直接 chmod/chown。

另外关闭了两个此前的本地 P1 代码缺口，但没有把它们扩大为在线验收：

- `gsyen-api` agent sandbox 现在默认每用户 20 MiB/256 文件、深度 8、单文件 512 KiB、
  单操作 512 nodes/2 MiB/1 秒；阿里云模板另外保留 5 GiB 磁盘余量。读/写/遍历/grep/
  delete/reset 共用边界与预算，shell 继续永久禁用。Cloud Run 回滚镜像显式保留
  `HOST=0.0.0.0`，阿里云 unit 则精确覆盖为 `127.0.0.1`，避免修复阿里云监听时破坏尚在
  承载流量的旧 Cloud Run。
- 备份包现要求 config/data/legacy Stalwart 的确定性内容与 metadata inventory；归档前后、
  tar member、restore staging 和 live tree 均复算，fresh host 按 allowlist 的符号用户/组
  映射 UID/GID，旧的无 inventory 包拒绝。单服务 systemd 激活/回滚另绑定 candidate、
  current unit、enabled/active、MainPID、release、health 和依赖状态；恢复到
  `unit.before.absent`、disabled/inactive 以及失败自动恢复均有 fail-closed 分支。真实 Linux
  fresh-host restore、Stalwart 停服一致性、断电恢复日志和在线服务事务仍是 P1 门禁。

本轮对 HalfSphere 做了最小安全更新：固定兼容 Node 20 的 `pnpm@10.34.5`，升级 Next/
`eslint-config-next` 到 `16.3.3`，把只在构建阶段使用的 `shadcn` 移到开发依赖，
用 Next Router 取代内部页面的 `window.location.href`，并把弃用的 `middleware.ts`
等价迁移为 `proxy.ts`。变更后完整复跑通过且不再产生该弃用告警。
同时移除对可伪造 `X-Real-IP` 的信任，仅使用由 Caddy/Vercel 净化的
`X-Forwarded-For`，并给进程内限流表增加 10,000 条容量门、节流过期清理与满载
fail-closed；新增 2 项静态安全契约测试。Cloudflare/ALB 位于 Caddy 前方时仍须在真实
入口按精确代理 CIDR 配置并做客户端 IP/限流 E2E，不能只依赖该本地修复。
依赖覆盖升级后又用冻结 lockfile 重新安装并完整复验：完整树 687 项、生产树 170 项，
两者均为 0 advisory；构建仅使用 `.invalid` 域名和公开占位 anon key，未读取或打印
真实 Secret。该结果只证明候选前端，不替代项目 827 的生产后端来源闭环。

本轮修复了邮件恢复路径的两个真实测试问题：Node-only release contract 不再被 Vitest
重复收集；D1 trigger 同时更新 intervention ledger 时，收件恢复逻辑接受受影响行数
`>= 1`，不再把已完成事务误报为未完成。代码仍保持 R2 持久化及 SHA 校验先于 D1
主记录、持久 outbox、幂等 delivery ID、lease/retry/DLQ/terminal ledger 的契约。

## 4. HalfSphere 生产源码 P0

2026-08-27 只读复审重新确认：

- `halfsphere.com` 仍由 Vercel 响应；当前 production artifact 和 `/apply` chunk 都
  直接调用 `https://halfsphere-api-827638954474.us-central1.run.app/apply`。
- production deployment 对应前端 commit
  `82b743a4546c3d92ff5f7c9291bb42974977b560`；本地嵌套候选与公开 GitHub ref
  一致。这只闭环前端，不闭环 Cloud Run 后端。
- 当前 `gcloud` 活动身份为 `lihouyi7586@gmail.com`，对项目
  `827638954474` 精确返回 `PERMISSION_DENIED`。
- 项目 `halfsphere-api-7586` 和 `hs-v2ryan` 可见且 ACTIVE；未启用任何被禁用 API，
  未恢复计费，未读取 Secret 值。

最小只读解锁方式是由项目 827 的 Owner/IAM Admin 授予：

```bash
gcloud projects add-iam-policy-binding 827638954474 \
  --member='user:lihouyi7586@gmail.com' \
  --role='roles/viewer'
```

`roles/viewer` 足够列出 Cloud Run revision、Build、Artifact、日志和 Secret 元数据，
不含 `secretmanager.versions.access`，不能读取 Secret 值。取得权限后必须从 current
revision 的 image digest/build provenance/source archive 反查完整后端 commit；在此之前
禁止使用 776 镜像或推测代码部署 HalfSphere API。

## 5. 阿里云生产变更门

当前已知目标 ECS 系统盘为 `d-2ze9t48edu0hojhpho4q`，100 GiB；2026-08-27 控制面
复核仍显示手工云盘快照为 0、快照服务未开通。按整盘保守上限，单个手工快照预计约
`14.80 元/月`，实际按快照占用和阿里云账单为准。以下操作仍在等待用户明确确认：

1. 开通/使用 ECS 快照并为上述精确磁盘创建 1 个手工快照；本次授权不包含删除。
2. 快照完成且文件级备份方案复核后，才可修改 systemd/Caddy/目录/用户/防火墙。
3. 新购 RDS、OSS、ACR、SLS/KMS/MNS、ALB 或 HalfSphere 独立 ECS 仍须单独报价和批准。

CLI SSH 对 `root`/`ubuntu` 当前均返回 public-key denied，但既有阿里云 RAM 会话已恢复，
已通过实例详情的 Workbench 免密 `root` 入口完成只读盘点。没有读取 Secret 值，也没有
修改文件、服务、Caddy、防火墙或控制面资源。实机确认的主要阻断包括：

- 目标 ECS 同时承载无关商城/Smart Wing 服务，不满足只允许 GSYEN/HalfSphere 长期共享
  基础设施的边界；systemd 当前因 6 个无关 unit 失败而处于 degraded。
- 同机无关 root 进程也意味着不能安全给该 ECS 绑定 GSYEN RAM role 或写入生产 Secret；
  一台新共享 ECS 仍只有一个实例 role，当前推荐终态改为 GSYEN/HalfSphere 各自独立 ECS，
  或先完成单独批准的服务级短期身份安全评审。
- GSYEN 三个活动应用 unit 仍以 root 运行、没有 CPU/内存上限；HalfSphere 独立空间完全
  未建立。
- 两台 ECS 共用一个安全组，12 条入站规则都来自 `0.0.0.0/0`；不能直接收敛，否则可能
  影响无关实例。目标主机 UFW 当前只放行 22/80/443，仍需独立安全组/来源白名单设计。
- Stalwart `0.16.19` 正在运行，但 IMAPS 使用自签名证书，`mail-ingest` 未部署；这不是
  可验收的公网邮件链路。
- 文件备份最新一版已于 2026-08-27 06:55:17 完成，但从未恢复；同盘未加密应用归档
  不含受保护配置/Secret，不能替代云盘快照、加密离线副本和恢复演练。

## 6. 下一执行顺序

不需新增授权即可继续：

1. 活动 GCP 平台复扫现只剩 `gsyen-api` GCP workflow、SGSYEN GCS rollback adapter 及其
   package manifest；继续准备 Android release 前置条件和批准 origin 的最终 artifact 扫描。
2. 生成新的完整恢复点并更新测试矩阵、代码审计和部署报告；不提交 Secret。
3. 基于已闭环的 Python 3.12.3/56 项 lock 与 dataset transaction，继续准备模型 immutable
   release、wheel/hash/SBOM、legacy onboarding 变更 diff，以及真实 Linux 恢复/systemd/
   健康检查/断电回滚演练脚本。

解锁后按门执行：

1. ECS/磁盘/systemd/Caddy/Stalwart/端口的只读核对已完成；快照获批并成功、文件级
   恢复方案闭环后，才可进入生产主机变更。历史峰值/容量仍须在影子阶段持续测量。
2. 项目 827 `roles/viewer` 到位后闭环 HalfSphere 真实后端 revision/source/data/Secret
   元数据和项目 `hs-v2ryan` 的生产归属。
3. 任何付费资源、DNS/API/回调切换、GCP 停服、Secret 写入或不可恢复删除继续走独立
   审批门；邮件阶段一不修改 `gsyen.com` MX，Resend 继续为唯一生产外发通道。
4. 独立 ECS 旧私网报价缺少 Caddy 私网上游和 NAT/EIP 出网成本，不能作为购买授权；
   选择两 ECS或服务级身份方向后，必须从登录态订单页重取完整组合报价。

明确分类为非 GCP 运行平台依赖、当前允许保留的 Google 项包括：Gemini Developer API、
Supabase 发起的 Google OAuth、Google Fonts，以及 Android 构建期 Google Maven/KSP。
其中 Google Fonts 后续应评估自托管，当前允许不等于必须长期保留。`sgsyen-api` 的 GCS
provider 是迁移观察期回滚适配器，只有实际阿里云
env/log 证明 `OBJECT_STORAGE_PROVIDER=oss` 且 GCP-off 观察通过后，才能决定删除。

## 7. 当前完成判定

数据数量/主键/hash、真实邮件 E2E、备份恢复、ECS reboot、容量/故障、双系统独立回滚、
GCP-off 和零 GCP 请求/费用观察均未完成；HalfSphere 最终平级源码落位与全部路径引用
验证也未执行。HalfSphere 仍有 P0，GSYEN model 与生产部署仍有 P1。因此 GSYEN、
HalfSphere 和联合迁移均不得评分为完成。
