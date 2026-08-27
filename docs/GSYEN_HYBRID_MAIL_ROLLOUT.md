# GSYEN 混合邮件架构上线手册

更新：2026-08-25

目标架构：Cloudflare 负责稳定接收，Stalwart 负责标准邮箱与 IMAP/JMAP，
Resend 继续负责外发。根域生产 MX 在完整验证前保持不变。

## 当前状态

- `gsyen.com` 的生产 MX 仍为 Cloudflare Email Routing；
- GSYEN Email Worker 继续把原始 EML、HTML 和附件写入 R2，把索引写入 D1；
- Resend 仍是唯一批准的生产外发通道；
- 阿里云 Stalwart 已安装，并已确认监听 SMTP 25、SMTPS 465 和 IMAPS 993；
- 镜像开关 `STALWART_MIRROR_ENABLED` 默认是 `false`；
- 未修改生产 MX、SPF、DKIM、DMARC，也未停用 Cloudflare 或 Resend。

## 并行投递链路

```text
Internet
  -> Cloudflare Email Routing
  -> GSYEN Email Worker
      -> D1/R2（现有主记录，先成功保存）
      -> Stalwart Mirror Queue
          -> HTTPS mail-ingest gateway
              -> 127.0.0.1:25
                  -> Stalwart mailbox

Outbound
  -> GSYEN Email Worker
      -> Resend
```

镜像队列只保存 message ID、R2 object key 和信封地址，不把完整邮件放入 Queue。
阿里云网关按 message ID 写入本地幂等回执，同一个 Queue 任务重试不会重复投递。
连续失败的任务进入专用 DLQ，持久化到 D1 后由定时任务重新入队。

## 安全边界

- 网关只绑定 `127.0.0.1:18085`，由 Caddy 提供 TLS；
- `/internal/mail/mirror` 必须使用独立 Bearer token；
- token 只保存在 Cloudflare Secret 和 `/srv/gsyen/config/mail-ingest.env`；
- 网关只接受 `@gsyen.com` 收件人，最大原信默认 5 MiB；
- Stalwart SMTP 仅在本机完成镜像投递，外发仍走 Resend；
- 不把 Stalwart 管理员密码、镜像 token 或 Resend key 写入仓库和日志。

## 阿里云部署

仓库文件：

- `deploy/aliyun/mail-ingest/`
- `deploy/aliyun/systemd/gsyen-mail-ingest.service`
- `deploy/aliyun/install-mail-ingest.sh`

安装脚本只复制文件并载入 systemd，不会启用或启动服务：

```sh
sudo bash deploy/aliyun/install-mail-ingest.sh
```

在 `/srv/gsyen/config/mail-ingest.env` 写入环境变量，权限必须为 `0600`。
服务器和 Cloudflare 必须使用同一份随机 token。

建议使用独立测试入口，例如：

```caddyfile
mail-ingest.gsyen.com {
    handle /internal/mail/mirror {
        reverse_proxy 127.0.0.1:18085
    }
    handle /healthz {
        reverse_proxy 127.0.0.1:18085
    }
    respond 404
}
```

配置完成后先验证，不立即启用：

```sh
systemctl start gsyen-mail-ingest
curl -fsS http://127.0.0.1:18085/healthz
systemctl status gsyen-mail-ingest --no-pager
```

## Cloudflare 资源

生产环境需要两个独立 Queue：

```sh
npx wrangler queues create gsyen-mail-stalwart-mirror-production
npx wrangler queues create gsyen-mail-stalwart-mirror-dlq-production
```

然后配置但保持镜像关闭：

```sh
npx wrangler secret put STALWART_MIRROR_TOKEN --env production
```

在 `wrangler.jsonc` 的 production vars 中加入测试网关 URL，并保持：

```json
{
  "STALWART_MIRROR_ENABLED": "false",
  "STALWART_MIRROR_URL": "https://mail-ingest.gsyen.com/internal/mail/mirror"
}
```

队列、D1 migration、网关、TLS 和测试邮箱全部验证以后，才单独把开关改为
`true` 并部署 Worker。这个动作不修改 MX，关闭开关即可回滚。

## 准入测试

至少验证以下项目：

1. Cloudflare 原有收件、D1/R2 和 GSYEN Mail UI 无回归；
2. 同一 Message-ID 重试只在 Stalwart 中出现一次；
3. HTML、中文、附件和 5 MiB 边界消息均可读取；
4. 网关停止 30 分钟后恢复，Queue 能自动补投；
5. Queue 重试耗尽后，DLQ 记录出现在 D1 并可自动重新入队；
6. Apple Mail 或 Thunderbird 可通过 IMAPS 993 读取试点邮箱；
7. Stalwart 不直接向互联网出站，发件仍由 Resend 完成；
8. 从备份恢复 Stalwart 数据和幂等回执后，历史邮件数量与哈希一致。

## 回滚

镜像阶段的回滚不涉及 MX：

1. 把 `STALWART_MIRROR_ENABLED` 改回 `false` 并部署 Worker；
2. 停止 `gsyen-mail-ingest.service`；
3. 保留 D1/R2、Queue、DLQ 和 Stalwart 数据用于审计；
4. Cloudflare 收件与 Resend 发件继续按原链路工作。

只有在并行运行、备份恢复和客户端验证全部达标后，才另行制定根域 MX 切换方案。
