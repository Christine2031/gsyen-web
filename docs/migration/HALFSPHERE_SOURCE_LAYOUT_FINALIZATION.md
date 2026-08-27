# HalfSphere 平级源码目录收尾

更新日期：2026-08-26（Asia/Shanghai）

## 最终不变式

迁移 Goal 完成前，唯一规范源码路径必须为：

```text
/Users/Ethan/Desktop/Projects/gsyen
/Users/Ethan/Desktop/Projects/halfsphere
```

两者是平级、独立 Git 工作树。HalfSphere 不得长期保留在
`/Users/Ethan/Desktop/Projects/gsyen/halfsphere`，但重复副本的删除仍属于需再次
明确确认的破坏性动作。

## 2026-08-26 只读基线

本节是 `2026-08-26T15:23:21+0800` 的时点证据；目录整理前必须用
[`audit-halfsphere-source-layout.sh`](./audit-halfsphere-source-layout.sh) 重新生成一份新基线，
不得沿用本节数字推测当时状态。

| 路径 | 状态 | 证据 |
|---|---|---|
| `/Users/Ethan/Desktop/Projects/gsyen/halfsphere` | 当前候选工作树，禁止移动/覆盖 | 真实目录（非 symlink）；`703060 KiB`（约 `686.58 MiB`）；branch `main`；HEAD `82b743a4546c3d92ff5f7c9291bb42974977b560`；16 个 unstaged modified、5 个 untracked、0 个 staged、0 个 conflict |
| `/Users/Ethan/Desktop/Projects/halfsphere` | 既有目标目录，禁止直接覆盖 | 真实目录（非 symlink）；`0 KiB`；顶层条目数 `0`；不是 Git 工作树；仍视为用户已有路径并完整保留 |

### Git 完整性与 dirty 状态

- `.git` 是本地目录，无 object alternates、submodule、额外 worktree 或再嵌套的
  `.git`；当前唯一 worktree 就是候选目录。
- `main` 跟踪 `origin/main`，ahead/behind 均为 `0`；唯一 remote 名为
  `origin`，脱敏后为 `https://github.com/Christine3749/halfsphere.git`。
- HEAD tree 是 `9361c2d7f8acfcd4bdb4cce0797fd4d3f6af6f35`；全部 refs 共
  `50` 个 commit，`0` 个 tag，`593` 个 packed object。
- `git fsck --full --no-dangling` 和 pack verify 均通过；无 garbage object。
- 21 个 dirty 条目由 16 个未 stage 修改和 5 个 untracked 源文件组成；
  无 staged 变更、无 merge conflict。它们覆盖 Docker/Next 配置、auth/admin/apply
  路由、SQL migration/rebuild guard、公共 API 配置和安全测试，不可丢弃或
  用 HEAD 重建替代。

| 时点指纹 | SHA-256 |
|---|---|
| porcelain status manifest | `4253065559e57aa3ac906f2884e8e0583adbc78adb9d24c9b800f63f76a7dea2` |
| HEAD → 当前工作树 binary diff | `9820724dbe5b607752c6aa33e26c5f1b7976e9312e7a76c972680014d03196ed` |
| index binary diff（空） | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| tracked path manifest | `a11af99d1a6f762bda9d49c2149f763d811139ede3aa0076096b5dceb0afe7bd` |
| 5 个已审查 untracked 文件的 content manifest | `4decb10dca3be4bf692cd93dcd19dd47569a4b90cb4203dc0111757e96ac8ea7` |

### 迁移期本地整改后 checkpoint

`2026-08-26T15:48:09+0800` 再次运行增强后的只读门禁。HEAD、branch、upstream、
remote names、目标空目录及 `git fsck` 均未变化；为修复 HalfSphere 安全基线和
15 个 lint error，当前工作树已合法增长为 31 个 unstaged modified、5 个
untracked、0 staged、0 conflict。该变化必须作为迁移代码保全，不能再用上面的
21 条历史 dirty 数字恢复或覆盖。

| checkpoint 项 | 结果 |
|---|---|
| source size（含动态 ignored build/dependency） | `706064 KiB` |
| porcelain status manifest | `7fabbb9aed4966f010ea207a7f79fd5c9b7e63d6e8898592c871733e8a385b02` |
| HEAD → 当前工作树 binary diff | `9f350542f5f6d5aa17b3f24ada39928b9797ec2439903d6afcb9f3b1e2dbcb16` |
| index binary diff（空） | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| tracked path manifest | `a11af99d1a6f762bda9d49c2149f763d811139ede3aa0076096b5dceb0afe7bd` |
| 5 个 untracked 文件的路径/类型/模式/内容 manifest | `7133f35792d3255afa33ed5024ade43a13f9a1f0f9ad8961dfdee5fd0b5792a8` |
| ignored / env-like 计数 | `46660` / `1`（未输出路径、未读内容） |

