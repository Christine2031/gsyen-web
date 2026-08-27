# 阿里云控制面与 ECS 只读复审

初盘日期：2026-08-26；续跑复核：2026-08-27（Asia/Shanghai）  
地域：华北 2（北京），`cn-beijing`  
目标 ECS：`i-2zeewhay0farxq8lucrd`  
结论状态：**部分证实；容量、备份恢复和生产变更门均未通过**

## 1. 范围、证据和禁止动作

本次只读复审用于核对阿里云实际状态，不把仓库模板或旧文档当作生产事实。

- 本机未发现可用的阿里云 CLI，因此控制面事实来自已登录的阿里云控制台
  `Describe/List` 等只读页面；没有展示或记录 AccessKey、Cookie 或任何凭据。
- 在已有且无需新增授权的 ECS Workbench 登录入口中，只执行了 `uptime`、`free`、
  `df`、`lsblk`、`vmstat`、`ss`、systemd 状态/属性、版本号和文件元数据等无副作用命令。
- 未读取环境变量值、Stalwart 配置正文、应用数据、日志正文、OSS 对象或 Secret 值。
- 未使用 Cloud Assistant `RunCommand`，未创建 invocation；未创建/修改/重启任何资源，
  未改安全组、防火墙、服务、DNS、备份策略或部署。
- 盘点范围只包含目标 ECS 及与其关联的磁盘、ENI、VPC、vSwitch、安全组和可见的
  阿里云产品元数据。另一台 ECS 及现有 OSS 的业务归属尚未闭环，均按无关资源保护。

本文统一使用：

- `实际/已证实`：控制台或主机只读输出直接证明；
- `模板/目标`：仓库中存在配置，但未在生产应用；
- `未知`：当前只读入口不足以证明；
- `不存在于可见清单`：相应地域列表为空，不等同于整个账号、其他地域绝对不存在。

### 1.1 2026-08-27 Workbench 续跑差异

阿里云 RAM 会话恢复后，重新从精确实例详情进入 Workbench 免密 `root` 会话，只执行
只读命令和本机无凭据探针；没有创建快照、改服务/文件/防火墙、启用 API、读取 Secret
值或启动/停止进程。新证据进一步确认：

- 实例仍是 `i-2zeewhay0farxq8lucrd`、8C16G、Ubuntu 24.04、5 Mbps；系统盘仍是
  `d-2ze9t48edu0hojhpho4q`、ESSD Entry 100 GiB、0 快照/0 策略，且快照服务尚未开通。
- 根分区当前 43G/99G（46%），约 12 GiB memory available、无 swap；三次 `vmstat`
  为 94–98% idle/0% iowait。`ss -s` 为 332 total、TCP established 27；这仍只是瞬时值。
- systemd 为 `degraded`：`aegis.service` 和 5 个无关 Smart Wing candidate unit failed。
  本轮不修复、不重置，因为它们不是 GSYEN/HalfSphere 且可能属于商城发布流程。
- `gsyen-web`、`gsyen-model`、`sgsyen-web`、Stalwart active；`gsyen-api` 与
  `sgsyen-api` inactive/disabled，`mail-ingest` 和全部 `halfsphere-*` unit 不存在。
- 三个活动 GSYEN Web/Model unit 仍以 root 运行，`CPUQuota`/`MemoryMax` 为 infinity；
  `systemd-analyze security` 分别给 Web/Model/SGSYEN Web `8.7 EXPOSED`，Stalwart
  `6.1 MEDIUM`。仓库中的独立用户/slice/hardening 尚未成为实际配置。
- `/srv/halfsphere`、`halfsphere` 用户/组和 `18180-18189` listener 均不存在；
  `/srv/gsyen` 为 root 所有，部分应用目录仍是 UID 502/`staff`。
- 当前 `/etc/caddy/Caddyfile` 验证通过但全文件及所有候选/备份配置均没有
  `gsyen`/`sgsyen`/Stalwart/mail 路由；因此 loopback 应用没有阿里云生产入口。
- ECS 已部署 GSYEN Web artifact 仍包含
  `gsyen-api-776196228503.asia-east1.run.app`；SGSYEN artifact 仍包含
  `sgsyen-api-ocjwdme54q-de.a.run.app`。后二者 SHA-256 分别为
  `1d328f75f4ca8e579a09b2e23dbe71519b6460e753696bcfe201859d16397bbd` 和
  `34b3e3dc53e0d93a415b19dfbd632b910b1be0d4a1b82e35a06a01880d5840dc`。
  两个 API 构建产物与当前本地候选 hash 也不一致，服务器源码副本属于旧基线。
