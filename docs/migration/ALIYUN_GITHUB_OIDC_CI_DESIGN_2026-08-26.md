# 阿里云 GitHub Actions OIDC CI/CD 设计

更新日期：2026-08-26（Asia/Shanghai）  
状态：本地设计候选；尚未创建 RAM/OIDC/ACR、未修改 GitHub workflow、未部署生产

## 1. 决策

GSYEN 与 HalfSphere 的新 CI/CD 不使用长期 AccessKey，也不复用现有 GCP WIF/GSA。目标是：

```text
GitHub production environment
  → GitHub OIDC token
  → 独立 Alibaba Cloud OIDC IdP
  → 独立最小权限 RAM deployment role
  → 独立 ACR namespace/repository
  → 经审批的 ECS release stage/promote/rollback
```

两方必须使用不同的 OIDC IdP、RAM role、GitHub environment、ACR namespace/repository、
release manifest 和部署目标。即使将来允许共用一个 OIDC provider，也不得共用 deployment
role；当前用户允许长期共享的基础设施清单不含部署身份，所以本设计默认 provider 也隔离。

## 2. 官方依据与供应链固定

- 阿里云官方 GitHub 组织提供
  [`configure-aliyun-credentials-action`](https://github.com/aliyun/configure-aliyun-credentials-action)，
  支持 OIDC provider ARN、RAM role ARN、session name、session expiration 与 audience。
- 当前可见最新 tag 是 `v1.1.0`，对应 commit
  `1e5248c8d5d93a8781ac344a68e19a43341e79e6`。生产 workflow 应固定完整 commit SHA，
  不能只用可移动的 `@v1`。
- GitHub 官方 OIDC 文档明确把该阿里云 Action 列为云提供商集成示例；workflow 必须只给
  `id-token: write` 和代码读取所需的最小权限。
- 阿里云 RAM 官方文档支持为 OIDC identity provider 创建 RAM role；实际 trust policy、
  client ID/audience 和 claim 条件必须在创建前由安全复核再次逐项确认。

候选认证步骤只作为模板证据，不含真实账号或 ARN：

```yaml
permissions:
  contents: read
  id-token: write

steps:
  - uses: actions/checkout@<approved-full-commit-sha>
  - uses: aliyun/configure-aliyun-credentials-action@1e5248c8d5d93a8781ac344a68e19a43341e79e6
    with:
      role-to-assume: ${{ vars.ALIYUN_DEPLOY_ROLE_ARN }}
      oidc-provider-arn: ${{ vars.ALIYUN_OIDC_PROVIDER_ARN }}
      role-session-name: gsyen-production-${{ github.run_id }}
      role-session-expiration: 1800
      audience: github-actions
```

ARN 是非 Secret 配置，但仍只放各自 GitHub Environment variable；任何临时 STS token、
registry password 或 Secret 值不得输出、缓存到 artifact 或写入仓库。

## 3. 信任边界

| 业务 | GitHub repository/environment | 独立 OIDC IdP | 独立 RAM role | 允许目标 |
|---|---|---|---|---|
| GSYEN API/服务 | `Christine3749/gsyen-api` 等已核对仓库；`gsyen-production` | 计划 `github-gsyen-production` | 计划 `gsyen-github-deploy` | 仅 GSYEN ACR repo、精确 GSYEN ECS/release 命令、必要只读 inventory |
| HalfSphere | 真实后端仓库尚未知；不得用前端仓库推测 | 生产源码闭环后命名 | 计划 `halfsphere-github-deploy` | 仅 HalfSphere ACR repo、精确 HalfSphere ECS/release 命令、必要只读 inventory |

Trust policy 必须限制：

1. issuer 为 GitHub Actions OIDC；
2. audience 精确等于已批准 client ID；
3. subject 精确到目标 repository + protected production environment，不能使用组织级通配；
4. production environment 必须有人工 reviewer，branch/tag 规则单独锁定；
5. pull request、fork、任意分支和未批准 reusable workflow 均不能取得生产 role；
6. session 最长 30 分钟，CloudTrail/ActionTrail 能按 `github.run_id` 追溯；
7. 两方 role 之间无 `AssumeRole`/role chaining 权限。

HalfSphere 真实项目 827 后端 repository/commit 未闭环，因此其 subject 当前无法安全填写；
这不是可以使用宽泛 trust policy 的理由。

## 4. 构建与发布不变式

每个 artifact 必须生成并验证仓库已有的 `BUILD.json`/release inventory，至少包含：

- 业务 owner、repository、完整 Git commit、构建时间和 workflow run ID；
- image digest，禁止只记录 tag；
- Node/Python/runtime 版本和 lockfile hash；
- 目标 ACR namespace/repository 和阿里云地域；
- production origin/provider allowlist；
- 对 artifact 解包扫描 `.run.app`、GCS、GAR、GCP 项目 ID 和未批准 `googleapis.com`；
- 不含 `.env`、私钥、token、credential JSON 或明文 Secret 的负向证明。

部署采用 `stage → validate → promote`，不覆盖 `current` 目录内容：

1. CI 构建、测试并推送不可变 digest；
2. 通过阿里云 API 对精确实例执行受限 release stage，不能使用账号级任意命令权限；
3. 服务端再次验证 manifest、文件 hash、owner、权限、provider 和 GCP 字符串；
4. 影子端口健康/业务测试通过后才允许 promote；
5. promote 只切 `current` symlink 并重启对应业务 unit；
6. 失败只回滚该业务到上一个已验证 release，不能联动回滚另一业务；
7. Caddy 变更走独立 atomic validate/activate/rollback gate。

部署 API 最终选 Cloud Assistant/OOS、受限 SSH certificate 或其他机制，必须在生产变更审批前
确定。禁止把长期 SSH 私钥或 ECS root 密码作为默认 GitHub Secret 方案；不得在现有共享 ECS
安装能取得两个业务权限的通用 self-hosted runner。

## 5. GitHub workflow 迁移顺序

1. 闭环各服务真实 source repository/commit；HalfSphere 827 未完成前保持 blocked；
2. 用户批准并创建两套 OIDC IdP/RAM role、独立 ACR 和最小权限 policy；
3. 先创建只允许 `workflow_dispatch` 的影子 workflow，固定所有第三方 Action SHA；
4. 构建/推送影子 image，核对 commit ↔ digest ↔ release manifest；
5. 在阿里云 shadow 环境验证后，才允许 production environment；
6. 同一迁移窗口内分别切换，但两套 workflow、审批和 rollback 互不依赖；
7. 观察期通过后，停止向 GCP deploy；撤销 GCP WIF/GSA 和删除旧 GitHub Secret 另需确认；
8. 最终扫描 GitHub Actions/log/artifact，证明无 GAR、Cloud Run 或 GCP deployment identity。

## 6. 当前阻断

- ACR 类型、namespace/repository、费用和资源 ID 尚未确认或创建；付费动作需批准。
- GSYEN 目标 ECS 快照/离线恢复门尚未通过，禁止 stage production release。
- HalfSphere 独立 ECS 尚未购买，真实 827 后端 repo/source/commit 未取得。
- GitHub production environment、branch protection 和 reviewer 尚未创建/复核。
- 阿里云部署调用机制和精确 RAM policy 尚未在 shadow 验证。

因此当前不会新增会自动触发的 workflow，也不会禁用
`gsyen-api/.github/workflows/deploy.yml`。旧 GCP workflow 仍是生产回滚链路；只有阿里云影子、
数据校验、客户端切换和独立回滚全部通过后，才能进入停用审批。
