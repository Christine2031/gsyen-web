# 迁移审批门与禁止动作

更新日期：2026-08-27

## 无需额外审批、可持续执行

- 本地只读盘点、代码搜索、Git 状态和历史检查。
- 不含 Secret 的代码、测试、文档和部署模板改造。
- 本地 lint、typecheck、unit/integration test 和 build。
- 云控制面的只读查询，但不得启用 API、读取 Secret 值或制造业务探针流量。
- 生成迁移账本、回滚清单和费用估算。

## 必须暂停并取得用户确认

| 动作 | 当前状态 | 前置证据 |
|---|---|---|
| 恢复 GCP 776 项目计费 | 禁止 | 说明预计费用、读取目的和关闭方式 |
| 启用任何 GCP API / Service Usage | 禁止 | 精确项目/API、只读目的、费用/副作用和回退方式；不得为盘点方便自动启用 |
| 新购 ECS/RDS/OSS/ACR/KMS/SLS/MNS 等 | 禁止 | 规格、区域、月费、容量理由和退出成本 |
| 购买迁移专用 ECS | 等待新报价与确认 | 现有 ECS 有无关 root 业务，不能安全绑定业务 RAM role；旧 HalfSphere 私网 ¥386.96/月参考缺 Caddy 私网上游和 NAT/EIP 出网成本，不能据此下单。最终推荐两台业务 ECS；精确规格/订单价另行确认 |
| 创建可能计费的阿里云云盘快照/文件备份 | 禁止 | 目标磁盘、保留期、预计容量和费用 |
| 修改阿里云生产 ECS 配置/服务/防火墙 | 禁止 | 现状备份、diff、健康检查和逐项回滚命令 |
| 写入/轮换生产 Secret | 禁止 | Secret 清单、权限边界、回滚和不打印机制 |
| 数据导入生产数据库/对象存储 | 禁止 | 导出清单、目标隔离、校验方案和回滚副本 |
| DNS、API、客户端、Webhook、第三方回调切换 | 禁止 | 影子环境验收、TTL、切换顺序和单方回滚 |
| 修改 `gsyen.com` MX | 本阶段明确禁止 | 完整邮件验证与未来功能缺口闭环；另行批准 |
| 停止 GCP 部署或服务 | 禁止 | 双系统 GCP-off 演练、零生产访问和回滚观察期 |
| 清理嵌套或重复的 HalfSphere 源码目录 | 禁止 | 平级副本来源/dirty 状态/构建/路径引用验证完成，并针对精确目录再次确认 |
| 删除数据库、Bucket、磁盘、镜像、Secret、项目 | 绝对禁止 | 停止后观察完成，并取得针对精确清单的再次确认 |

## 当前需要用户协助但不阻塞本地工作

1. 由项目 `827638954474` 的 Owner/IAM Admin 给
   `user:lihouyi7586@gmail.com` 授予项目级 `roles/viewer`，只读定位 HalfSphere
   真实生产 revision/source。该角色不含 Secret version access；后续数据/Secret 值导出
   必须另做短期、逐资源授权。
2. 决定是否恢复 `halfsphere-api-7586` 的逾期计费，以读取 source ZIP/Artifact Registry/Secret 元数据。
3. Cloudflare Email Routing/D1/R2/Queues 只读盘点已完成；生产 D1 备份、`0016`—`0022`
   expand/deploy/contract、mirror Queue 创建、Secret 写入和 Worker 发布仍需单独变更确认。
4. 阿里云 RAM/Workbench 只读入口已恢复并完成目标主机盘点；CLI `root`/`ubuntu` SSH
   仍为 public-key denied。这不再阻塞只读审计，但文件级离线备份的可靠传输入口仍须在
   快照获批后单独解决，不能把浏览器终端当成备份通道。
5. 决定是否批准系统盘手工快照：100 GiB 按整盘保守上限 `14.80 元/月`，精确磁盘和
   保留/删除边界见 `ALIYUN_PRECHANGE_BACKUP_APPROVAL.md`。
6. 决定最终 ECS 拓扑。只新增一台 HalfSphere ECS、让 GSYEN 留在现有无关业务共机环境
   只能作为过渡；一台新共享 ECS 仍只有一个实例 RAM role。当前最小安全终态是 GSYEN 与
   HalfSphere 各自独立 ECS，或另行评审服务级短期身份方案。任何购买仍须实时订单报价。

## 绝不作为“完成”证据的项目

- 进程显示 running。
- 端口能连接或单一 `/health` 返回 200。
- 搜索不到某个字符串。
- 单个表记录数相同但主键/哈希未核对。
- GCP 没有新部署但仍有生产流量。
- HalfSphere 候选 GitHub 仓库能够 build，但未证明等于生产 revision。
- 邮件 Queue 投递成功但 D1/R2 主记录、原始 EML、附件和收件人未完成对账。

## 完成声明门槛

只有 GSYEN 与 HalfSphere 分别通过功能、数据、稳定性、安全、回滚和 GCP-off 验证，HalfSphere 源码平级目录与全部引用完成验证，并且没有未解决 P0/P1，才允许标记“彻底脱离 GCP”。任何未知生产依赖按未完成处理。