- Stalwart `0.16.19` 本机 SMTP banner 正常，HTTP `8080` 返回 302；IMAPS `993`
  使用 `rcgen self signed cert`，不能作为公网 TLS 验收。`mail-ingest` 仍未部署。
- 文件备份最新完成时间变为 `2026-08-27 06:55:17`，任务仍在每日运行；上次恢复时间
  仍为 `-`。同盘 tar 共有 326 个条目、SHA-256
  `529a7b95297438a9ddb0ff1c56ff20a942190586dc2a77e86306cae8ae02a0d7`，未加密、
  未覆盖受保护 config/Secret，也未恢复，仍不能替代云盘快照与离线灾备。

续跑结论：控制面入口已恢复，但它只让“先查实际”得以继续；目标环境就绪状态没有因此
提升。反而确认现有 ECS 与无关商城/Smart Wing 共机，超出用户只允许 GSYEN/HalfSphere
共享的长期基础设施边界。任何安装模板、迁移用户/目录、Caddy reload 或安全组收敛仍须
先完成快照/可恢复文件备份和精确变更审批。

## 2. 账号与地域资源摘要

### 2.1 可见资源

| 资源 | 实际状态 | 归属/处置边界 |
|---|---|---|
| ECS | 2 台 | 目标 8C16G；另一台 4C8G 为无关业务，禁止修改 |
| 云盘 | 2 块 | 均为 100 GiB，均显示 0 云盘快照 |
| ENI | 2 个 | 目标主 ENI 见下文 |
| 安全组 | 1 个 | 两台 ECS 共用，不能只按 GSYEN 风险直接修改 |
| VPC / vSwitch / 路由表 | 各 1 | 现有共享基础设施 |
| OSS Bucket | 2 个 | `botaizt`、`btshangcheng`；疑似既有商城业务，禁止复用或读取对象 |
| CDN 域名 | 1 个 | 归属未知，禁止修改 |
| RAM 用户 / RAM 角色 | 1 / 10 | 归属未知；目标 ECS 未绑定 RAM 角色 |

### 2.2 地域产品清单

| 产品 | `cn-beijing` 可见事实 | 迁移结论 |
|---|---|---|
| RDS | 实例列表无实例；VPC 资源统计 RDS 为 0；回收站 0 | 当前无可用的 GSYEN/HalfSphere RDS，目标数据库仍须建设和审批 |
| OSS | 2 个标准、本地冗余 Bucket；版本控制和传输加速均关闭 | 业务归属未闭环，不得将其当作迁移目标或备份介质 |
| ECS 镜像 | 目标使用阿里云 Ubuntu 24.04 公共基础镜像；自定义镜像页未形成可复核清单 | 自定义镜像数量/归属未知，不能据此宣称为 0 |
| ACR | 企业版实例列表为空；旧 `instances/default/namespace` 只读路径被控制台重定向回企业版实例列表，未出现个人版 namespace/repository | 未发现可用企业版 ACR，也不能把重定向推断为账号全局绝对没有旧个人版资源；目标两套 namespace/repository 仍须在定价/类型确认和审批后创建。官方当前说明个人版免费但无 SLA，企业版为包年包月且另产生 OSS 费用；北京支持经济版，但实例基础价必须以购买页实时显示为准，当前没有可据此批准的精确报价 |
| SLS | 控制台显示未开通 | 生产日志、审计和告警目标尚未建立 |
| SLB/CLB | 控制台显示未开通；目标 ECS 无关联负载均衡 | 当前入口为单 ECS/Caddy/公网 IP |
| SAE | 未开通；全地域应用 0、实例 0、CU 0、任务 0 | 当前没有 SAE 影子或生产服务 |
| KMS | 北京地域无 KMS 实例 | 未发现目标 KMS；不能据此断言账号中没有其他 Secret 系统 |
| NAT / VPN | VPC 统计 NAT 0、VPC NAT 0、VPN 0 | 没有可见的 NAT/VPN 冗余链路 |
| EIP | EIP 列表无记录；目标详情 EIP 为 `-` | 目标使用实例公网 IP，不是 EIP |
| 文件备份 | ECS 文件备份基础版已保护目标 100 GiB | 有恢复点，但尚未做恢复验证；详见第 5 节 |
| 云盘快照 | 快照服务尚未开通；两块盘均为 0 快照 | 生产变更前快照门仍关闭 |

