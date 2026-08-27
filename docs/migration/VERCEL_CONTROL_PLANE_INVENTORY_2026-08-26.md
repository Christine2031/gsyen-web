# Vercel 生产控制面只读盘点

盘点日期：2026-08-26（Asia/Shanghai）  
账号：`christine2031`  
团队：`Christine Li's projects`  
性质：生产依赖与切换面的严格只读证据；未 link 本地仓库、未读取环境变量值、未部署或修改域名

## 1. 结论

Vercel 不是待移除的 GCP 平台依赖，可以在第一阶段保留，但它是 GSYEN、HalfSphere 和
SGSYEN 当前生产前端及 API 地址注入的重要控制面。当前生产 artifact 与本地 dirty source
并不等价：

1. GSYEN 当前 Vercel production commit `313095e…` 的 serverless auth proxy 在未配置
   `GSYEN_API_ORIGIN` 时回退到项目号 `776196228503` 的 Cloud Run；生产环境变量名称清单中
   没有 `GSYEN_API_ORIGIN`，公共站点 `/api/auth/me` 当前返回 503。
2. SGSYEN 当前生产 bundle 仍包含一个哈希形式的 `a.run.app` 报告地址。Git 历史显示该地址
   取代了项目号 `827638954474` 的显式 Cloud Run fallback；这强烈支持它属于同一生产链路，
   但在取得项目 827 权限前仍只能标记为推断。
3. HalfSphere production deployment 与候选源码 commit `82b743a…` 已闭环，但
   `halfsphere.com`/`www.halfsphere.com` 没有出现在当前可见团队的项目域名列表中。公共 DNS
   与响应证明网站由 Vercel 提供，真实域名 owner/team/project assignment 仍须定位。
4. 因此，“本地源码已经集中配置”不能当作生产脱离 GCP 证据。必须在获批切换时更新对应
   Vercel 环境变量、重新部署、扫描发布 bundle，并以运行日志证明没有 GCP 请求。

## 2. 安全与方法边界

- 本地根仓库没有 `.vercel/project.json`，本次没有执行 `vercel link`。
- 只读取账号、team、project、deployment、domain 和 **环境变量名称/作用域元数据**；没有拉取、
  解密、打印或写入任何环境变量值。
- 没有创建 deployment、promote、rollback、alias、domain、DNS record 或 deploy hook。
- 公共 artifact 只按已知关键词抽取 URL；没有把 bundle 全文、请求正文、query 或 Secret 写入
  证据。
- 本报告记录的生产 commit 是控制面 deployment 元数据，不代表本地未提交修改已经发布。

## 3. GSYEN

| 项目元数据 | 当前值 |
|---|---|
| project | `gsyen-web` |
| project ID | `prj_AGimQJwQ5Ib4HcdJz0iXDWRtSNxs` |
| framework/runtime | Vite / Node.js 24 / Hobby |
| production deployment | `dpl_7YCphbubZHLr73CMKvMqgkgjhpaa` |
| source commit | `313095e0a937f331b4524b15ccd58220fbb3660f` |
| deployment shape | 9 serverless functions |
| visible domains | `gsyen.com`（跳转 `www`）、`www.gsyen.com`、`maas.gsyen.com`、branch alias、`gsyen-web.vercel.app` |

生产环境变量元数据只记录以下名称：

`VITE_API_URL`、`MOONSHOT_API_KEY`、`OLLAMA_BASE_URL`、`SICHEN_TZ`、
`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`MAAS_NODES`、`MAAS_TOKENS`、
`VITE_GSYEN_API_URL`。

`GSYEN_API_ORIGIN` 不在该名称清单中。部署 commit 的 `api/authProxy.ts` 对缺失值使用
`https://gsyen-api-776196228503.asia-east1.run.app`，因此当前 `/api/auth/*` serverless
proxy 仍依赖 GCP。公共 bundle 另确认包含该 Cloud Run URL，以及允许保留的 GSYEN/MaaS/mail
业务域名。

本地 dirty source 已删除该 fallback 并通过 `api/gsyenApiOrigin.ts` 强制集中配置；这是一项
候选修复，不是生产证据。若迁移窗口仍保留 Vercel 前端，切换动作必须显式增加指向阿里云的
`GSYEN_API_ORIGIN`，部署后复核 function 配置、bundle 字符串和请求日志。改变生产 env/部署
属于生产切换，需用户明确确认。

## 4. HalfSphere