门禁脚本现在还要求 source/target 都是非 symlink 的真实目录，校验
`EXPECTED_HEAD` 必须为完整小写 commit，并在不输出文件名或内容的前提下复算
untracked content manifest；symlink target 负向测试按预期退出 `66`。

候选目录另有 `46660` 个 ignored 条目，主要是 `node_modules`（`642408
KiB`）和 `.next`（`59124 KiB`）；非 `.git` 范围内有 `1932` 个 symlink。
检测到 1 个 env-like 文件，**未读取内容、未输出路径、未计算内容哈希**。
源码保全与 Secret 保全要分开：不得把该文件写入 Git；整理前的
`0700` 文件级回滚副本必须保留它，如需转移则以 `0600` 单独处理。

本机项目所在文件系统当时可用 `45065336 KiB`（约 `42.98 GiB`），
容量足以同时保留当前约 0.67 GiB 候选目录、暂存副本和一份回滚副本；
这只解除容量阻断，不解除生产版本和删除审批门禁。

### 2026-08-26 续跑复核

`2026-08-26T18:14:01+0800` 在网络恢复后重新运行同一只读门禁。候选目录
HEAD、branch、upstream、31 个 worktree 修改、5 个 untracked、0 staged、0 conflict，
以及 status、tracked diff、index、tracked path 和 untracked content 五项 SHA-256
均与上一个 checkpoint 完全一致；`git fsck` 再次通过。目录统计为 `703824 KiB`，
ignored/env-like 计数仍为 `46660`/`1`。既有目标
`/Users/Ethan/Desktop/Projects/halfsphere` 仍为真实、非 symlink、`0 KiB`、0 个顶层
条目的非 Git 目录，因此没有被移动、覆盖或写入。该复核只确认本地保全状态，827
生产后端来源门禁仍未解除。

当前嵌套 HEAD 已证明与 `halfsphere.com` 的 Vercel 前端部署源码等价，但这不等于
项目号 `827638954474` 的 `/apply` Cloud Run 后端 revision 已闭环。后端来源仍是 P0
未知，因此现在不能执行目录整理。

已知生产证据的边界是：

- Vercel deployment `dpl_Dspy9DHmKQgWGzaYzhYVR8QhUw4E` 对应当前 HEAD；97 个
  共同前端源文件核对后实际差异为 0，所以前端候选 commit 已闭环。
- 公共前端 artifact 的 `/apply` 仍指向项目号 `827638954474`；当前身份
  无权读取该项目，无法核对 revision、image digest、build source 或 commit。
- 可访问项目 `halfsphere-api-7586` / `776196228503` 的同名旧服务只能
  闭环到 revision `halfsphere-api-00003-ldn`、source ZIP SHA-256
  `aca86e60ba8823402699e34af7dcb4ebe0c94c14b5428560133b2a9c20e59fba`
  和 image digest
  `sha256:8775d32ed6cac41847a609d54bd0312eb9d10347fd48925a8c746b0c6ecb0e29`；
  它不能被当作 827 生产后端或当前前端 HEAD 的后端来源证明。

### 2026-08-27 Goal 恢复后复核

依赖安全升级与新增代理安全测试完成后，重新运行同一只读门禁并通过。HEAD、branch、
upstream、remote names、目标空目录和 `git fsck` 均未变化；当前为 35 个 unstaged
modified、7 个 untracked、0 staged、0 conflict，不能再沿用 2026-08-26 的 dirty 数字。

| checkpoint 项 | 结果 |
|---|---|
| source size（含 ignored build/dependency） | `1073576 KiB` |
| porcelain status manifest | `831dbf808022d9770e0d6c40508b94a54b84535f11468482c989be770c6a8222` |
| HEAD → 当前工作树 binary diff | `83d0a20853b54c9d34eb4eccc876657b243391875c531b7048f71bd3147d1e0d` |
| index binary diff（空） | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| tracked path manifest | `a11af99d1a6f762bda9d49c2149f763d811139ede3aa0076096b5dceb0afe7bd` |
| untracked content manifest | `c8dbdd6f7da23457a3657283efaa9098f21f2b80a07f915d6d2b179e768a3d6a` |
| ignored / env-like 计数 | `58391` / `1`（未输出路径、未读内容） |

目标 `/Users/Ethan/Desktop/Projects/halfsphere` 仍为真实非 symlink 空目录；本次仅更新
保全指纹，827 生产后端来源与删除/落位审批门仍未解除。

`2026-08-27T15:15:42+0800` 在用户明确恢复统一 Goal 后再次执行同一脚本并通过：HEAD、
35 个 unstaged、7 个 untracked、0 staged/conflict、五项 manifest SHA、58,391 个 ignored、
1 个未读取的 env-like 文件以及空目标目录均未变化；`git fsck` 通过。动态 ignored
依赖/构建内容使 source size 显示为 `1071284 KiB`，不影响受 Git/内容 manifest 约束的
源码身份。未移动、复制、覆盖或删除任何目录。

