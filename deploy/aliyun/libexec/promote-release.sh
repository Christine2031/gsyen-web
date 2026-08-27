#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"
readonly libexec_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly validator="${libexec_dir}/validate-release-tree.py"
readonly stalwart_validator="${libexec_dir}/validate-stalwart-release.py"

usage() {
  cat >&2 <<EOF
Usage: ${program_name} {gsyen|halfsphere} APP RELEASE_ID --check|--apply

--check validates the immutable release and reports its hash/current state.
--apply atomically points current at that exact release and requires a root-owned
0400/0600 marker containing only the reported SHA-256 at:
  /etc/gsyen-aliyun/release-approvals/SPACE/APP/RELEASE_ID.promote

Promotion does not restart a service, reload Caddy or change DNS/MX. Promoting a
previous immutable release provides an independent single-app rollback.
EOF
}

[[ $# -eq 4 ]] || { usage; exit 64; }
readonly space="$1"
readonly app="$2"
readonly release_id="$3"
readonly mode="$4"
[[ "${release_id}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ &&
   "${release_id}" != . && "${release_id}" != .. ]] || {
  echo "${program_name}: invalid release ID" >&2
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
readonly app_root="/srv/${space}/apps/${app}"
readonly releases_dir="${app_root}/releases"
readonly release_dir="${releases_dir}/${release_id}"
readonly current_link="${app_root}/current"
readonly desired_target="releases/${release_id}"
[[ -d "${app_root}" && ! -L "${app_root}" &&
   -d "${releases_dir}" && ! -L "${releases_dir}" &&
   -d "${release_dir}" && ! -L "${release_dir}" ]] || {
  echo "${program_name}: immutable release directory is missing or unsafe" >&2
  exit 66
}
release_hash="$(python3 "${validator}" "${space}" "${app}" "${release_id}" \
  "${release_dir}" --owner root --group "${business_group}")"
[[ "${release_hash}" =~ ^[0-9a-f]{64}$ ]] || {
  echo "${program_name}: validator returned an invalid tree hash" >&2
  exit 70
}
if [[ "${space}:${app}" == gsyen:stalwart ]]; then
  python3 "${stalwart_validator}" "${release_dir}" >/dev/null
fi

current_target=none
if [[ -L "${current_link}" ]]; then
  current_target="$(readlink "${current_link}")"
elif [[ -e "${current_link}" ]]; then
  echo "${program_name}: current exists but is not a symlink; refusing replacement" >&2
  exit 73
fi
[[ "${current_target}" == none ||
   "${current_target}" =~ ^releases/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || {
  echo "${program_name}: current has an unsafe or non-release target" >&2
  exit 73
}
if [[ "${mode}" == --check ]]; then
  echo "Validated ${space}/${app}/${release_id}: ${release_hash}; current=${current_target}"
  exit 0
fi
if [[ "${current_target}" == "${desired_target}" ]]; then
  echo "Release ${space}/${app}/${release_id} is already current: ${release_hash}"
  exit 0
fi

(( EUID == 0 )) || {
  echo "${program_name}: --apply must run as root" >&2
  exit 77
}
for command_name in date flock install ln mktemp mv readlink stat wc; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "${program_name}: required command not found: ${command_name}" >&2
    exit 69
  }
done
readonly approval_file="/etc/gsyen-aliyun/release-approvals/${space}/${app}/${release_id}.promote"
exec 9>"/run/lock/gsyen-aliyun-release-${space}-${app}.lock"
flock -n 9 || {
  echo "${program_name}: another ${space}/${app} release operation is running" >&2
  exit 75
}

# Revalidate both the cross-business resource boundary and immutable payload
# after acquiring the shared app lock. The boundary gate must pass immediately
# before any current-link state is accepted or changed.
"${libexec_dir}/validate-boundary-gate.sh" "${space}" >/dev/null
release_hash_locked="$(python3 "${validator}" "${space}" "${app}" "${release_id}" \
  "${release_dir}" --owner root --group "${business_group}")"
[[ "${release_hash_locked}" == "${release_hash}" ]] || {
  echo "${program_name}: immutable release changed during validation" >&2
  exit 74
}
if [[ "${space}:${app}" == gsyen:stalwart ]]; then
  python3 "${stalwart_validator}" "${release_dir}" >/dev/null
fi
if [[ -L "${current_link}" ]]; then
  current_target="$(readlink "${current_link}")"
elif [[ -e "${current_link}" ]]; then
  echo "${program_name}: current became a non-symlink" >&2
  exit 73
else
  current_target=none
fi
[[ "${current_target}" == none ||
   "${current_target}" =~ ^releases/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || {
  echo "${program_name}: current became an unsafe or non-release target" >&2
  exit 73
}
if [[ "${current_target}" == "${desired_target}" ]]; then
  echo "Release ${space}/${app}/${release_id} is already current: ${release_hash}"
  exit 0
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
   "${approval_size}" == 65 && "${approval_hash}" == "${release_hash}" ]] || {
  echo "${program_name}: approval marker owner, mode or exact hash is invalid" >&2
  exit 77
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 /var/backups/gsyen-aliyun-releases
audit_dir="$(mktemp -d "/var/backups/gsyen-aliyun-releases/${timestamp}-${space}-${app}-${release_id}.XXXXXX")"
chmod 0700 "${audit_dir}"
printf '%s\n' \
  "space=${space}" \
  "app=${app}" \
  "release_id=${release_id}" \
  "tree_sha256=${release_hash}" \
  "previous_current=${current_target}" \
  "prepared_at=${timestamp}" > "${audit_dir}/record"
chmod 0600 "${audit_dir}/record"
mv -- "${approval_file}" "${audit_dir}/promote-approval"

temporary_link="${app_root}/.current-${release_id}.$$"
cleanup() {
  [[ -L "${temporary_link}" ]] && rm -- "${temporary_link}"
}
trap cleanup EXIT
ln -s -- "${desired_target}" "${temporary_link}"
mv -Tf -- "${temporary_link}" "${current_link}"
trap - EXIT
printf '%s\n' "promoted_at=$(date -u +%Y%m%dT%H%M%SZ)" >> "${audit_dir}/record"

echo "Promoted ${space}/${app}: ${current_target} -> ${desired_target} (${release_hash})"
echo "No service was restarted; start-window health checks remain mandatory."
