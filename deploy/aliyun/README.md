# GSYEN and HalfSphere Alibaba Cloud deployment

This directory records the isolated, parallel migration of GSYEN and HalfSphere
from Google Cloud to approved Alibaba Cloud target host(s). Templates never change
production DNS, mail MX, Caddy imports or a running service by themselves.

## Server layout

- Applications: `/srv/gsyen/apps`
- Runtime configuration: `/srv/gsyen/config` (each rendered env is root-owned,
  mode `0640`, and readable only by its service group)
- Persistent data: `/srv/gsyen/data`
- Backups: `/srv/gsyen/backups`
- Logs: `/srv/gsyen/logs`

HalfSphere is a peer business space, not a GSYEN subdirectory:

- Applications: `/srv/halfsphere/apps`
- Runtime configuration: `/srv/halfsphere/config`
- Persistent data: `/srv/halfsphere/data`
- Backups: `/srv/halfsphere/backups`
- Logs: `/srv/halfsphere/logs`

`systemd-sysusers` creates independent `gsyen` and `halfsphere` identities. It
also creates restricted `gsyen-mail` and `stalwart` identities. All GSYEN
service accounts use the execute-only `gsyen-space` traversal group; mail and
Stalwart are deliberately **not** members of the broad `gsyen` group and cannot
read the core API/Web env files.
Secret-bearing rendered environment files must be root-owned, group-readable by
only the matching service group, and mode `0640`. Never reuse a production
database user, RAM credential, OSS bucket/prefix or secret between the spaces.
The rendered non-secret allocation contracts under `resources/` also reserve distinct
RDS database/schema/users, OSS prefixes, ACR namespaces, SLS projects and RAM
roles. `validate-resource-boundaries.py` rejects placeholders and checks the two
contracts plus the declared ECS topology. They remain inventory gates, not proof
that paid resources exist.

Alibaba Cloud permits only one instance RAM role per ECS. Consequently the
`shared_ecs` topology intentionally cannot pass this repository's boundary gate:
different roles are impossible on one ECS, while one shared role violates the
required permission isolation. Use separate ECS instance IDs and distinct roles,
or stop for a separately reviewed workload-identity design. Buying any target ECS
still requires explicit cost approval. The legacy 8C16G host also runs unrelated
root workloads, so it is not an acceptable production identity boundary even for
GSYEN alone. With separate ECS IDs, each business currently expects its own local
Caddy and loopback upstreams. The previously suggested topology of an old shared
Caddy proxying to a private HalfSphere ECS is not implemented by these templates.

Every application unit resolves code through an app-local `current` symlink:

```text
/srv/<space>/apps/<app>/
├── releases/<release-id>/   # immutable, root-owned release
└── current -> releases/<release-id>
```

GSYEN and HalfSphere never share an app directory, release lock or promotion
approval. Runtime env files remain outside releases under the matching
`/srv/<space>/config`; release validation rejects bundled `.env`, repository
metadata, obvious private-key containers, escaping links, hard links,
group/world-writable files and content without full source-commit metadata.
Mail-ingest releases are root:`gsyen-mail`; Stalwart releases are
root:`stalwart`. Both use the same immutable staging/promotion mechanism rather
than a mutable installer.

## Reserved loopback ports

| Service | Port | Legacy ECS observed 2026-08-27 (not a template result) |
| --- | ---: | --- |
| GSYEN web | 18080 | Running |
| GSYEN core API | 18081 | Inactive/disabled; required env missing |
| SGSYEN web | 18082 | Running |
| GSYEN model API | 18083 | Running |
| SGSYEN API | 18084 | Inactive/disabled; required env missing |
| Stalwart ingest gateway | 18085 | Not installed |

HalfSphere reserves `18180-18189`; the initial assignments are:

| Service | Port | State after foundation installation |
| --- | ---: | --- |
| HalfSphere web | 18180 | Disabled until a reviewed release and env file exist |
| HalfSphere API | 18181 | Disabled until the project-827 production source is recovered |
| Reserved | 18182-18189 | Must not be assigned to GSYEN |

Application units run an `ExecStartPost` guard that fails startup unless their
assigned listener is exclusively on `127.0.0.1` or `::1`. Caddy is the only
intended public HTTP entry point. The GSYEN API and SGSYEN API now default to
loopback, validate their `HOST` policy and pass local real-start checks on
`127.0.0.1`; the post-start guard remains a second, system-level assertion.
Repeat the same listener verification under the candidate systemd units on the
Alibaba Cloud shadow host before enabling traffic.

