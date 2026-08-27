#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"
readonly libexec_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly helper="${libexec_dir}/model_dataset_transaction.py"
readonly datasets_root="/srv/gsyen/data/gsyen-model/datasets"
readonly versions_root="${datasets_root}/versions"
readonly approval_root="/etc/gsyen-aliyun/model-data-approvals"

usage() {
  cat >&2 <<EOF
Usage: ${program_name} VERSION_ID CANONICAL_TRANSACTIONS_CSV MAX_BYTES --check|--apply

--check reads the canonical candidate once and prints the deterministic
manifest SHA-256 required in the root-owned 0400/0600 one-time marker:
  ${approval_root}/VERSION_ID.stage

--apply stages exactly transactions.csv plus its deterministic MANIFEST.json
under ${versions_root}/VERSION_ID. It never changes current, previous, the
model environment, a service, DNS or MX.
EOF
}

[[ $# -eq 4 ]] || { usage; exit 64; }
readonly version_id="$1"
readonly candidate="$2"
readonly max_bytes="$3"
readonly mode="$4"
[[ "${mode}" == --check || "${mode}" == --apply ]] || { usage; exit 64; }
[[ "${version_id}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ &&
   "${version_id}" != . && "${version_id}" != .. ]] || {
  echo "${program_name}: invalid model dataset version ID" >&2
  exit 64
}
[[ "${max_bytes}" =~ ^[1-9][0-9]{3,9}$ ]] &&
  (( 10#${max_bytes} >= 1024 && 10#${max_bytes} <= 1024 * 1024 * 1024 )) || {
  echo "${program_name}: dataset byte limit must be between 1024 and 1 GiB" >&2
  exit 64
}
[[ -x "${helper}" ]] || {
  echo "${program_name}: model dataset transaction helper is unavailable" >&2
  exit 69
}

if [[ "${mode}" == --check ]]; then
  manifest_hash="$(python3 "${helper}" candidate "${version_id}" "${max_bytes}" "${candidate}")"
  [[ "${manifest_hash}" =~ ^[0-9a-f]{64}$ ]] || {
    echo "${program_name}: helper returned an invalid manifest digest" >&2
    exit 70
  }
  echo "Validated model dataset ${version_id}; stage approval digest=${manifest_hash}"
  echo "No managed path, environment file or service was changed."
  exit 0
fi

(( EUID == 0 )) || {
  echo "${program_name}: --apply must run as root" >&2
  exit 77
}
for command_name in awk chmod chown date df flock install mktemp mv python3 sha256sum stat; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "${program_name}: required command not found: ${command_name}" >&2
    exit 69
  }
done
"${libexec_dir}/validate-boundary-gate.sh" gsyen >/dev/null

validate_managed_directory() {
  local path="$1"
  [[ -d "${path}" && ! -L "${path}" ]] || {
    echo "${program_name}: managed dataset directory is missing or unsafe: ${path}" >&2
    exit 73
  }
  [[ "$(stat -c '%U:%G:%a' "${path}")" == root:gsyen:750 ]] || {
    echo "${program_name}: managed dataset directory must be root:gsyen mode 0750: ${path}" >&2
    exit 77
  }
}

validate_managed_directory "${datasets_root}"
validate_managed_directory "${versions_root}"
readonly version_dir="${versions_root}/${version_id}"
readonly approval_file="${approval_root}/${version_id}.stage"

readonly lock_file="/run/lock/gsyen-aliyun-model-data.lock"
[[ ! -L "${lock_file}" && ( ! -e "${lock_file}" || -f "${lock_file}" ) ]] || {
  echo "${program_name}: model dataset lock path is unsafe" >&2
  exit 73
}
exec 9>>"${lock_file}"
flock -n 9 || {
  echo "${program_name}: another model dataset transaction is running" >&2
  exit 75
}
"${libexec_dir}/validate-boundary-gate.sh" gsyen >/dev/null
validate_managed_directory "${datasets_root}"
validate_managed_directory "${versions_root}"

if [[ -e "${version_dir}" || -L "${version_dir}" ]]; then
  [[ -d "${version_dir}" && ! -L "${version_dir}" ]] || {
    echo "${program_name}: immutable version path is not a real directory" >&2
    exit 73
  }
  candidate_hash="$(python3 "${helper}" candidate "${version_id}" "${max_bytes}" "${candidate}")"
  existing_hash="$(python3 "${helper}" version "${version_id}")"
  [[ "${candidate_hash}" == "${existing_hash}" ]] || {
    echo "${program_name}: version ID already exists with different content" >&2
    exit 73
  }
  echo "Model dataset ${version_id} is already staged with manifest ${existing_hash}."
  exit 0
fi
[[ -d "${approval_root}" && ! -L "${approval_root}" &&
   "$(stat -c '%U:%G:%a' "${approval_root}")" == root:root:700 ]] || {
  echo "${program_name}: model data approval directory is missing or unsafe" >&2
  exit 77
}
[[ -f "${approval_file}" && ! -L "${approval_file}" ]] || {
  echo "${program_name}: missing regular one-time stage approval marker" >&2
  exit 77
}

# Model datasets share the host disk with application releases and backups.
exec 8>>"/run/lock/gsyen-aliyun-storage-capacity.lock"
flock -n 8 || {
  echo "${program_name}: another operation is using host disk capacity" >&2
  exit 75
}
available_bytes="$(df -P -B1 -- "${versions_root}" | awk 'NR == 2 {print $4}')"
readonly minimum_free_after_stage=$((5 * 1024 * 1024 * 1024))
[[ "${available_bytes}" =~ ^[0-9]+$ ]] || {
  echo "${program_name}: cannot determine available dataset storage" >&2
  exit 74
}
if (( 10#${max_bytes} + minimum_free_after_stage > available_bytes )); then
  echo "${program_name}: staging the approved maximum must leave at least 5 GiB free" >&2
  exit 74
fi

readonly staging_dir="$(mktemp -d "${datasets_root}/.stage-${version_id}.XXXXXX")"
cleanup() {
  case "${staging_dir}" in
    "${datasets_root}/.stage-${version_id}."*) rm -rf -- "${staging_dir}" ;;
  esac
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

read -r manifest_hash approval_marker_hash < <(
  python3 "${helper}" stage "${version_id}" "${max_bytes}" \
    "${candidate}" "${staging_dir}" "${approval_file}"
)
[[ "${manifest_hash}" =~ ^[0-9a-f]{64}$ &&
   "${approval_marker_hash}" =~ ^[0-9a-f]{64}$ ]] || {
  echo "${program_name}: staged helper result is invalid" >&2
  exit 70
}
chown root:gsyen "${staging_dir}" \
  "${staging_dir}/transactions.csv" "${staging_dir}/MANIFEST.json"
chmod 0750 "${staging_dir}"
chmod 0640 "${staging_dir}/transactions.csv" "${staging_dir}/MANIFEST.json"

# Validate the staged bytes and metadata, using the final path contract through
# a temporary relative name that cannot be selected by current/previous.
staged_manifest_hash="$(python3 - "${helper}" "${version_id}" "${staging_dir}" <<'PY'
import importlib.util
import grp
import pathlib
import sys

spec = importlib.util.spec_from_file_location("model_dataset_transaction", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
manifest = module.validate_version(
    sys.argv[2], pathlib.Path(sys.argv[3]), expected_uid=0,
    expected_gid=grp.getgrnam("gsyen").gr_gid,
)
print(manifest["manifest_sha256"])
PY
)"
[[ "${staged_manifest_hash}" == "${manifest_hash}" ]] || {
  echo "${program_name}: staged copy differs from its approved manifest" >&2
  exit 74
}
[[ "$(sha256sum "${approval_file}" | awk '{print $1}')" == "${approval_marker_hash}" ]] || {
  echo "${program_name}: stage approval changed during the transaction" >&2
  exit 74
}
[[ "$(stat -c '%u:%a:%h' "${approval_file}")" =~ ^0:[46]00:1$ ]] || {
  echo "${program_name}: stage approval metadata changed during the transaction" >&2
  exit 74
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
install -d -o root -g root -m 0700 /var/backups/gsyen-aliyun-model-data
audit_dir="$(mktemp -d "/var/backups/gsyen-aliyun-model-data/${timestamp}-stage-${version_id}.XXXXXX")"
chmod 0700 "${audit_dir}"
printf '%s\n' \
  "action=stage" \
  "version_id=${version_id}" \
  "manifest_sha256=${manifest_hash}" \
  "prepared_at=${timestamp}" > "${audit_dir}/record"
chmod 0600 "${audit_dir}/record"
mv -- "${approval_file}" "${audit_dir}/stage-approval"

# GNU mv -n refuses an unexpected collision. The protected root and shared
# transaction lock make this the only normal writer, but the no-clobber flag is
# retained as defense in depth.
mv -Tn -- "${staging_dir}" "${version_dir}"
if [[ -d "${staging_dir}" ]]; then
  echo "${program_name}: immutable version appeared during commit; nothing was overwritten" >&2
  exit 73
fi
trap - EXIT HUP INT TERM
printf '%s\n' "staged_at=$(date -u +%Y%m%dT%H%M%SZ)" >> "${audit_dir}/record"

echo "Staged immutable model dataset ${version_id}: ${manifest_hash}"
echo "current, previous, the model environment and all services were unchanged."
