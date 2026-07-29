# GSYEN Mail 生产部署

最终邮箱地址使用 `@gsyen.com`。迁移验收期间，`mail.gsyen.com` 仅作为
隔离的收件测试入口；不要修改 `gsyen.com` 根域现有 Google Workspace MX。

当前生产状态（2026-07-29）：

- `mail.gsyen.com` Email Routing 为 `ready`。
- 三条 Cloudflare MX 与 SPF 已在公共 DNS 生效。
- `ethan7586@mail.gsyen.com` 精确路由到 `gsyen-mail-production`。
- `gsyen.com` 根域 MX 仍为 `smtp.google.com`。
- `mail-api.gsyen.com/health` 返回 200。
- Resend 中 `gsyen.com` 已验证，生产 Worker 使用独立 Sending access API Key。

## 当前外部前置条件

1. `gsyen.com` 必须位于将要部署 Worker 的同一个 Cloudflare 账号。
2. 任意外部收件人发信通过已验证 `gsyen.com` 的 Resend API。
3. Cloudflare API Token 只需 Workers、D1、R2、Queues 与 Email Routing 权限。
4. Resend API Key 必须使用 Sending access，并仅保存为 Worker Secret。
5. `MAIL_DOMAIN` 保持 `gsyen.com`；`INBOUND_DOMAINS` 同时接受
   `gsyen.com,mail.gsyen.com`，由 Worker 将测试子域地址规范化到根域邮箱。

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

隔离收件域已通过 Cloudflare Email Routing API 配置。后续在 Cloudflare
Dashboard 中：

1. 在 Resend 保持 `gsyen.com` 为 Verified，保留其 SPF、DKIM 与 bounce 记录。
2. Resend 发信 DNS 与根域入站 MX 相互独立，不得替换根域 Google MX。
3. 保留 `mail.gsyen.com` 的 Cloudflare MX。
4. 只为已存在且已激活的邮箱创建精确 Worker 路由；迁移前不启用 catch-all。
5. 不删除、不替换 `gsyen.com` 根域的 Google MX，直到双向测试全部通过。

DNS 通常 5–15 分钟生效，全球传播最长可能达到 24 小时。

## 部署

```powershell
npm run check
npx wrangler deploy --dry-run --env production --outdir dist
npm run deploy
```

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

## 回滚

1. 先暂停注册和发件，不删除数据。
2. 把 Email Routing 子域规则改为转发至已验证管理邮箱。
3. 回滚 Worker 版本；D1 迁移只做向前兼容修复。
4. 保留 R2 原始邮件，确认导出后才能按保留策略删除。
5. 根域 Google Workspace MX 在回滚和隔离测试阶段全程不受影响。