The hybrid mail rollout is documented in
[`docs/GSYEN_HYBRID_MAIL_ROLLOUT.md`](../../docs/GSYEN_HYBRID_MAIL_ROLLOUT.md).
The Cloudflare-to-Stalwart mirror remains disabled until its Queue, secret,
gateway TLS, Stalwart account and rollback tests have all passed.
The Caddy candidate contains a separate HTTPS hostname for exactly
`POST /internal/mail/mirror`, a 5-MiB body limit, required header shapes and
bounded upstream timeouts. It requires `Content-Type: message/rfc822` and the
presence of `X-GSYEN-Envelope-From`, while still allowing that header's empty
value for the RFC null reverse-path used by bounces. It does not expose
`/healthz` and does not alter MX.
The `request_body` directive requires Caddy 2.10+; validate against the audited
2.11.4 candidate/production binary rather than silently using an older Caddy.
Cloudflare Access service credentials or mTLS are optional additional controls
that require their own reviewed configuration; neither is silently enabled.
The mail-ingest unit also requires every capacity/idempotency setting from its
env example. Startup validation binds the app limit to Caddy's 5 MiB, fixes the
receipt path under recoverable GSYEN data, bounds concurrency/free space and
requires `lease >= 2 * SMTP timeout >= 2 * health-probe timeout` ordering. The
duplicate-guard flag may remain `false`; in that state `/healthz` and delivery
correctly stay unavailable instead of producing a false-ready result.

## Required secrets

`VITE_SGSYEN_API_URL` in `env/sgsyen-web.env.example` is public build-time
configuration. Supply it only while building the static SGSYEN Web release;
`sgsyen-web.service` does not read a Vite environment file at runtime.

