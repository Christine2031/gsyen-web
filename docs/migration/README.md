# GSYEN 与 HalfSphere 同步迁移证据索引

更新日期：2026-08-27（Asia/Shanghai）

本目录记录同一个持续迁移 Goal 的事实、决策、审批门和验收证据。它不是“已完成”声明；任一结论都必须能回溯到代码、云控制面、日志、导出清单或测试输出。

## 当前状态

- 阶段 0（保护现状与只读盘点）：进行中。
- 代码和本地部署模板可以继续改造并验证。
- 阿里云生产节点修改、付费资源创建、DNS/MX、生产切换、GCP 停服和删除：全部冻结，等待对应证据与用户确认。
- GSYEN 仍有真实 Cloud Run 流量，不能停服。
- 阿里云 Workbench 只读盘点已恢复并完成：`gsyen-api`/`sgsyen-api` 均停止且正式 env
  缺失，当前 Caddy 没有 GSYEN 路由，ECS 上 Web artifact 仍硬编码 Cloud Run；
  HalfSphere 独立空间尚不存在，因此不能把现有进程视为迁移完成。
- 新发现空项目 `gsyen-api-7586`（560294832548）属于 GSYEN 收尾范围；当前未绑定 billing、无运行资源，删除或书面保留仍需确认。
- HalfSphere 当前前端指向项目号 `827638954474` 的 Cloud Run；现有账号无权访问该项目，生产 revision 与源码尚未闭环。
- 当前 format-v2 本地恢复检查点为 `/Users/Ethan/Desktop/Projects/gsyen-local-checkpoint-20260827-resumed-goal-v9`：7 仓库/9 scope、177 个符合条件的未跟踪文件、73/73 SHA-256、同 ID `already-complete`、0 symlink、目录/文件权限 `0700`/`0600`。旧 v1/v2/v4/v5/v6/v7/v8 均只作历史恢复证据，禁止覆盖或删除。
- 根仓库本地 lint、163 项单测、38 项 Electron 安全测试和 production build 通过；生产依赖为 0 high / 5 moderate。完整开发树仍有 Excalidraw 固定 nanoid 的 1 high 条件项，浏览器/Electron E2E 尚未完成。
- GSYEN Model 已闭环 ECS Python 3.12.3、真实 venv、56 项精确 lock、`pip check`、源码/CSV
  hash 与 loopback 冒烟；本地 immutable dataset stage/promote/rollback 5/5 通过。仍缺真实
  新鲜数据、首次 legacy onboarding、immutable code release、独立用户/cgroup、Linux/
  断电/容量/恢复和生产 E2E，不能进入生产切换。
- 阿里云官方限制一台 ECS 同时最多一个实例 RAM role；实机又有无关 root 业务，因此现有
  ECS 和单台新共享 ECS 都不能兑现双方独立身份。当前推荐终态为两台业务 ECS，或另行
  评审服务级短期身份。旧北京 F 4C8G/100 GiB 私网 ¥386.96/月参考缺 NAT/EIP 与私网
  Caddy 改造，不是可下单报价；尚未购买任何资源。
- Cloudflare Email Routing/D1/R2/Queues 已完成控制面只读盘点：生产 D1 为 500 条 message、R2 为 977 个对象；生产仅有 Resend 外发队列族，尚无 Stalwart mirror 队列、绑定或 `0016` 之后的新表，邮件镜像仍未上线。本地候选已扩展到 `0022` 的 expand/deploy/contract 设计，但 Stalwart 认证边界、协调恢复和端到端告警仍是 P1。

## 文档

- [统一 Goal 恢复后的执行状态（2026-08-27）](./RESUMED_GOAL_STATUS_2026-08-27.md)
- [阶段 0 盘点](./PHASE0_INVENTORY_2026-08-26.md)
- [代码与 GCP 依赖审计（2026-08-26）](./CODE_GCP_DEPENDENCY_AUDIT_2026-08-26.md)
- [根仓库生产依赖安全审计（2026-08-26）](./ROOT_RUNTIME_DEPENDENCY_AUDIT_2026-08-26.md)
- [GCP 控制面只读复审（2026-08-26）](./GCP_CONTROL_PLANE_INVENTORY_2026-08-26.md)
- [Vercel 生产控制面只读盘点（2026-08-26）](./VERCEL_CONTROL_PLANE_INVENTORY_2026-08-26.md)
- [Cloudflare 邮件控制面只读盘点（2026-08-26）](./CLOUDFLARE_MAIL_CONTROL_PLANE_INVENTORY_2026-08-26.md)
- [邮件入站、镜像与恢复安全审计（2026-08-26）](./MAIL_PIPELINE_SECURITY_AUDIT_2026-08-26.md)
- [GSYEN Model 服务代码与阿里云可运行性审计](./GSYEN_MODEL_SERVICE_AUDIT_2026-08-26.md)
- [本地测试矩阵、失败与未执行项](./LOCAL_TEST_MATRIX_2026-08-26.md)
- [GitHub CI/CD、Secret 元数据与 Webhook 盘点](./GITHUB_CICD_INVENTORY_2026-08-26.md)
- [资源归属矩阵](./RESOURCE_OWNERSHIP_MATRIX.md)
- [审批与禁止动作](./APPROVAL_GATES.md)
- [阿里云控制面与 ECS 只读复审（2026-08-26）](./ALIYUN_CONTROL_PLANE_INVENTORY_2026-08-26.md)
- [阿里云生产变更前备份审批单](./ALIYUN_PRECHANGE_BACKUP_APPROVAL.md)
- [现有 ECS legacy 状态的变更前备份合同](./LEGACY_ECS_PRECHANGE_BACKUP_DESIGN.md)
- [多仓库本地恢复检查点脚本与安全边界](./LOCAL_RECOVERY_CHECKPOINT.md)
- [HalfSphere 平级源码目录收尾](./HALFSPHERE_SOURCE_LAYOUT_FINALIZATION.md)
- [HalfSphere 独立 ECS 身份隔离与费用决策单](./HALFSPHERE_INDEPENDENT_ECS_COST_AND_IDENTITY_DECISION_2026-08-26.md)
- [阿里云 GitHub Actions OIDC CI/CD 设计](./ALIYUN_GITHUB_OIDC_CI_DESIGN_2026-08-26.md)

后续证据将按阶段增加：代码审计、目标架构、数据迁移账本、测试矩阵、切换记录、GCP 停止观察、回滚演练和最终评分。

## 结论标记

本文档统一使用以下状态：

- `已证实`：有直接、可复核证据。
- `部分证实`：只有范围受限的直接证据。
- `未知`：没有足够访问权限或证据。
- `不适用/允许保留`：已分类为非 GCP 运行平台依赖或经书面允许的第三方能力。
- `禁止操作`：在审批门或前置验证完成前不得变更。

## 安全约束

- 文档只记录 Secret 名称和用途，不记录值。
- 所有 GCP 命令必须显式指定项目，禁止依赖当前默认项目。
- 根仓库包含多个未跟踪的独立 Git 仓库；禁止使用 `git add -A`、`git clean` 或覆盖式恢复。
- 最终源码布局必须是 `/Users/Ethan/Desktop/Projects/gsyen` 与 `/Users/Ethan/Desktop/Projects/halfsphere` 平级；在生产 revision 和 dirty 状态闭环前不得移动或覆盖当前 HalfSphere 副本。
- 生产数据不删除；共享资源只有在 GSYEN 与 HalfSphere 均证明不再使用后才可进入待删除审批。
