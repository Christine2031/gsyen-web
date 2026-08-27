#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"
readonly libexec_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly systemd_root="/etc/systemd/system"
readonly candidate_root="/etc/gsyen-aliyun/systemd-available"
readonly approval_root="/etc/gsyen-aliyun/systemd-approvals"
readonly audit_root="/var/backups/gsyen-aliyun-systemd"
readonly health_root="/etc/gsyen-aliyun/healthchecks"

usage() {
  cat >&2 <<EOF
Usage: ${program_name} {activate|rollback} {gsyen|halfsphere} SERVICE CANDIDATE --check|--apply

The command changes exactly one allowlisted .service unit. --check is read-only
and prints a deterministic approval digest. --apply requires that digest plus
a newline in the root-owned 0400/0600 one-time marker:
  ${approval_root}/SPACE/SERVICE.{activate|rollback}

Activation candidates must be the exact SERVICE.service file below
${candidate_root}. Rollback candidates must be unit.before or
unit.before.absent from a successful prior transaction under ${audit_root}.
The transaction never changes a release link, Caddy, DNS, MX or a Secret file.
EOF
}

[[ $# -eq 5 ]] || { usage; exit 64; }
readonly action="$1"
readonly space="$2"
readonly service="$3"
readonly candidate="$4"
readonly mode="$5"
[[ "${action}" == activate || "${action}" == rollback ]] || { usage; exit 64; }
[[ "${mode}" == --check || "${mode}" == --apply ]] || { usage; exit 64; }

app=""
business_group=""
service_user=""
expected_env_file=""
listener_port=""
health_kind="http"
case "${space}:${service}" in
  gsyen:gsyen-web) app=gsyen-web; business_group=gsyen; service_user=gsyen; listener_port=18080; expected_env_file=/srv/gsyen/config/gsyen-web.env ;;
  gsyen:gsyen-api) app=gsyen-api; business_group=gsyen; service_user=gsyen; listener_port=18081; expected_env_file=/srv/gsyen/config/gsyen-api.env ;;
  gsyen:sgsyen-web) app=sgsyen-web; business_group=gsyen; service_user=gsyen; listener_port=18082 ;;
  gsyen:gsyen-model) app=gsyen-model; business_group=gsyen; service_user=gsyen; listener_port=18083; expected_env_file=/srv/gsyen/config/gsyen-model.env ;;
  gsyen:sgsyen-api) app=sgsyen-api; business_group=gsyen; service_user=gsyen; listener_port=18084; expected_env_file=/srv/gsyen/config/sgsyen-api.env ;;
  gsyen:gsyen-mail-ingest) app=mail-ingest; business_group=gsyen-mail; service_user=gsyen-mail; listener_port=18085; expected_env_file=/srv/gsyen/config/mail-ingest.env ;;
  gsyen:stalwart) app=stalwart; business_group=stalwart; service_user=stalwart; listener_port=25; health_kind=smtp; expected_env_file=/srv/gsyen/config/stalwart/stalwart.env ;;
  halfsphere:halfsphere-web) app=halfsphere-web; business_group=halfsphere; service_user=halfsphere; listener_port=18180; expected_env_file=/srv/halfsphere/config/halfsphere-web.env ;;
  halfsphere:halfsphere-api) app=halfsphere-api; business_group=halfsphere; service_user=halfsphere; listener_port=18181; expected_env_file=/srv/halfsphere/config/halfsphere-api.env ;;
  *)
    echo "${program_name}: service is not allocated to the selected business space" >&2
    exit 64
    ;;
esac
readonly app business_group service_user expected_env_file listener_port health_kind
readonly unit="${service}.service"
readonly active_unit="${systemd_root}/${unit}"
readonly app_root="/srv/${space}/apps/${app}"
readonly current_link="${app_root}/current"
readonly health_config="${health_root}/${space}.urls"
readonly approval_file="${approval_root}/${space}/${service}.${action}"

case "${action}" in
  activate)
    [[ "${candidate}" == "${candidate_root}/${unit}" ]] || {
      echo "${program_name}: activation candidate path is outside the exact allowlist" >&2
      exit 65
    }
    ;;
  rollback)
    readonly rollback_pattern="^${audit_root}/[0-9]{8}T[0-9]{6}Z-${space}-${service}\.[A-Za-z0-9]{6}/unit\.before(\.absent)?$"
    [[ "${candidate}" =~ ${rollback_pattern} ]] || {
      echo "${program_name}: rollback candidate is not a prior transaction unit.before" >&2
      exit 65
    }
    ;;
esac

(( EUID == 0 )) || {
  echo "${program_name}: root is required to read protected candidates and systemd state" >&2
  exit 77
}
for command_name in awk bash chmod date flock grep install mktemp mv python3 readlink \
  realpath rm rmdir sha256sum stat systemctl systemd-analyze timeout wc; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "${program_name}: required command not found: ${command_name}" >&2
    exit 69
  }
done

fail() {
  echo "${program_name}: $*" >&2
  exit 78
}

require_private_directory() {
  local directory="$1"
  [[ -d "${directory}" && ! -L "${directory}" &&
     "$(stat -c '%U:%G:%a' "${directory}")" == root:root:700 ]] || {
    echo "${program_name}: root-only directory is missing or unsafe: ${directory}" >&2
    exit 77
  }
}

