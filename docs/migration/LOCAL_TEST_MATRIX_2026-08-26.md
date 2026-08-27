# GSYEN / HalfSphere 本地测试矩阵

执行日期：2026-08-26（Asia/Shanghai）  
范围：当前共享工作树的本地静态检查、单元测试与构建；未使用生产 Secret，未部署，未切流

> 历史基线提示：本文件保留 2026-08-26 的原始执行记录，其中的测试数、依赖告警和
> HalfSphere `middleware` 状态已被 2026-08-27 复验取代。当前结果以
> [`RESUMED_GOAL_STATUS_2026-08-27.md`](./RESUMED_GOAL_STATUS_2026-08-27.md) 为准，
> 不得把下表旧数字当作当前验收结果。

## 结论

当前可在本机执行的主要 TypeScript/Node/Android 质量门均已通过，但这不是生产验收：
`gsyen-model` 缺少可复现 Python runtime，HalfSphere 真实项目 827 后端源码仍未知，
全部真实数据库/对象存储、Cloudflare→阿里云邮件、ECS systemd/Caddy、客户端签名发布、
备份恢复、压力与 GCP-off 测试尚未完成。

## 已执行结果

| 单元 | 执行门 | 结果 | 证据与限制 |
|---|---|---|---|
| 根 GSYEN Web/Node | `npm run lint`、`npm test`、`npm run build` | PASS | TypeScript 通过；33 files / 163 tests；Vite 与 Node bundle 成功。主 JS 2,641.33 kB（gzip 774.08 kB），存在性能 warning |
| Electron 安全 | `npm run test:electron-security` | PASS | 38/38；覆盖受限文件读取、导航/外链、loopback bridge、Office ZIP/HTML、防越界路径与安全 rename。未执行签名的 macOS/Windows `electron:build` |
| 根依赖安全 | 两次 `npm audit`、版本/锁文件核对、Sharp 内存冒烟 | PARTIAL | 生产树 0 critical / 0 high / 5 moderate；完整树 0 critical / 1 high / 6 moderate。Sharp PNG 冒烟 92 bytes；剩余为 Fortune/Excel/uuid 无上游 fix 和 Excalidraw 固定 nanoid 条件风险；`npm ls --all` 仍有 React 19/旧 Radix peer 与两个 Sharp optional extraneous 告警 |
| `gsyen-api` | `npm run typecheck`、`npm test`、`npm run build` | PASS | 32/32；含 auth、signup 并发/幂等/回滚、sandbox，以及模型 loopback origin、Bearer、超时/大小/schema、限速和并发边界。未连接真实 Supabase、Gemini、模型、邮箱或阿里云 systemd |
| `email-worker` | `npm run check` | PASS | TypeScript；20 files / 127 tests。development/production Wrangler dry-run 均通过，`STALWART_MIRROR_ENABLED=false`，未部署 |
| `mail-ingest` | `npm test`、两个 `node --check` | PASS | 14/14；稳定 delivery ID、raw SHA、receipt/lease、冲突、空 reverse-path、RFC 7352 guard、SMTP dot-stuffing 与硬超时。未做真实 Stalwart E2E |
| `sgsyen-api` | `npm run typecheck`、`npm test`、`npm run build` | PASS | 21/21：对象存储 17 + 日志脱敏 4。`npm audit --omit=dev --audit-level=high` exit 0；GCS 回滚链仍有 5 个 moderate |
| `sgsyen-web` | `npm run lint`、`npm test`、`npm run build` | PASS | 这里的 `lint` 实际仅为 `tsc --noEmit`；3/3 静态服务器测试。主 JS 约 1.23 MB（gzip 384 KB），存在 chunk warning |
| HalfSphere 候选 | `npm run lint`、`npm run typecheck`、`npm test`、`next build` | PASS（候选源码） | lint 0 error/0 warning；6/6 security/migration tests；24 routes/pages build 成功。build 仅使用不可用的公开占位 URL/key；Next.js 提示 `middleware` 约定弃用。不能替代项目 827 后端或真实 Supabase 集成 |
| Android | URL 构建门；`testDebugUnitTest lintDebug assembleDebug` | PASS | 13/13，0 failure/error；lint 0 error/26 warning；APK 19,980,861 bytes，SHA-256 `edc10d28c6f2746325c3e6721ba12aa983252a2a19d466f682cf15614b01b7fb`。使用 debug 签名，不是 release artifact |
| `gsyen-model` | `py_compile`、Git/data 静态审计 | PARTIAL | 7 个 Python 文件语法通过；9 个运行依赖均未安装且全部未锁，未运行训练/API。详见模型审计报告 |
| 阿里云部署模板 | `validate-templates.sh`、两个 installer `--check` | PASS | shell/Python 模板、双空间、端口、loopback、release、备份/恢复 fail-closed 静态门通过；没有执行任何 `--apply` |

