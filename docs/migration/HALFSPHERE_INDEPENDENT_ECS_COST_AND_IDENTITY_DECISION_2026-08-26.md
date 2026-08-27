# HalfSphere 独立 ECS：身份隔离与费用决策单

更新日期：2026-08-26（Asia/Shanghai）  
状态：**等待用户批准；未下单、未加入配置清单、未创建任何资源**

## 结论

在当前明确要求下，HalfSphere 不能与 GSYEN 长期共用同一台 ECS。

原因不是 CPU 或目录布局，而是实例身份边界：阿里云 ECS 官方文档说明，一台实例同一时间
最多绑定一个实例 RAM 角色。实例上的进程通过同一个 metadata endpoint 获取该角色身份，
Linux user、systemd slice、目录权限和端口范围都不能把该身份拆成两套。当前目标又明确要求：

- GSYEN 与 HalfSphere 使用不同 RAM 权限、Secret、OSS 与 ACR 边界；
- 禁止合并生产密钥和身份；
- 任一系统应能单独回滚。

因此，把两个业务放在一台 ECS 再绑定一个“合并权限角色”只能提供资源组织，不能兑现权限隔离。
官方依据：[ECS 实例 RAM 角色绑定限制](https://help.aliyun.com/zh/ecs/user-guide/attach-an-instance-ram-role-to-an-ecs-instance)。

## 2026-08-27 实机复核后的目标修正

Workbench 已确认现有 8C16G 同时运行无关商城/Smart Wing，且存在无关 root 进程、共享
高风险安全组和 degraded systemd。给该实例绑定 GSYEN RAM role，会让同机 root 进程也能
访问实例元数据身份；目录、Unix 用户和 cgroup 无法隔离主机 root。因此旧主机不能再被
当作可写入生产 Secret/绑定业务 RAM role 的最终目标。

| 方案 | 结论 | 原因 |
|---|---|---|
| 继续使用现有 ECS 同机 | 拒绝作为生产终态 | 有无关 root 业务，身份、Secret 和故障域不合格 |
| 新建一台 GSYEN+HalfSphere 共享 ECS | 当前 gate 拒绝 | 一台实例仍只有一个 RAM role，不能兑现双方独立权限 |
| 只新建 HalfSphere ECS，GSYEN 留旧机 | 仅可过渡 | HalfSphere 隔离改善，但 GSYEN 身份风险仍未关闭 |
| GSYEN 与 HalfSphere 各自独立 ECS | **推荐终态** | 双 RAM role、Secret、故障域和单方回滚都可独立验证 |

若用户希望只购买一台新共享 ECS，必须先提出不依赖实例共享 role 的服务级短期身份设计，
完成轮换、最小权限、泄露面和主机 root 风险评审；不能简单改成长期 AK 或合并 role。

## HalfSphere 单节点基线（历史询价，不是完整下单方案）

HalfSphere 独立 ECS 的目录/身份基线仍是华北 2（北京）、现有 VPC：

| 项目 | 推荐值 | 边界 |
|---|---|---|
| 规格 | `ecs.u1-c1m2.xlarge`，4 vCPU / 8 GiB | 独立 `halfsphere` RAM role 和安全组 |
| 系统盘 | 100 GiB ESSD PL0 | 独立快照、备份和容量告警 |
| 路径 | `/srv/halfsphere` | 不挂载或读取 `/srv/gsyen` |
| 入口 | 当前模板仅支持本机 Caddy → loopback | 独立 ECS 应运行自己的 Caddy；共享旧 Caddy 的私网反代尚未实现 |
| 服务 | `halfsphere-*`，端口 `18180-18189` | 独立 user、env、DB user/schema、日志、备份 |
| 身份 | 独立 ECS RAM role | OSS/ACR/Secret 最小权限，不与 GSYEN 合并 |

旧“仅私网、由现有 Caddy 反代”建议当前**不可执行**：HalfSphere unit 与 Caddy 模板都
只允许 loopback，安全组清单也禁止 `18180/18181` 私网入站；账号目前没有 NAT/EIP，
私网节点访问 Supabase、Resend、GitHub/npm/ACR 等出网链路和费用也未闭环。可执行方向是：

1. 每台业务 ECS 运行本机 Caddy，使用经批准的公网/Cloudflare 入口和受控出网；或
2. 另行实现精确私网 bind、Caddy 私网上游、源安全组/mTLS 与 NAT/EIP/出网代理。

两种方向都涉及新增付费和生产网络变更，必须在购买前重新报价并批准。

## 2026-08-26 控制台询价证据

通过阿里云已登录控制台的北京区购买向导进行只读配置，未点击“加入清单”或“确认下单”。
报价为一台、包年包月 1 个月、北京 F、100 GiB ESSD PL0；价格随库存、优惠和计费规则变化，
下单前必须重新确认最终账单。

| 方案 | 控制台配置 | 当时显示的配置费用 |
|---|---|---:|
| 最小影子 | `u2i` 2C4G、100 GiB、5 Mbps | ¥351.59/月 |
| 历史私网参考（当前不完整） | `u1` 4C8G、100 GiB、无公网 IPv4 | **¥386.96/月**，未含 NAT/EIP/代理 |
| 历史公网参考 | `u1` 4C8G、100 GiB、固定 5 Mbps | **¥511.96/月** |

补充观察：`u2i` 4C8G 的参考实例价为 ¥353.09/月，但北京 F 在第二次询价时显示售罄，
因此没有把它作为可立即购买的推荐规格；当前可售的 `u1` 4C8G 实例参考价为 ¥336.96/月。
询价入口：[阿里云 ECS 北京区购买向导](https://ecs-buy.aliyun.com/wizard#/prepay/cn-beijing)。

费用尚不包含：快照长期占用、离线备份、SLS/ARMS、RDS、OSS、ACR、KMS、ALB、流量超额、
税费或未来促销变化。现有 100 GiB 云盘快照保守上限参考为 ¥14.80/月；新 ECS 快照也需按
实际占用和保留期另算。

## 不推荐的替代方案

1. **同一 ECS、合并 RAM role**：成本最低，但违反独立 RAM/Secret/OSS 权限要求，不可标记为
   已隔离；只有用户明确放宽安全要求并接受书面风险后才可重新评估。
2. **同一 ECS、环境文件凭据**：可按 Unix user 分开文件，但长期静态凭据增加轮换和泄露面，
   也不能解决 loopback、内核和主机级共同故障；不作为当前生产目标。
3. **SAE 或自建身份代理**：可能提供工作负载级身份，但会新增付费平台、兼容性和运维面；
   必须先做技术验证与单独报价，不能凭架构假设替代证据。

## 批准后仍需完成的门

批准购买只授权创建精确规格，不等于授权生产切换。购买后仍须完成：

1. 独立安全组、RAM role/policy、Secret、OSS/ACR、DB user/schema 的非 Secret 资源对账；
2. `/srv/halfsphere`、systemd/cgroup、备份和监控的影子部署；
3. CPU、RSS、OOM、磁盘/IO、连接、5 Mbps 或私网吞吐、P95/P99 压测；
4. HalfSphere 数据数量/主键/哈希和生产 revision/source commit 闭环；
5. 单独故障与回滚演练；
6. 用户再次批准 DNS、Webhook、客户端或生产回调切换。

## 需要用户决定

- 是否接受“两台业务 ECS”作为最终身份/故障隔离方向；
- 或要求先设计并评审可在一台专用共享 ECS 上运行的服务级短期身份方案；
- 选择方向后再从登录态订单页取得 GSYEN、HalfSphere、系统盘、公网/NAT、快照的精确
  组合报价和审批上限。旧 ¥386.96/¥511.96 只作 2026-08-26 历史参考，不能自动授权。

未收到明确批准前，不创建实例、磁盘、公网 IP、安全组、RAM role 或其他关联资源。