ensure_private_directory() {
  local directory="$1"
  if [[ -e "${directory}" || -L "${directory}" ]]; then
    require_private_directory "${directory}"
  else
    install -d -o root -g root -m 0700 -- "${directory}"
  fi
}

record_value() {
  local record="$1"
  local key="$2"
  awk -F= -v key="${key}" '
    $1 == key { count += 1; value = substr($0, index($0, "=") + 1) }
    END { if (count != 1 || value == "") exit 65; print value }
  ' "${record}"
}

candidate_hash=""
candidate_absent=false
desired_enabled=enabled
desired_active=active
validate_candidate_path_and_metadata() {
  local expected_mode canonical_candidate candidate_owner candidate_links candidate_mode
  local audit_dir record record_hash record_space record_service activated_at
  [[ -f "${candidate}" && ! -L "${candidate}" ]] ||
    fail "candidate must be a regular non-symlink file"
  canonical_candidate="$(realpath --canonicalize-existing -- "${candidate}")" ||
    fail "candidate path cannot be canonicalized"
  [[ "${canonical_candidate}" == "${candidate}" ]] ||
    fail "candidate path contains a symlink or path alias"
  candidate_owner="$(stat -c '%u' "${candidate}")"
  candidate_links="$(stat -c '%h' "${candidate}")"
  candidate_mode="$(stat -c '%a' "${candidate}")"
  expected_mode=644
  [[ "${action}" == activate ]] || expected_mode=600
  [[ "${candidate_owner}" == 0 && "${candidate_links}" == 1 &&
     "${candidate_mode}" == "${expected_mode}" ]] ||
    fail "candidate owner, link count or mode is unsafe"
  candidate_size="$(stat -c '%s' "${candidate}")"
  candidate_absent=false
  if [[ "${candidate##*/}" == unit.before.absent ]]; then
    [[ "${action}" == rollback && "${candidate_size}" == 0 ]] ||
      fail "absence rollback marker is invalid"
    candidate_absent=true
    candidate_hash=none
  else
    [[ "${candidate_size}" =~ ^[0-9]+$ && "${candidate_size}" -ge 1 &&
       "${candidate_size}" -le 262144 ]] || fail "candidate unit size is outside the reviewed limit"
    candidate_hash="$(sha256sum "${candidate}" | awk '{print $1}')"
    [[ "${candidate_hash}" =~ ^[0-9a-f]{64}$ ]] || fail "candidate hash is invalid"
  fi

  if [[ "${action}" == rollback ]]; then
    audit_dir="$(dirname "${candidate}")"
    record="${audit_dir}/record"
    require_private_directory "${audit_dir}"
    [[ -f "${record}" && ! -L "${record}" &&
       "$(stat -c '%u:%a:%h' "${record}")" == 0:600:1 ]] ||
      fail "rollback audit record is missing or unsafe"
    record_space="$(record_value "${record}" space)" || fail "rollback record lacks space"
    record_service="$(record_value "${record}" service)" || fail "rollback record lacks service"
    record_hash="$(record_value "${record}" previous_unit_sha256)" ||
      fail "rollback record lacks previous unit hash"
    desired_enabled="$(record_value "${record}" previous_enabled)" ||
      fail "rollback record lacks previous enable state"
    desired_active="$(record_value "${record}" previous_active)" ||
      fail "rollback record lacks previous active state"
    activated_at="$(record_value "${record}" activated_at)" ||
      fail "rollback record is not a successful transaction"
    [[ "${record_space}" == "${space}" && "${record_service}" == "${service}" &&
       "${record_hash}" == "${candidate_hash}" &&
       "${activated_at}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] ||
      fail "rollback candidate does not match its successful transaction record"
    [[ "${desired_enabled}" == enabled || "${desired_enabled}" == disabled ||
       "${desired_enabled}" == not-found ]] || fail "rollback enable state is invalid"
    [[ "${desired_active}" == active || "${desired_active}" == inactive ]] ||
      fail "rollback active state is invalid"
    if [[ "${candidate_absent}" == true ]]; then
      [[ "${desired_enabled}:${desired_active}" == not-found:inactive ]] ||
        fail "absence rollback must restore not-found/inactive state"
    else
      [[ "${desired_enabled}" != not-found ]] ||
        fail "a real rollback unit cannot restore not-found state"
    fi
  fi
}

require_exact_line() {
  local line="$1"
  [[ "$(grep -Fxc -- "${line}" "${candidate}")" == 1 ]] ||
    fail "candidate lacks one exact required unit line: ${line}"
}

validate_candidate_contract() {
  local capability_count dependency_count env_count ordering_count other_space
  local verify_dir verify_file verify_status
  require_exact_line "Slice=${space}.slice"
  require_exact_line "WorkingDirectory=${app_root}/current"
  require_exact_line "ConditionPathExists=!/etc/gsyen-aliyun/locks/${space}-restore-in-progress"
  require_exact_line "WantedBy=multi-user.target"
  require_exact_line "User=${service_user}"
  require_exact_line "Group=${business_group}"
  require_exact_line 'NoNewPrivileges=true'
  capability_count="$(grep -Ec '^CapabilityBoundingSet=' "${candidate}" || true)"
  [[ "${capability_count}" == 1 ]] ||
    fail "candidate must contain exactly one CapabilityBoundingSet"
  capability_count="$(grep -Ec '^AmbientCapabilities=' "${candidate}" || true)"
  [[ "${capability_count}" == 1 ]] ||
    fail "candidate must contain exactly one AmbientCapabilities"
  if [[ "${service}" == stalwart ]]; then
    require_exact_line 'CapabilityBoundingSet=CAP_NET_BIND_SERVICE'
    require_exact_line 'AmbientCapabilities=CAP_NET_BIND_SERVICE'
  else
    require_exact_line 'CapabilityBoundingSet='
    require_exact_line 'AmbientCapabilities='
  fi
  [[ "$(grep -Ec '^ExecStart=' "${candidate}")" == 1 ]] ||
    fail "candidate must contain exactly one ExecStart"
  grep -E '^ExecStart=' "${candidate}" | grep -Fq -- "${app_root}/current" ||
    fail "candidate ExecStart is outside the selected immutable release"
  if grep -Eq '^(Alias|Also|OnFailure|OnSuccess|PropagatesReloadTo|ReloadPropagatedFrom)=' \
    "${candidate}"; then
    fail "candidate can activate or reload a second unit"
  fi
  dependency_count="$(grep -Ec \
    '^(Requires|Requisite|Wants|BindsTo|PartOf|Upholds|Conflicts)=.*\.service([[:space:]]|$)' \
    "${candidate}" || true)"
  ordering_count="$(grep -Ec '^(Before|After)=.*\.service([[:space:]]|$)' \
    "${candidate}" || true)"
  case "${service}" in
    gsyen-mail-ingest)
      [[ "${dependency_count}:${ordering_count}" == 1:1 ]] ||
        fail "mail-ingest has an unreviewed service dependency"
      require_exact_line 'Requires=stalwart.service'
      require_exact_line 'After=network-online.target stalwart.service'
      ;;
    stalwart)
      [[ "${dependency_count}:${ordering_count}" == 1:0 ]] ||
        fail "Stalwart has an unreviewed service dependency or ordering edge"
      require_exact_line 'Conflicts=postfix.service sendmail.service exim4.service'
      ;;
    *)
      [[ "${dependency_count}:${ordering_count}" == 0:0 ]] ||
        fail "candidate references an unreviewed second service"
      ;;
  esac
  if grep -Eq '^Exec(Start|StartPre|StartPost|Condition|Reload|Stop|StopPost)=[[:space:]]*[-@:+!]*[+!]' \
    "${candidate}"; then
    fail "candidate uses an Exec privilege-elevation prefix"
  fi
  if [[ "${service}" != stalwart ]] &&
     grep -Eq '^(CapabilityBoundingSet|AmbientCapabilities)=.+' "${candidate}"; then
    fail "candidate requests nonempty process capabilities"
  fi
  other_space=gsyen
  [[ "${space}" == gsyen ]] && other_space=halfsphere
  if grep -Fq -- "/srv/${other_space}/" "${candidate}"; then
    fail "candidate crosses into the other business data space"
  fi
  if { [[ "${space}" == gsyen ]] &&
       grep -Eq 'halfsphere-[a-z-]+\.service' "${candidate}"; } ||
     { [[ "${space}" == halfsphere ]] &&
       grep -Eq '(^|[[:space:]=])(gsyen-[a-z-]+|sgsyen-[a-z-]+|stalwart)\.service' "${candidate}"; }; then
    fail "candidate declares a cross-business service dependency"
  fi
  env_count="$(grep -Ec '^EnvironmentFile=' "${candidate}" || true)"
  if [[ -z "${expected_env_file}" ]]; then
    [[ "${env_count}" == 0 ]] || fail "service must not read a runtime EnvironmentFile"
  else
    [[ "${env_count}" == 1 ]] || fail "service must read exactly one EnvironmentFile"
    require_exact_line "EnvironmentFile=${expected_env_file}"
  fi

  if [[ "${action}" == rollback ]]; then
    verify_dir="$(mktemp -d "/run/gsyen-aliyun-systemd-verify.XXXXXX")"
    chmod 0700 "${verify_dir}"
    verify_file="${verify_dir}/${unit}"
    install -o root -g root -m 0600 "${candidate}" "${verify_file}"
    verify_status=0
    systemd-analyze verify "${verify_file}" >/dev/null || verify_status=$?
    rm -- "${verify_file}"
    rmdir -- "${verify_dir}"
    (( verify_status == 0 )) || fail "rollback candidate failed systemd-analyze verify"
  else
    systemd-analyze verify "${candidate}" >/dev/null
  fi
}