## 失败与修复记录

1. HalfSphere 第一次 `npm run lint`：15 errors、11 warnings。问题包括条件 Hook、effect
   内同步 setState、JSX 引号、`explicit-any` 和未使用符号。已做最小修复且未放宽
   ESLint；复跑为 0 error/0 warning。仍缺浏览器级预算表单/hydration 测试。
2. HalfSphere 第一次 `next build`：因未提供 `NEXT_PUBLIC_SUPABASE_URL` 而按设计
   fail closed。随后只用 `.invalid` 公开占位值验证编译成功；真实构建变量仍待 827
   源码和生产配置闭环，不能把占位构建发布。
3. Android 第一次聚合命令用 `./gradlew` 返回 permission denied，因为 wrapper 文件
   未带 executable bit；改用仓库脚本一致的 `bash gradlew` 后完整通过。发布前应决定
   是否在 Git 中恢复 wrapper executable mode，并在 Linux CI 复验。
4. 网络波动期间 production Wrangler dry-run 一度延迟；最终输出 production bindings
   与 `--dry-run: exiting now`，没有发布。外网恢复后还需在正式 CI 环境复跑并归档日志。
5. 模型审计发现 Web 原来通过 `VITE_PREDICT_API` 直连无鉴权模型，且取消信号不生效。
   已在本地改为 Web/Electron → 带 Bearer 的 GSYEN API `/api/model/ask` →
   `127.0.0.1:18083`，增加 4 秒超时、每用户限速、全局并发上限和请求/响应契约；
   Caddy 仅把同源 `/api/auth/*`、`/api/model/*` 转给 GSYEN API。上述仅有单元/模板
   证据，真实 Supabase token、model runtime 和 Caddy E2E 尚未执行。
6. `pdfjs-dist` 升级后的首次 `npm run lint` 因新版未从包根导出
   `DocumentInitParameters` 而失败。已改为从公开 `getDocument` 签名推导参数类型；复跑
   lint、161 项单测和 production build 均通过，没有使用内部运行时导入。
7. format-v2 checkpoint 测试首次人工命令把测试文件名下划线误写为连字符，Python 在
   加载测试前 exit 2；使用正确命令后 10/10 通过。真实 v2 preflight/apply、同 ID
   `already-complete` 和 73 项 SHA 复算均通过。
8. 依赖独立复审用 436-byte 合法 PDF 证明极端 `MediaBox` 可在 scale 2 请求
   `200000 × 200000` canvas，绕过 `maxImageSize`。现已在分配前限制页面单边和总像素、
   每批自动挂载 20 页，并把 240k 提取预算前移；新增 2 项策略测试，lint、33/163 单测和
   production build 复跑通过。单页文本解析超时、完整虚拟化和恶意 PDF 浏览器/Electron
   E2E 仍未完成。

## 仍未执行的强制验收

- Web 登录、注册、退出、Cookie/session、OAuth redirect 的真实浏览器 E2E；
- Electron 打包、签名、升级下载链和最终安装包旧 GCP 字符串/出网扫描；
- Android release variant、签名、真机/模拟器关键路径和最终 APK/AAB 出网扫描；
- GSYEN/HalfSphere 真实数据库 schema、记录数、PK/FK/UUID/时间/状态与回调集成；
- GCS→OSS、发布文件和全部对象逐项数量/大小/SHA-256；
- Cloudflare Email Routing→D1/R2→Queue→Caddy→mail-ingest→Stalwart E2E、附件和
  重复投递/崩溃窗/DLQ 演练；
- Stalwart IMAP/JMAP/SMTP、Resend 外发/退信、服务/ECS reboot 自动恢复；
- ECS 上 systemd/cgroup、Caddy、真实 OSS RAM Role/IMDSv2、容量/压力/故障隔离；
- 快照、文件/数据库/对象备份和两套独立恢复/回滚演练；
- GCP 服务停止后的全功能、零生产请求与费用观察。

状态：**本地代码质量门取得阶段性证据；核心生产验收未开始，不得标记迁移完成。**
