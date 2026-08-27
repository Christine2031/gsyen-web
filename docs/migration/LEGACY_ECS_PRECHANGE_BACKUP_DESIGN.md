# 现有 ECS legacy 状态的变更前备份合同

更新日期：2026-08-27（Asia/Shanghai）  
状态：**本地设计已审查；快照未批准，脚本未安装，生产备份未执行**

## 为什么不能复用目标态脚本

现有 `backup-space.sh` 强制要求完整的 `current -> releases/<id>` 目标布局；当前 ECS 是
legacy 裸目录、混合 UID，并与无关商城/Smart Wing 共用 Caddy 和 systemd。现有
`restore-space.sh` 还会对 live `/srv/gsyen` 使用删除式同步。两者直接用于当前主机会失败，
或产生越界/覆盖风险。因此需要一次性的 `backup-legacy-prechange.sh` 和只恢复到隔离空目录的
companion validator；不得把 legacy archive 交给 target restore。

## 固定 payload 白名单

归档正文只能包含：

```text
/srv/gsyen/apps/gsyen-web
/srv/gsyen/apps/gsyen-api
/srv/gsyen/apps/gsyen-model
/srv/gsyen/apps/gsyen-android
/srv/gsyen/apps/sgsyen-web
/srv/gsyen/apps/sgsyen-api
/srv/gsyen/config/gsyen-api.env.incomplete
/srv/gsyen/data
/srv/gsyen/logs
/srv/gsyen/stalwart
/etc/caddy/Caddyfile
/etc/systemd/system/gsyen-web.service
/etc/systemd/system/gsyen-api.service
/etc/systemd/system/gsyen-model.service
/etc/systemd/system/sgsyen-web.service
/etc/systemd/system/sgsyen-api.service
/etc/systemd/system/stalwart.service
```

另记录 `/srv/gsyen`、`apps`、`config`、`backups` 目录本身的 metadata，但不递归归档
`backups`。旧的 `gsyen-private-apps-20260825.tar.gz` 只在加密 manifest 中记录路径、大小、
mtime 和既有 SHA，不再次打包。

脚本必须核对 `/srv/gsyen/apps` 一级子目录恰好是上述六个应用；出现任何额外目录就失败。
`/srv/halfsphere` 当前不存在，脚本不得创建或归档。`caddy-api.service`、无关业务 unit、
PostgreSQL、Redis、journald、其他 `/srv`、`/home`、`/root`、`/var/lib` 一律排除。

Caddy 候选/备份和 systemd drop-in 只接受只读盘点后写入版本库的 canonical literal 路径；
禁止 `/etc/caddy/*`、`Caddyfile*` 或目录递归。未分类 drop-in 直接阻断。

## 文件系统与身份门

- 所有 source 与父目录必须为 absolute canonical 非 symlink 路径；不接受用户提供的 source、
  glob、exclude、输出目录或 `--force`。
- symlink 不跟随；只允许相对、非悬空且目标位于已选择 payload 内的链接。hardlink 两端都必须
  是同一 payload 中已清点的普通文件。
- payload 下存在额外 mount、device/FIFO/socket、setuid/setgid、file capability、未批准 ACL、
  `security.*`/`trusted.*` xattr 或 group/world writable 项时失败。
- 不自动 `chown`/`chmod`；使用 numeric owner 原样保存。owner 白名单必须由快照后的只读
  preflight 绑定：`0:0`、已观察 UID 502 与其 numeric GID、实际 Stalwart UID/GID、
  `0:<stalwart-gid>`。任何其他 UID/GID 阻断。
- incomplete env 必须 `0600`；Stalwart binary 必须 `0750 root:stalwart`；Stalwart env
  `0640`；systemd/Caddy 必须 root-owned 且不可 group/world writable。

## 一致性、加密和容量