## 路径引用审计

排除 `.git`、`node_modules`、`build`、`dist`、`.next`、虚拟环境、真实
`.env*` 和 Secret-like 文件后，本轮只读搜索的分类如下。

### 最终落位时必须更新

| 引用 | 当前用途 | 落位动作 |
|---|---|---|
| `vite.config.ts:49` 的 `halfsphere/**` | 根 Vitest 为嵌套 HalfSphere 排除子树 | HalfSphere 成为平级仓库后删除该过时 exclude，并重跑根测试 |
| `CODE_GCP_DEPENDENCY_AUDIT_2026-08-26.md:32,61,93-96,145,160,250-261` | 审计期的 `halfsphere/...` 相对文件证据 | 将当前文件引用改为平级仓库语义；旧绝对路径只能留在明确标注的历史证据段 |
| `PHASE0_INVENTORY_2026-08-26.md:36-40,56` | 候选目录/原始 HEAD 基线 | 追加落位时间、最终路径和新指纹；保留原基线为历史审计证据 |
| 本文档 | 门禁与时点基线 | 追加执行记录，不改写旧指纹；将状态改为已验收 |

### 不是本机源码嵌套引用

- `deploy/aliyun/**` 中的 `/srv/halfsphere/**` 是用户指定的阿里云独立运行
  空间，必须保留，不应改为本机 `/Users/...` 路径。
- `deploy/aliyun/resources/halfsphere.boundaries.env.example` 的
  `OSS_PREFIX=halfsphere/` 是对象 key 前缀，不是文件系统路径。
- `sgsyen-web/docs/halfsphere-api-optimized.md:12` 的 `halfsphere/` 是概念性项目树，
  不依赖它是 GSYEN 子目录。
- 未发现 GitHub Actions `working-directory`、`npm --prefix`、`cd`、symlink 或部署
  脚本硬编码当前嵌套绝对路径。HalfSphere 候选仓库本身也没有
  `.github/workflows` 需要迁移路径。

## 执行门槛

只有以下条件全部满足，才可开始复制：

1. 827 生产 revision、镜像 digest、构建 source 与 commit 已核对；
2. 当前嵌套工作树的 Git bundle、tracked diff、untracked 清单/归档和 SHA-256 已生成；
3. 对外部既有空目录重新做时间点盘点，确认用户没有在其中新增内容；
4. 两份目录均未出现无法归属的新改动或 Secret；
5. 所有构建、测试和部署脚本均已准备支持最终平级路径；
6. 磁盘空间足以同时保留源、暂存副本和回滚副本。

## 安全整理流程

整理采用“复制到新暂存目录 → 校验 → 原子落位 → 保留旧副本”，不得把嵌套目录
直接 move 到既有目标目录，也不得使用覆盖式同步：

1. 在 `/Users/Ethan/Desktop/Projects` 下创建唯一、权限受限的暂存目录；
2. 先创建 `0700` 完整文件级回滚副本（包括 `.git`、未提交、未跟踪、
   ignored 内容和本地 Secret），Secret 子目录/文件保持 `0700`/`0600`，
   不读取值、不写入 Git，不复用硬链接；
3. 再完整复制候选工作树到受限暂存目录；在暂存副本中将可重建的
   `node_modules`/`.next` 与源码保全分开处理，不得因此删除唯一回滚副本；
4. 比对 HEAD、所有 remotes（输出时脱敏）、porcelain status、tracked diff hash、
   untracked 文件清单/hash 和关键文件权限；
5. 在暂存副本运行 HalfSphere 的 typecheck、test、lint、build 及迁移静态测试；
6. 重新确认现有目标目录仍为空且 inode/mtime 没有出现未归属变更；
   获得对该可恢复 rename 的明确执行确认后，将它重命名为时间戳备份，
   而不是删除或覆盖；
7. 将验证后的暂存目录原子重命名为
   `/Users/Ethan/Desktop/Projects/halfsphere`；
8. 更新根文档、脚本、CI/CD、部署工具和本机路径引用，重新搜索旧嵌套绝对路径；
9. 从最终路径再次执行完整构建和测试，并验证 Git status 与复制前一致；
10. 嵌套旧副本保留到生产切换、GCP-off 和观察期结束；只有用户针对该精确路径
   再次确认后，才允许清理。

## 验收证据

- 最终路径 HEAD/branch/origin 与生产来源账本一致；
- 迁移前后的 tracked diff、untracked 清单和内容哈希一致；
- Git 历史对象完整，`git fsck` 和恢复 bundle 验证通过；
- 所有测试/build 从最终平级路径通过；
- `rg`、CI 日志和部署配置不再引用旧嵌套路径；
- 旧副本的保留/清理决定和恢复位置有书面记录。

状态：**待执行；当前不得移动、覆盖或删除任何 HalfSphere 目录。**
