# 多仓库本地恢复检查点

状态：format v2 脚本已通过独立安全复审及 10/10 临时 fixture 测试；当前真实工作区检查点计划/执行 ID 为 `20260827-resumed-goal-v9`，精确证据见本文末尾“当前 v9 检查点”。2026-08-26 的 v1/v2 以及后续 v4/v5/v6/v7/v8 都保留为历史恢复证据；任何现有检查点均禁止覆盖或删除。

脚本：`scripts/create-local-recovery-checkpoint.py`

## 用途与边界

该工具为当前 migration dirty state 创建一个新的、私有的文件级检查点。它不会运行 `git add`、`git commit`、`git clean`、checkout、reset、网络请求、恢复或清理操作，也不会修改任一源仓库。

显式覆盖九个 scope：

1. 根 GSYEN 仓库；
2. `gsyen-api`；
3. `gsyen-android`；
4. `gsyen-model`；
5. `sgsyen-api`；
6. `sgsyen-web`；
7. `halfsphere`；
8. `email-worker`；
9. `deploy/aliyun/mail-ingest`。

每个 scope 必须是根仓库内容，或恰好以自身目录为 top-level 的独立 Git 仓库；解析到其他父仓库、外部 worktree、symlink `.git` 或缺失目录都会 fail closed。当前 `email-worker` 和 `mail-ingest` 归入根仓库，其他六个应用目录是独立仓库，因此预期共处理七个 Git 仓库。

## 使用

路径必须是无 `..` 的绝对路径，并且每个已有路径组件都不能是 symlink。输出父目录还必须由当前用户拥有且不可 group/world writable；当前 `/Users/Ethan/Desktop/Projects` 的实测 mode 为 `0755`，满足该门禁。先执行只读预检：

```bash
python3 /Users/Ethan/Desktop/Projects/gsyen/scripts/create-local-recovery-checkpoint.py \
  --workspace /Users/Ethan/Desktop/Projects/gsyen \
  --output-parent /Users/Ethan/Desktop/Projects \
  --checkpoint-id REPLACE_WITH_UNIQUE_ID \
  --check
```

预检只输出 repo/scope 数量、可归档未跟踪文件数量和按原因聚合的排除数量；不输出 workspace、checkpoint ID、checkpoint 或成员路径。它不创建文件。

只有在确认 ID、磁盘位置和本地恢复门禁后才可显式执行：

```bash
python3 /Users/Ethan/Desktop/Projects/gsyen/scripts/create-local-recovery-checkpoint.py \
  --workspace /Users/Ethan/Desktop/Projects/gsyen \
  --output-parent /Users/Ethan/Desktop/Projects \
  --checkpoint-id REPLACE_WITH_UNIQUE_ID \
  --apply
```

目标名固定为 `gsyen-local-checkpoint-<ID>`。脚本只调用 `mkdir` 创建不存在的目标，绝不覆盖：

- 同 ID 是已经完成、SHA 有效且与当前七个仓库的 refs/status/patch/untracked hash 完全一致的检查点时，返回 `already-complete` 且不写任何字节；
- 同名文件、symlink、不完整目录、损坏目录或内容与当前工作区不一致时 fail closed；
- 失败后可能保留一个没有完整 completion files 的私有目录；脚本不会自动删除或覆盖它，重试必须先人工审计并选择新 ID。

## 每个 Git 仓库的内容

```text
repos/<scope>/
├── repository.bundle
├── bundle.verify.txt
├── tracked-working-tree.patch
├── index.patch
├── status.porcelain-v2.z
├── refs.txt
├── metadata.json
├── untracked.tar
├── untracked-manifest.jsonl
└── untracked-exclusions.json
```

