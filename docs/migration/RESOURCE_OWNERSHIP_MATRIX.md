# GSYEN / HalfSphere 资源归属矩阵

更新日期：2026-08-26

本矩阵优先回答“谁仍在使用、能否独立回滚、何时允许停止”。`未知` 一律按仍被使用处理。

| 资源/依赖 | GSYEN | HalfSphere | 归属 | 当前证据 | 动作约束 |
|---|---:|---:|---|---|---|
| GCP 项目 `halfsphere-api-7586` / 776196228503 | 是 | 有同名服务但非生产闭环 | 共享项目 | 两个 Cloud Run 服务、共用默认 Compute SA | 两方独立验证前禁止停项目或删共享身份 |
| GCP 项目 `gsyen-api-7586` / 560294832548 | 名称属 GSYEN、当前为空 | 否 | GSYEN 独立空项目 | billing 未绑定；Cloud Run/Compute/Artifact/Secret 未启用，Bucket/dataset/SA 均 0 | 最终删除或书面保留需用户确认；不得漏出 GCP 收尾清单 |
| Cloud Run `gsyen-api` | 是 | 否 | GSYEN 独立 | commit、revision 与持续流量已证实 | 阿里云验收且观察期完成前禁止停 |
| 776 项目 Cloud Run `halfsphere-api` | 否 | 未知/可能旧版 | 未决 | source digest 已知，前端未指向该项目 | 先取源码核对；不得当作生产替代 |
| 776 Artifact Registry `cloud-run-source-deploy` | `gsyen-api` package | `halfsphere-api` package | 共享 repository | 两方 revision/build digest 可见；完整清单被 billing blocker 阻断 | 两方 ACR digest 对账前禁止停用或删除 |
| 776 Cloud Run source Bucket | `services/gsyen-api/` 2 对象 | `services/halfsphere-api/` 1 对象 | 共享 Bucket、prefix 分离 | 共 3 对象/10,957,693 bytes；无 public IAM | 两方 source/commit/回滚闭环前禁止删除 |
| Cloud Run 项目号 `827638954474` | 很可能含 SGSYEN API（待证实） | 是 | 未知共享生产项目 | HalfSphere artifact 直接引用；SGSYEN Git 历史把该显式地址改为当前哈希 `a.run.app` 地址 | P0：取得权限与完整资源清单；按双方共享处理，禁止停用/删除 |
| 776 默认 Compute SA | 是 | 可能 | 不安全共享 | 两服务共用且项目 Editor | 迁移后分别用最小权限身份；双确认后再停用 |
| GSYEN GitHub WIF/GSA | 是 | 否 | GSYEN 独立 | provider 限定 `gsyen-api` 仓库 | 切换成功前保留；之后撤销需确认 |
| 阿里云 GitHub OIDC/RAM deploy role（尚未创建） | 计划是 | 计划是 | 必须两套独立身份 | 官方 `configure-aliyun-credentials-action` 支持 OIDC；本地设计固定 v1.1.0 commit SHA，不使用长期 AK | 各自 OIDC IdP、role、GitHub environment、ACR/release target；创建/付费/生产 workflow 前确认，禁止宽泛 repo trust |
| Secret `gsyen-*` 三项 | 是 | 否 | GSYEN 独立 | Cloud Run 引用名称 | 迁移值时不得打印；独立阿里云 Secret |
| Secret `halfsphere-database-url` | 否 | 可能旧版 | HalfSphere/未决 | 776 同名服务引用 | 需与 827 生产数据库比对，禁止猜测复用 |
| Supabase ref `hrtynofmjcumuanjvpxz` | 是 | 是 | 第三方共享数据平面 | 代码/migration 表明 auth、tier、subscription 耦合 | 迁移必须保留 UUID/账号/权限契约；禁止任一方单独 drop |
| `user_tiers`、`auth.users` 等共享表 | 是 | 是 | 共享数据库对象 | 两仓库 migration 与业务代码交叉引用 | 拆分前双写/核对；任何 DROP 需双方确认 |
| `sanyuanlou-api` 的 `registration_requests` 写入 | 否/未知 | 是 | HalfSphere 共享消费者 | Git 历史 `386834ce…` 直接写表 | 纳入接口/数据回归；未确认退出前禁止拆表或改契约 |
| HalfSphere provider 加密数据 | 否 | 是 | HalfSphere 独立 | 需要原 `HALFSPHERE_ENCRYPTION_KEY` | 必须迁移原密钥；禁止无计划轮换 |
| SGSYEN 候选 bucket `sgsyen-content` / GCS 路径字段 | 是/未知 | 否 | GSYEN 家族/待定位 | 具体 bucket 名只在账本出现；三个可访问项目 Bucket list 均无此项，代码仅要求 `GCS_BUCKET` | 从真实生产 env/DB 路径定位 owner project；迁移哈希、字段兼容后再退役 GCS |
| Cloudflare Email Routing/D1/R2/Queue | 是 | 否 | GSYEN 邮件独立 | 控制面已证实 D1 500 messages、R2 977 objects 和 3 条 active 精确路由；生产仅有 Resend 外发队列族，尚无 Stalwart mirror queues/binding/schema | 先备份并依序迁移 D1 schema、建立独立 mirror/DLQ/terminal queues 再发布；Cloudflare 主记录优先，阿里云故障不得影响收件 |
| Stalwart | 是 | 否 | GSYEN 邮件镜像 | 阿里云监听已观察，配置/数据待核对 | 第一阶段不是根域 MX；只作镜像与 IMAP/JMAP 验证 |
| Resend | 是 | 可能 | 允许保留第三方 | 生产外发约束 | 第一阶段唯一生产外发；不是 GCP 平台依赖 |
| Gemini/Google OAuth（若发现） | 按功能 | 按功能 | 外部 Google API 候选 | 尚需逐调用分类 | 不机械删除；书面允许清单说明用途与密钥边界 |
| ECS `i-2zeewhay0farxq8lucrd` | 是 | 否（当前安全要求下） | GSYEN/现有业务主机 | 容量只读证据已取得；一台 ECS 同时最多一个 RAM role | 不把合并 role 冒充双业务权限隔离；HalfSphere 采用独立 ECS 后再验收 |
| HalfSphere 独立 ECS（尚未创建） | 否 | 计划是 | HalfSphere 独立 | 北京 F `u1` 4C8G/100 GiB 私网控制台参考 ¥386.96/月；未下单 | 购买前明确确认；独立 RAM role/SG/备份，生产切换另行确认 |
| `/srv/gsyen` | 是 | 否 | GSYEN 独立 | 目标不变式，服务器实况待核 | 禁止 HalfSphere 写入或读取 |
| `/srv/halfsphere` | 否 | 是 | HalfSphere 独立 | 目标不变式，服务器实况待核 | owner/group `halfsphere`，服务前缀/端口独立 |
| Caddy/VPC/系统监控 | 是 | 是 | 允许共享基础设施 | 用户明确允许；推荐 HalfSphere 独立 ECS 仍可经现有 Caddy 私网反代 | 记录入口单点；独立公网/ALB 拆分需另行报价确认 |
| 阿里云 OSS Bucket/前缀 | 是 | 是 | 必须强隔离 | 现有 2 个 Bucket，归属未读全 | 优先独立 Bucket；若前缀隔离则独立 RAM policy |
| ACR namespace | 是 | 是 | 必须独立 | 尚未创建/盘点 | 新付费或实例动作先报价确认 |
| 项目 `hs-v2ryan` | 否/未知 | 否/未知 | 疑似无关 Tools Hub | VM、磁盘、代理规则、输入法备份 | 完整保留，禁止纳入停服/删除 |
| “输入法.网”客户端 → `gsyen-api` | 是（外部消费者） | 未证实 | owner 待确认 | 最近 24h 35 个 `GET /api/auth/me` 全为 HTTP 500；25 billing-disabled、10 instance-start-failed | 找到 owner、发布渠道和阿里云 endpoint 切换证据前不得停 GSYEN Cloud Run；恢复 GCP billing 需确认 |
| Vercel `gsyen-web` production | 是 | 否 | GSYEN 前端/代理 | production commit `313095e…` 的 auth proxy 因缺少 `GSYEN_API_ORIGIN` 回退到 776 Cloud Run | 切换 env/deploy 需确认；发布后扫描 artifact 和请求日志，可独立回滚 deployment |
| Vercel `halfsphere` production | 否 | 是 | HalfSphere 前端 | commit `82b743a…` 已闭环；根域由 Vercel 响应但不在当前可见项目域名列表 | 先定位 domain owner/team；切换不得与 GSYEN 共用 env/Secret |
| Vercel `sgsyen-web` production | 是 | 否 | GSYEN 家族前端 | 当前 bundle 仍含哈希 `a.run.app` 报告地址；本地集中配置尚未发布 | 阿里云 SGSYEN API 验收后独立切换；保留旧 deployment 回滚 |
| 非 GSYEN 量化/供应链资源 | 否 | 否 | 无关 | 用户约束及 ECS 实况 | 禁止修改、迁移或删除 |

## 独立回滚边界

### GSYEN

- 独立部署版本、env、数据库凭据、OSS 身份、systemd units、日志和备份。
- 切换失败只将 GSYEN DNS/API/回调恢复到已记录的 GCP revision。
- 不触碰 HalfSphere 数据、密钥、进程或回调。

### HalfSphere

- 独立 Linux user/group、`/srv/halfsphere`、端口 `18180-18189`、数据库用户/schema、Secret 与 ACR namespace。
- 切换失败只恢复 HalfSphere 域名/回调和已确认的真实生产 revision。
- 在 827 项目源码和数据未闭环前，不具备可验证的回滚点。

## 共享资源停止规则

共享数据库、Bucket、Secret、Service Account、部署身份或 GCP 项目只有同时满足以下条件才可进入停止审批：

1. GSYEN 与 HalfSphere 均有阿里云端数量/主键/哈希核对证据。
2. 双方生产日志、DNS、CI、客户端、Webhook 和第三方回调均不再访问该资源。
3. 双方可分别回滚，且已完成演练。
4. GCP 停止观察期内双方关键业务均通过。
5. 用户对“停止”给出明确确认；不可恢复删除另需第二次确认。
