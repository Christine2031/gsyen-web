#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"
readonly libexec_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly validator="${libexec_dir}/validate-release-tree.py"
readonly stalwart_validator="${libexec_dir}/validate-stalwart-release.py"

usage() {
  cat >&2 <<EOF
Usage: ${program_name} {gsyen|halfsphere} APP RELEASE_ID SOURCE_DIR --check|--apply

--check validates and hashes SOURCE_DIR without changing the host.
--apply copies the exact approved tree into an immutable release directory. It
requires a root-owned 0400/0600 marker containing only the printed SHA-256 at:
  /etc/gsyen-aliyun/release-approvals/SPACE/APP/RELEASE_ID.stage

This command never changes current, restarts a service, reloads Caddy or changes
DNS/MX. Runtime environment files must remain under /srv/SPACE/config.
EOF
}

[[ $# -eq 5 ]] || { usage; exit 64; }
readonly space="$1"
readonly app="$2"
readonly release_id="$3"
readonly requested_source="$4"
readonly mode="$5"
[[ "${release_id}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ &&
   "${release_id}" != . && "${release_id}" != .. ]] || {
  echo "${program_name}: invalid release ID" >&2
  exit 64
}
[[ "${app}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || {
  echo "${program_name}: invalid app name" >&2
  exit 64
}
case "${space}:${app}" in
  gsyen:gsyen-web|gsyen:gsyen-api|gsyen:sgsyen-web|gsyen:sgsyen-api|gsyen:gsyen-model)
    business_group=gsyen
    ;;
  gsyen:mail-ingest)
    business_group=gsyen-mail
    ;;
  gsyen:stalwart)
    business_group=stalwart
    ;;
  halfsphere:halfsphere-web|halfsphere:halfsphere-api)
    business_group=halfsphere
    ;;
  *)
    echo "${program_name}: app is not allocated to the selected business space" >&2
    exit 64
    ;;
esac
[[ "${mode}" == --check || "${mode}" == --apply ]] || { usage; exit 64; }
[[ -d "${requested_source}" && ! -L "${requested_source}" ]] || {
  echo "${program_name}: source must be a real directory" >&2
  exit 66
}
readonly source_dir="$(cd "${requested_source}" && pwd -P)"
readonly app_root="/srv/${space}/apps/${app}"
readonly releases_dir="${app_root}/releases"
readonly release_dir="${releases_dir}/${release_id}"
case "${source_dir}/" in
  "${app_root}/"*)
    echo "${program_name}: source must be outside the managed app directory" >&2
    exit 65
    ;;
esac
[[ -x "${validator}" ]] || {
  echo "${program_name}: release validator is unavailable" >&2
  exit 69
}

source_hash="$(python3 "${validator}" "${space}" "${app}" "${release_id}" "${source_dir}")"
[[ "${source_hash}" =~ ^[0-9a-f]{64}$ ]] || {
  echo "${program_name}: validator returned an invalid tree hash" >&2
  exit 70
}
if [[ "${space}:${app}" == gsyen:stalwart ]]; then
  python3 "${stalwart_validator}" "${source_dir}" >/dev/null
fi
if [[ "${mode}" == --check ]]; then
  echo "Validated ${space}/${app}/${release_id}: ${source_hash}"
  exit 0
fi

(( EUID == 0 )) || {
  echo "${program_name}: --apply must run as root" >&2
  exit 77
}
"${libexec_dir}/validate-boundary-gate.sh" "${space}" >/dev/null
for command_name in awk chmod chown cp date df du flock install mktemp mv python3 stat wc; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "${program_name}: required command not found: ${command_name}" >&2
    exit 69
  }
done
readonly approval_file="/etc/gsyen-aliyun/release-approvals/${space}/${app}/${release_id}.stage"

for parent in "/srv/${space}" "/srv/${space}/apps"; do
  [[ -d "${parent}" && ! -L "${parent}" ]] || {
    echo "${program_name}: foundation path is missing or unsafe: ${parent}" >&2
    exit 73
  }
done
for managed_path in "${app_root}" "${releases_dir}"; do
  if [[ -e "${managed_path}" || -L "${managed_path}" ]]; then
    [[ -d "${managed_path}" && ! -L "${managed_path}" ]] || {
      echo "${program_name}: managed app path is unsafe: ${managed_path}" >&2
      exit 73
    }
  fi
done

validate_existing_managed_release_directory() {
  local managed_path="$1"
  local actual_owner actual_group actual_mode

  if [[ -e "${managed_path}" || -L "${managed_path}" ]]; then
    [[ -d "${managed_path}" && ! -L "${managed_path}" ]] || {
      echo "${program_name}: managed app path is unsafe: ${managed_path}" >&2
      exit 73
    }
    actual_owner="$(stat -c '%u' "${managed_path}")"
    actual_group="$(stat -c '%G' "${managed_path}")"
    actual_mode="$(stat -c '%a' "${managed_path}")"
    [[ "${actual_owner}" == 0 && "${actual_group}" == "${business_group}" &&
       "${actual_mode}" == 750 ]] || {
      echo "${program_name}: existing managed directory must already be root:${business_group} mode 0750: ${managed_path}" >&2
      echo "${program_name}: permissions were not changed" >&2
      exit 78
    }
  fi
}