- bundle 包含当前可达的全部 refs 和 `HEAD`，生成后立即运行 `git bundle verify`。
- bundle 数据通过 Git 的标准输入/输出直接连接到已安全打开的文件 descriptor，Git 不接收 checkpoint pathname；检查点的创建、读取、哈希和遍历也全部绑定持久化目录 descriptor，避免 public pathname 被 rename/symlink 替换后把后续操作重定向到其他 inode。
- `index.patch` 是 `HEAD → index` 的 binary/full-index patch。
- `tracked-working-tree.patch` 是 `index → working tree` 的 binary/full-index patch。
- status 使用 NUL 分隔的 porcelain v2 原始记录；metadata 记录 HEAD/tree、branch、upstream、remote **名称**、object format、status hash 和两层 patch 的字节数。Remote URL 不保存，因为 URL 可能嵌入 credential。
- 存在 unresolved index entries 时退出 76；普通 patch 无法忠实恢复冲突 index stage。
- `assume-unchanged`、`skip-worktree`（包括 sparse-checkout）等隐藏 index 状态，以及无法由两层 patch 忠实重建的 `intent-to-add` 状态，同样退出 76；否则 Git status/diff 可能静默漏掉工作树改动或 index 语义。
- 使用 alternates、partial/promisor clone 或未纳入九 scope 的 Git submodule 时退出 78；`GIT_NO_LAZY_FETCH=1` 防止 bundle 因缺失对象触发隐式网络下载。
- Git bundle 只保存 Git object，不会自动携带 Git LFS 对象。当前静态扫描未发现 LFS 跟踪项；若后续仓库启用 LFS，必须单独保存并校验 LFS object，不能把本检查点视为完整恢复证据。
- 捕获前后 status、refs、remote names、index/worktree patch hash、untracked 路径集合/模式/内容 hash 必须一致；七个仓库全部捕获后还会再全量复核一次。任一变化退出 75，不会产生完成检查点。

顶层另有 `scope-map.jsonl`、`checkpoint.json`、`CHECKPOINT_COMPLETE` 和 `SHA256SUMS`。只有 `CHECKPOINT_COMPLETE` 与 `SHA256SUMS` 同时存在、全部 mode 校验通过且 SHA 复算通过，目录才可视为完整。

## Secret、未跟踪文件和路径安全

未跟踪文件候选只来自各仓库的 `git ls-files --others --exclude-standard`。以下类别按路径判定后只增加聚合计数，脚本不会打开、哈希或归档其内容：

- `.git`、`node_modules`、`build`、`dist`、`.next`、coverage、venv、Gradle/Wrangler/cache 等构建或依赖目录；
- 真实 `.env`、`.env.*`、`*.env`、`.dev.vars`、`.npmrc`、`.netrc` 等 Secret/credential 文件；`.env.example`、`.sample` 和 `.template` 等显式模板允许归档；
- 私钥、证书、keystore、service-account/client-secret/credentials JSON 等；
- SQLite/DB、dump、backup、WAL/SHM 和压缩 SQL dump；
- 由其他显式 scope 独立保存的嵌套 Git 仓库。

已跟踪的敏感路径如果发生变化，预检退出 77，避免生成可能包含 Secret 值的 patch。工具不会做内容型 Secret 扫描，因为扫描本身需要读取值；普通源码文件里误放的 Secret 仍是无法自动证明不存在的风险。Git bundle 是不解析内容的历史恢复容器，若 Secret 早已提交到历史，该暴露必须通过独立 Secret rotation/history remediation 处理，不能靠本工具“清洗”。

符合条件的未跟踪普通文件从仓库目录 fd 开始，逐级使用 `openat`/`O_DIRECTORY`/`O_NOFOLLOW` 打开，避免检查后父目录被换成 symlink 的竞态。任何候选 symlink、父级 symlink、FIFO/socket/device、路径穿越或捕获期间 inode/size/mtime/ctime 变化都会失败。归档 manifest 每行只有：

```json
{"mode":"0644","path":"relative/path","sha256":"...","type":"file"}
```

manifest 和 tar 成员路径不会写入 stdout。忽略文件、被排除的 Secret、证书、数据库和构建输出不在恢复检查点中；它不能替代加密 Secret 备份、数据库一致性备份或阿里云云盘快照。

## 权限与恢复原则

- checkpoint 以及所有子目录均为 `0700`。
- 所有 bundle、patch、metadata、tar、manifest、marker 和 `SHA256SUMS` 均为 `0600`。
- 脚本不会创建 snapshot 内 symlink。
- 所有 Git 子命令禁用 optional lock、fsmonitor、hooks、external diff/textconv，并关闭终端认证提示。
- 脚本清除继承的全部 `GIT_*` 控制变量后仅设置自己的只读安全项，并通过命令行固定 `--git-dir=.git --work-tree=.`，防止 `GIT_DIR`、`GIT_WORK_TREE`、`GIT_INDEX_FILE`、object alternates、`core.worktree` 或 config 注入把采集重定向到其他仓库。仓库根与 `.git` inode 在整个进程中保持打开；scope 解析及未跟踪文件读取都从已绑定目录 fd 逐级 `openat`。

