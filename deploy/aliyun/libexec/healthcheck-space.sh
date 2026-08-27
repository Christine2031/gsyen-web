#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"

usage() {
  echo "Usage: ${program_name} {gsyen|halfsphere} CONFIG_FILE [SERVICE [--validate-only]]" >&2
  echo "CONFIG_FILE format: NAME|http://127.0.0.1:PORT/PATH|EXPECTED_STATUS" >&2
}

if [[ $# -lt 2 || $# -gt 4 || ( $# -eq 4 && "$4" != --validate-only ) ||
      ( $# -eq 4 && -z "${3:-}" ) ]]; then
  usage
  exit 64
fi

readonly space="$1"
readonly config_file="$2"
readonly service_filter="${3:-}"
readonly validation_mode="${4:-}"
[[ -z "${service_filter}" || "${service_filter}" =~ ^[a-z0-9][a-z0-9-]*$ ]] || {
  usage
  exit 64
}
case "${space}" in
  gsyen) readonly port_pattern='1808[0-5]' ;;
  halfsphere) readonly port_pattern='1818[0-9]' ;;
  *) usage; exit 64 ;;
esac

[[ -f "${config_file}" && ! -L "${config_file}" ]] || {
  echo "${program_name}: regular config file is required: ${config_file}" >&2
  exit 66
}
[[ "${validation_mode}" == --validate-only ]] || command -v curl >/dev/null 2>&1 || {
  echo "${program_name}: curl is required" >&2
  exit 69
}

checks=0
failures=0
while IFS='|' read -r name url expected_status extra; do
  [[ -z "${name//[[:space:]]/}" || "${name}" == \#* ]] && continue
  if [[ -n "${extra:-}" || ! "${name}" =~ ^[a-z0-9][a-z0-9-]*$ ||
        ! "${url}" =~ ^http://127\.0\.0\.1:(${port_pattern})(/[^[:space:]]*)?$ ||
        ! "${expected_status}" =~ ^[1-5][0-9][0-9]$ ]]; then
    echo "${program_name}: invalid or non-loopback check for ${name:-unnamed}" >&2
    exit 65
  fi

  [[ -z "${service_filter}" || "${name}" == "${service_filter}" ]] || continue
  checks=$((checks + 1))
  [[ "${validation_mode}" == --validate-only ]] && continue
  actual_status="$(curl --silent --show-error --output /dev/null \
    --connect-timeout 2 --max-time 5 --write-out '%{http_code}' "${url}" || true)"
  if [[ "${actual_status}" != "${expected_status}" ]]; then
    echo "${name}: expected HTTP ${expected_status}, got ${actual_status:-curl-error}" >&2
    failures=$((failures + 1))
  else
    echo "${name}: HTTP ${actual_status}"
  fi
done < "${config_file}"

if (( checks == 0 )); then
  echo "${program_name}: config contains no checks; refusing a false-success result" >&2
  exit 65
fi
if [[ -n "${service_filter}" && "${checks}" -ne 1 ]]; then
  echo "${program_name}: service filter must select exactly one health check" >&2
  exit 65
fi
(( failures == 0 ))