ensure_managed_release_directory() {
  local managed_path="$1"

  validate_existing_managed_release_directory "${managed_path}"
  [[ -e "${managed_path}" || -L "${managed_path}" ]] && return 0
  install -d -m 0750 -o root -g "${business_group}" -- "${managed_path}"
}

exec 9>"/run/lock/gsyen-aliyun-release-${space}-${app}.lock"
flock -n 9 || {
  echo "${program_name}: another ${space}/${app} release operation is running" >&2
  exit 75
}
validate_existing_managed_release_directory "${app_root}"
validate_existing_managed_release_directory "${releases_dir}"

if [[ -e "${release_dir}" || -L "${release_dir}" ]]; then
  [[ -d "${release_dir}" && ! -L "${release_dir}" ]] || {
    echo "${program_name}: existing release path is not a real directory" >&2
    exit 73
  }
  existing_hash="$(python3 "${validator}" "${space}" "${app}" "${release_id}" \
    "${release_dir}" --owner root --group "${business_group}")"
  [[ "${existing_hash}" == "${source_hash}" ]] || {
    echo "${program_name}: release ID already exists with different content" >&2
    exit 73
  }
  echo "Release ${space}/${app}/${release_id} is already staged with hash ${source_hash}."
  exit 0
fi

# Releases share the root disk even when their app locks are independent. Hold
# a host-wide capacity lock through the copy so concurrent app stages cannot
# each consume the same reported free space.
exec 8>"/run/lock/gsyen-aliyun-storage-capacity.lock"
flock -n 8 || {
  echo "${program_name}: another release copy is using host disk capacity" >&2
  exit 75
}
# Preserve enough space for the running host, logs and an independent rollback
# release. This is a final apply-time guard; the migration capacity review must
# still account for databases, backups and all applications together.
readonly minimum_free_after_stage=$((5 * 1024 * 1024 * 1024))
source_bytes="$(du -sx -B1 -- "${source_dir}" | awk '{print $1}')"
available_bytes="$(df -P -B1 -- "/srv/${space}/apps" | awk 'NR == 2 {print $4}')"
[[ "${source_bytes}" =~ ^[0-9]+$ && "${available_bytes}" =~ ^[0-9]+$ ]] || {
  echo "${program_name}: cannot determine release disk-space requirement" >&2
  exit 74
}
if (( source_bytes + minimum_free_after_stage > available_bytes )); then
  echo "${program_name}: insufficient space; staging must leave at least 5 GiB free" >&2
  exit 74
fi

[[ -f "${approval_file}" && ! -L "${approval_file}" ]] || {
  echo "${program_name}: missing regular approval marker ${approval_file}" >&2
  exit 77
}
approval_owner="$(stat -c '%u' "${approval_file}")"
approval_mode="$(stat -c '%a' "${approval_file}")"
approval_size="$(wc -c < "${approval_file}" | tr -d '[:space:]')"
approval_hash="$(tr -d '\n' < "${approval_file}")"
[[ "${approval_owner}" == 0 && "${approval_mode}" =~ ^[46]00$ &&
   "${approval_size}" == 65 && "${approval_hash}" == "${source_hash}" ]] || {
  echo "${program_name}: approval marker owner, mode or exact hash is invalid" >&2
  exit 77
}

ensure_managed_release_directory "${app_root}"
ensure_managed_release_directory "${releases_dir}"
readonly staging_dir="$(mktemp -d "${app_root}/.stage-${release_id}.XXXXXX")"
cleanup() {
  case "${staging_dir}" in
    "${app_root}/.stage-${release_id}."*) rm -rf -- "${staging_dir}" ;;
  esac
}
trap cleanup EXIT
cp -a -- "${source_dir}/." "${staging_dir}/"
chmod --reference="${source_dir}" "${staging_dir}"
chown -hR "root:${business_group}" "${staging_dir}"
staged_hash="$(python3 "${validator}" "${space}" "${app}" "${release_id}" \
  "${staging_dir}" --owner root --group "${business_group}")"
[[ "${staged_hash}" == "${source_hash}" ]] || {
  echo "${program_name}: source changed or copy validation failed" >&2
  exit 74
}
if [[ "${space}:${app}" == gsyen:stalwart ]]; then
  python3 "${stalwart_validator}" "${staging_dir}" >/dev/null
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 /var/backups/gsyen-aliyun-releases
audit_dir="$(mktemp -d "/var/backups/gsyen-aliyun-releases/${timestamp}-${space}-${app}-${release_id}.XXXXXX")"
chmod 0700 "${audit_dir}"
printf '%s\n' \
  "space=${space}" \
  "app=${app}" \
  "release_id=${release_id}" \
  "tree_sha256=${source_hash}" \
  "prepared_at=${timestamp}" > "${audit_dir}/record"
chmod 0600 "${audit_dir}/record"
mv -- "${approval_file}" "${audit_dir}/stage-approval"
mv -- "${staging_dir}" "${release_dir}"
trap - EXIT
printf '%s\n' "staged_at=$(date -u +%Y%m%dT%H%M%SZ)" >> "${audit_dir}/record"

echo "Staged immutable release ${space}/${app}/${release_id}: ${source_hash}"
echo "current was not changed and no service was restarted."
