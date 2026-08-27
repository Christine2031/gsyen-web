#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"
readonly libexec_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly resource_dir="/etc/gsyen-aliyun/resources"

if [[ $# -ne 1 || ( "$1" != gsyen && "$1" != halfsphere ) ]]; then
  echo "Usage: ${program_name} {gsyen|halfsphere}" >&2
  exit 64
fi
for command_name in python3 stat; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "${program_name}: required command not found: ${command_name}" >&2
    exit 69
  }
done

for contract in "${resource_dir}/topology.env" \
  "${resource_dir}/gsyen.boundaries.env" \
  "${resource_dir}/halfsphere.boundaries.env"; do
  [[ -f "${contract}" && ! -L "${contract}" ]] || {
    echo "${program_name}: rendered non-secret contract is missing or unsafe" >&2
    exit 66
  }
  owner="$(stat -c '%u' "${contract}")"
  mode="$(stat -c '%a' "${contract}")"
  [[ "${owner}" == 0 && $((8#${mode} & 8#022)) -eq 0 ]] || {
    echo "${program_name}: rendered contracts must be root-owned and not group/world-writable" >&2
    exit 77
  }
done

python3 "${libexec_dir}/validate-resource-boundaries.py" \
  "${resource_dir}/topology.env" \
  "${resource_dir}/gsyen.boundaries.env" \
  "${resource_dir}/halfsphere.boundaries.env" >/dev/null
echo "${program_name}: validated the rendered non-secret boundary gate for $1"
