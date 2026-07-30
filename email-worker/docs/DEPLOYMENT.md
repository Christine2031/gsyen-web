# GSYEN Mail 生产部署

用户邮箱只使用 `@gsyen.com`。`mail-api.gsyen.com` 仅是内部 HTTPS API
主机名，不接收邮件，也不作为用户可见邮箱域。

当前生产状态（2026-07-29）：

- `gsyen.com` Email Routing 为 `ready`。
- 根域三条 Cloudflare MX 与 SPF 已在公共 DNS 生效。
- `ethan7586@gsyen.com` 精确路由到 `gsyen-mail-production`。
- 旧的 `mail.gsyen.com` 收件子域已退役。
- `mail-api.gsyen.com/health` 返回 200。
- Resend 中 `gsyen.com` 已验证，生产 Worker 使用独立 Sending access API Key。

## 当前外部前置条件

1. `gsyen.com` 必须位于将要部署 Worker 的同一个 Cloudflare 账号。
2. 任意外部收件人发信通过已验证 `gsyen.com` 的 Resend API。
3. Cloudflare API Token 只需 Workers、D1、R2、Queues 与 Email Routing 权限。
4. Resend API Key 必须使用 Sending access，并仅保存为 Worker Secret。
5. `MAIL_DOMAIN` 与 `INBOUND_DOMAINS` 均保持 `gsyen.com`，Worker 拒绝
   其他域名，包括已经退役的 `mail.gsyen.com`。

## 资源创建

在 `email-worker` 目录执行：

```powershell
npx wrangler d1 create gsyen-mail-development
npx wrangler d1 create gsyen-mail-production
npx wrangler r2 bucket create gsyen-mail-development
npx wrangler r2 bucket create gsyen-mail-production
npx wrangler queues create gsyen-mail-outbound-development
npx wrangler queues create gsyen-mail-outbound-production
npx wrangler queues create gsyen-mail-outbound-dlq-development
npx wrangler queues create gsyen-mail-outbound-dlq-production
npx wrangler queues create gsyen-mail-outbound-dlq-terminal-development
npx wrangler queues create gsyen-mail-outbound-dlq-terminal-production
```

把两个 D1 命令返回的真实 UUID 写入 `wrangler.jsonc` 对应环境。文件中的
全零 UUID 只用于本地开发和 dry-run，不能用于生产发布。

## Secret 与数据库

```powershell
npx wrangler secret put SUPABASE_ANON_KEY --env development
npx wrangler secret put SUPABASE_ANON_KEY --env production
npx wrangler secret put RESEND_API_KEY --env development
npx wrangler secret put RESEND_API_KEY --env production
npx wrangler d1 migrations apply gsyen-mail-development --remote --env development
npx wrangler d1 migrations apply gsyen-mail-production --remote --env production
```

不要把真实 key 写入 `wrangler.jsonc`、`.dev.vars.example` 或 Git。

## 邮件域配置

根域收件已通过 Cloudflare Email Routing 配置。后续在 Cloudflare Dashboard 中：

1. 在 Resend 保持 `gsyen.com` 为 Verified，保留其 SPF、DKIM 与 bounce 记录。
2. Resend 发信 DNS 与根域入站 MX 相互独立，不得删除有效的 SPF/DKIM。
3. 删除 `mail.gsyen.com` 现存的三条 Cloudflare MX 记录，以及所有以
   `@mail.gsyen.com` 为目标的 Email Routing 规则；不能只停止创建新记录。
4. 删除后同时从 DNS Records 与 Email Routing Rules 页面确认已退役配置不存在，
   并用公共 DNS 查询确认 `mail.gsyen.com` 不再返回 MX。
5. 只为已存在且已激活的 `@gsyen.com` 邮箱创建精确 Worker 路由。
6. 保持根域 Cloudflare MX、Resend SPF/DKIM/bounce 记录有效，不得在清理旧子域时
   删除这些生产配置。
7. 保持 catch-all 关闭，避免不存在地址产生无效访问和存储。

DNS 通常 5–15 分钟生效，全球传播最长可能达到 24 小时。

## 部署

```powershell
npm run check
npx wrangler deploy --dry-run --env production --outdir dist
npx wrangler d1 migrations apply gsyen-mail-production --remote --env production
npm run deploy
```

部署后必须确认两个消费者都存在：

```powershell
npx wrangler queues consumer list gsyen-mail-outbound-production
npx wrangler queues consumer list gsyen-mail-outbound-dlq-production
```

主队列负责有限重试，耗尽后进入 DLQ；DLQ 消费者只有在 D1 已成功保存
脱敏事件后才确认消息。管理员通过 `GET /v1/admin/operations` 查看未处理
死信、24 小时失败量、卡住的发送任务与持久化事故记录，再通过
`POST /v1/admin/dead-letters/{event-id}/replay` 单项重放。禁止批量盲重放。

## 管理员与用户注册

在 HalfSphere Supabase Auth 的目标管理员 `app_metadata` 中设置：

```json
{
  "mail_admin": true
}
```

普通用户注册后状态为 `pending`。管理员调用：

```text
POST /v1/admin/mailboxes/{mailbox-id}/status
Authorization: Bearer {admin-access-token}
Content-Type: application/json

{"status":"active"}
```

## 发布验收

1. `/health` 返回 `ok: true`，且响应不包含 Secret。
2. 用户申请邮箱后为 `pending`。
3. 未激活用户无法发件，未激活地址拒收。
4. 管理员激活后，从外部邮箱发到新地址，收件箱只返回安全纯文本。
5. 从 GSYEN 发往一个受控外部邮箱，确认 SPF、DKIM、DMARC 通过。
6. 重复投递相同 `Message-ID`，数据库只能出现一次。
7. 人为使用不存在地址，确认没有 catch-all 泄露或无限存储。
8. 超过每日配额返回 429，不产生额外队列消息。
9. 检查 Queue、DLQ、Resend、Worker 与 D1 日志。
10. 确认 `mail.gsyen.com` 无 MX、无 Email Routing 规则，同时根域收件与 Resend
    发件仍各自通过一次真实邮件测试。
11. 确认生产 DLQ 有消费者，并验证一次“持久化后确认、队列不可用时保持
    pending、已发送邮件不重复发送”的自动测试。
12. 使用管理员令牌读取 `/v1/admin/operations`，确认无未处理死信或卡住任务。

## 回滚

1. 先暂停注册和发件，不删除数据。
2. 把根域精确 Email Routing 规则改为转发至已验证管理邮箱。
3. 回滚 Worker 版本；D1 迁移只做向前兼容修复。
4. 保留 R2 原始邮件，确认导出后才能按保留策略删除。
5. 不恢复已退役的 `mail.gsyen.com` 邮件子域。
6. 回滚期间保留 DLQ 消费者与 `dead_letter_events`，不要删除事故证据。
