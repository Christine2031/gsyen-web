#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"

usage() {
  echo "Usage: ${program_name} PORT [WAIT_SECONDS] [EXPECTED_PID]" >&2
}

if [[ $# -lt 1 || $# -gt 3 || ! "${1:-}" =~ ^[0-9]+$ ||
      ! "${2:-20}" =~ ^[0-9]+$ ||
      ( -n "${3:-}" && ! "${3}" =~ ^[0-9]+$ ) ]]; then
  usage
  exit 64
fi

readonly port="$1"
readonly wait_seconds="${2:-20}"
readonly expected_pid="${3:-}"
if (( port < 1 || port > 65535 || wait_seconds < 1 || wait_seconds > 120 )) ||
   [[ -n "${expected_pid}" && "${expected_pid}" -lt 2 ]]; then
  usage
  exit 64
fi

command -v ss >/dev/null 2>&1 || {
  echo "${program_name}: ss is required; refusing to assume the listener is private" >&2
  exit 69
}

deadline=$((SECONDS + wait_seconds))
while (( SECONDS < deadline )); do
  listeners="$(ss -H -ltnp "sport = :${port}" 2>/dev/null || true)"
  if [[ -n "${listeners}" ]]; then
    while IFS= read -r listener; do
      # ss columns are: State Recv-Q Send-Q Local:Port Peer:Port.
      local_address="$(awk '{print $4}' <<<"${listener}")"
      case "${local_address}" in
        127.0.0.1:"${port}"|\[::1\]:"${port}") ;;
        *)
          echo "${program_name}: port ${port} is exposed on ${local_address}; refusing startup" >&2
          exit 1
          ;;
      esac
      if [[ -n "${expected_pid}" ]] &&
         ! grep -Eq "pid=${expected_pid}([,)[:space:]]|$)" <<<"${listener}"; then
        echo "${program_name}: listener ${local_address} is not owned by expected main PID ${expected_pid}" >&2
        exit 1
      fi
    done <<<"${listeners}"
    exit 0
  fi
  sleep 1
done

echo "${program_name}: no TCP listener appeared on port ${port} within ${wait_seconds}s" >&2
exit 1
