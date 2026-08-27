# GitHub CI/CD、Secret 元数据与 Webhook 盘点

盘点日期：2026-08-26（Asia/Shanghai）  
方式：GitHub API 只读；只记录 Secret 名称/更新时间，不读取值，不记录 Webhook 完整路径或签名

## 仓库归属

| 本地单元 | GitHub 仓库 | 备注 |
|---|---|---|
| 根 Web/Electron、`email-worker` | `Christine3749/gsyen-web` | `email-worker` 是同一 Git 工作树的子目录，不是独立仓库 |
| GSYEN API | `Christine3749/gsyen-api` | 独立 Git 工作树 |
| Android | `Christine3749/gsyen-android` | 独立 Git 工作树 |
| Model | `Christine3749/gsyen-model` | 独立 Git 工作树 |
| SGSYEN API | `Christine3749/sgsyen-api` | 独立 Git 工作树 |
| SGSYEN Web | `Christine3749/sgsyen-web` | 独立 Git 工作树 |
| HalfSphere 当前候选 | `Christine3749/halfsphere` | 最终须迁移到平级本机目录；不代表 827 `/apply` 后端源码 |

当前只读身份为 `Christine3749`，GitHub CLI 具备 `repo`/`workflow` 范围。本盘点
没有写 workflow、Secret、environment、hook 或仓库设置。

## Workflow 与部署链路

| 仓库 | Workflow | 状态 | 迁移判定 |
|---|---|---|---|
| `gsyen-web` | `.github/workflows/release.yml` / `Release` | active；仅 tag 触发 | 构建 Web/Electron，发布到 Cloudflare R2 与 GitHub Release；不是 GCP，可暂保留 |
| `gsyen-api` | `.github/workflows/deploy.yml` / `Deploy to Cloud Run` | **active；main push 触发** | WIF → Artifact Registry → Cloud Run，属于仍在运行的 GCP 生产链路，阿里云验收前禁止禁用 |
| Android、Model、SGSYEN API/Web、HalfSphere | 无 GitHub Actions workflow | 已证实当前仓库无 workflow | 仍须审计 Vercel/GitHub App/外部 webhook/人工部署，不能把“无 workflow”当成无 CI/CD |

最近运行的只读证据进一步锁定了生产来源：`gsyen-api` 的 Cloud Run workflow
最近一次成功运行于 `2026-07-30T17:44:23Z`，head commit 为
`2ee79f9672a28b6789b5bb5d0438941d8442f7df`，与当前生产 revision 的已审计
source commit 一致；最近 9 次记录中 6 次成功、3 次失败。`gsyen-web` Release
workflow 最近一次成功运行于 `2026-08-23T07:36:54Z`，head commit 为
`313095e0a937f331b4524b15ccd58220fbb3660f`。这里只读取运行元数据，没有重跑、
取消或修改 workflow。

所有仓库的默认 Actions token 权限均为 `read`，且不能批准 PR review。现有 workflow
可按 job 单独提升权限。environment protection rule 当前均为空；分支控制的只读
证据单列如下。

## 主分支控制

| 仓库 | 只读证据 | 迁移风险 |
|---|---|---|
| `gsyen-web` | active repository ruleset `protect-main`：禁止删除和 non-fast-forward，要求经 PR，并要求 `CodeRabbit` status check；当前批准人数为 0 | 这是唯一已确认存在 active main ruleset 的仓库；新增阿里云 workflow 前需验证新 required checks 不可绕过，且 GSYEN/HalfSphere 审批不互相授权 |
| `sgsyen-api`、`sgsyen-web`、`gsyen-model`、`halfsphere` | classic branch-protection API 返回 `Branch not protected`，ruleset 列表为空 | main 当前没有已确认的受保护部署门；生产 CI 切换前应增加各业务独立的 review/status 要求 |
| `gsyen-api`、`gsyen-android` | 私有仓库；当前套餐/API 以 HTTP 403 表明 branch protection/ruleset 需升级套餐或改为公开仓库 | 状态应记为**不可验证/不可用**，不能误写成“已保护”；也不得为了获得该功能降低仓库可见性 |

本次盘点没有修改 ruleset、套餐、仓库可见性或分支设置。

## Secret 名称账本

### `gsyen-web`