release_target=""
release_hash=""
validate_release_state() {
  local releases_dir release_dir resolved_current resolved_release
  releases_dir="${app_root}/releases"
  [[ -d "${app_root}" && ! -L "${app_root}" &&
     "$(stat -c '%U:%G:%a' "${app_root}")" == "root:${business_group}:750" ]] ||
    fail "managed app root is missing or has unsafe metadata"
  [[ -d "${releases_dir}" && ! -L "${releases_dir}" &&
     "$(stat -c '%U:%G:%a' "${releases_dir}")" == "root:${business_group}:750" ]] ||
    fail "managed releases directory is missing or has unsafe metadata"
  [[ -L "${current_link}" ]] || fail "current must be a relative immutable-release symlink"
  release_target="$(readlink "${current_link}")"
  [[ "${release_target}" =~ ^releases/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] ||
    fail "current has an unsafe release target"
  release_dir="${app_root}/${release_target}"
  [[ -d "${release_dir}" && ! -L "${release_dir}" ]] ||
    fail "current immutable release directory is missing or unsafe"
  resolved_current="$(realpath --canonicalize-existing -- "${current_link}")"
  resolved_release="$(realpath --canonicalize-existing -- "${release_dir}")"
  [[ "${resolved_current}" == "${resolved_release}" ]] ||
    fail "current does not resolve to its declared release"
  release_hash="$(python3 "${libexec_dir}/validate-release-tree.py" \
    "${space}" "${app}" "${release_target#releases/}" "${release_dir}" \
    --owner root --group "${business_group}")"
  [[ "${release_hash}" =~ ^[0-9a-f]{64}$ ]] || fail "release validator returned an invalid hash"
  if [[ "${space}:${app}" == gsyen:stalwart ]]; then
    python3 "${libexec_dir}/validate-stalwart-release.py" "${release_dir}" >/dev/null
  fi
}

health_contract_hash=""
validate_health_contract() {
  if [[ "${health_kind}" == smtp ]]; then
    health_contract_hash="$(printf '%s\n' 'stalwart-smtp-banner-v1|127.0.0.1|25' | \
      sha256sum | awk '{print $1}')"
    return 0
  fi
  [[ -f "${health_config}" && ! -L "${health_config}" &&
     "$(stat -c '%u:%h' "${health_config}")" == 0:1 ]] ||
    fail "service health configuration is missing or unsafe"
  health_mode="$(stat -c '%a' "${health_config}")"
  (( (8#${health_mode} & 8#022) == 0 )) || fail "service health configuration is writable"
  "${libexec_dir}/healthcheck-space.sh" "${space}" "${health_config}" \
    "${service}" --validate-only >/dev/null
  health_contract_hash="$(sha256sum "${health_config}" | awk '{print $1}')"
}

current_fragment=""
current_unit_hash=""
current_enabled=""
current_active=""
current_main_pid=""
capture_systemd_state() {
  local load_state dropins raw_enabled raw_active unit_mode
  manager_state="$(systemctl is-system-running 2>/dev/null || true)"
  [[ "${manager_state}" == running || "${manager_state}" == degraded ]] ||
    fail "systemd manager is not in a reviewable running/degraded state"
  load_state="$(systemctl show "${unit}" --property=LoadState --value 2>/dev/null || true)"
  current_fragment="$(systemctl show "${unit}" --property=FragmentPath --value 2>/dev/null || true)"
  dropins="$(systemctl show "${unit}" --property=DropInPaths --value 2>/dev/null || true)"
  [[ -z "${dropins}" ]] || fail "drop-in unit overrides require a separate reviewed migration"
  if [[ -z "${current_fragment}" ]]; then
    [[ "${load_state}" == not-found && ! -e "${active_unit}" && ! -L "${active_unit}" ]] ||
      fail "effective current unit path is ambiguous"
    current_fragment=none
    current_unit_hash=none
  else
    [[ "${load_state}" == loaded && "${current_fragment}" == "${active_unit}" &&
       -f "${active_unit}" && ! -L "${active_unit}" &&
       "$(stat -c '%u:%h' "${active_unit}")" == 0:1 ]] ||
      fail "effective current unit is outside the exact managed path"
    unit_mode="$(stat -c '%a' "${active_unit}")"
    [[ "${unit_mode}" == 644 ]] || fail "effective current unit must be mode 0644"
    current_unit_hash="$(sha256sum "${active_unit}" | awk '{print $1}')"
  fi

  raw_enabled="$(systemctl is-enabled "${unit}" 2>/dev/null || true)"
  case "${raw_enabled}" in
    enabled|disabled) current_enabled="${raw_enabled}" ;;
    not-found|"")
      [[ "${current_fragment}" == none ]] || fail "current enable state is ambiguous"
      current_enabled=not-found
      ;;
    *) fail "unsupported current enable state: ${raw_enabled}" ;;
  esac
  raw_active="$(systemctl is-active "${unit}" 2>/dev/null || true)"
  case "${raw_active}" in
    active|inactive) current_active="${raw_active}" ;;
    unknown|"")
      [[ "${current_fragment}" == none ]] || fail "current active state is ambiguous"
      current_active=inactive
      ;;
    *) fail "service is transitional or failed; remediate it before unit activation" ;;
  esac
  current_main_pid="$(systemctl show "${unit}" --property=MainPID --value 2>/dev/null || true)"
  if [[ -z "${current_main_pid}" && "${current_fragment}" == none ]]; then
    current_main_pid=0
  fi
  [[ "${current_main_pid}" =~ ^[0-9]+$ ]] || fail "current MainPID state is invalid"
  if [[ "${current_active}" == active ]]; then
    (( current_main_pid >= 2 )) || fail "active current service has no MainPID"
  else
    [[ "${current_main_pid}" == 0 ]] || fail "inactive current service retains a MainPID"
  fi
  [[ "${current_fragment}" != none || "${current_enabled}:${current_active}" == not-found:inactive ]] ||
    fail "a missing current unit has inconsistent service state"
}

