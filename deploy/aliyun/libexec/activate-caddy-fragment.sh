#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"
readonly root_config="/etc/caddy/Caddyfile"
readonly active_root="/etc/gsyen-aliyun/caddy-active"
readonly approval_root="/etc/gsyen-aliyun/caddy-approvals"

usage() {
  cat >&2 <<EOF
Usage: ${program_name} {gsyen|halfsphere} CANDIDATE --check|--apply

The root Caddyfile must already contain exactly one managed import:
  import /etc/gsyen-aliyun/caddy-active/SPACE.caddy

--check validates a temporary whole-Caddy configuration. --apply additionally
requires a root-owned 0400/0600 SPACE.activate marker containing exactly:
  CANDIDATE_SHA256 ROOT_CADDY_SHA256 PREVIOUS_FRAGMENT_SHA256
It atomically promotes one immutable fragment and reloads Caddy. It never edits
the root Caddyfile, DNS or MX. Re-activate a previous immutable fragment to roll
back, using a fresh approval marker. Both modes require root so the temporary
root file can remain beside /etc/caddy/Caddyfile and preserve relative imports.
EOF
}

[[ $# -eq 3 ]] || { usage; exit 64; }
readonly space="$1"
readonly candidate="$2"
readonly mode="$3"
[[ "${space}" == gsyen || "${space}" == halfsphere ]] || { usage; exit 64; }
[[ "${mode}" == --check || "${mode}" == --apply ]] || { usage; exit 64; }
(( EUID == 0 )) || {
  echo "${program_name}: root is required to validate beside the protected root Caddyfile" >&2
  exit 77
}
[[ "${candidate}" = /* && -f "${candidate}" && ! -L "${candidate}" ]] || {
  echo "${program_name}: CANDIDATE must be an absolute regular non-symlink file" >&2
  exit 66
}
[[ -f "${root_config}" && ! -L "${root_config}" ]] || {
  echo "${program_name}: root Caddyfile must be a regular non-symlink file" >&2
  exit 66
}
for command_name in caddy sha256sum awk grep mktemp install stat wc flock mv ln readlink systemctl rm chmod date tr; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "${program_name}: required command not found: ${command_name}" >&2
    exit 69
  }
done
readonly allowed_snippet="${space}_security_headers"
if awk -v allowed="${allowed_snippet}" '
  $1 == "import" && (NF != 2 || $2 != allowed) { forbidden = 1 }
  END { exit forbidden ? 0 : 1 }
' "${candidate}"; then
  echo "${program_name}: candidate has an external or unexpected import" >&2
  exit 65
fi
if grep -Eiq 'run\.app|storage\.googleapis\.com|pkg\.dev|halfsphere-api-7586|gsyen-api-7586|\{env\.' "${candidate}"; then
  echo "${program_name}: candidate still contains a forbidden GCP runtime identifier" >&2
  exit 65
fi

readonly active_link="${active_root}/${space}.caddy"
readonly required_import="import ${active_link}"
[[ "$(grep -Fxc -- "${required_import}" "${root_config}")" == 1 ]] || {
  echo "${program_name}: root Caddyfile lacks the exact single managed import contract" >&2
  exit 78
}
readonly candidate_hash="$(sha256sum "${candidate}" | awk '{print $1}')"
readonly root_hash="$(sha256sum "${root_config}" | awk '{print $1}')"
[[ -L "${active_link}" ]] || {
  echo "${program_name}: a reviewed immutable baseline fragment is required before activation" >&2
  exit 73
}
previous_target="$(readlink "${active_link}")"
[[ "${previous_target}" =~ ^releases/${space}/[0-9a-f]{64}\.caddy$ &&
   -f "${active_root}/${previous_target}" && ! -L "${active_root}/${previous_target}" ]] || {
  echo "${program_name}: active fragment link is unsafe" >&2
  exit 73
}
previous_hash="$(sha256sum "${active_root}/${previous_target}" | awk '{print $1}')"
[[ "${previous_target##*/}" == "${previous_hash}.caddy" ]] || {
  echo "${program_name}: active fragment filename does not match its content hash" >&2
  exit 73
}

# Prove the rollback target and root import are valid before testing a
# candidate. First-time baseline/import onboarding is a separate root-Caddy
# change with its own backup and approval; this script never attempts it.
caddy validate --adapter caddyfile --config "${root_config}" >/dev/null

temporary_root="$(mktemp "$(dirname "${root_config}")/.${program_name}.XXXXXX")"
cleanup() {
  rm -f -- "${temporary_root}" "${active_root}/.${space}.caddy.$$" 2>/dev/null || true
}
trap cleanup EXIT
awk -v expected="${required_import}" -v replacement="import ${candidate}" '
  $0 == expected { print replacement; replaced += 1; next }
  { print }
  END { if (replaced != 1) exit 65 }
' "${root_config}" > "${temporary_root}"
caddy validate --adapter caddyfile --config "${temporary_root}" >/dev/null

if [[ "${mode}" == --check ]]; then
  echo "Validated whole Caddy configuration for ${space}; no active file was changed."
  exit 0
fi

readonly approval_file="${approval_root}/${space}.activate"
[[ -f "${approval_file}" && ! -L "${approval_file}" ]] || {
  echo "${program_name}: missing regular activation approval marker" >&2
  exit 77
}
approval_root_owner="$(stat -c '%U:%G' "${approval_root}")"
approval_root_mode="$(stat -c '%a' "${approval_root}")"
candidate_owner="$(stat -c '%u' "${candidate}")"
candidate_mode="$(stat -c '%a' "${candidate}")"
[[ "${approval_root_owner}" == root:root && "${approval_root_mode}" == 700 &&
   "${candidate_owner}" == 0 && $((8#${candidate_mode} & 8#022)) -eq 0 ]] || {
  echo "${program_name}: approval directory/candidate ownership or permissions are unsafe" >&2
  exit 77
}
approval_owner="$(stat -c '%u' "${approval_file}")"
approval_mode="$(stat -c '%a' "${approval_file}")"
read -r approved_candidate approved_root approved_previous approved_extra < "${approval_file}" || true
[[ "${approval_owner}" == 0 && "${approval_mode}" =~ ^[46]00$ &&
   "${approved_candidate:-}" == "${candidate_hash}" &&
   "${approved_root:-}" == "${root_hash}" &&
   "${approved_previous:-}" == "${previous_hash}" && -z "${approved_extra:-}" &&
   "$(wc -l < "${approval_file}" | tr -d '[:space:]')" == 1 ]] || {
  echo "${program_name}: approval marker does not match candidate/root/previous hashes" >&2
  exit 77
}
readonly approval_marker_hash="$(sha256sum "${approval_file}" | awk '{print $1}')"

exec 9>"/run/lock/gsyen-aliyun-caddy-transaction.lock"
flock -n 9 || {
  echo "${program_name}: another Caddy transaction is running" >&2
  exit 75
}
# Re-run the read-only check after taking the transaction lock.
[[ -f "${root_config}" && ! -L "${root_config}" ]] || {
  echo "${program_name}: root Caddyfile changed after approval" >&2
  exit 74
}
[[ "$(sha256sum "${root_config}" | awk '{print $1}')" == "${root_hash}" ]] || {
  echo "${program_name}: root Caddyfile changed after approval" >&2
  exit 74
}
[[ -f "${candidate}" && ! -L "${candidate}" ]] || {
  echo "${program_name}: candidate changed after validation/approval" >&2
  exit 74
}
candidate_owner_locked="$(stat -c '%u' "${candidate}")"
candidate_mode_locked="$(stat -c '%a' "${candidate}")"
[[ "${candidate_owner_locked}" == 0 &&
   $((8#${candidate_mode_locked} & 8#022)) -eq 0 &&
   "$(sha256sum "${candidate}" | awk '{print $1}')" == "${candidate_hash}" ]] || {
  echo "${program_name}: candidate changed after validation/approval" >&2
  exit 74
}
[[ -f "${approval_file}" && ! -L "${approval_file}" ]] || {
  echo "${program_name}: activation approval changed after validation" >&2
  exit 74
}
[[ "$(sha256sum "${approval_file}" | awk '{print $1}')" == "${approval_marker_hash}" ]] || {
  echo "${program_name}: activation approval changed after validation" >&2
  exit 74
}
locked_previous_target=none
if [[ -L "${active_link}" ]]; then
  locked_previous_target="$(readlink "${active_link}")"
  [[ "${locked_previous_target}" == "${previous_target}" &&
     -f "${active_root}/${locked_previous_target}" &&
     ! -L "${active_root}/${locked_previous_target}" &&
     "$(sha256sum "${active_root}/${locked_previous_target}" | awk '{print $1}')" == "${previous_hash}" ]] || {
    echo "${program_name}: active fragment changed after approval" >&2
    exit 74
  }
else
  echo "${program_name}: active fragment changed after approval" >&2
  exit 74
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
install -d -o root -g root -m 0700 /var/backups/gsyen-aliyun-caddy
audit_dir="$(mktemp -d "/var/backups/gsyen-aliyun-caddy/${timestamp}-${space}.XXXXXX")"
chmod 0700 "${audit_dir}"
install -m 0600 "${root_config}" "${audit_dir}/Caddyfile.before"
install -m 0600 "${candidate}" "${audit_dir}/candidate.caddy"
printf '%s\n' \
  "space=${space}" "candidate_sha256=${candidate_hash}" "root_sha256=${root_hash}" \
  "previous_target=${previous_target}" "previous_sha256=${previous_hash}" \
  > "${audit_dir}/record"
chmod 0600 "${audit_dir}/record"

release_dir="${active_root}/releases/${space}"
release_file="${release_dir}/${candidate_hash}.caddy"
install -d -o root -g root -m 0755 "${active_root}" "${release_dir}"
if [[ -e "${release_file}" ]]; then
  [[ -f "${release_file}" && ! -L "${release_file}" &&
     "$(sha256sum "${release_file}" | awk '{print $1}')" == "${candidate_hash}" ]] || {
    echo "${program_name}: immutable Caddy release hash collision" >&2
    exit 73
  }
else
  install -o root -g root -m 0444 "${candidate}" "${release_file}"
fi
[[ "$(sha256sum "${release_file}" | awk '{print $1}')" == "${candidate_hash}" ]] || {
  echo "${program_name}: immutable fragment copy failed hash verification" >&2
  exit 74
}
temporary_link="${active_root}/.${space}.caddy.$$"
ln -s -- "releases/${space}/${candidate_hash}.caddy" "${temporary_link}"
mv -Tf -- "${temporary_link}" "${active_link}"

rollback_active() {
  ln -s -- "${previous_target}" "${temporary_link}"
  mv -Tf -- "${temporary_link}" "${active_link}"
  caddy validate --adapter caddyfile --config "${root_config}" >/dev/null || true
  systemctl reload caddy || true
}
if ! caddy validate --adapter caddyfile --config "${root_config}" >/dev/null ||
   ! systemctl reload caddy; then
  rollback_active
  echo "${program_name}: activation failed and the previous fragment was restored" >&2
  exit 74
fi
mv -- "${approval_file}" "${audit_dir}/activation-approval"
printf '%s\n' "activated_at=$(date -u +%Y%m%dT%H%M%SZ)" >> "${audit_dir}/record"
trap - EXIT
echo "Activated ${space} Caddy fragment ${candidate_hash}; DNS and MX were unchanged."
