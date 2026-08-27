#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"
readonly libexec_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly helper="${libexec_dir}/model_dataset_transaction.py"
readonly env_validator="${libexec_dir}/validate-env-file.sh"
readonly datasets_root="/srv/gsyen/data/gsyen-model/datasets"
readonly current_link="${datasets_root}/current"
readonly previous_link="${datasets_root}/previous"
readonly env_file="/srv/gsyen/config/gsyen-model.env"
readonly approval_root="/etc/gsyen-aliyun/model-data-approvals"
readonly service_name="gsyen-model.service"
readonly health_timeout_seconds=75

usage() {
  cat >&2 <<EOF
Usage: ${program_name} {promote|rollback} VERSION_ID --check|--apply

The approval digest binds the desired immutable manifest to the exact protected
environment hash plus current and previous relative links. Place only that
digest plus a newline in the root-owned 0400/0600 one-time marker:
  ${approval_root}/VERSION_ID.{promote|rollback}

Apply atomically replaces gsyen-model.env and datasets/current under one model
data lock, restarts only ${service_name}, and checks its loopback /readyz SHA.
On failure it restores only the prior model env/current/previous state and the
prior model service state. It never changes another unit, Caddy, DNS or MX.
EOF
}

[[ $# -eq 3 ]] || { usage; exit 64; }
readonly action="$1"
readonly version_id="$2"
readonly mode="$3"
[[ "${action}" == promote || "${action}" == rollback ]] || { usage; exit 64; }
[[ "${mode}" == --check || "${mode}" == --apply ]] || { usage; exit 64; }
(( EUID == 0 )) || {
  echo "${program_name}: root is required because the protected env must be hashed without printing it" >&2
  exit 77
}
for command_name in awk chmod chown date flock install ln mktemp mv python3 readlink \
  rm sha256sum stat systemctl tr wc; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "${program_name}: required command not found: ${command_name}" >&2
    exit 69
  }
done
[[ -x "${helper}" && -x "${env_validator}" ]] || {
  echo "${program_name}: model data transaction helpers are unavailable" >&2
  exit 69
}
"${libexec_dir}/validate-boundary-gate.sh" gsyen >/dev/null

plan_field() {
  local field="$1"
  python3 "${helper}" field "${field}" <<< "${plan_json}"
}

plan_json="$(python3 "${helper}" plan "${action}" "${version_id}")"
approval_digest="$(plan_field approval_digest)"
no_op="$(plan_field no_op)"
[[ "${approval_digest}" =~ ^[0-9a-f]{64}$ &&
   ( "${no_op}" == true || "${no_op}" == false ) ]] || {
  echo "${program_name}: helper returned an invalid safe plan" >&2
  exit 70
}
if [[ "${no_op}" == true ]]; then
  echo "Model dataset ${version_id} is already active and coherent; no action is required."
  exit 0
fi
if [[ "${mode}" == --check ]]; then
  echo "Validated ${action} plan for model dataset ${version_id}; approval digest=${approval_digest}"
  echo "No environment, data link or service was changed."
  exit 0
fi

readonly approval_file="${approval_root}/${version_id}.${action}"
[[ -d "${approval_root}" && ! -L "${approval_root}" &&
   "$(stat -c '%U:%G:%a' "${approval_root}")" == root:root:700 ]] || {
  echo "${program_name}: model data approval directory is missing or unsafe" >&2
  exit 77
}
[[ -f "${approval_file}" && ! -L "${approval_file}" ]] || {
  echo "${program_name}: missing regular one-time ${action} approval marker" >&2
  exit 77
}
approval_owner="$(stat -c '%u' "${approval_file}")"
approval_mode="$(stat -c '%a' "${approval_file}")"
approval_links="$(stat -c '%h' "${approval_file}")"
approval_size="$(wc -c < "${approval_file}" | tr -d '[:space:]')"
readonly expected_approval_marker_hash="$(
  printf '%s\n' "${approval_digest}" | sha256sum | awk '{print $1}'
)"
readonly approval_marker_hash="$(sha256sum "${approval_file}" | awk '{print $1}')"
[[ "${approval_owner}" == 0 && "${approval_mode}" =~ ^[46]00$ &&
   "${approval_links}" == 1 && "${approval_size}" == 65 &&
   "${approval_marker_hash}" == "${expected_approval_marker_hash}" ]] || {
  echo "${program_name}: approval marker metadata or deterministic digest is invalid" >&2
  exit 77
}

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

# Rebuild the whole non-secret plan under the transaction lock. This detects a
# changed env hash, current/previous target or immutable manifest before writes.
plan_json="$(python3 "${helper}" plan "${action}" "${version_id}")"
locked_digest="$(plan_field approval_digest)"
[[ "${locked_digest}" == "${approval_digest}" ]] || {
  echo "${program_name}: protected model data state changed after approval" >&2
  exit 74
}
[[ -f "${approval_file}" && ! -L "${approval_file}" &&
   "$(sha256sum "${approval_file}" | awk '{print $1}')" == "${approval_marker_hash}" &&
   "$(stat -c '%u:%a:%h' "${approval_file}")" =~ ^0:[46]00:1$ ]] || {
  echo "${program_name}: approval marker changed after validation" >&2
  exit 74
}