dependency_state_hash=""
validate_dependency_state() {
  local dependency_active dependency_fragment dependency_pid dependency_state
  local conflict_unit
  case "${service}" in
    gsyen-mail-ingest)
      dependency_fragment="$(systemctl show stalwart.service \
        --property=FragmentPath --value 2>/dev/null || true)"
      dependency_active="$(systemctl is-active stalwart.service 2>/dev/null || true)"
      dependency_pid="$(systemctl show stalwart.service \
        --property=MainPID --value 2>/dev/null || true)"
      [[ -n "${dependency_fragment}" && "${dependency_active}" == active &&
         "${dependency_pid}" =~ ^[0-9]+$ && "${dependency_pid}" -ge 2 ]] ||
        fail "mail-ingest requires an already-active reviewed Stalwart service"
      "${libexec_dir}/assert-loopback-listener.sh" 25 5 "${dependency_pid}" >/dev/null ||
        fail "mail-ingest prerequisite Stalwart is not an isolated loopback listener"
      dependency_state_hash="$(printf '%s\n' \
        'schema=1' \
        'dependency=stalwart.service' \
        "fragment=${dependency_fragment}" \
        "active=${dependency_active}" \
        "main_pid=${dependency_pid}" | sha256sum | awk '{print $1}')"
      ;;
    stalwart)
      dependency_state='schema=1'
      for conflict_unit in postfix.service sendmail.service exim4.service; do
        dependency_fragment="$(systemctl show "${conflict_unit}" \
          --property=FragmentPath --value 2>/dev/null || true)"
        dependency_active="$(systemctl is-active "${conflict_unit}" 2>/dev/null || true)"
        case "${dependency_active}" in
          inactive|unknown|"") ;;
          *) fail "Stalwart conflict is not safely inactive: ${conflict_unit}" ;;
        esac
        dependency_state+=$'\n'"unit=${conflict_unit}|fragment=${dependency_fragment}|active=${dependency_active}"
      done
      dependency_state_hash="$(printf '%s\n' "${dependency_state}" | \
        sha256sum | awk '{print $1}')"
      ;;
    *)
      dependency_state_hash="$(printf '%s\n' 'schema=1' 'dependency=none' | \
        sha256sum | awk '{print $1}')"
      ;;
  esac
  [[ "${dependency_state_hash}" =~ ^[0-9a-f]{64}$ ]] ||
    fail "dependency isolation state hash is invalid"
}