| 名称 | 最近更新时间（UTC） | 当前代码消费者/结论 |
|---|---|---|
| `R2_ACCESS_KEY_ID` | 2026-06-15 | Release workflow 使用；Cloudflare R2 允许暂保留 |
| `R2_SECRET_ACCESS_KEY` | 2026-06-15 | 同上；值未读取 |
| `V2RAY_NODES` | 2026-07-30 | Windows Electron build 使用；属于发布配置，不是 GCP |
| `VITE_GSYEN_API_URL` | 2026-07-14 | Windows/Mac artifact 使用；值不可读，生产切换时必须更新并扫描安装包 |
| `VITE_SUPABASE_URL` | 2026-06-10 | Electron build 使用；Supabase 允许暂保留 |
| `VITE_SUPABASE_ANON_KEY` | 2026-06-10 | Electron build 使用；属于浏览器公开 key，但仍按 Secret 管理 |
| `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` | 2026-06-14 | 当前 Release workflow 未引用；长期 AK 风险，未知消费者闭环前禁止删除 |
| `OSS_KEY_ID` / `OSS_KEY_SECRET` | 2026-06-09 | 当前 Release workflow 未引用；疑似重复旧命名，先查历史 run/外部消费者 |

### `gsyen-api`

- `GCP_SA_KEY`，最近更新时间 2026-06-16。当前 active workflow 使用 WIF，不引用
  该 JSON key 名称；这说明元数据漂移，不代表可直接删除。必须先查 key ID、最后
  使用、历史 workflow、其他仓库和 Audit Logs，再在 GCP-off 审批中撤销。

Android、Model、SGSYEN API/Web、HalfSphere 当前无 repository-level Actions
Secret 或 Variable。API 无法据此排除 organization/environment/GitHub App/Vercel
侧 Secret；这些仍需各控制面核对。

## Environments

- `gsyen-web`：`Preview`、`Production`，未发现 protection rule。
- `sgsyen-web`：`Production`、`Production – sgsyen-app`、
  `Production – sgsyen-web`，未发现 protection rule。
- `halfsphere`：`Preview`、`Production`，未发现 protection rule。
- 其余上述仓库：无 environment。

上述 7 个 environment 的 Secret 名称列表也均为空。仍不能据此排除 Vercel 或
其他 GitHub App 自身保存的部署变量。

上线前应为两个业务分别建立 protected environment、独立 approver 与独立凭证，
不得让 GSYEN 的批准自动授权 HalfSphere，反之亦然。

## Webhook 只读证据

| 仓库 | Host | 事件 | 最近投递证据 |
|---|---|---|---|
| `gsyen-web` | `webhook.gsyen.com` | push | 2026-08-23 四次均 HTTP 530，耗时 0.03–0.12s |
| `gsyen-api` | `webhook.gsyen.com` | push | hook active；API 当前无 delivery 历史 |
| `sgsyen-web` | `webhook.gsyen.com` | push | hook active；API 当前无 delivery 历史 |
| 其他仓库 | 无 hook | — | — |

2026-08-26 对 `https://webhook.gsyen.com/` 的非业务 HEAD 探测也返回 Cloudflare 530。
没有请求或显示 hook 的完整路径、query 或签名。530 证明当前入口不可用，不能用
它承担阿里云部署；也不能在未知用途闭环前直接删除 hook。先从现有接收端代码、
Cloudflare DNS/Tunnel 与服务器日志确认它原本负责的部署或通知，再设计独立的
GSYEN/HalfSphere 回调和单方回滚。

## 迁移动作与闸门

1. 保持 `gsyen-api` GCP workflow active，直到阿里云影子 workflow、数据和业务
   验收通过；当前真实 Cloud Run 仍有流量。
2. 新增阿里云 workflow 时只生成不可变 commit/digest release；使用两个业务各自
   的 protected environment 和 RAM 身份，不复用长期 OSS AK。
3. 更新 `VITE_GSYEN_API_URL` 后，从 Windows/Mac 最终安装包扫描 `.run.app`、旧
   endpoint 与 updater 地址，再发布。
4. HalfSphere 827 后端源码/仓库未找到前，不创建推测 workflow。
5. Secret、hook、WIF/GSA 的停用属于生产切换/身份变更，必须在零消费者证据后
   取得用户确认；删除仍需针对精确清单再次确认。

状态：**只读盘点完成；GitHub/GCP 生产链路未切换，Webhook 故障未修复。**