固定输出到 `/var/backups/gsyen-aliyun-legacy/<run-id>/`，目录/文件权限 `0700`/`0600`，
产物为 `tar --numeric-owner --acls --xattrs --sparse --one-file-system` → 单线程 `zstd` →
`age` recipient 加密包。ECS 只保存 public X25519 recipient；private identity 必须在 ECS 外，
不得进入 Git。外部 sidecar 只公开密文 archive SHA、大小、run ID 和时间；Secret 文件的路径和
逐文件哈希仅在加密 manifest 内。

初始硬门：source apparent ≤ 8 GiB、export ≤ 4 GiB、archive ≤ 8 GiB、expanded tar ≤
16 GiB、成员 ≤ 500,000、保留至少 30 GiB；apply 前 available 必须至少 42 GiB。压缩使用
`nice`/`ionice` 和单线程，避免影响共机无关业务。

按固定顺序取得非阻塞锁：

```text
/run/lock/gsyen-aliyun-backup-gsyen.lock
/run/lock/gsyen-aliyun-backup-gsyen-legacy-prechange.lock
/run/lock/gsyen-aliyun-storage-capacity.lock
```

归档前后必须重新计算 payload manifest；任一 type/size/mtime/hash/owner/mode 漂移即废弃。
Stalwart 正在写入时不得标记 consistency=true。官方当前
[Database Migration](https://stalw.art/docs/management/maintenance/migration/) 文档明确要求
import/export 前停止服务，并说明 live raw-store 操作可能不一致或损坏；官方
[FAQ](https://stalw.art/docs/faq/) 只说明 RocksDB/SQLite 可通过复制数据目录做完整备份，
没有把 live copy 声明为一致在线快照。目标二进制版本 `v0.16.19` 也已由
[官方 release](https://github.com/stalwartlabs/stalwart/releases/tag/v0.16.19) 核实存在。
因此当前合同只接受另行批准的 quiesce 窗口：停止并确认所有 Stalwart listener/进程退出，
再对经配置识别的全部 data/blob/search/config 路径做文件备份；若使用外部数据库/对象后端，
改走该后端的原生一致性备份。没有批准停服或 backend/path 未闭环时 hook 必须以 `78` 失败。

## 一次性审批与恢复

CLI 只能是：

```text
backup-legacy-prechange.sh --self-check
backup-legacy-prechange.sh --approval <canonical-json> --check
backup-legacy-prechange.sh --approval <canonical-json> --apply
```

root-only、mode `0400` 的一次性 approval JSON 必须绑定 instance/disk/snapshot ID、
`snapshot_state=Available`、有效期、机器指纹、脚本/allowlist/owner-policy/hook/age recipient/
容量 limits 的 SHA 以及用户审批引用。marker 不能自行创建快照，也不能替代控制面真实性核对。

同盘加密包仍不是灾备。off-host 必须 pull `.partial` 密文、固定 SSH host key，双方核对 SHA 后
原子改名；随后以 ECS 外 age identity 解密并在空的独立 Linux scratch root 恢复。validator
必须核对 archive SHA、成员/展开上限、逐文件 hash/uid/gid/mode/mtime、links、Caddy validate、
systemd offline verify、Stalwart binary/version/config/data。共享 Caddy/systemd 只能生成 diff，
禁止自动回写生产。

只有 snapshot Available、加密 archive、异地签名 receipt、decrypt/validator receipt 和隔离
恢复 receipt 全部齐备，才允许独立 issuer 创建最终 `prechange-approved`。

## 仍阻断实现/执行的精确事实

1. Caddy 候选/备份 literal 文件名；
2. `staff` 与 `stalwart` 的实际 numeric UID/GID；
3. Stalwart 0.16.19 的实际 data/blob/search backend 与 canonical storage path；一致性方法已
   收敛为经另行批准的停服窗口或外部后端原生备份，不允许 live tar；
4. 可固定 host key 的可靠 SSH/SFTP 异地通道。

任何一项未知都必须 fail closed。快照、停服/quiesce、生产脚本安装、备份 apply 和恢复回写
仍分别受 [审批门](./APPROVAL_GATES.md) 与
[快照审批单](./ALIYUN_PRECHANGE_BACKUP_APPROVAL.md) 约束。