approval_digest=""
no_op=false
collect_plan() {
  "${libexec_dir}/validate-boundary-gate.sh" "${space}" >/dev/null
  validate_candidate_path_and_metadata
  if [[ "${candidate_absent}" == false ]]; then
    validate_candidate_contract
  fi
  validate_release_state
  validate_health_contract
  capture_systemd_state
  validate_dependency_state
  no_op=false
  if [[ "${candidate_hash}" == "${current_unit_hash}" &&
        "${desired_enabled}" == "${current_enabled}" &&
        "${desired_active}" == "${current_active}" ]]; then
    no_op=true
  fi
  approval_digest="$(printf '%s\n' \
    'schema=1' \
    "action=${action}" \
    "space=${space}" \
    "service=${service}" \
    "candidate_path=${candidate}" \
    "candidate_sha256=${candidate_hash}" \
    "desired_enabled=${desired_enabled}" \
    "desired_active=${desired_active}" \
    "current_fragment=${current_fragment}" \
    "current_unit_sha256=${current_unit_hash}" \
    "current_enabled=${current_enabled}" \
    "current_active=${current_active}" \
    "current_main_pid=${current_main_pid}" \
    "dependency_state_sha256=${dependency_state_hash}" \
    "release_target=${release_target}" \
    "release_sha256=${release_hash}" \
    "health_contract_sha256=${health_contract_hash}" | sha256sum | awk '{print $1}')"
  [[ "${approval_digest}" =~ ^[0-9a-f]{64}$ ]] || fail "approval digest is invalid"
}

collect_plan
readonly planned_digest="${approval_digest}"
readonly planned_candidate_hash="${candidate_hash}"
readonly planned_candidate_absent="${candidate_absent}"
readonly planned_desired_enabled="${desired_enabled}"
readonly planned_desired_active="${desired_active}"
readonly planned_current_fragment="${current_fragment}"
readonly planned_current_unit_hash="${current_unit_hash}"
readonly planned_enabled="${current_enabled}"
readonly planned_active="${current_active}"
readonly planned_main_pid="${current_main_pid}"
readonly planned_dependency_hash="${dependency_state_hash}"
readonly planned_release_target="${release_target}"
readonly planned_release_hash="${release_hash}"
readonly planned_health_hash="${health_contract_hash}"

if [[ "${no_op}" == true ]]; then
  echo "${unit} already matches candidate ${candidate_hash} and the requested enable/active state; no unit transaction is required."
  exit 0
fi
if [[ "${mode}" == --check ]]; then
  echo "Validated ${action} plan for ${space}/${service}; approval digest=${approval_digest}"
  echo "No unit, enable state, process, Caddy, DNS, MX or Secret file was changed."
  exit 0
fi

require_private_directory "${approval_root}"
require_private_directory "${approval_root}/${space}"
[[ -f "${approval_file}" && ! -L "${approval_file}" ]] ||
  fail "missing regular one-time systemd approval marker"