同一 UID 的主动恶意进程本身已经具备任意修改工作区的权限。纯 Python/POSIX 无法阻止它把一个已打开的 checkpoint 目录 inode 整体搬入工作区；脚本会在 public binding 复核时检测并拒绝完成，但不能把同 UID 恶意方当作强安全隔离边界。若需要抵御该威胁，输出目录必须由不同 UID/管理员 ACL 持有，或在经验证的 MAC/App Sandbox 中执行。

恢复时只应操作一个全新的隔离目录：先从 bundle clone/核对 HEAD；仅当 `index.patch` 非空时将它应用到 index，仅当 `tracked-working-tree.patch` 非空时再应用工作树 patch。Git 对 0-byte patch 默认报错，因此恢复脚本必须用 `test -s` 跳过空层（或在已验证 Git 版本中显式使用 `git apply --allow-empty`），不得把空 patch 当成恢复失败。未跟踪 tar 必须先核对 `untracked-manifest.jsonl` 和 SHA，再解压到该空隔离目录；不得直接覆盖当前工作区。被排除的 Secret/数据库需从各自受保护备份恢复。任何删除旧 checkpoint、重复源码或失败目录的动作仍走原删除确认门禁。

## 本地测试

测试只在 `TemporaryDirectory` 内创建模拟 Git 仓库和假 Secret：

```bash
PYTHONPYCACHEPREFIX="$(mktemp -d)" python3 -m py_compile \
  /Users/Ethan/Desktop/Projects/gsyen/scripts/create-local-recovery-checkpoint.py \
  /Users/Ethan/Desktop/Projects/gsyen/scripts/tests/test_create_local_recovery_checkpoint.py

cd /Users/Ethan/Desktop/Projects/gsyen
PYTHONDONTWRITEBYTECODE=1 \
  python3 -m unittest -v scripts.tests.test_create_local_recovery_checkpoint
```

当前 10 项集成测试通过，覆盖：七仓库/九 scope、每个仓库的 staged/unstaged/空 patch 分层恢复、untracked tar/manifest、Secret/DB/build 排除、0700/0600、bundle verify、SHA256SUMS、同 ID 幂等复核且零覆盖、untracked symlink、目标 symlink、目标与源仓库 public pathname 替换、继承 `GIT_*` 与 local `core.worktree` 注入、`assume-unchanged`/`skip-worktree`/`intent-to-add` 门禁，以及 tracked sensitive-path 负向门禁。

## 真实 v2 检查点证据

目标：`/Users/Ethan/Desktop/Projects/gsyen-local-checkpoint-20260826-continued-goal-v2`

| 门禁 | 结果 |
|---|---|
| format-v2 单元/fixture | `py_compile` PASS；10/10 PASS |
| 真实 preflight | `preflight-pass`；7 repositories；9 scopes；130 eligible untracked；6 nested repository exclusions；其他排除类别均为 0 |
| 首次 apply | `complete`，没有覆盖既有目录 |
| 同 ID 再次 apply | `already-complete`，内容一致且零覆盖 |
| 独立复算 | 74 files、9 directories、73 checksums；全部匹配；0 symlink |
| 权限 | 根及目录均 `0700`，文件均 `0600` |

一次人工测试命令误将测试文件名中的下划线写成连字符，Python 在打开测试文件前以 exit 2 退出；随后使用正确文件名复跑 10/10，通过且没有工作区副作用。该操作失误保留在失败记录中，不影响脚本结果。

v2 仍不包含被规则排除的 Secret、数据库、构建输出或 Git LFS object，也不能替代阿里云云盘快照、加密文件备份和真实恢复演练。

## 当前 v9 检查点

目标：`/Users/Ethan/Desktop/Projects/gsyen-local-checkpoint-20260827-resumed-goal-v9`

| 门禁 | 结果 |
|---|---|
| 真实 preflight | `preflight-pass`；7 repositories；9 scopes；177 eligible untracked；6 nested repository exclusions；其他排除类别均为 0 |
| 首次 apply | `complete`，没有覆盖既有目录 |
| 同 ID 再次 apply | `already-complete`，内容一致且零覆盖 |
| 独立复算 | 73/73 SHA-256；0 symlink |
| 权限 | 根及目录均 `0700`，文件均 `0600` |

v9 是恢复本 Goal 后当前代码、依赖 lockfile、邮件链路、阿里云实机证据、本地 quota/
dataset/restore/systemd transaction 加固与报告的基线；它仍按同一规则排除
Secret、数据库与构建输出，也不替代阿里云系统盘快照、应用数据备份或恢复演练。旧检查点
只作历史恢复点保留，不得据其较早的测试/文件数量覆盖当前工作树。
