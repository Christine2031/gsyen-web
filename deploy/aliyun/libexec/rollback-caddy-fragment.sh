#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"
readonly libexec_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -ne 3 || ( "$1" != gsyen && "$1" != halfsphere ) ||
      ( "$3" != --check && "$3" != --apply ) ]]; then
  echo "Usage: ${program_name} {gsyen|halfsphere} PREVIOUS_IMMUTABLE_FRAGMENT --check|--apply" >&2
  exit 64
fi
space="$1"
candidate="$2"
mode="$3"
readonly candidate_pattern="^/etc/gsyen-aliyun/caddy-active/releases/${space}/[0-9a-f]{64}\\.caddy$"
[[ "${candidate}" =~ ${candidate_pattern} ]] || {
  echo "${program_name}: rollback target must be a reviewed immutable ${space} fragment" >&2
  exit 65
}

echo "${program_name}: rollback is a new approved atomic activation; it does not change DNS or MX."
exec "${libexec_dir}/activate-caddy-fragment.sh" "${space}" "${candidate}" "${mode}"