readonly old_current="$(plan_field current_target)"
readonly old_previous="$(plan_field previous_target)"
readonly old_dataset_sha="$(plan_field current_dataset_sha256)"
readonly desired_target="$(plan_field desired_target)"
readonly desired_dataset_sha="$(plan_field desired_dataset_sha256)"
readonly expected_env_hash="$(plan_field env_sha256)"
[[ "${old_current}" =~ ^versions/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ &&
   ( "${old_previous}" == none ||
     "${old_previous}" =~ ^versions/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ) &&
   "${desired_target}" =~ ^versions/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ &&
   "${old_dataset_sha}" =~ ^[0-9a-f]{64}$ &&
   "${desired_dataset_sha}" =~ ^[0-9a-f]{64}$ &&
   "${expected_env_hash}" =~ ^[0-9a-f]{64}$ ]] || {
  echo "${program_name}: safe activation plan fields are invalid" >&2
  exit 70
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
install -d -o root -g root -m 0700 /var/backups/gsyen-aliyun-model-data
audit_dir="$(mktemp -d "/var/backups/gsyen-aliyun-model-data/${timestamp}-${action}-${version_id}.XXXXXX")"
chmod 0700 "${audit_dir}"
install -o root -g root -m 0600 "${env_file}" "${audit_dir}/gsyen-model.env.before"
[[ "$(sha256sum "${audit_dir}/gsyen-model.env.before" | awk '{print $1}')" == "${expected_env_hash}" ]] || {
  echo "${program_name}: protected model environment changed while creating rollback evidence" >&2
  exit 74
}
printf '%s\n' \
  "action=${action}" \
  "version_id=${version_id}" \
  "approval_digest=${approval_digest}" \
  "old_current=${old_current}" \
  "old_previous=${old_previous}" \
  "desired_target=${desired_target}" \
  "old_dataset_sha256=${old_dataset_sha}" \
  "desired_dataset_sha256=${desired_dataset_sha}" \
  "prepared_at=${timestamp}" > "${audit_dir}/record"
chmod 0600 "${audit_dir}/record"

temp_env="$(mktemp "/srv/gsyen/config/.gsyen-model.env.XXXXXX.env")"
chmod 0600 "${temp_env}"
python3 "${helper}" render-env "${version_id}" "${temp_env}"
chown root:gsyen "${temp_env}"
chmod 0640 "${temp_env}"
readonly -a required_env_keys=(
  GSYEN_MODEL_DATA_MODE
  GSYEN_MODEL_DATA_PATH
  GSYEN_MODEL_MAX_DATA_AGE_DAYS
  GSYEN_MODEL_DATA_MAX_BYTES
  GSYEN_MODEL_DATA_SHA256
  GSYEN_MODEL_CORS_ORIGINS
  OMP_NUM_THREADS
  OPENBLAS_NUM_THREADS
  MKL_NUM_THREADS
  NUMEXPR_NUM_THREADS
  PYTHONUNBUFFERED
  PYTHONDONTWRITEBYTECODE
)
"${env_validator}" gsyen "${temp_env}" "${required_env_keys[@]}" >/dev/null

# The renderer reads the env separately. Rechecking the approved plan here
# proves its non-data settings came from the exact protected source we backed up.
[[ "$(python3 "${helper}" plan "${action}" "${version_id}" | \
  python3 "${helper}" field approval_digest)" == "${approval_digest}" ]] || {
  echo "${program_name}: model data state changed while rendering the candidate environment" >&2
  exit 74
}

# Dataset promotion is not a service-onboarding primitive. Requiring an
# already-active model prevents a data-only approval from unexpectedly starting
# a disabled or intentionally stopped unit. Initial activation has its own
# reviewed systemd transaction and approval gate.
systemctl is-active --quiet "${service_name}" || {
  echo "${program_name}: ${service_name} must already be active before ${action}" >&2
  exit 75
}
mv -- "${approval_file}" "${audit_dir}/${action}-approval"

was_active=true
state_changed=false
transaction_complete=false
state_restored=false

atomic_set_link() {
  local link_path="$1"
  local expected_target="$2"
  local new_target="$3"
  local temporary_link="${link_path}.transaction.$$"

  [[ "${new_target}" =~ ^versions/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || return 1
  if [[ "${expected_target}" == none ]]; then
    [[ ! -e "${link_path}" && ! -L "${link_path}" ]] || return 1
  else
    [[ -L "${link_path}" && "$(readlink "${link_path}")" == "${expected_target}" ]] || return 1
  fi
  [[ ! -e "${temporary_link}" && ! -L "${temporary_link}" ]] || return 1
  ln -s -- "${new_target}" "${temporary_link}" || return 1
  if ! mv -Tf -- "${temporary_link}" "${link_path}"; then
    rm -f -- "${temporary_link}"
    return 1
  fi
}

restore_link() {
  local link_path="$1"
  local target="$2"
  local temporary_link="${link_path}.restore.$$"

  if [[ "${target}" == none ]]; then
    if [[ -L "${link_path}" ]]; then
      rm -- "${link_path}" || return 1
    elif [[ -e "${link_path}" ]]; then
      return 1
    fi
    return 0
  fi
  [[ "${target}" =~ ^versions/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || return 1
  [[ ! -e "${link_path}" || -L "${link_path}" ]] || return 1
  [[ ! -e "${temporary_link}" && ! -L "${temporary_link}" ]] || return 1
  ln -s -- "${target}" "${temporary_link}" || return 1
  if ! mv -Tf -- "${temporary_link}" "${link_path}"; then
    rm -f -- "${temporary_link}"
    return 1
  fi
}

restore_state() {
  local failed=0
  local restore_env

  [[ "${state_restored}" == false ]] || return 0
  restore_env="$(mktemp "/srv/gsyen/config/.gsyen-model.env.restore.XXXXXX.env")" || return 1
  if ! install -o root -g gsyen -m 0640 \
    "${audit_dir}/gsyen-model.env.before" "${restore_env}"; then
    failed=1
  elif ! mv -Tf -- "${restore_env}" "${env_file}"; then
    failed=1
  fi
  [[ ! -e "${restore_env}" && ! -L "${restore_env}" ]] || rm -f -- "${restore_env}"
  restore_link "${current_link}" "${old_current}" || failed=1
  restore_link "${previous_link}" "${old_previous}" || failed=1
  if (( failed == 0 )); then
    python3 "${helper}" coherence >/dev/null || failed=1
  fi
  if (( failed == 0 )); then
    if [[ "${was_active}" == true ]]; then
      systemctl restart "${service_name}" >/dev/null 2>&1 || failed=1
      python3 "${helper}" health "${old_dataset_sha}" "${health_timeout_seconds}" \
        >/dev/null 2>&1 || failed=1
    else
      systemctl stop "${service_name}" >/dev/null 2>&1 || failed=1
    fi
  else
    # An incoherent env/link rollback must never be restarted. Keep the model
    # fail-closed and require operator recovery from the root-only audit copy.
    systemctl stop "${service_name}" >/dev/null 2>&1 || failed=1
  fi
  if (( failed == 0 )); then
    state_restored=true
    printf '%s\n' "rolled_back_at=$(date -u +%Y%m%dT%H%M%SZ)" >> "${audit_dir}/record"
    return 0
  fi
  printf '%s\n' "rollback_incomplete_at=$(date -u +%Y%m%dT%H%M%SZ)" >> "${audit_dir}/record"
  return 1
}

cleanup_transaction() {
  local status=$?
  trap - EXIT HUP INT TERM
  if [[ "${state_changed}" == true && "${transaction_complete}" == false ]]; then
    if restore_state; then
      echo "${program_name}: activation failed; prior model data/env/current state was restored" >&2
    else
      echo "${program_name}: P0 activation and automatic model-only rollback both failed; inspect ${audit_dir}" >&2
      status=74
    fi
  fi
  [[ ! -e "${temp_env:-}" && ! -L "${temp_env:-}" ]] || rm -f -- "${temp_env}"
  exit "${status}"
}
trap cleanup_transaction EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# Close the small gap between the pre-write service-state check and the first
# protected write. A concurrent stop aborts without consuming data state.
systemctl is-active --quiet "${service_name}" || {
  echo "${program_name}: ${service_name} stopped before the transaction commit" >&2
  exit 75
}
state_changed=true
mv -Tf -- "${temp_env}" "${env_file}"
atomic_set_link "${current_link}" "${old_current}" "${desired_target}"
"${env_validator}" gsyen "${env_file}" "${required_env_keys[@]}" >/dev/null
python3 "${helper}" coherence >/dev/null
systemctl restart "${service_name}" >/dev/null 2>&1
python3 "${helper}" health "${desired_dataset_sha}" "${health_timeout_seconds}" >/dev/null

# Preserve the exact former current only after the desired version is healthy.
# If this final atomic link update fails, the EXIT trap restores all three
# protected model-data state objects and only this model service.
atomic_set_link "${previous_link}" "${old_previous}" "${old_current}"
python3 "${helper}" coherence >/dev/null
transaction_complete=true
printf '%s\n' "activated_at=$(date -u +%Y%m%dT%H%M%SZ)" >> "${audit_dir}/record"
trap - EXIT HUP INT TERM

echo "Completed ${action} for model dataset ${version_id}; ${service_name} passed the exact-SHA readiness check."
echo "No other service, Caddy, DNS or MX was changed."
