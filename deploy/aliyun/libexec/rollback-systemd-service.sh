#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"
readonly libexec_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -ne 4 || ( "$1" != gsyen && "$1" != halfsphere ) ||
      ( "$4" != --check && "$4" != --apply ) ]]; then
  echo "Usage: ${program_name} {gsyen|halfsphere} SERVICE PRIOR_AUDIT_DIRECTORY --check|--apply" >&2
  exit 64
fi
readonly space="$1"
readonly service="$2"
readonly audit_directory="$3"
readonly mode="$4"
readonly audit_pattern="^/var/backups/gsyen-aliyun-systemd/[0-9]{8}T[0-9]{6}Z-${space}-${service}\.[A-Za-z0-9]{6}$"
[[ "${audit_directory}" =~ ${audit_pattern} ]] || {
  echo "${program_name}: rollback audit directory is outside the exact transaction allowlist" >&2
  exit 65
}

(( EUID == 0 )) || {
  echo "${program_name}: root is required to inspect protected rollback evidence" >&2
  exit 77
}

readonly unit_before="${audit_directory}/unit.before"
readonly unit_before_absent="${audit_directory}/unit.before.absent"
rollback_candidate=""
if [[ -f "${unit_before}" && ! -L "${unit_before}" &&
      ! -e "${unit_before_absent}" && ! -L "${unit_before_absent}" ]]; then
  rollback_candidate="${unit_before}"
elif [[ -f "${unit_before_absent}" && ! -L "${unit_before_absent}" &&
        ! -e "${unit_before}" && ! -L "${unit_before}" ]]; then
  rollback_candidate="${unit_before_absent}"
else
  echo "${program_name}: audit must contain exactly one regular unit.before or unit.before.absent" >&2
  exit 65
fi
readonly rollback_candidate

echo "${program_name}: rollback is a new digest-approved transaction for only ${space}/${service}."
exec "${libexec_dir}/activate-systemd-service.sh" rollback "${space}" "${service}" \
  "${rollback_candidate}" "${mode}"