| 项目元数据 | 当前值 |
|---|---|
| project | `halfsphere` |
| project ID | `prj_s2zhR5knoQyhlPYUMDCzq2LNFvkh` |
| framework/runtime | Next.js / Node.js 24 |
| production deployment | `dpl_Dspy9DHmKQgWGzaYzhYVR8QhUw4E` |
| source commit | `82b743a4546c3d92ff5f7c9291bb42974977b560` |
| visible aliases | `halfsphere-alpha.vercel.app` 等 Vercel alias；当前可见列表不含根域 |

生产环境变量元数据只记录名称：`NEXT_PUBLIC_SUPABASE_URL`、
`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_API_URL`。

公共 `halfsphere.com` 和 `www.halfsphere.com` 当前均由 Vercel 响应并跳转 `/guest`，`www`
DNS 指向 Vercel，但域名不在当前账号/team 可见的项目域名列表。域名可能属于另一 team、账号
或不同 assignment；未定位前不得假设当前项目能够完成根域切换或回滚。

该 deployment 的前端 artifact 指向项目 827 的 HalfSphere Cloud Run，详见
`GCP_CONTROL_PLANE_INVENTORY_2026-08-26.md`。Vercel commit 闭环只证明前端版本，不提供
项目 827 的后端源码、Secret、数据库或回滚点。

## 5. SGSYEN

### 5.1 当前 custom-domain 项目

| 项目元数据 | 当前值 |
|---|---|
| project | `sgsyen-web` |
| project ID | `prj_SRWlknZqA1cWHPKqAyuVwKDLMriG` |
| framework | Vite |
| production deployment | `dpl_DwBR…` |
| source commit | `569ae9ef80cc5ca6579b4cf7565dd7148c4f8840` |
| domains | `sgsyen.com`、`www.sgsyen.com` 及项目 alias |

生产环境变量元数据只记录名称：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、
`VITE_API_URL`。

公共生产 bundle 仍包含：

`https://sgsyen-api-ocjwdme54q-de.a.run.app/reports/`

仓库历史 commit `69d0ce9` 把原 fallback
`https://sgsyen-api-827638954474.asia-east1.run.app` 改为上述哈希 URL。因此项目 827 很可能
不仅承载 HalfSphere，还承载 SGSYEN API；这是基于源码历史的推断，不是控制面归属证明。
在取得项目权限并枚举 revision、custom domain、日志、数据库和 Secret 前，项目 827 必须按
共享生产依赖处理，禁止停用或删除。

本地 dirty source 已通过 `VITE_SGSYEN_API_URL` 集中配置，但当前 production commit 的
`SgsyenReports.tsx`/`ResearchPage.tsx` 仍直接引用旧地址。需要独立发布和线上验证。

### 5.2 旧/重复项目

另有项目 `sgsyen-app`（`prj_la204…`），同一仓库/commit、Next.js、目前只有
`sgsyen-app.vercel.app`，未发现当前 custom domain。其环境变量元数据包含 Supabase service
role 与 `NEXT_PUBLIC_API_URL` 等名称。它可能是旧部署或旁路消费者；在访问日志、alias、hook
和调用方核对前保留，不做删除推断。

## 6. 输入法项目线索

Vercel 项目 `gy-shurufa`（`prj_hWQX…`）为 framework `other` 的手工 production deployment，
域名是 `shurufa.wang`/`www.shurufa.wang`，没有可见 Git commit 元数据或环境变量。它不能单独
解释 GCP 日志中 User-Agent 为“输入法.网”的 `/api/auth/me` 调用。当前 GitHub 可见组织也没有
定位该原生客户端源码；owner、发布渠道、版本和 endpoint 更新机制仍为未知/P0 消费者清单项。

## 7. 切换与验收清单

每个业务必须独立完成：

1. 在获批窗口前导出 project/deployment/domain/env-name 元数据和当前 production deployment ID。
2. 只在用户批准后，把 API origin 切到各自阿里云域名；不得把 HalfSphere 与 GSYEN 共用 Secret。
3. 重新部署后保存 source commit、deployment ID、alias/domain 归属和可回滚旧 deployment。
4. 对公开 JS、serverless functions、source map（若公开）、Electron/Android artifact 做 GCP 地址扫描。
5. 从 Vercel、Cloudflare、阿里云和 GCP 两端对账请求；观察期必须证明新生产请求不再到 GCP。
6. 测试 auth/session/cookie、CORS、OAuth/Webhook、报告下载、HalfSphere `/apply` 与双方共享账号契约。
7. 任一业务失败只回滚该业务的 Vercel env/deployment/alias，不强制回滚另一方。

当前状态：**只读盘点完成；生产 artifact 仍依赖 GCP；未执行切换。**
