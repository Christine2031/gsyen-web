# 双业务阿里云部署模板实施记录

日期：2026-08-26  
范围：仅本地 `deploy/aliyun`；未连接或修改生产 ECS、DNS、MX、Caddy、GCP 或阿里云控制面。

## 已实现

- 固定并隔离 `/srv/gsyen` 与 `/srv/halfsphere` 的 `apps/config/data/logs/backups`。
- `systemd-sysusers` 建立独立 `gsyen`、`gsyen-mail`、`stalwart`、`halfsphere` 身份；邮件用户只加入 execute-only `gsyen-space` traversal group，不再获得读取核心 GSYEN Secret 的 `gsyen` 组权限；HalfSphere 所有新增 unit 均以 `halfsphere-*` 命名并以 `halfsphere` 用户运行。
- `systemd-tmpfiles` 固化目录所有权与最小权限；服务不能写对方空间，备份目录仅 root 可写。
- `/srv/gsyen/data` 与 `/srv/gsyen/logs` 的父级由 root 管理，避免共享 `gsyen` UID
  rename/替换模型、邮件或 Stalwart 子树；核心 API 的用户 agent workspace 迁移到唯一显式
  可写的 `/srv/gsyen/data/gsyen-api/agent-sandboxes`，Web/SGSYEN units 不再获得 data/logs
  整棵目录写权限。
- `gsyen.slice` 与 `halfsphere.slice` 分别限制 CPU、内存、任务数和 IO 权重；初始总上限给操作系统、Caddy 和监控保留资源。
- GSYEN 端口固定为 `18080-18085`；HalfSphere 初始使用 `18180/18181`，其余 `18182-18189` 保留。
- 所有 HTTP 应用 unit 增加 loopback 监听验收守卫；监听 `0.0.0.0`/`::` 会导致启动失败。
- HalfSphere Web/API unit、两套独立健康检查 service/timer、两套独立加密备份 service/timer。
- 两套 Caddy 候选片段分别反代本业务 loopback 端口；GSYEN 另有仅允许指定 POST/header/body/timeout 契约的独立 mail-ingest HTTPS site，强制 `message/rfc822` 且要求 envelope-from header 存在，同时保留退信所需的空 reverse-path。渲染器不会导入或 reload；新增激活/回滚 transaction 骨架以 candidate/root/previous 三组哈希批准，锁内复验三者未发生竞态，并在失败时恢复旧 symlink，仍需 Linux/Caddy 影子验证。
- 两套独立环境变量示例只含不可用占位符，不含真实 Secret。
- unit 启动前校验 env 的 root/组/0640 权限、必需键、占位符、大小写规避的 GCP 地址/项目标识、端口空间、loopback、CORS、OSS provider 与独立 RAM role；mail-ingest 另强制显式 5 MiB、并发、receipt 路径、磁盘余量、lease/SMTP/health timeout 顺序和 duplicate-guard 布尔门禁，避免静默回退默认值；校验过程不打印值。
- 两套 rendered non-secret 资源边界门禁显式核对 RDS database/schema/user、OSS bucket/prefix mode、ACR namespace、SLS project、RAM role 和 ECS topology。shared-ECS + 双独立 role 会硬失败并要求独立 HalfSphere ECS；不会把一个合并 role 虚报为权限隔离。
- age 加密备份与停服恢复骨架：一致性钩子、SHA-256、host-wide 容量锁/余量、保护树 mount 防遗漏、tar 成员与展开字节上限、重复/歧义路径、不安全 hardlink 及特权 ACL/security-xattr 拒绝、全应用/current release inventory，以及 config/data/legacy Stalwart 的确定性 path/type/size/hash/link/symbolic-owner/group/mode inventory 前后校验均为强制项。恢复先忽略归档 numeric UID/GID，再把严格验证且目标机存在的业务 allowlist 符号身份映射到 fresh-host ID；旧的无 inventory 包拒绝。两套 inventory 均在首次覆盖前及 rsync 后复验，恢复证据只在 live-tree 复验后复制。canonical root-only 归档输入、恢复前备份、跨重启持久启动门和单空间恢复边界保持不变。本地结果只标记 `LOCAL_ARCHIVE_COMPLETE`/`OFFHOST_COPY_REQUIRED`。
- GSYEN/HalfSphere 独立 logrotate 模板；journald/SLS 可按 unit 前缀、slice 和 Caddy hostname 分流。
- foundation 默认只检查；`--apply` 要求 root、显式预变更批准标记。mail-ingest compatibility installer 已删除 mutable app-root rsync/delete 路径，只接受带 RELEASE/BUILD manifest 的 candidate 并委托 stage；不自动 promote。除 slice 外，service/timer 与 logrotate 均只进入 available 候选区，不覆盖 live unit、不调度日志删除、不启用服务、timer 或 Caddy。
- 所有应用 unit 统一通过独立 app 目录的 `current` 相对链接运行；release tree 要求 RELEASE/BUILD 双 manifest、完整 commit、公开 origin/provider、Gemini/OAuth 明确 allowlist、artifact GCP 标识扫描、确定性 SHA-256、root/业务组只读权限和安全链接。Stalwart 另要求不执行 candidate 的版本/归档 SHA/二进制 SHA 锁定校验。stage 与 promote 使用不同的一次性哈希批准标记，均不重启服务；回滚可只提升单个旧 release。
- 新增独立单服务 systemd transaction：批准摘要绑定 candidate/current unit、
  enabled/active/MainPID、release tree、health 和依赖状态；精确校验 User/Group/EnvironmentFile、
  `NoNewPrivileges`、Exec privilege prefix 与 capability（Stalwart 仅允许
  `CAP_NET_BIND_SERVICE`）。mail-ingest 要求既有 Stalwart loopback/MainPID，Stalwart 要求
  三类旧 MTA conflict 均 inactive。失败自动恢复旧 unit 与服务状态，rollback 可处理
  `unit.before`、disabled/inactive 和首次安装前的 `unit.before.absent`；本地只通过 fail-closed
  静态事务验证，未在 ECS 执行。
