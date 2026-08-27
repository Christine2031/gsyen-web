# gsyen.com 邮件迁移现网基线

采集时间：2026-08-24（Asia/Shanghai）  
状态：只读盘点；未执行生产变更

## 已确认事实

### 公共 DNS

以下结果通过公共 DNS 查询获得，不代表控制台内全部隐藏或待发布配置：

| 名称 | 类型 | TTL | 当前值 |
| --- | --- | ---: | --- |
| `gsyen.com` | MX | 300 秒 | `46 route1.mx.cloudflare.net.` |
| `gsyen.com` | MX | 300 秒 | `92 route2.mx.cloudflare.net.` |
| `gsyen.com` | MX | 300 秒 | `94 route3.mx.cloudflare.net.` |
| `gsyen.com` | TXT/SPF | 300 秒 | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| `_dmarc.gsyen.com` | TXT | 300 秒 | `v=DMARC1; p=none;` |
| `resend._domainkey.gsyen.com` | TXT/DKIM | 3600 秒 | Resend RSA 公钥存在 |
| `google._domainkey.gsyen.com` | TXT/DKIM | — | 未发现 |
| `default._domainkey.gsyen.com` | TXT/DKIM | — | 未发现 |
| `gsyen.com` | NS | 86400 秒 | `anderson.ns.cloudflare.com.` |
| `gsyen.com` | NS | 86400 秒 | `beth.ns.cloudflare.com.` |

未发现 `autodiscover.gsyen.com`、`imap.gsyen.com`、`smtp.gsyen.com` 的公开 CNAME。

结论：当前公网入站链路由 Cloudflare Email Routing 承担，而不是 Google MX。
Google / Google Workspace 即使保存账号或历史邮件，也不能直接视为当前公网 MX 入口。

### 仓库与 Cloudflare

- `email-worker/wrangler.jsonc` 将生产 Worker 定义为 `gsyen-mail-production`；
- 生产 D1 名称为 `gsyen-mail-production`，R2 名称同名；
- Worker 配置表明入站域为 `gsyen.com`，出站 provider 代码当前使用 Resend；
- 仓库部署文档记录 `ethan7586@gsyen.com` 曾有精确 Email Routing 规则；
- 当前 Wrangler 已登录 Cloudflare，但 OAuth 令牌缺少 D1/Email Routing 所需权限；
- 对生产 D1 执行的只读统计查询被 Cloudflare 以未授权拒绝，没有数据被修改。

### 阿里云

- 阿里云控制台已登录；
- 阿里企业邮箱控制台当前显示“尚未购买任何邮箱产品”；
- 这是预期状态：本项目不购买阿里企业邮箱，不在阿里企业邮箱中创建 GSYEN 用户；
- 阿里云仅作为 GSYEN 自研邮件系统及其他业务的基础设施目标平台。

### Google / Google Workspace

- Google 管理后台需要再次验证身份，当前等待账号持有人完成通行密钥验证；
- 尚未取得用户、别名、群组、Gmail 数据量、路由、OAuth 应用或 Vault/保留策略清单；
- 在完成管理员只读盘点前，不判断 Google 中哪些项目仍承担生产职责。

## 已知地址候选（待控制台核验）

根据项目沟通记录，至少需要核验以下地址的类型、状态、历史邮件和转发目标：

- `ethan7586@gsyen.com`
- `christine@gsyen.com`
- `winstonwang@gsyen.com`

这些地址目前只是迁移候选，不等于已经确认的 Google 用户、Cloudflare 路由或阿里邮箱账号。

## 目标架构结论

邮箱业务模型仍由 GSYEN 控制。当前 Cloudflare Worker 中的邮箱领域逻辑需要迁成
平台无关的 TypeScript 核心，并接入阿里云适配层：D1 到 PostgreSQL，R2 到 OSS，
Queues 到 SMQ/MNS，Worker HTTP 到 SAE/Function Compute，Cloudflare Email Routing
到经合规与端口验证的自研 SMTP 入站网关。出站供应商保持可插拔，首期可以继续
使用 Resend，验证阿里云邮件推送后再按 provider 切换。

Google 中若存在历史邮件，仍须使用现代 OAuth 或受控导出方式盘点和迁移；不得批量
收集用户密码。Google 历史数据迁移与阿里企业邮箱无关。

## 下一步门禁

- [ ] 用户完成 Google 管理后台通行密钥验证；
- [ ] 刷新 Cloudflare Wrangler 授权，取得 D1 与 Email Routing 的盘点权限；
- [ ] 导出 Google 用户、别名、群组、规则、数据量与依赖清单；
- [ ] 读取 Cloudflare 生产邮箱、别名、消息统计与 Email Routing 规则；
- [ ] 用户确认阿里云地域、网络、资源规格与预算；
- [ ] 阿里云书面确认自建邮件入口、TCP 25、固定 IP 与 PTR 条件；
- [ ] 建立非生产 VPC、PostgreSQL、OSS、SMQ 和应用运行环境；
- [ ] 在非生产数据库创建试点 GSYEN 自研邮箱，不修改 MX；
- [ ] 完成历史邮件试迁移和增量同步验证后，再提出生产切换申请。

## 本次操作审计

- 仅执行公共 DNS 查询、仓库只读检查和控制台只读查看；
- 未购买阿里云产品；
- 未创建、删除或修改邮箱账号；
- 未修改 MX、SPF、DKIM、DMARC 或任何 DNS；
- 未停用 Google、Cloudflare、Resend 或 GSYEN Mail Worker；
- 未上传邮箱密码、邮件正文或其他凭据。
