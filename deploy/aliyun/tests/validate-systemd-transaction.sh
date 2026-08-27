#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"
readonly deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly transaction="${deploy_dir}/libexec/activate-systemd-service.sh"
readonly rollback="${deploy_dir}/libexec/rollback-systemd-service.sh"
readonly healthcheck="${deploy_dir}/libexec/healthcheck-space.sh"

fail() {
  echo "${program_name}: $*" >&2
  exit 1
}

contains() {
  grep -Eq -- "$2" "$1" || fail "$1 lacks $2"
}

ordered() {
  local first second
  first="$(awk -v needle="$2" 'index($0, needle) { print NR; exit }' "$1")"
  # Use the last occurrence for the second marker so a helper function
  # definition cannot satisfy an ordering assertion intended for its commit-time
  # invocation.
  second="$(awk -v needle="$3" 'index($0, needle) { line=NR } END { if (line) print line }' "$1")"
  [[ "${first}" =~ ^[0-9]+$ && "${second}" =~ ^[0-9]+$ && first -lt second ]] ||
    fail "$1 does not place '$2' before '$3'"
}

bash -n "${transaction}" "${rollback}" "${healthcheck}"
if bash "${transaction}" >/dev/null 2>&1; then
  fail "transaction without explicit action/mode incorrectly succeeded"
fi
if bash "${transaction}" activate halfsphere gsyen-api \
  /etc/gsyen-aliyun/systemd-available/gsyen-api.service --check >/dev/null 2>&1; then
  fail "cross-business service selection incorrectly succeeded"
fi
if bash "${transaction}" activate gsyen gsyen-api /tmp/gsyen-api.service \
  --check >/dev/null 2>&1; then
  fail "activation candidate outside the exact allowlist incorrectly succeeded"
fi
if bash "${rollback}" gsyen gsyen-api /tmp/not-an-audit --check >/dev/null 2>&1; then
  fail "rollback path outside the audit allowlist incorrectly succeeded"
fi

temporary_dir="$(mktemp -d)"
cleanup() {
  rm -rf -- "${temporary_dir}"
}
trap cleanup EXIT
printf '%s\n' '#!/usr/bin/env bash' \
  'for argument in "$@"; do last="${argument}"; done' \
  'printf "%s\\n" "${last}" >> "${HEALTH_TEST_LOG}"' \
  'printf 200' > "${temporary_dir}/curl"
chmod 0755 "${temporary_dir}/curl"
printf '%s\n' \
  'gsyen-web|http://127.0.0.1:18080/|200' \
  'gsyen-api|http://127.0.0.1:18081/api/health|200' \
  > "${temporary_dir}/gsyen.urls"
HEALTH_TEST_LOG="${temporary_dir}/curl.log" PATH="${temporary_dir}:${PATH}" \
  bash "${healthcheck}" gsyen "${temporary_dir}/gsyen.urls" gsyen-api >/dev/null
[[ "$(wc -l < "${temporary_dir}/curl.log" | tr -d '[:space:]')" == 1 &&
   "$(cat "${temporary_dir}/curl.log")" == http://127.0.0.1:18081/api/health ]] ||
  fail "single-service health filter called an unexpected endpoint"
PATH=/nonexistent /bin/bash "${healthcheck}" gsyen \
  "${temporary_dir}/gsyen.urls" gsyen-web --validate-only >/dev/null
printf '%s\n' 'gsyen-api|http://127.0.0.1:18081/api/health|200' \
  >> "${temporary_dir}/gsyen.urls"
if PATH=/nonexistent /bin/bash "${healthcheck}" gsyen \
  "${temporary_dir}/gsyen.urls" gsyen-api --validate-only >/dev/null 2>&1; then
  fail "duplicate service health contract incorrectly succeeded"
fi

contains "${transaction}" '^case "\$\{space\}:\$\{service\}" in$'
contains "${transaction}" 'activation candidate path is outside the exact allowlist'
contains "${transaction}" 'rollback candidate does not match its successful transaction record'
contains "${transaction}" 'systemd-analyze verify'
contains "${transaction}" 'missing regular one-time systemd approval marker'
contains "${transaction}" 'NoNewPrivileges=true'
contains "${transaction}" 'CapabilityBoundingSet=CAP_NET_BIND_SERVICE'
contains "${transaction}" 'candidate uses an Exec privilege-elevation prefix'
contains "${transaction}" 'mail-ingest requires an already-active reviewed Stalwart service'
contains "${transaction}" 'Stalwart conflict is not safely inactive'
contains "${transaction}" 'dependency_state_sha256='
contains "${transaction}" 'dependency isolation state changed before commit'
contains "${transaction}" 'current_main_pid='
contains "${transaction}" 'assert-loopback-listener\.sh'
contains "${transaction}" 'Stalwart\[\[:space:\]\]\+ESMTP'
contains "${transaction}" 'restore_previous_state'
contains "${transaction}" 'systemctl disable "\$\{unit\}"'
contains "${transaction}" 'planned_candidate_absent'
contains "${transaction}" 'current unit changed before absence rollback'
contains "${transaction}" 'planned_desired_enabled.*enabled'
contains "${transaction}" 'planned_desired_active.*active'
contains "${transaction}" 'planned_candidate_absent.*false'
contains "${transaction}" 'mv -Tf -- "\$\{temporary_unit\}" "\$\{active_unit\}"'
contains "${transaction}" 'systemctl daemon-reload'
contains "${transaction}" 'systemctl enable "\$\{unit\}"'
contains "${transaction}" 'systemctl restart "\$\{unit\}"'
contains "${transaction}" 'inactive\|unknown\|""'
contains "${transaction}" 'healthcheck-space\.sh'
contains "${transaction}" '--validate-only'
contains "${rollback}" 'unit_before_absent='
contains "${rollback}" 'exactly one regular unit.before or unit.before.absent'
contains "${rollback}" '"\$\{rollback_candidate\}" "\$\{mode\}"'
ordered "${transaction}" 'flock -n 9' '# Rebuild the complete plan under both'
ordered "${transaction}" '# Rebuild the complete plan under both' \
  'mv -Tf -- "${temporary_unit}" "${active_unit}"'
ordered "${transaction}" 'mv -Tf -- "${temporary_unit}" "${active_unit}"' \
  'verify_selected_service'
ordered "${transaction}" 'state_changed=true' 'verify_selected_service'
ordered "${transaction}" '"activated_at=$(date -u' 'transaction_complete=true'

echo "Fail-closed single-service systemd transaction template validation passed."