- 新增非执行型 firewall/security-group desired-state 清单：目标独立 SG、80/443 公网、SSH CIDR 白名单、Phase 1 邮件端口关闭、应用端口 loopback、egress 先观测后批准；没有修改现有共享 SG/UFW。
- SGSYEN API 的代码、env 和 unit 已统一为 `OBJECT_STORAGE_PROVIDER=oss` + ECS RAM Role：锁定官方 credentials provider、强制 IMDSv2、每次操作取得可轮换 STS 凭证，正文读取使用北京内网 endpoint，浏览器 V4 下载签名使用公网 endpoint；不再把长期 OSS AccessKey 列为生产配置。正文改为受限流式读取，候选配置默认上限 5 MiB、代码硬上限 10 MiB，超过即中止；systemd 最终移除 `DEBUG`，应用启动也拒绝能匹配 `ali-oss` 的 debug glob，避免签名或临时凭证元数据进入生产日志。
- foundation 的目标是安全建立 root:root `0700` 的双业务、逐应用 release approval 目录。
  2026-08-27 的 P1 复审曾发现脚本会先创建备份目录/安装 sysusers，再检查既有 `/srv`
  metadata；本地修复现已把审批标记、既有账号、全部 tmpfiles 目标、受管目录、模板源和
  每个安装目标的只读 preflight 放到首次系统写入之前，并在取得安装锁后、首次受管写入前
  重放一次。静态顺序回归已加入。当前 legacy `/srv/gsyen` 已知不符合目标
  owner/group/mode，因此正式 `--apply` 会在不改变该目录的情况下提前失败；这项本地修复
  未在 ECS 执行，也不构成生产变更授权。快照、文件备份和显式批准闸门仍然有效。