The GSYEN web server requires `SUPABASE_URL` and `SUPABASE_ANON_KEY` to verify
Bearer sessions before `/api/chat`; omitting them makes chat fail closed with
HTTP 503. The core and supply-chain APIs require `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. The core API also uses `MOONSHOT_API_KEY`, the
external Google model API key `GEMINI_API_KEY`, and
`MAIL_WORKER_INTERNAL_TOKEN`. Do not commit rendered values. Store them in:

- `/srv/gsyen/config/gsyen-web.env`
- `/srv/gsyen/config/gsyen-api.env`
- `/srv/gsyen/config/sgsyen-api.env`

`gsyen-api` must set `AGENT_SANDBOX_ROOT` to the pre-provisioned
`/srv/gsyen/data/gsyen-api/agent-sandboxes`. The release tree is immutable and is
not a persistence location. `/srv/gsyen/data` and `/srv/gsyen/logs` are root-owned
traversal parents; only explicitly provisioned service subdirectories are writable.
The Web and SGSYEN units do not receive a broad write mount over either tree.
The Alibaba env contract also fixes 20 MiB and 256 files per user, depth 8,
512 KiB per file, 512 nodes/2 MiB/1 second per operation and a 5-GiB filesystem
reserve. One host-wide atomic mutation lock protects quota admission; reads,
tree/grep, writes, delete and reset all use the same path/symlink budgets. The
public health probe caches the write/fsync/free-space readiness result for five
seconds so a request burst cannot turn it into a disk-I/O amplifier. These are
initial safety ceilings, not target-capacity evidence; use a project/filesystem
quota in addition if production volume requires a stronger kernel boundary.

The initial migration could read Cloud Run metadata, but Google Secret Manager
denied secret access while billing on `halfsphere-api-7586` was disabled. Do not
restore billing, enable APIs, or request Secret payload access without separate,
explicit approval for each action. Prefer owner-mediated rotation or export at
the source system; restoring billing alone neither grants Secret access nor
authorizes copying values. Keep all rendered values out of Git and command output.

HalfSphere has separate examples in `env/halfsphere-*.env.example`. The API env
contract is deliberately provisional: the current production endpoint belongs
to inaccessible GCP project number `827638954474`, while the recovered local
repository has not been proven byte-for-byte equivalent to that revision. Do
not invent a launcher or copy the project-776 secret contract into production.

## Foundation installation

Local validation is non-mutating:

```sh
bash deploy/aliyun/tests/validate-templates.sh
bash deploy/aliyun/install-foundation.sh --check
```

On the ECS, `--apply` is allowed only after a reviewed cloud-disk snapshot and
file-backup record exists. A root-owned `0400` or `0600`, nonempty marker at
`/etc/gsyen-aliyun/prechange-approved` is required. The installer backs up every
differing managed file before replacement, creates directories/users, installs
slices and examples, and runs `daemon-reload`. Every service/timer (including
health and backup) is copied only to `/etc/gsyen-aliyun/systemd-available`, and
logrotate rules only to `logrotate-available`; the foundation installer cannot
replace a live application/utility unit, schedule log deletion or change what
starts on the next ECS reboot. It does **not** enable/start a service or timer
and does not import/reload Caddy.
Before `systemd-tmpfiles` can create anything, the installer compares every
already-existing managed directory with the reviewed owner/group/mode contract.
A symlink, non-directory or metadata mismatch stops the run without changing
those permissions; an old layout needs its own approved data-layout migration.
Managed configuration subdirectories likewise must already be root-owned with
their exact mode, so an unsafe parent cannot redirect an install.
The apply path performs these checks, existing-account checks, source-template
checks and every managed destination type/ownership check before its first
system write. After taking the root-owned installer lock it replays the same
preflight before the first managed write. A known legacy-layout mismatch must
therefore fail before sysusers, tmpfiles, backup directories or managed files
are changed; no local validation result authorizes an ECS apply.
On success it moves the one-time marker into that run's root-only audit backup;
every later `--apply` therefore requires a newly reviewed marker.

```sh
sudo bash deploy/aliyun/install-foundation.sh --apply
```

The marker is a gate, not backup evidence by itself. Record the snapshot ID,
file archive hash, operator and timestamp in the change record; do not put a
credential in the marker.

Foundation installs only `resources/*.example`. Before any release `--apply` or
service start, create root-owned, non-group/world-writable rendered files named
`topology.env`, `gsyen.boundaries.env` and `halfsphere.boundaries.env` under
`/etc/gsyen-aliyun/resources`, then run
`validate-resource-boundaries.py`/`validate-boundary-gate.sh`. Values are never
printed. A placeholder, mismatched OSS env, overlapping allocation or impossible
shared-ECS RAM topology fails closed.

## Immutable releases and single-service rollback

Prepare a candidate directory outside `/srv/<space>/apps/<app>` with the exact
runtime payload and a non-secret `RELEASE.json`:

```json
{
  "schema": 1,
  "space": "gsyen",
  "app": "gsyen-api",
  "release_id": "20260826-2ee79f9",
  "source_commit": "2ee79f9672a28b6789b5bb5d0438941d8442f7df",
  "built_at": "2026-08-26T00:00:00Z"
}
```

Every candidate also requires `BUILD.json`. It binds the same source commit to
sorted public origins, a reviewed provider allowlist and an explicit
`allowed_google_services` list. Only `gemini` and `oauth` are recognized Google
exceptions; Vertex AI, Cloud Run, GCS, Artifact Registry, Cloud SQL and Secret
Manager are not exceptions. The release validator scans every artifact for
`run.app`, GCS/AR hosts, known GCP project IDs/numbers and unapproved
`googleapis.com` hosts. A build-time frontend value therefore cannot evade the
runtime env checks. See `release/BUILD.json.example`.

The commit above is the audited local GSYEN API baseline; `built_at` must be
replaced by the real build timestamp. First run the read-only check and record
its tree hash:

Build every candidate on a Linux runtime compatible with the ECS. In
particular, construct the model candidate's virtual environment with copied
launchers so moving the immutable tree does not leave interpreter links pointing
back to a temporary build directory:

```sh
cd /var/tmp/gsyen-model-candidate
test "$(python3 -c 'import sys; print(f\"{sys.version_info.major}.{sys.version_info.minor}\")')" = 3.12
python3 -m venv --copies .venv
.venv/bin/python -m pip install --requirement requirements.lock
.venv/bin/python -m pip check
.venv/bin/python -m pip freeze | LC_ALL=C sort | sha256sum
```

The recovered ECS baseline is Python `3.12.3`; its 56-package sorted freeze hashes to
`2eb726b9252ba840f305cf4fe405a809ffd889d12f592ab1c907eec8b8ac3c20` under `LC_ALL=C`
and matches the
checked-in `requirements.lock`. The hash is provenance for this recovered runtime, not a
permanent approval to upgrade packages. Any lock change requires a new Linux build and
model/API regression evidence.

Before starting a production model candidate, promote its reviewed dataset to a
versioned directory below `/srv/gsyen/data/gsyen-model/datasets`, owned by
`root:gsyen` with directory mode `0750` and file mode `0640`. Set the exact lowercase
SHA-256 and maximum accepted byte size in `/srv/gsyen/config/gsyen-model.env`.
The service resolves the approved version path, refuses a final-component symlink,
reads it through one file descriptor and trains from those exact hashed bytes. A
mutable file owned by the shared `gsyen` application user is not an acceptable
production dataset.

### Versioned model-data transaction

Model data has a separate transaction from the model code release. Its fixed
layout is:

```text
/srv/gsyen/data/gsyen-model/datasets/
├── versions/<version-id>/
│   ├── transactions.csv   # root:gsyen 0640
│   └── MANIFEST.json      # root:gsyen 0640, deterministic
├── current -> versions/<version-id>
└── previous -> versions/<version-id>
```

`stage-model-dataset.sh` accepts only a canonical absolute candidate named
exactly `transactions.csv` outside the managed root. It reads that candidate
through one `O_NOFOLLOW` descriptor, checks the byte ceiling and exact CSV
header, then binds version ID, filename, size, ceiling and dataset SHA-256 into
a canonical manifest. `--check` prints the manifest digest without changing the
host. A subsequent `--apply` requires that exact digest in the root-owned
one-time `/etc/gsyen-aliyun/model-data-approvals/<version>.stage` marker. It
uses the model-data and host-capacity locks, cannot overwrite an existing
version, and does not change either link, the env or a service.

```sh
/usr/local/libexec/gsyen-aliyun/stage-model-dataset.sh \
  20260827-orders-1 /canonical/review/transactions.csv 268435456 --check
```

After staging, `promote-model-dataset.sh <version> --check` produces a different
approval digest. That digest binds the desired immutable manifest to the exact
current/previous relative links and the SHA-256 of the protected environment
file; it does not disclose any environment value. Promotion requires the
matching `.promote` one-time marker. Under the same exclusive lock it renders
and validates a root:`gsyen` mode-`0640` env candidate, atomically renames it to
`gsyen-model.env`, atomically switches `current`, restarts only
`gsyen-model.service`, and requires `/readyz` to report the desired dataset SHA.
Only after health succeeds does it atomically preserve the former current as
`previous`.

If restart or exact-SHA readiness fails, the EXIT transaction restores the
root-only saved env plus the former current/previous links and restores only the
prior model service state. It never restarts another GSYEN or HalfSphere unit.
`rollback-model-dataset.sh <previous-version> --check|--apply` uses the same
transaction but additionally requires the requested immutable target to equal
the protected `previous` link and uses a fresh `.rollback` approval marker.
Successful repeated promotion of the already coherent current is a no-op.

This contract intentionally rejects a missing, absolute, nested, or legacy
`current` target and an env that is not already coherent with a validated
version. Therefore it cannot perform the first legacy-to-versioned onboarding.
That one-time baseline conversion still needs a separately reviewed snapshot,
file backup, inactive-service window and explicit production approval. No local
template validation or marker example authorizes an ECS `--apply`.

```sh
sudo /usr/local/libexec/gsyen-aliyun/stage-release.sh \
  gsyen gsyen-api 20260826-2ee79f9 /var/tmp/gsyen-api-candidate --check
```

After the exact hash, snapshot/file-backup evidence and change window are
approved, place only that 64-character hash plus a newline in the root-owned
mode-`0400`/`0600` `.stage` marker named by the command's help, then use
`--apply`. Staging copies to a new immutable release and cannot overwrite a
different tree with the same ID. It never changes `current`.

The foundation installer creates each permitted
`/etc/gsyen-aliyun/release-approvals/<space>/<app>` directory as root:root mode
`0700`, refusing symlinks and non-directory collisions. Create a marker without
relaxing those directory permissions (the hash is audit metadata, not a
credential):

```sh
approval_tmp="$(mktemp)"
trap 'rm -f -- "${approval_tmp}"' EXIT
chmod 0600 "${approval_tmp}"
printf '%s\n' "${release_hash}" > "${approval_tmp}"
sudo install -o root -g root -m 0400 "${approval_tmp}" \
  /etc/gsyen-aliyun/release-approvals/gsyen/gsyen-api/20260826-2ee79f9.stage
rm -- "${approval_tmp}"
trap - EXIT
```

Use the exact app, release ID and `.stage`/`.promote` suffix printed by the
corresponding command; never reuse one system's marker for the other.

The compatibility `install-mail-ingest.sh` no longer copies or deletes an app
root. Its candidate form requires both manifests and delegates only to
`stage-release.sh`; promotion remains a second approved command.

For SGSYEN API, `OBJECT_STORAGE_TEXT_MAX_BYTES` is mandatory in the production
env contract (`5242880` by default in the candidate example, with a hard
10-MiB configuration ceiling). Markdown bodies are streamed from OSS and
aborted once this byte limit is crossed. The unit removes `DEBUG` after all env
sources are merged, and application startup also rejects debug globs that could
enable `ali-oss`; request-signing and temporary credential metadata must not be
sent to production logs.

Run `promote-release.sh ... --check` on the staged release. Promotion requires
a separate `.promote` marker containing its exact tree hash and atomically
updates only that app's `current` link. It deliberately does not restart the
unit: restart, health checks and Caddy traffic changes belong to the approved
start window. Both one-time markers are moved to a root-only audit directory.
Running either apply command again against the identical staged/current release
is a no-op, so deployment is repeatable.

Rollback uses the same promotion path with a previously validated immutable
release and a new approval marker. Restart and verify only that app. A GSYEN
rollback never changes HalfSphere's link, and vice versa. Do not garbage-collect
old releases until the observation period ends and the exact paths have a
separate deletion approval.

### Approval-bound single-service unit transaction

Release promotion deliberately does not install or start a live unit. The
separate `activate-systemd-service.sh` transaction changes exactly one
allowlisted application service after its release, environment and health
contracts are ready. `--check` binds the exact candidate/current unit hashes,
enabled/active state, MainPID, immutable release tree, business health contract
and reviewed service-dependency state into one approval digest. `--apply`
requires that digest plus a newline in the root-owned mode-`0400`/`0600`
`/etc/gsyen-aliyun/systemd-approvals/SPACE/SERVICE.activate` marker.

```sh
sudo /usr/local/libexec/gsyen-aliyun/activate-systemd-service.sh \
  activate gsyen gsyen-api \
  /etc/gsyen-aliyun/systemd-available/gsyen-api.service --check
```

The candidate must use the exact business user/group, app `current` directory,
environment file, empty capabilities and `NoNewPrivileges=true`. Stalwart is
the sole capability exception and may request only `CAP_NET_BIND_SERVICE` for
its loopback port 25. Exec privilege prefixes, cross-business paths, extra
service dependencies and drop-ins fail closed. Mail-ingest additionally
requires the already-active Stalwart MainPID to own an isolated loopback
listener; Stalwart activation requires postfix/sendmail/exim conflict units to
remain inactive. These prerequisite states are re-hashed immediately before
commit and after health verification.

Each successful transaction preserves a protected `unit.before` or
`unit.before.absent` plus the previous enabled/active state. Rollback is a new,
independently digest-approved transaction and can restore a real enabled or
disabled/inactive unit, or remove a first-install unit and return to
not-found/inactive without touching another business service:

```sh
sudo /usr/local/libexec/gsyen-aliyun/rollback-systemd-service.sh \
  gsyen gsyen-api \
  /var/backups/gsyen-aliyun-systemd/TIMESTAMP-gsyen-gsyen-api.SUFFIX --check
```

Any failed install/restart/listener/business-health step attempts to restore
the exact former unit and service state before returning failure. This local
contract still needs an isolated Linux exercise for active, inactive, disabled
and absent units, failure injection and power interruption. It is not approval
to create a marker or run `--apply` on the current ECS.

## Resource isolation

`gsyen.slice` is capped at 450% CPU, 7 GiB memory high / 8 GiB max and 2,048
tasks. `halfsphere.slice` is capped at 250% CPU, 3 GiB high / 4 GiB max and 1,024
tasks. Together they leave roughly one vCPU and at least 2 GiB of the observed
8-core/~14-GiB host outside application caps for Ubuntu, Caddy and monitoring.
These are initial guardrails, not capacity-test evidence. Do not raise both caps
or enable production traffic until CPU, memory, disk IO, bandwidth and peak
connection load tests pass. The slice files may still be exercised on an
isolated, credential-free shadow host, but the resource boundary gate blocks a
shared-ECS production start because the required RAM identities cannot be
isolated. The supported target is a separately approved HalfSphere ECS without
changing either business's paths or identities.

## Caddy candidates

The files under `caddy/` contain unresolved tokens and are never installed as
active imports. Render to a new candidate path, validate it on a host with the
locked Caddy binary, review the diff, and only then schedule an independently
approved import/reload:

```sh
bash deploy/aliyun/libexec/render-caddy-fragment.sh \
  gsyen /etc/gsyen-aliyun/caddy-available/gsyen.caddy \
  www.gsyen.example.com api.gsyen.example.com \
  sg.gsyen.example.com sg-api.gsyen.example.com \
  mail-ingest.gsyen.example.com

bash deploy/aliyun/libexec/render-caddy-fragment.sh \
  halfsphere /etc/gsyen-aliyun/caddy-available/halfsphere.caddy \
  halfsphere.example.com api.halfsphere.example.com
```

GSYEN rendering requires five independent domains: Web, API, SGSYEN Web,
SGSYEN API and the mail-ingest HTTPS endpoint. The fifth site proxies only the
mail mirror POST to loopback port `18085`; it is not a mail-server hostname/MX
change.

The renderer accepts only HTTPS FQDNs, rejects `.run.app`, refuses symlink
outputs and never reloads Caddy. Access logs go to Caddy's JSON stdout and must
be routed to separate SLS streams/alerts by hostname; application logs are
already separable by `SyslogIdentifier` and business slice.
HSTS is intentionally absent until every affected hostname/subdomain has passed
HTTPS and rollback validation; adding a long-lived browser policy is a separate
production decision.

`activate-caddy-fragment.sh` is an approval-bound transaction skeleton. It
requires the root Caddyfile to contain an exact managed import, validates a
temporary **whole** configuration, binds approval to the candidate/root/previous
hashes, atomically changes only one business symlink and restores the old link
if validation or reload fails. It never edits the root Caddyfile, DNS or MX.
It deliberately refuses a first activation with no previous link. Onboard the
exact root import together with a reviewed immutable baseline fragment in a
separate backed-up/approved root-Caddy change; the transaction script first
validates that baseline whole configuration, so every later failure has a real
rollback target.
`rollback-caddy-fragment.sh` reuses the same transaction with a previous
immutable fragment and a fresh approval. Because this Mac lacks the production
Caddy/systemd runtime, both scripts still require an isolated Linux shadow test
and external TLS/business smoke checks before activation. Even `--check` uses
`sudo` on the shadow host: its temporary root file must remain beside protected
`/etc/caddy/Caddyfile` so relative imports retain their real semantics.

## Backups and restore

`backup-space.sh` produces a mode-0600, age-encrypted archive of `apps`,
`config`, `data` and operator-supplied database/object exports. For GSYEN this
includes the immutable Stalwart app/config/data layout and, while it still
exists, the explicitly named legacy `/srv/gsyen/stalwart` tree. It refuses to
run without a separate public age recipient and an executable, reviewed
`/srv/SPACE/config/backup.d/pre-backup` hook. The hook must create
`consistency-confirmed`; the provided example intentionally exits with failure.
The private age identity must remain off the ECS. Before archiving, the script
holds a host-wide storage lock, validates all immutable release/build manifests,
writes their tree/current inventory, and creates a second deterministic inventory
for every `config`, `data` and optional legacy Stalwart directory, file and
symlink. That encrypted in-package inventory records canonical path, type, byte
size, content/target SHA-256, symlink target and symbolic owner/group/mode. Only
the business allowlisted symbolic identities are accepted; unknown numeric
owners, hard-linked mutable files, special modes and group/world-writable
mutable content fail closed. The source content, symlinks and releases are all
re-hashed after tar has finished reading them. Restore independently hashes the
tar members against the embedded pre-read inventory, so a mid-archive mutation
cannot be hidden by changing the source back later. The script then calculates a conservative two-copy disk
budget and preserves a configured free-space reserve. This is a target-state
backup: every required application (including Stalwart) must have a valid
immutable release and `current` link. A mount at or below a protected tree also
fails closed because `--one-file-system` would otherwise omit its contents; use
a separately reviewed snapshot/export plan for that mount. Relative `current`
links that resolve inside the same business space are preserved, while any
symlink resolving outside `/srv/gsyen` or `/srv/halfsphere` fails closed.
Pre-migration legacy
protection still requires the already mandated cloud-disk snapshot and audited
file backup before foundation apply. A legacy backup without the embedded
content inventory is intentionally not accepted by this target-state restore.

`restore-space.sh` accepts only a canonical, root-owned/non-writable archive and
checksum copied below the selected `/srv/SPACE/backups` tree, checks SHA-256,
refuses active units, bounds decrypted tar bytes/member count using both
configuration and current free space, rejects duplicate/ambiguous paths and
unsafe hard-link targets or privileged ACL/security-xattr metadata. Tar symbolic
owner/group names must be nonempty, business-allowlisted and present on the
fresh target. Old numeric UID/GID fields are deliberately ignored: extraction
starts with `--no-same-owner`, then a validated symbolic-name-to-target-ID pass
sets ownership before either inventory is verified. The release and mutable-content
inventories are checked before the first overwrite and again immediately after
rsync. Restore evidence is copied under `data/restore-exports` only after that
live-tree post-check, so the evidence directory cannot invalidate its own check.
The script creates another encrypted pre-restore backup, restores only the selected space,
and creates a persistent `/etc/gsyen-aliyun/locks/SPACE-restore-in-progress`
systemd gate. The gate blocks automatic starts even across ECS reboot and is not
removed by the script; remove it only in the approved post-restore start window.
The script does not import a database or object dump automatically because those
contracts remain service-specific. Local archives are marked
`LOCAL_ARCHIVE_COMPLETE` and `OFFHOST_COPY_REQUIRED`, never simply `COMPLETE`.
The script does not perform retention, off-host copy, provenance signing or an
off-host restore. The supplied consistency hook therefore remains fail-closed.
Implement and review separate per-business pg_dump/OSS count+hash hooks, copy
the encrypted archive and checksum off-host, add an independently trusted
signature/immutable-storage control, and verify a restore before enabling either
backup timer. Retention deletion remains a separate approval.

GSYEN and HalfSphere backup services and timers are independent. Restoring or
rolling back one never stops, deletes or overwrites the other's space.

## Firewall and security-group desired state

`network/firewall-security-group.desired.tsv` is a non-executable review list.
It calls for a target-specific security group, public 80/443 only, SSH restricted
to rendered admin CIDRs, no public Stalwart or application ports, and an observed
then reviewed egress policy. It deliberately does not modify the current shared
security group or UFW. The other ECS sharing the current group must be fully
classified before an approved network change.

## Verification

After an approved, hash-bound systemd candidate activation, the following are
read-only verification commands. Foundation installation alone does not install
or start these live units, and the current legacy units must not be started as
substitutes:

```sh
systemctl is-active gsyen-web sgsyen-web gsyen-model
curl -fsS http://127.0.0.1:18080/
curl -fsS http://127.0.0.1:18082/
curl -fsS http://127.0.0.1:18083/readyz
```

After the candidate units and API secrets are separately approved and activated:

```sh
systemctl is-active gsyen-api sgsyen-api
curl -fsS http://127.0.0.1:18081/api/health
curl -fsS http://127.0.0.1:18084/health
```

After the verified HalfSphere release, true project-827 API and candidate units
are activated, verify them without issuing a raw start against unknown legacy
units:

```sh
systemctl is-active halfsphere-web halfsphere-api
bash /usr/local/libexec/gsyen-aliyun/healthcheck-space.sh \
  halfsphere /etc/gsyen-aliyun/healthchecks/halfsphere.urls
```

## Rollback boundary

Before production cutover, rollback is simply stopping the new systemd units;
the existing Caddy routes, DNS, MX, PM2 applications, PostgreSQL, and Redis are
left unchanged. Production DNS or MX changes require a separate confirmed
cutover and rollback window.

HalfSphere rollback is independent: stop only `halfsphere-*`, restore only
`/srv/halfsphere`, and revert only its Caddy/DNS/callback changes. Shared GCP
resources cannot be stopped or deleted until both business spaces have passed
their own GCP-off validation.