ACR 计费与北京可用性依据：阿里云官方
[计费说明](https://help.aliyun.com/zh/acr/product-overview/billing-description)与
[开服地域](https://www.alibabacloud.com/help/zh/acr/product-overview/supported-regions)。本轮没有
点击购买、创建实例、开通 OSS 或提交订单；第三方页面出现的促销价不作为审批证据。

## 3. 目标 ECS、网络和磁盘

### 3.1 ECS

| 字段 | 实际值 |
|---|---|
| 实例 ID / 名称 | `i-2zeewhay0farxq8lucrd` / 福利商城全域系统 |
| 状态 | Running |
| 可用区 | 北京 F |
| 规格 | `ecs.u2a-c1m2.2xlarge` |
| 标称容量 | 8 vCPU / 16 GiB |
| 操作系统 | Ubuntu 24.04 64-bit |
| 镜像 | `ubuntu_24_04_x64_20G_alibase_20260720.vhd` |
| 计费/到期 | 包年包月，2027-05-18 23:59:59 到期 |
| 公网带宽 | 固定带宽 5 Mbps |
| 公网 / 私网 IPv4 | `123.57.232.253` / `172.27.70.38` |
| IPv6 | 未配置 |
| RAM 角色 | 未绑定 |
| 负载均衡 | 未关联 |
| 控制台健康 | 系统/实例可达性检查通过；无监控告警规则 |

控制台安全摘要另显示 3 个中危告警和 1 个安全问题。本轮没有展开可能含业务或漏洞细节的
正文，因此只能记为待安全审计项，不能推断为已修复或已被利用。

### 3.2 VPC、vSwitch 和 ENI

| 资源 | 实际值 |
|---|---|
| VPC | `vpc-2zepepewnh0t0057976a3`，默认 VPC，`172.16.0.0/12`，Available |
| DNS | `100.100.2.136`、`100.100.2.138` |
| 公网直通 | 已开启 |
| vSwitch | `vsw-2zefwrzql67njbd09tw9c`，默认 vSwitch，北京 F，`172.27.64.0/20` |
| vSwitch 地址使用 | 已用 2 / 4092，可用 4090 |
| ENI | `eni-2zeewhay0farxq8nwh1z`，主网卡，InUse，`172.27.70.38` |
| ENI 释放策略 | 随实例释放 |

### 3.3 系统盘

| 字段 | 实际值 |
|---|---|
| 云盘 ID | `d-2ze9t48edu0hojhpho4q` |
| 类型 / 容量 | ESSD Entry / 100 GiB |
| 标称 IOPS | 2600 |
| 用途 | 系统盘，随实例释放 |
| 云盘快照 / 自动快照策略 | 0 / 0 |
| 主机视图 | 单块 100G NVMe；根分区 ext4 99G |
| 根分区使用 | 43G 已用、52G 可用、45% |

系统盘、实例公网 IP、Caddy 入口和 ECS 均为单点。现状没有快照、数据盘或负载均衡可承担
快速故障转移。

## 4. 安全组和公网暴露

安全组 `sg-2zeid0k1op66p92f3qqr` 为普通安全组，两台 ECS 共用，组内互通开启。
12 条入方向规则的 IPv4 来源全部为 `0.0.0.0/0`：

| 协议/端口 | 规则备注或常见用途 | 风险判断 |
|---|---|---|
| TCP `48080` | 网站管理系统后端服务 | 管理面不应对全网开放 |
| TCP `13306` | docker-mysql | 数据库端口不应对全网开放 |
| TCP `16379` | docker-redis | 缓存端口不应对全网开放 |
| TCP `50000`、`8180` | Jenkins | CI 控制面不应对全网开放 |
| TCP `54280` | 未说明 | 所有者和用途未知 |
| TCP `11420` | bt | 管理面不应对全网开放 |
| 全部 ICMPv4 | Ping 等 | 需按运维需求收敛 |
| TCP `80`、`443` | Web | 预期公网入口，但应由入口层统一管理 |
| TCP `3389` | RDP | Linux 目标不需要；另一台 ECS 用途未知 |
| TCP `22` | SSH | 当前允许全网访问 |

没有自定义出方向规则，采用默认全放行。目标主机的 UFW 当前启用、入站默认拒绝，仅允许
IPv4/IPv6 的 `22`、`80`、`443`，因此在**目标主机**上暂时挡住了安全组额外放开的
数据库、Redis、Jenkins、管理和邮件端口。但这不是安全组收敛的替代：

- 公网 SSH `22` 在安全组和 UFW 两层都允许任意来源；
- 同一安全组的另一台无关 ECS 的主机防火墙和监听未知；
- 安全组变更可能同时中断无关业务，必须先核对另一台 ECS 所有者、监听和访问来源；
- 现有共享安全组不属于用户允许长期共享的基础设施，HalfSphere 目标应有独立权限边界。

本轮将其列为 **P1 待隔离风险**，但没有证据证明已发生入侵或数据泄漏，因此不虚报为 P0。
任何收敛均需单独变更方案、来源白名单、回滚规则和用户批准。

## 5. 云盘快照与文件备份

### 5.1 实际保护状态

- 快照全局页显示“开通快照服务”；本轮没有点击开通。目标盘快照数 0，自动策略 0。
- ECS 文件备份基础版已经保护目标 100 GiB，控制台显示 18 个备份版本，
  “至少保留一个版本”开启，任务优先级低。
- 盘点时下一次任务正在执行；上一完成恢复点为 `2026-08-26 07:40:11`，到期
  `2026-09-25 07:40:11`，备份 ID `s-0000421vprczr51uo6sa`；下一计划时间为
  `2026-08-27 05:19:00`。
- 控制台显示免费额度已用 100 GiB、剩余 0 GiB；这只说明控制台额度，不等同于已核对
  账单或承诺未来零费用。
- 从未执行恢复，控制台“上次恢复时间”为 `-`。现有文件备份没有经过完整性、权限、
  应用一致性或实际恢复演练，也没有已验证的离线副本。
- 主机 `/srv/gsyen/backups/gsyen-private-apps-20260825.tar.gz` 为同盘本地归档，大小约
  49 MiB；未读取内容、未计算哈希、未恢复。它不能抵御系统盘故障，不能冒充灾备。

### 5.2 快照最高月成本依据

2026-08-26 从阿里云官方 [ECS 实时定价页](https://ecs-buy.aliyun.com/price) 的华北 2
交互式价格中记录标准快照单价 `0.148 元/GB/月`。官方
[快照 FAQ](https://help.aliyun.com/zh/ecs/data-protection-and-recovery-faqs) 说明应在 ECS
价格明细的快照页签核对地域单价。按整块 100 GiB 全额占用做保守上限：

```text
100 GiB × 0.148 元/GiB/月 = 14.80 元/月
```

实际账单按占用数据块和保留时长计算。该估算不含跨地域复制、自动策略、KMS 新实例、
OSS 或其他备份产品。快照服务尚未开通，开通服务和创建快照都是持久化/可能付费动作，
本轮均未执行。

### 5.3 备份门结论

现有 18 个文件级恢复点比“零备份”风险低，但不能替代崩溃一致性云盘快照、加密离线副本
和恢复演练。生产修改前仍须：

1. 明确批准开通快照服务并为精确云盘创建手工快照，预算最高 `14.80 元/月`；
2. 验证快照变为 Available，记录 snapshot ID 和保留/删除审批边界；
3. 在不泄露 Secret 的前提下制作可恢复的加密离线文件归档和 SHA-256 清单；
4. 在隔离位置演练至少一次文件恢复，生产切换前再演练应用/数据库恢复；
5. 删除任何恢复点、归档或快照时重新取得精确目标确认。

## 6. 主机容量与运行态

### 6.1 操作系统与瞬时容量

| 指标 | 只读实测 | 限制 |
|---|---|---|
| OS / 内核 | Ubuntu 24.04.4 LTS / `6.8.0-136-generic`，systemd 255 | 控制台提示需重启 |
| 运行时间 / load | 17 天 23 小时；`0.06/0.20/0.33` | 仅单一时点 |
| CPU | 8 核；3 个 vmstat 样本约 99% idle、0% iowait | 不是历史峰值 |
| 内存 | OS 可见 14 GiB；2.4 GiB used，约 12 GiB available | 无 swap，突发 OOM 风险未测 |
| 磁盘 | 99G 根分区，43G used，52G available | 单盘且与无关业务共用 |
| 连接 | `ss -s`：355 total；TCP 157、established 38、timewait 77 | 没有峰值连接数据 |
| 公网 | 5 Mbps 固定带宽 | 业务峰值、下载和邮件附件吞吐未测 |

控制台没有可提取的历史峰值数值；CPU、内存、磁盘 IO/IOPS、带宽、连接和请求延迟的
P95/P99 尚属未知。瞬时空闲不能作为双方共同上线的容量证明。

### 6.2 运行组件版本

- Caddy `2.11.4`
- Stalwart `0.16.19`
- Docker `29.1.3`（当前没有容器）
- Node.js `22.23.2`
- Python `3.12.3`
- PostgreSQL 服务为 17；`psql` 客户端 `18.6`
- Redis `7.0.15`

登录提示另有 15 个普通更新、5 个 ESM Apps 安全更新、1 次自动更新失败。本轮没有读取
更新日志，也没有安装、重启或修改自动更新设置。

## 7. 服务、监听和目录实况

### 7.1 systemd

| 单元 | 实际状态 | 运行用户 | 约计内存 | 关键差距 |
|---|---|---:|---:|---|
| `caddy` | active / enabled | `caddy` | 25 MiB | 共享入口单点 |
| `gsyen-web` | active / enabled | root | 20 MiB | 应用不应以 root 运行 |
| `gsyen-model` | active / enabled | root | 166 MiB | 应用不应以 root 运行 |
| `sgsyen-web` | active / enabled | root | 92 MiB | 应用不应以 root 运行 |
| `stalwart` | active / enabled | `stalwart` | 78 MiB | 尚未完成邮件端到端验收 |
| `gsyen-api` | inactive / dead / disabled | — | — | 完整 env 缺失，未提供生产 API |
| `sgsyen-api` | inactive / dead / disabled | — | — | 完整 env 缺失，未提供生产 API |
| `caddy-api.service` | disabled | — | — | 所有者/用途待分类 |
| `halfsphere-*` | 不存在 | — | — | HalfSphere 影子空间尚未建立 |
| `mail-ingest` | 未观察到单元或监听 | — | — | 邮件镜像链路未部署 |

相关 GSYEN/SGSYEN/Stalwart 单元全部仍在 `system.slice`，`CPUQuota=infinity`、
`MemoryMax=infinity`、`TasksMax=17942`。没有 GSYEN/HalfSphere 独立 slice/cgroup 上限。
主机同时运行商城/Smart Wing 测试服务、PostgreSQL 17、两个 Redis 进程和备份 Agent，
因此资源耗尽、重启、Caddy/系统盘故障会跨业务传播。

### 7.2 监听

| 绑定范围 | 端口/服务 |
|---|---|
| 所有接口 | SSH `22`；Caddy `80/443`、UDP `443`；Stalwart `25/465/993/995/4190/8080/46477`；无关 Node `3012` |
| 回环接口 | Redis `16379/16380`；PostgreSQL `5432`；无关服务 `3000-3003/3011/3100-3101/3200-3201/8443-8445/9443-9445`；GSYEN Web `18080`；SGSYEN Web `18082`；Model `18083`；Caddy admin `2019` |
| 预期但未监听 | `18081`（GSYEN API）、`18084`（SGSYEN API）、HalfSphere `18180-18189` |

Stalwart 虽绑定所有接口，但当前安全组/UFW没有共同放行其邮件端口，因此还不能从公网直达，
也没有根域 MX 切换证据。`8080` 和 `46477` 的实际协议只能通过后续受控配置审计确认，
本轮未读取 Stalwart 配置正文。

### 7.3 文件布局和元数据

- `/srv/gsyen` **实际存在**；`/srv/halfsphere` **实际不存在**。
- `/srv/gsyen/apps` 含 `gsyen-web`、`gsyen-api`、`gsyen-model`、`gsyen-android`、
  `sgsyen-api`、`sgsyen-web`。部分嵌套目录显示 UID 502/`staff`，与 Linux 目标用户不一致；
  运行中的 Web/Model 服务却以 root 启动。
- apps 下没有观察到 `current -> releases/<id>` 之类原子发布 symlink；仓库里的不可变 release
  模板尚未成为生产事实。
- `/srv/gsyen/config` 权限 `0750`，只观察到 mode `0600` 的
  `gsyen-api.env.incomplete`；没有读取内容。
- systemd 元数据显示 API 期望
  `/srv/gsyen/config/gsyen-api.env` 和 `/srv/gsyen/config/sgsyen-api.env`，实际均不存在。
- Stalwart 二进制位于 `/srv/gsyen/stalwart/bin/stalwart`，约 102 MiB，
  mode `0750`、owner `root:stalwart`；env 文件 mode `0640`、配置文件 mode `0644`，
  未读取正文。数据和日志目录 mode `0750`。
- `/etc/caddy/Caddyfile` 为 root 所有、mode `0644`、约 6.9 KiB；`caddy validate` 只读验证通过。
  同目录有多个手工日期命名的备份/候选文件，说明部署和回滚尚未完全模板化。

## 8. 实际、模板和未知差距

| 能力 | 实际 | 仓库目标/模板 | 判定 |
|---|---|---|---|
| GSYEN 运行空间 | `/srv/gsyen` 存在但布局/用户不统一 | 独立用户、slice、release、env、日志和备份 | 部分实际，未验收 |
| HalfSphere 运行空间 | `/srv/halfsphere` 不存在 | 独立 `halfsphere` 用户、`18180-18189`、`halfsphere-*` | 仅模板 |
| 双方 cgroup | 无业务级 CPU/内存上限 | 独立 slice 和资源限制 | 仅模板 |
| GSYEN API / SGSYEN API | 停止且 env 缺失 | systemd/健康检查模板存在 | 不可用 |
| HalfSphere API/Web | 未部署 | 独立影子环境模板/规划 | 未建立 |
| 邮件镜像 | Stalwart 运行，`mail-ingest` 未见 | Cloudflare D1/R2/Queue → mail-ingest → Stalwart | 未闭环 |
| 数据库隔离 | 本机 PostgreSQL/Redis 归属未完成 | 独立 DB/schema/user | 未证实 |
| 对象存储 | 只有未知归属 OSS | 独立 Bucket 或严格前缀/RAM | 未建立 |
| 镜像仓库 | 未发现企业版 ACR | GSYEN/HalfSphere 独立 namespace | 未建立 |
| Secret | KMS 未开通；env 文件不完整 | 独立 Secret/RAM 或受保护 env | 未建立 |
| 日志监控 | SLS 未开通、无 ECS 告警规则 | 独立日志、监控、告警 | 未建立 |
| 高可用 | 单 ECS/单盘/单公网 IP/Caddy | 故障隔离与可拆分方案 | 未通过 |
| 恢复 | 文件备份有恢复点但从未恢复，0 云盘快照 | 快照+加密离线备份+恢复演练 | 未通过 |

## 9. HalfSphere 主机隔离决策与只读报价

阿里云官方说明一台 ECS 同时最多绑定一个实例 RAM 角色。由于 GSYEN 与 HalfSphere 必须使用
独立 RAM 权限、OSS/ACR/Secret 且禁止合并生产身份，现有 8C16G 主机即使使用不同 Linux
user、slice 和目录，也无法提供两套实例身份。当前推荐 HalfSphere 使用独立 ECS；没有创建资源。

2026-08-26 在北京 F 购买向导只读配置得到：可售 `ecs.u1-c1m2.xlarge`（4C8G）、100 GiB
ESSD、无公网 IPv4 的 1 个月配置费用为 `¥386.96/月`；同规格固定 5 Mbps 为 `¥511.96/月`。
询价会随库存和优惠变化，下单前必须复核。完整依据、替代方案和批准门见
[HalfSphere 独立 ECS 决策单](./HALFSPHERE_INDEPENDENT_ECS_COST_AND_IDENTITY_DECISION_2026-08-26.md)。

## 10. 8C16G 容量门与共享基础设施结论

当前 8C16G 节点有静态 CPU、内存和磁盘余量，但**不得据此批准 GSYEN 与 HalfSphere
共同生产运行**，原因是：

1. 没有历史峰值、压测、故障注入和 P95/P99 延迟证据；
2. 5 Mbps 公网带宽、无 swap、单系统盘、单入口均是明确上限；
3. 两个 API 当前未运行，HalfSphere 尚未部署，观测负载不包含目标全量负载；
4. 没有业务 cgroup；现有无关商城服务可能与迁移服务争抢 CPU、内存、IO、连接和端口；
5. 共享安全组扩大故障和安全影响面，且超出允许长期共享项；
6. 没有经过恢复演练的云盘快照/离线副本。

用户允许长期共享的项目仅为 ECS、VPC/vSwitch、Caddy 入口和系统监控。每个共享项的
当前影响与拆分方向如下：

| 共享项 | 当前资源上限/故障影响 | 拆分方向 |
|---|---|---|
| ECS | 8C16G、5 Mbps、单系统盘；主机或重启故障影响双方及无关商城 | HalfSphere 独立 ECS；或验证后保留影子共机、生产拆分 |
| VPC/vSwitch | 地址充足；路由、ACL、地域故障共享 | 同 VPC 独立 vSwitch/SG；更强隔离时独立 VPC |
| Caddy | 单进程/单配置/单公网 IP；错误配置同时影响双方 | 独立 ECS 后各自入口，或 ALB；配置必须原子发布/回滚 |
| 系统监控 | 当前 SLS 未开通且无告警 | 共享采集 Agent，但日志索引、告警联系人和权限按业务隔离 |

容量验收至少需要：部署两套真实影子服务后，采集正常和峰值流量模型下的 CPU、RSS、
磁盘 IOPS/延迟、带宽、连接、错误率和 P95/P99；设置并验证各自 slice 上限；执行单服务
OOM/CPU 饱和/重启、Caddy 回滚和磁盘空间门禁。若性能、安全或故障隔离任一不合格，
必须提出 HalfSphere 独立 ECS 规格和月费，购买前再次确认。

## 11. 风险与下一审批闸门

| 等级 | 事实 | 当前处置 |
|---|---|---|
| P1 | 共用安全组将 SSH、RDP、数据库、Redis、Jenkins 和管理端口对全网放行 | 目标 UFW 仅部分缓解；先核对另一 ECS，再提交白名单/独立 SG 变更审批 |
| P1 | 0 云盘快照；现有文件备份未恢复、无验证离线副本 | 生产写操作冻结；按精确云盘和费用审批快照/离线备份 |
| P1 | GSYEN API、SGSYEN API 停止且完整 env 缺失 | 不得宣称 API 已恢复或进入切换 |
| P1 | `/srv/halfsphere`、HalfSphere 单元/用户/端口均未建立 | 只能继续本地模板和源码审计，不能验收 HalfSphere |
| P1 | 无 GSYEN/HalfSphere cgroup，且与无关业务同机 | 容量门未通过；变更前提交 slice 限额和回滚方案 |
| P2 | Web/Model 以 root 运行，部分目录 UID 502，发布非原子 | 在备份门后迁移为最小权限用户和 release 布局 |
| P2 | SLS/告警未开通，单 ECS/单盘/5 Mbps/无 swap | 先给出成本和告警/拆分方案，再请求付费确认 |
| P2 | 多份手工 Caddy 配置候选，运维漂移 | 与仓库模板做只读 diff 后原子切换，需生产变更审批 |

下一步不是直接部署。必须依次取得或满足：

1. **快照/离线备份审批**：明确同意开通快照服务，并为
   `d-2ze9t48edu0hojhpho4q` 创建一个手工快照，预算上限 `14.80 元/月`；随后制作并验证
   加密离线文件备份。删除不在本审批内。
2. **生产配置审计审批**：快照和文件备份可恢复后，才读取必要的 Caddy/Stalwart/应用配置，
   仍须脱敏且不把 Secret 输出或提交。
3. **隔离与安全组变更审批**：提交精确的 Linux 用户、systemd slice、端口、独立 SG/RAM、
   防火墙和回滚 diff；先证明不会影响另一台 ECS 和商城服务。
4. **新增付费资源审批**：RDS、OSS、ACR、SLS/KMS、ALB 或 HalfSphere 独立 ECS 均须给出
   规格、地域、数量和月费后再购买。
5. DNS/MX、第三方回调、生产切换、停止 GCP 和任何删除仍保持各自独立确认门。

截至本报告，允许继续的工作仅限本地代码审计/测试、只读盘点和模板改进；**没有证据支持
“阿里云目标环境已就绪”或“双方已脱离 GCP”**。