## 静态验证证据

执行命令：

```text
bash deploy/aliyun/tests/validate-templates.sh
```

结果：

```text
Alibaba Cloud deployment template validation passed.
```

验证覆盖：所有 Bash/Python 语法、双空间目录、HalfSphere 用户/组/unit 前缀、邮件用户权限、端口边界、slice 资源限制、loopback/MainPID 守卫、不可变 release/current 路径、RELEASE/BUILD/Stalwart manifest、Gemini 正向 allowlist 与 Vertex/run.app 负向 artifact、双 ECS resource boundary 正向与 shared-ECS 双 RAM role 负向、release 确定性哈希与逃逸链接/可写文件/`.env` 负向、mail-ingest Caddy 契约、env Secret 占位符，以及 health/backup/restore/Caddy/network/systemd transaction 门禁的静态检查。另有 content inventory 6/6、model dataset transaction 5/5 和 model stdlib contract 19/19 通过。

额外执行：

```text
bash deploy/aliyun/install-foundation.sh --check
Foundation templates passed shell syntax and completeness checks.

bash deploy/aliyun/install-mail-ingest.sh --check
Mail ingest sources passed static checks. No release was staged or promoted.
```

邮件接入网关回归：

```text
cd deploy/aliyun/mail-ingest && npm test
26 tests passed, 0 failed
```

覆盖原始 MIME 接收、未授权/异域拒绝、稳定 delivery ID 与原文哈希校验、
原子 receipt 状态转换、并发/陈旧 lease 去重恢复、Stalwart 超时和失败重试、
Message-ID 记录、空 envelope sender、recipient case/plus/dot 保真、至少 30 天
RFC 7352 重复守卫、SMTPUTF8/8BITMIME 能力门禁、SMTP dot-stuffing、单次事务
硬超时及成功响应契约。

API loopback 修复由主任务完成并提供以下本地证据：`gsyen-api` 与
`sgsyen-api` 的 typecheck/tests/build 均通过；分别实启在
`127.0.0.1:19081` 与 `127.0.0.1:19084`，health 返回 200，`lsof` 仅显示
loopback listener。该源代码阻断已解除；候选 systemd unit 在阿里云影子
主机上的在线验证仍未执行，不能把本地证据扩大为生产验收。

SGSYEN API 当前对象存储测试为 17/17 通过，覆盖安全 key、STS 凭证轮换、
内网读取/公网签名 endpoint 分离、credential error 脱敏、流式正文大小边界、
配置硬上限及 `ali-oss` debug 拒绝；typecheck/build
通过，直接 Hono/node-server/ws 依赖已升级。2026-08-27 复验确认本地、Dockerfile、
CI 和既有 ECS 盘点均为 Node 22 基线，因此观察期 GCS rollback adapter 已最小升级到
`@google-cloud/storage@8.0.1`；typecheck、21/21 tests 和 build 通过。该可选回滚链
仍有 `gaxios`/`uuid` 的 2 个 moderate 告警，阿里云生产配置强制选择 OSS 且动态加载
不会执行 GCS 实现；仍须以实际部署 env/日志证明生产未选择 GCS，不得把本地隔离设计
冒充在线证据。
另以不可用占位配置做黑盒启动：`DEBUG=ali-oss` 在监听端口前 fail closed；
清空 `DEBUG` 后服务只监听 `127.0.0.1:19084`，`/health` 返回 200，并在
SIGINT 后完成优雅退出。该测试不访问 OSS metadata，也不等于 ECS/RAM 联调。
全局 500 错误日志另有 4/4 脱敏测试：日志只输出固定 schema、allowlist
分类和错误类型，限制为 256 bytes，不读取或序列化 error 的
`cause/request/config/headers`，客户端仍只收到通用 500 响应。