approval_owner="$(stat -c '%u' "${approval_file}")"
approval_mode="$(stat -c '%a' "${approval_file}")"
approval_links="$(stat -c '%h' "${approval_file}")"
approval_size="$(wc -c < "${approval_file}" | awk '{print $1}')"
approval_lines="$(wc -l < "${approval_file}" | awk '{print $1}')"
IFS= read -r approval_value < "${approval_file}" || true
[[ "${approval_owner}" == 0 && "${approval_mode}" =~ ^[46]00$ &&
   "${approval_links}" == 1 && "${approval_size}" == 65 && "${approval_lines}" == 1 &&
   "${approval_value}" == "${planned_digest}" ]] ||
  fail "approval marker metadata or deterministic digest is invalid"
readonly approval_marker_hash="$(sha256sum "${approval_file}" | awk '{print $1}')"

validate_lock_path() {
  local lock_path="$1"
  local lock_mode
  [[ ! -L "${lock_path}" && ( ! -e "${lock_path}" || -f "${lock_path}" ) ]] ||
    fail "transaction lock path is unsafe"
  [[ -f "${lock_path}" ]] || return 0
  lock_mode="$(stat -c '%a' "${lock_path}")"
  [[ "$(stat -c '%u:%h' "${lock_path}")" == 0:1 &&
     $((8#${lock_mode} & 8#022)) -eq 0 ]] || fail "transaction lock metadata is unsafe"
}

readonly systemd_lock="/run/lock/gsyen-aliyun-systemd-transaction.lock"
readonly release_lock="/run/lock/gsyen-aliyun-release-${space}-${app}.lock"
validate_lock_path "${systemd_lock}"
validate_lock_path "${release_lock}"
umask 077
exec 9>>"${systemd_lock}"
flock -n 9 || {
  echo "${program_name}: another systemd unit transaction is running" >&2
  exit 75
}
exec 8>>"${release_lock}"
flock -n 8 || {
  echo "${program_name}: the selected immutable release is changing" >&2
  exit 75
}

# Rebuild the complete plan under both the systemd and matching app-release
# locks. No unit write occurs unless candidate/current/service/release/health
# state still produces the approved deterministic digest.
collect_plan
[[ "${approval_digest}" == "${planned_digest}" &&
   "${candidate_hash}" == "${planned_candidate_hash}" &&
   "${candidate_absent}" == "${planned_candidate_absent}" &&
   "${desired_enabled}" == "${planned_desired_enabled}" &&
   "${desired_active}" == "${planned_desired_active}" &&
   "${current_fragment}" == "${planned_current_fragment}" &&
   "${current_unit_hash}" == "${planned_current_unit_hash}" &&
   "${current_enabled}" == "${planned_enabled}" &&
   "${current_active}" == "${planned_active}" &&
   "${current_main_pid}" == "${planned_main_pid}" &&
   "${dependency_state_hash}" == "${planned_dependency_hash}" &&
   "${release_target}" == "${planned_release_target}" &&
   "${release_hash}" == "${planned_release_hash}" &&
   "${health_contract_hash}" == "${planned_health_hash}" ]] ||
  fail "candidate, current unit/service, release or health state changed after approval"
[[ -f "${approval_file}" && ! -L "${approval_file}" &&
   "$(sha256sum "${approval_file}" | awk '{print $1}')" == "${approval_marker_hash}" ]] ||
  fail "approval marker changed after validation"

backup_parent_mode="$(stat -c '%a' /var/backups)"
[[ -d /var/backups && ! -L /var/backups && "$(stat -c '%u' /var/backups)" == 0 &&
   $((8#${backup_parent_mode} & 8#022)) -eq 0 ]] || fail "backup parent is unsafe"
ensure_private_directory "${audit_root}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
audit_dir="$(mktemp -d "${audit_root}/${timestamp}-${space}-${service}.XXXXXX")"
chmod 0700 "${audit_dir}"
if [[ "${planned_candidate_absent}" == true ]]; then
  install -o root -g root -m 0600 /dev/null "${audit_dir}/candidate.unit.absent"
else
  install -o root -g root -m 0600 "${candidate}" "${audit_dir}/candidate.unit"
  [[ "$(sha256sum "${audit_dir}/candidate.unit" | awk '{print $1}')" == "${planned_candidate_hash}" ]] ||
    fail "candidate changed while creating rollback evidence"
fi
if [[ "${planned_current_unit_hash}" == none ]]; then
  install -o root -g root -m 0600 /dev/null "${audit_dir}/unit.before.absent"
else
  install -o root -g root -m 0600 "${active_unit}" "${audit_dir}/unit.before"
  [[ "$(sha256sum "${audit_dir}/unit.before" | awk '{print $1}')" == \
     "${planned_current_unit_hash}" ]] || fail "current unit changed while creating rollback evidence"
fi
printf '%s\n' \
  'schema=1' \
  "action=${action}" \
  "space=${space}" \
  "service=${service}" \
  "candidate_path=${candidate}" \
  "candidate_unit_sha256=${planned_candidate_hash}" \
  "desired_enabled=${planned_desired_enabled}" \
  "desired_active=${planned_desired_active}" \
  "previous_fragment=${planned_current_fragment}" \
  "previous_unit_sha256=${planned_current_unit_hash}" \
  "previous_enabled=${planned_enabled}" \
  "previous_active=${planned_active}" \
  "previous_main_pid=${planned_main_pid}" \
  "release_target=${planned_release_target}" \
  "release_sha256=${planned_release_hash}" \
  "health_contract_sha256=${planned_health_hash}" \
  "approval_digest=${planned_digest}" \
  "prepared_at=${timestamp}" > "${audit_dir}/record"
chmod 0600 "${audit_dir}/record"
mv -- "${approval_file}" "${audit_dir}/${action}-approval"

assert_expected_listener() {
  local expected_pid="$1"
  "${libexec_dir}/assert-loopback-listener.sh" "${listener_port}" 60 "${expected_pid}"
}

run_business_health() {
  local banner current_health_hash
  if [[ "${health_kind}" == smtp ]]; then
    banner="$(timeout 6 bash -c '
      exec 3<>/dev/tcp/127.0.0.1/25
      IFS= read -r -t 5 line <&3
      printf "%s" "${line}"
    ')" || return 1
    [[ "${banner}" =~ ^220[[:space:]].*Stalwart[[:space:]]+ESMTP ]]
    return
  fi
  current_health_hash="$(sha256sum "${health_config}" | awk '{print $1}')"
  [[ "${current_health_hash}" == "${planned_health_hash}" ]] || return 1
  "${libexec_dir}/healthcheck-space.sh" "${space}" "${health_config}" "${service}" >/dev/null
}

verify_selected_service() {
  local checked_hash checked_target effective_active effective_enabled effective_fragment
  local effective_hash effective_pid
  effective_fragment="$(systemctl show "${unit}" --property=FragmentPath --value)"
  effective_enabled="$(systemctl is-enabled "${unit}" 2>/dev/null || true)"
  effective_active="$(systemctl is-active "${unit}" 2>/dev/null || true)"
  if [[ "${planned_candidate_absent}" == true ]]; then
    [[ -z "${effective_fragment}" && ! -e "${active_unit}" && ! -L "${active_unit}" ]] ||
      return 1
    case "${effective_enabled}" in
      not-found|"") ;;
      *) return 1 ;;
    esac
    case "${effective_active}" in
      inactive|unknown|"") ;;
      *) return 1 ;;
    esac
  else
    [[ "${effective_fragment}" == "${active_unit}" && -f "${active_unit}" && ! -L "${active_unit}" ]] ||
      return 1
    effective_hash="$(sha256sum "${active_unit}" | awk '{print $1}')"
    [[ "${effective_hash}" == "${planned_candidate_hash}" &&
       "${effective_enabled}" == "${planned_desired_enabled}" &&
       "${effective_active}" == "${planned_desired_active}" ]] || return 1
    effective_pid="$(systemctl show "${unit}" --property=MainPID --value)"
    if [[ "${planned_desired_active}" == active ]]; then
      [[ "${effective_pid}" =~ ^[0-9]+$ && "${effective_pid}" -ge 2 ]] || return 1
      assert_expected_listener "${effective_pid}" || return 1
      run_business_health || return 1
    else
      [[ "${effective_pid}" == 0 ]] || return 1
    fi
  fi
  validate_dependency_state
  [[ "${dependency_state_hash}" == "${planned_dependency_hash}" ]] || return 1
  validate_release_state
  checked_target="${release_target}"
  checked_hash="${release_hash}"
  [[ "${checked_target}" == "${planned_release_target}" &&
     "${checked_hash}" == "${planned_release_hash}" ]] || return 1
}

state_changed=false
transaction_complete=false
state_restored=false
temporary_unit="${systemd_root}/.${unit}.candidate.$$"
restore_temporary="${systemd_root}/.${unit}.restore.$$"

restore_previous_state() {
  local disk_hash failed=0 effective_fragment restored_enabled restored_active restored_hash restored_pid
  [[ "${state_restored}" == false ]] || return 0

  if [[ -f "${active_unit}" && ! -L "${active_unit}" ]]; then
    disk_hash="$(sha256sum "${active_unit}" | awk '{print $1}')"
  elif [[ ! -e "${active_unit}" && ! -L "${active_unit}" ]]; then
    disk_hash=none
  else
    disk_hash=unsafe
  fi
  if [[ "${disk_hash}" == "${planned_candidate_hash}" ]]; then
    if [[ "${planned_candidate_absent}" == false ]]; then
      systemctl stop "${unit}" >/dev/null 2>&1 || failed=1
      systemctl disable "${unit}" >/dev/null 2>&1 || failed=1
    fi
    if [[ "${planned_current_unit_hash}" == none ]]; then
      rm -- "${active_unit}" || failed=1
    else
      install -o root -g root -m 0644 "${audit_dir}/unit.before" "${restore_temporary}" || failed=1
      if (( failed == 0 )) &&
         [[ "$(sha256sum "${restore_temporary}" | awk '{print $1}')" == \
            "${planned_current_unit_hash}" ]]; then
        mv -Tf -- "${restore_temporary}" "${active_unit}" || failed=1
      else
        failed=1
      fi
    fi
  elif [[ "${disk_hash}" != "${planned_current_unit_hash}" ]]; then
    failed=1
  fi
  systemctl daemon-reload >/dev/null 2>&1 || failed=1
  if [[ "${planned_enabled}" == enabled ]]; then
    systemctl enable "${unit}" >/dev/null 2>&1 || failed=1
  fi
  if [[ "${planned_active}" == active ]]; then
    systemctl start "${unit}" >/dev/null 2>&1 || failed=1
  elif [[ "${planned_current_unit_hash}" != none ]]; then
    systemctl stop "${unit}" >/dev/null 2>&1 || failed=1
  fi

  effective_fragment="$(systemctl show "${unit}" --property=FragmentPath --value 2>/dev/null || true)"
  if [[ "${planned_current_unit_hash}" == none ]]; then
    [[ -z "${effective_fragment}" && ! -e "${active_unit}" && ! -L "${active_unit}" ]] || failed=1
  else
    [[ "${effective_fragment}" == "${active_unit}" && -f "${active_unit}" && ! -L "${active_unit}" ]] ||
      failed=1
    restored_hash="$(sha256sum "${active_unit}" 2>/dev/null | awk '{print $1}')"
    [[ "${restored_hash}" == "${planned_current_unit_hash}" ]] || failed=1
  fi
  restored_enabled="$(systemctl is-enabled "${unit}" 2>/dev/null || true)"
  if [[ "${planned_enabled}" == enabled ]]; then
    [[ "${restored_enabled}" == enabled ]] || failed=1
  elif [[ "${planned_enabled}" == disabled ]]; then
    [[ "${restored_enabled}" == disabled ]] || failed=1
  else
    [[ "${planned_current_unit_hash}" == none && "${restored_enabled}" != enabled ]] || failed=1
  fi
  restored_active="$(systemctl is-active "${unit}" 2>/dev/null || true)"
  if [[ "${planned_active}" == active ]]; then
    [[ "${restored_active}" == active ]] || failed=1
  else
    case "${restored_active}" in
      inactive) ;;
      unknown|"")
        [[ "${planned_current_unit_hash}" == none ]] || failed=1
        ;;
      *) failed=1 ;;
    esac
  fi
  if [[ "${planned_active}" == active ]]; then
    restored_pid="$(systemctl show "${unit}" --property=MainPID --value 2>/dev/null || true)"
    [[ "${restored_pid}" =~ ^[0-9]+$ && "${restored_pid}" -ge 2 ]] || failed=1
    assert_expected_listener "${restored_pid}" >/dev/null 2>&1 || failed=1
    run_business_health >/dev/null 2>&1 || failed=1
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
  [[ ! -e "${temporary_unit}" && ! -L "${temporary_unit}" ]] || rm -f -- "${temporary_unit}"
  [[ ! -e "${restore_temporary}" && ! -L "${restore_temporary}" ]] || rm -f -- "${restore_temporary}"
  if [[ "${state_changed}" == true && "${transaction_complete}" == false ]]; then
    (( status != 0 )) || status=74
    if restore_previous_state; then
      echo "${program_name}: ${action} failed; the selected unit/enable/active state was restored" >&2
    else
      echo "${program_name}: P0 ${action} and automatic single-service restoration both failed; inspect ${audit_dir}" >&2
      status=74
    fi
  fi
  [[ ! -e "${restore_temporary}" && ! -L "${restore_temporary}" ]] || rm -f -- "${restore_temporary}"
  exit "${status}"
}
trap cleanup_transaction EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

validate_dependency_state
[[ "${dependency_state_hash}" == "${planned_dependency_hash}" ]] ||
  fail "dependency isolation state changed before commit"

if [[ "${planned_candidate_absent}" == true ]]; then
  [[ "${planned_current_unit_hash}" != none && -f "${active_unit}" &&
     ! -L "${active_unit}" &&
     "$(sha256sum "${active_unit}" | awk '{print $1}')" == "${planned_current_unit_hash}" ]] ||
    fail "current unit changed before absence rollback"
  state_changed=true
  systemctl stop "${unit}"
  systemctl disable "${unit}" >/dev/null
  rm -- "${active_unit}"
  systemctl daemon-reload
else
  [[ ! -e "${temporary_unit}" && ! -L "${temporary_unit}" ]] ||
    fail "temporary unit path already exists"
  install -o root -g root -m 0644 "${candidate}" "${temporary_unit}"
  [[ "$(sha256sum "${temporary_unit}" | awk '{print $1}')" == "${planned_candidate_hash}" ]] ||
    fail "candidate changed during atomic unit installation"
  state_changed=true
  mv -Tf -- "${temporary_unit}" "${active_unit}"
  systemctl daemon-reload
  if [[ "${planned_desired_enabled}" == enabled ]]; then
    systemctl enable "${unit}" >/dev/null
  else
    systemctl disable "${unit}" >/dev/null
  fi
  if [[ "${planned_desired_active}" == active ]]; then
    systemctl restart "${unit}"
  else
    systemctl stop "${unit}"
  fi
fi
verify_selected_service

printf '%s\n' "activated_at=$(date -u +%Y%m%dT%H%M%SZ)" >> "${audit_dir}/record"
transaction_complete=true
trap - EXIT HUP INT TERM
echo "${action^}d ${space}/${unit}; the requested unit/enable/active state passed verification."
echo "No other business unit, release link, Caddy, DNS, MX or Secret file was directly changed."