本机没有 `caddy`、`age`、`shellcheck`、`systemd-analyze` 或 `logrotate`，因此未伪造 Caddy 实际解析、age 恢复、systemd 在线验证或 logrotate dry-run 结果；这些必须在隔离影子主机安装锁定版本后执行。

## 明确未完成及阻断

- 阿里云仍为 0 云盘快照；控制面已观察到 18 个文件备份版本，但从未恢复，且本地同盘归档未验 hash/恢复，均不能冒充可用回滚。`prechange-approved` 不得创建，直至快照、加密离线副本及恢复证据就绪。
- 本轮本地模板没有创建或改变 `/srv/*`、Linux 用户、环境文件、数据库用户、OSS bucket、
  ACR namespace、RAM policy 或 SLS 告警；实机已存在不符合目标布局的 legacy
  `/srv/gsyen`，而 `/srv/halfsphere` 不存在。这里只交付可审查模板，不能把“本轮未创建”
  误读为生产主机上绝对不存在。
- 未启用任何 service/timer，未写 Caddy import/immutable baseline，未重载 Caddy，未切 DNS/MX/第三方回调；原子激活脚本会在 baseline 缺失时硬失败，首次 root Caddy onboarding 仍须单独备份和批准。
- 项目号 `827638954474` 的真实 HalfSphere 生产 revision/source/commit 仍不可访问。`halfsphere-api.service` 只定义 launcher 契约并会在 launcher 缺失时失败，绝不以项目 776 或推测代码替代。
- GSYEN API 与 SGSYEN API 的 loopback 源码缺口已修复并通过本地实启验证；尚缺阿里云影子主机上的 systemd/`ss`/业务联调证据。
- 本地同盘加密归档不是灾备。mutable-content inventory 与 fresh-host 符号身份映射已通过
  6/6 fixture，但数据库/OSS hook 仍故意 fail closed；仍需阿里云快照、Stalwart quiesce、
  带独立来源认证的异地副本、数据库/对象 count+hash 导出和真实 fresh-host 恢复演练。
- 单服务 systemd transaction 与模型数据 transaction 都尚未经过 Linux `systemctl`、
  active/inactive/absent、健康失败、ECS reboot 或断电注入；本地静态/fixture 证据不能作为
  生产 `--apply` 授权。
- Caddy stdout 分流到独立 SLS stream、告警规则、GSYEN/SGSYEN RAM 最小权限及 HalfSphere 独立 ACR/OSS/RDS 仍需控制面实施和费用确认。
- 一台 ECS 同时最多一个实例 RAM role，不能满足双方独立 role；当前 boundary gate 因此阻断 shared-ECS stage/start。独立 HalfSphere ECS 的规格/月费必须另报并在购买前确认。
- Stalwart 目标版本、配置 schema、专用认证 loopback listener 和真实数据迁移尚未验证；旧 `/srv/gsyen/stalwart` 不会被模板自动删除。Caddy mail-ingest site 也只是未激活 candidate，MX 保持不变。

## 生产前强制顺序

1. 取得 HalfSphere 项目 827 的只读权限并锁定生产源码 commit/digest。
2. 创建并记录 ECS 云盘快照及首个可校验的文件级备份；再创建 root-only 预变更标记。
3. 确认 HalfSphere 独立 ECS 方案/费用，建立双方独立 RAM role；在各自影子环境运行 foundation，渲染 non-secret topology/resource contracts 与真实 env（不进 Git），但保持 unit 禁用。
4. 在阿里云影子主机复验 GSYEN API/SGSYEN API 的 systemd loopback 守卫，并分别部署两个业务 release。
5. 实现两套数据库/对象一致性备份 hook，生成加密异地副本并完成独立恢复演练。
6. 分别运行 systemd 在线验证、Caddy validate、业务健康检查、负载和故障隔离测试。
7. 只有经用户批准才可导入 Caddy、切 DNS/回调或启动生产流量；MX 本阶段不变。
