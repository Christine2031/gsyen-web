#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"
readonly deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly approval_file="/etc/gsyen-aliyun/prechange-approved"
readonly systemd_dir="/etc/systemd/system"
readonly libexec_dir="/usr/local/libexec/gsyen-aliyun"
readonly config_dir="/etc/gsyen-aliyun"
readonly lock_file="/run/gsyen-aliyun-foundation.lock"

usage() {
  cat >&2 <<EOF
Usage: ${program_name} --check | --apply

--check performs local template validation only.
--apply changes the current host and therefore requires root plus the root-owned,
nonempty marker ${approval_file}. The marker means snapshot and file-backup
evidence has been reviewed. This script never enables or starts services and
never activates a Caddy fragment.
EOF
}

mode="${1:-}"
[[ $# -eq 1 && ( "${mode}" == --check || "${mode}" == --apply ) ]] || {
  usage
  exit 64
}

required=(
  systemd/gsyen.slice
  systemd/halfsphere.slice
  systemd/halfsphere-web.service
  systemd/halfsphere-api.service
  sysusers.d/gsyen.conf
  sysusers.d/halfsphere.conf
  tmpfiles.d/gsyen.conf
  tmpfiles.d/halfsphere.conf
  libexec/assert-loopback-listener.sh
  libexec/healthcheck-space.sh
  libexec/backup-space.sh
  libexec/validate-backup-symlinks.py
  libexec/content_inventory.py
  libexec/apply-tar-symbolic-owners.py
  libexec/restore-space.sh
  libexec/stage-release.sh
  libexec/promote-release.sh
  libexec/activate-systemd-service.sh
  libexec/rollback-systemd-service.sh
  libexec/model_dataset_transaction.py
  libexec/stage-model-dataset.sh
  libexec/activate-model-dataset.sh
  libexec/promote-model-dataset.sh
  libexec/rollback-model-dataset.sh
  libexec/validate-tar-archive.py
  libexec/validate-release-tree.py
  libexec/validate-stalwart-release.py
  libexec/validate-resource-boundaries.py
  libexec/validate-boundary-gate.sh
  libexec/verify-release-inventory.py
  libexec/activate-caddy-fragment.sh
  libexec/rollback-caddy-fragment.sh
  libexec/validate-env-file.sh
  systemd/stalwart.service
  stalwart/STALWART_RELEASE.json.example
  stalwart/stalwart.env.example
  release/BUILD.json.example
  network/firewall-security-group.desired.tsv
)
for relative in "${required[@]}"; do
  [[ -s "${deploy_dir}/${relative}" ]] || {
    echo "${program_name}: missing template ${relative}" >&2
    exit 66
  }
done

for script in "${deploy_dir}"/*.sh "${deploy_dir}"/libexec/*.sh; do
  bash -n "${script}"
done
for python_file in "${deploy_dir}"/libexec/*.py; do
  python3 -c 'import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_text(), sys.argv[1], "exec")' \
    "${python_file}"
done

if [[ "${mode}" == --check ]]; then
  echo "Foundation templates passed shell syntax and completeness checks."
  exit 0
fi

(( EUID == 0 )) || {
  echo "${program_name}: --apply must run as root" >&2
  exit 77
}

for command_name in install cmp cp stat chmod mv flock mktemp date id basename dirname \
  systemd-sysusers systemd-tmpfiles systemctl; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "${program_name}: required command not found: ${command_name}" >&2
    exit 69
  }
done

install_with_backup() {
  local source="$1"
  local destination="$2"
  local mode_bits="$3"
  local relative_backup

  if [[ -L "${destination}" ]]; then
    echo "${program_name}: refusing to replace symlink ${destination}" >&2
    exit 73
  fi
  if [[ -f "${destination}" ]] && cmp -s "${source}" "${destination}"; then
    return 0
  fi
  if [[ -e "${destination}" ]]; then
    relative_backup="${destination#/}"
    install -d -m 0700 "${backup_dir}/$(dirname "${relative_backup}")"
    cp -a -- "${destination}" "${backup_dir}/${relative_backup}"
  fi
  install -D -m "${mode_bits}" "${source}" "${destination}"
}

ensure_root_private_directory() {
  local directory="$1"
  local owner mode_bits

  if [[ -L "${directory}" || ( -e "${directory}" && ! -d "${directory}" ) ]]; then
    echo "${program_name}: refusing unsafe approval directory ${directory}" >&2
    exit 73
  fi
  if [[ -d "${directory}" ]]; then
    stat --format='%n|%U|%G|%a|%F' "${directory}" \
      >> "${backup_dir}/approval-directory-metadata.txt"
    chmod 0600 "${backup_dir}/approval-directory-metadata.txt"
    owner="$(stat -c '%U:%G' "${directory}")"
    mode_bits="$(stat -c '%a' "${directory}")"
    [[ "${owner}" == root:root && "${mode_bits}" == 700 ]] || {
      echo "${program_name}: existing approval directory must already be root:root mode 0700: ${directory}" >&2
      exit 77
    }
    return 0
  fi
  install -d -o root -g root -m 0700 -- "${directory}"
  owner="$(stat -c '%U:%G' "${directory}")"
  mode_bits="$(stat -c '%a' "${directory}")"
  [[ "${owner}" == root:root && "${mode_bits}" == 700 ]] || {
    echo "${program_name}: approval directory is not root:root mode 0700: ${directory}" >&2
    exit 77
  }
}

ensure_root_directory() {
  local directory="$1"
  local expected_mode="$2"
  local owner mode_bits

  if [[ -L "${directory}" || ( -e "${directory}" && ! -d "${directory}" ) ]]; then
    echo "${program_name}: refusing unsafe managed directory ${directory}" >&2
    exit 73
  fi
  if [[ -d "${directory}" ]]; then
    owner="$(stat -c '%U:%G' "${directory}")"
    mode_bits="$(stat -c '%a' "${directory}")"
    [[ "${owner}" == root:root && "${mode_bits}" == "${expected_mode}" ]] || {
      echo "${program_name}: existing managed directory must be root:root mode ${expected_mode}: ${directory}" >&2
      exit 77
    }
    return 0
  fi
  install -d -o root -g root -m "0${expected_mode}" -- "${directory}"
}

validate_existing_tmpfiles_paths() {
  local definition entry_type path expected_mode expected_user expected_group age argument extra
  local actual_mode actual_owner actual_group

  for definition in "$@"; do
    while read -r entry_type path expected_mode expected_user expected_group age argument extra; do
      [[ -z "${entry_type:-}" || "${entry_type}" == \#* ]] && continue
      [[ "${entry_type}" == d && -n "${path:-}" && -z "${extra:-}" ]] || {
        echo "${program_name}: unsupported tmpfiles entry in ${definition}" >&2
        exit 65
      }
      if [[ -L "${path}" || ( -e "${path}" && ! -d "${path}" ) ]]; then
        echo "${program_name}: existing tmpfiles target is unsafe: ${path}" >&2
        exit 73
      fi
      [[ -d "${path}" ]] || continue
      actual_mode="$(stat -c '%a' "${path}")"
      actual_owner="$(stat -c '%U' "${path}")"
      actual_group="$(stat -c '%G' "${path}")"
      expected_mode="${expected_mode#0}"
      [[ "${actual_mode}" == "${expected_mode}" &&
         "${actual_owner}" == "${expected_user}" &&
         "${actual_group}" == "${expected_group}" ]] || {
        echo "${program_name}: existing directory metadata differs from the reviewed tmpfiles contract: ${path}" >&2
        echo "${program_name}: stop for an approved data-layout remediation; permissions were not changed" >&2
        exit 78
      }
    done < "${definition}"
  done
}

validate_configuration_root() {
  local owner mode_bits

  if [[ -L "${config_dir}" || ( -e "${config_dir}" && ! -d "${config_dir}" ) ]]; then
    echo "${program_name}: refusing unsafe configuration root ${config_dir}" >&2
    exit 73
  fi
  [[ -d "${config_dir}" ]] || {
    echo "${program_name}: configuration root is absent; create the reviewed approval marker safely before apply" >&2
    exit 77
  }
  owner="$(stat -c '%U:%G' "${config_dir}")"
  mode_bits="$(stat -c '%a' "${config_dir}")"
  [[ "${owner}" == root:root && $(( 8#${mode_bits} & 8#022 )) -eq 0 ]] || {
    echo "${program_name}: configuration root must be root:root and not group/world-writable" >&2
    exit 77
  }
}

validate_approval_marker() {
  local owner mode_bits link_count

  [[ -f "${approval_file}" && -s "${approval_file}" && ! -L "${approval_file}" ]] || {
    echo "${program_name}: missing regular, nonempty approval marker ${approval_file}" >&2
    exit 77
  }
  owner="$(stat -c '%u' "${approval_file}")"
  mode_bits="$(stat -c '%a' "${approval_file}")"
  link_count="$(stat -c '%h' "${approval_file}")"
  [[ "${owner}" == 0 && "${mode_bits}" =~ ^[46]00$ && "${link_count}" == 1 ]] || {
    echo "${program_name}: approval marker must be root-owned, singly linked and mode 0400 or 0600" >&2
    exit 77
  }
}

validate_existing_account_contract() {
  local account_group account expected_group isolated_user

  for account_group in \
    gsyen:gsyen \
    gsyen-mail:gsyen-mail \
    stalwart:stalwart \
    halfsphere:halfsphere; do
    account="${account_group%%:*}"
    expected_group="${account_group##*:}"
    if id -u "${account}" >/dev/null 2>&1 &&
       [[ "$(id -gn "${account}")" != "${expected_group}" ]]; then
      echo "${program_name}: existing ${account} account has an unexpected primary group" >&2
      exit 78
    fi
  done
  for isolated_user in gsyen-mail stalwart; do
    if id -u "${isolated_user}" >/dev/null 2>&1; then
      case " $(id -nG "${isolated_user}") " in
        *' gsyen '*)
          echo "${program_name}: ${isolated_user} already has broad gsyen group access; remove it in an approved identity change before foundation apply" >&2
          exit 78
          ;;
      esac
    fi
  done
  if id -u gsyen >/dev/null 2>&1 && id -u halfsphere >/dev/null 2>&1 &&
     [[ "$(id -u gsyen)" == "$(id -u halfsphere)" ]]; then
    echo "${program_name}: GSYEN and HalfSphere must not share a UID" >&2
    exit 78
  fi
}

validate_trusted_system_directory() {
  local directory="$1"
  local mode_bits

  [[ -d "${directory}" && ! -L "${directory}" ]] || {
    echo "${program_name}: required system directory is absent or unsafe: ${directory}" >&2
    exit 73
  }
  mode_bits="$(stat -c '%a' "${directory}")"
  [[ "$(stat -c '%u' "${directory}")" == 0 &&
     $(( 8#${mode_bits} & 8#022 )) -eq 0 ]] || {
    echo "${program_name}: required system directory must be root-owned and not group/world-writable: ${directory}" >&2
    exit 77
  }
}

validate_optional_trusted_system_directory() {
  local directory="$1"

  if [[ -e "${directory}" || -L "${directory}" ]]; then
    validate_trusted_system_directory "${directory}"
  fi
}

validate_root_directory_contract() {
  local directory="$1"
  local expected_mode="$2"
  local owner mode_bits

  if [[ -L "${directory}" || ( -e "${directory}" && ! -d "${directory}" ) ]]; then
    echo "${program_name}: refusing unsafe managed directory ${directory}" >&2
    exit 73
  fi
  [[ -d "${directory}" ]] || return 0
  owner="$(stat -c '%U:%G' "${directory}")"
  mode_bits="$(stat -c '%a' "${directory}")"
  [[ "${owner}" == root:root && "${mode_bits}" == "${expected_mode}" ]] || {
    echo "${program_name}: existing managed directory must be root:root mode ${expected_mode}: ${directory}" >&2
    exit 77
  }
}

validate_install_destination() {
  local destination="$1"
  local owner mode_bits link_count

  if [[ -L "${destination}" || ( -e "${destination}" && ! -f "${destination}" ) ]]; then
    echo "${program_name}: refusing unsafe managed file destination ${destination}" >&2
    exit 73
  fi
  [[ -f "${destination}" ]] || return 0
  owner="$(stat -c '%u' "${destination}")"
  mode_bits="$(stat -c '%a' "${destination}")"
  link_count="$(stat -c '%h' "${destination}")"
  [[ "${owner}" == 0 && $(( 8#${mode_bits} & 8#022 )) -eq 0 && "${link_count}" == 1 ]] || {
    echo "${program_name}: existing managed file must be root-owned, singly linked and not group/world-writable: ${destination}" >&2
    exit 77
  }
}

validate_source_files() {
  local label="$1"
  local source
  shift

  (( $# > 0 )) || {
    echo "${program_name}: no ${label} sources were found" >&2
    exit 66
  }
  for source in "$@"; do
    [[ -f "${source}" && -s "${source}" && ! -L "${source}" ]] || {
      echo "${program_name}: unsafe or missing ${label} source ${source}" >&2
      exit 66
    }
  done
}

validate_lock_file() {
  local owner mode_bits link_count

  if [[ -L "${lock_file}" || ( -e "${lock_file}" && ! -f "${lock_file}" ) ]]; then
    echo "${program_name}: refusing unsafe lock file ${lock_file}" >&2
    exit 73
  fi
  [[ -f "${lock_file}" ]] || return 0
  owner="$(stat -c '%u' "${lock_file}")"
  mode_bits="$(stat -c '%a' "${lock_file}")"
  link_count="$(stat -c '%h' "${lock_file}")"
  [[ "${owner}" == 0 && $(( 8#${mode_bits} & 8#022 )) -eq 0 && "${link_count}" == 1 ]] || {
    echo "${program_name}: existing lock file must be root-owned, singly linked and not group/world-writable" >&2
    exit 77
  }
}

run_apply_preflight() {
  local source unit_name example_name
  local -a libexec_sources=("${deploy_dir}"/libexec/*)
  local -a unit_sources=(
    "${deploy_dir}"/systemd/*.service
    "${deploy_dir}"/systemd/*.timer
    "${deploy_dir}"/systemd/*.slice
  )
  local -a healthcheck_sources=("${deploy_dir}"/healthchecks/*.example)
  local -a caddy_sources=("${deploy_dir}"/caddy/*.template)
  local -a backup_sources=("${deploy_dir}"/backup/*.conf.example)
  local -a logrotate_sources=("${deploy_dir}"/logrotate.d/*)
  local -a resource_sources=("${deploy_dir}"/resources/*.example)
  local -a env_sources=(
    "${deploy_dir}"/env/*.env.example
    "${deploy_dir}/mail-ingest/mail-ingest.env.example"
    "${deploy_dir}/stalwart/stalwart.env.example"
  )
  local -a approval_directories=(
    "${config_dir}/release-approvals"
    "${config_dir}/release-approvals/gsyen"
    "${config_dir}/release-approvals/gsyen/gsyen-web"
    "${config_dir}/release-approvals/gsyen/gsyen-api"
    "${config_dir}/release-approvals/gsyen/sgsyen-web"
    "${config_dir}/release-approvals/gsyen/sgsyen-api"
    "${config_dir}/release-approvals/gsyen/gsyen-model"
    "${config_dir}/release-approvals/gsyen/mail-ingest"
    "${config_dir}/release-approvals/gsyen/stalwart"
    "${config_dir}/release-approvals/halfsphere"
    "${config_dir}/release-approvals/halfsphere/halfsphere-web"
    "${config_dir}/release-approvals/halfsphere/halfsphere-api"
    "${config_dir}/systemd-approvals"
    "${config_dir}/systemd-approvals/gsyen"
    "${config_dir}/systemd-approvals/halfsphere"
    "${config_dir}/model-data-approvals"
    "${config_dir}/caddy-approvals"
  )
  local -a managed_directories=(
    "/var/backups/gsyen-aliyun-foundation:700"
    "/var/backups/gsyen-aliyun-model-data:700"
    "${libexec_dir}:755"
    "${config_dir}/systemd-available:755"
    "${config_dir}/healthchecks:755"
    "${config_dir}/caddy-available:755"
    "${config_dir}/caddy-active:755"
    "${config_dir}/locks:700"
    "${config_dir}/backup:755"
    "${config_dir}/logrotate-available:755"
    "${config_dir}/resources:755"
    "${config_dir}/network-desired:755"
    "${config_dir}/release-examples:755"
    "${config_dir}/env-examples:755"
  )
  local directory_contract directory expected_mode

  validate_configuration_root
  validate_approval_marker
  validate_existing_account_contract
  validate_trusted_system_directory /run
  validate_trusted_system_directory /var/backups
  validate_trusted_system_directory /usr/local
  validate_optional_trusted_system_directory /usr/local/libexec
  validate_trusted_system_directory /usr/lib/sysusers.d
  validate_trusted_system_directory /usr/lib/tmpfiles.d
  validate_trusted_system_directory "${systemd_dir}"
  validate_lock_file

  systemd-sysusers --dry-run \
    "${deploy_dir}/sysusers.d/gsyen.conf" \
    "${deploy_dir}/sysusers.d/halfsphere.conf" >/dev/null
  validate_existing_tmpfiles_paths \
    "${deploy_dir}/tmpfiles.d/gsyen.conf" \
    "${deploy_dir}/tmpfiles.d/halfsphere.conf"

  for directory_contract in "${managed_directories[@]}"; do
    directory="${directory_contract%:*}"
    expected_mode="${directory_contract##*:}"
    validate_root_directory_contract "${directory}" "${expected_mode}"
  done
  for directory in "${approval_directories[@]}"; do
    validate_root_directory_contract "${directory}" 700
  done

  validate_source_files "libexec" "${libexec_sources[@]}"
  validate_source_files "systemd unit" "${unit_sources[@]}"
  validate_source_files "health-check" "${healthcheck_sources[@]}"
  validate_source_files "Caddy" "${caddy_sources[@]}"
  validate_source_files "backup configuration" "${backup_sources[@]}"
  validate_source_files "logrotate" "${logrotate_sources[@]}"
  validate_source_files "resource contract" "${resource_sources[@]}"
  validate_source_files "environment example" "${env_sources[@]}"
  validate_source_files "sysusers" \
    "${deploy_dir}/sysusers.d/gsyen.conf" \
    "${deploy_dir}/sysusers.d/halfsphere.conf"
  validate_source_files "tmpfiles" \
    "${deploy_dir}/tmpfiles.d/gsyen.conf" \
    "${deploy_dir}/tmpfiles.d/halfsphere.conf"
  validate_source_files "network desired state" \
    "${deploy_dir}/network/firewall-security-group.desired.tsv"
  validate_source_files "release manifest example" \
    "${deploy_dir}/release/BUILD.json.example"

  validate_install_destination /usr/lib/sysusers.d/gsyen-migration.conf
  validate_install_destination /usr/lib/sysusers.d/halfsphere-migration.conf
  validate_install_destination /usr/lib/tmpfiles.d/gsyen-migration.conf
  validate_install_destination /usr/lib/tmpfiles.d/halfsphere-migration.conf
  for source in "${libexec_sources[@]}"; do
    validate_install_destination "${libexec_dir}/$(basename "${source}")"
  done
  for source in "${unit_sources[@]}"; do
    unit_name="$(basename "${source}")"
    case "${unit_name}" in
      *.slice) validate_install_destination "${systemd_dir}/${unit_name}" ;;
      *) validate_install_destination "${config_dir}/systemd-available/${unit_name}" ;;
    esac
  done
  for source in "${healthcheck_sources[@]}"; do
    validate_install_destination "${config_dir}/healthchecks/$(basename "${source}")"
  done
  for source in "${caddy_sources[@]}"; do
    validate_install_destination "${config_dir}/caddy-available/$(basename "${source}")"
  done
  for source in "${backup_sources[@]}"; do
    validate_install_destination "${config_dir}/backup/$(basename "${source}")"
  done
  for source in "${logrotate_sources[@]}"; do
    validate_install_destination "${config_dir}/logrotate-available/$(basename "${source}")"
  done
  for source in "${resource_sources[@]}"; do
    validate_install_destination "${config_dir}/resources/$(basename "${source}")"
  done
  validate_install_destination "${config_dir}/network-desired/firewall-security-group.desired.tsv"
  validate_install_destination "${config_dir}/release-examples/BUILD.json.example"
  for source in "${env_sources[@]}"; do
    example_name="$(basename "${source}")"
    validate_install_destination "${config_dir}/env-examples/${example_name}"
  done
}

# Every predictable, read-only apply check runs before this marker. The locked
# replay below protects against another installer changing state between the
# initial preflight and the first managed file/directory write.
run_apply_preflight # APPLY_PREFLIGHT_BEFORE_FIRST_WRITE
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
umask 077
# FIRST_SYSTEM_WRITE: create/open only the root-owned synchronization file.
exec 9>>"${lock_file}"
flock -n 9 || {
  echo "${program_name}: another foundation installation is running" >&2
  exit 75
}
run_apply_preflight # LOCKED_PREFLIGHT_BEFORE_MANAGED_WRITE

install -d -o root -g root -m 0700 /var/backups/gsyen-aliyun-foundation
backup_dir="$(mktemp -d "/var/backups/gsyen-aliyun-foundation/${timestamp}.XXXXXX")"
chmod 0700 "${backup_dir}"
for managed_path in /srv/gsyen /srv/halfsphere \
  /srv/gsyen/{apps,config,data,logs,backups} \
  /srv/halfsphere/{apps,config,data,logs,backups}; do
  if [[ -e "${managed_path}" && ! -L "${managed_path}" ]]; then
    stat --format='%n|%U|%G|%a|%F' "${managed_path}" >> "${backup_dir}/directory-metadata.txt"
  fi
done
if [[ -f "${backup_dir}/directory-metadata.txt" ]]; then
  chmod 0600 "${backup_dir}/directory-metadata.txt"
fi

install_with_backup "${deploy_dir}/sysusers.d/gsyen.conf" /usr/lib/sysusers.d/gsyen-migration.conf 0644
install_with_backup "${deploy_dir}/sysusers.d/halfsphere.conf" /usr/lib/sysusers.d/halfsphere-migration.conf 0644
systemd-sysusers /usr/lib/sysusers.d/gsyen-migration.conf /usr/lib/sysusers.d/halfsphere-migration.conf
[[ "$(id -gn gsyen)" == gsyen && "$(id -gn halfsphere)" == halfsphere &&
   "$(id -gn gsyen-mail)" == gsyen-mail && "$(id -gn stalwart)" == stalwart &&
   "$(id -u gsyen)" != "$(id -u halfsphere)" ]] || {
  echo "${program_name}: application identities are missing, shared or use unexpected primary groups" >&2
  exit 78
}
for service_user in gsyen gsyen-mail stalwart; do
  case " $(id -nG "${service_user}") " in
    *' gsyen-space '*) ;;
    *)
      echo "${program_name}: ${service_user} lacks the execute-only GSYEN traversal group" >&2
      exit 78
      ;;
  esac
done
for isolated_user in gsyen-mail stalwart; do
  case " $(id -nG "${isolated_user}") " in
    *' gsyen '*)
      echo "${program_name}: ${isolated_user} still has broad gsyen group access; remove it in an approved identity change" >&2
      exit 78
      ;;
  esac
done

install_with_backup "${deploy_dir}/tmpfiles.d/gsyen.conf" /usr/lib/tmpfiles.d/gsyen-migration.conf 0644
install_with_backup "${deploy_dir}/tmpfiles.d/halfsphere.conf" /usr/lib/tmpfiles.d/halfsphere-migration.conf 0644
systemd-tmpfiles --create /usr/lib/tmpfiles.d/gsyen-migration.conf /usr/lib/tmpfiles.d/halfsphere-migration.conf

ensure_root_directory "${libexec_dir}" 755
for script in "${deploy_dir}"/libexec/*; do
  install_with_backup "${script}" "${libexec_dir}/$(basename "${script}")" 0755
done
# Defense in depth for a non-cooperating process that changes the path after
# the locked preflight; the approval marker means this root must already exist.
validate_configuration_root
ensure_root_directory "${config_dir}/systemd-available" 755
for approval_directory in \
  "${config_dir}/release-approvals" \
  "${config_dir}/release-approvals/gsyen" \
  "${config_dir}/release-approvals/gsyen/gsyen-web" \
  "${config_dir}/release-approvals/gsyen/gsyen-api" \
  "${config_dir}/release-approvals/gsyen/sgsyen-web" \
  "${config_dir}/release-approvals/gsyen/sgsyen-api" \
  "${config_dir}/release-approvals/gsyen/gsyen-model" \
  "${config_dir}/release-approvals/gsyen/mail-ingest" \
  "${config_dir}/release-approvals/gsyen/stalwart" \
  "${config_dir}/release-approvals/halfsphere" \
  "${config_dir}/release-approvals/halfsphere/halfsphere-web" \
  "${config_dir}/release-approvals/halfsphere/halfsphere-api" \
  "${config_dir}/systemd-approvals" \
  "${config_dir}/systemd-approvals/gsyen" \
  "${config_dir}/systemd-approvals/halfsphere" \
  "${config_dir}/model-data-approvals"; do
  ensure_root_private_directory "${approval_directory}"
done
for unit in "${deploy_dir}"/systemd/*.{service,timer,slice}; do
  [[ -e "${unit}" ]] || continue
  unit_name="$(basename "${unit}")"
  case "${unit_name}" in
    *.slice)
      install_with_backup "${unit}" "${systemd_dir}/${unit_name}" 0644
      ;;
    *)
      # Application units remain candidates so an initial foundation run cannot
      # change what starts on the next ECS reboot.
      install_with_backup "${unit}" "${config_dir}/systemd-available/${unit_name}" 0644
      ;;
  esac
done

ensure_root_directory "${config_dir}/healthchecks" 755
ensure_root_directory "${config_dir}/caddy-available" 755
ensure_root_directory "${config_dir}/caddy-active" 755
ensure_root_private_directory "${config_dir}/caddy-approvals"
ensure_root_directory /var/backups/gsyen-aliyun-model-data 700
ensure_root_directory "${config_dir}/locks" 700
for example in "${deploy_dir}"/healthchecks/*.example; do
  install_with_backup "${example}" "${config_dir}/healthchecks/$(basename "${example}")" 0644
done
for template in "${deploy_dir}"/caddy/*.template; do
  install_with_backup "${template}" "${config_dir}/caddy-available/$(basename "${template}")" 0644
done
ensure_root_directory "${config_dir}/backup" 755
for example in "${deploy_dir}"/backup/*.conf.example; do
  install_with_backup "${example}" "${config_dir}/backup/$(basename "${example}")" 0644
done
ensure_root_directory "${config_dir}/logrotate-available" 755
for logrotate_config in "${deploy_dir}"/logrotate.d/*; do
  install_with_backup "${logrotate_config}" \
    "${config_dir}/logrotate-available/$(basename "${logrotate_config}")" 0644
done
ensure_root_directory "${config_dir}/resources" 755
for resource_contract in "${deploy_dir}"/resources/*.example; do
  install_with_backup "${resource_contract}" \
    "${config_dir}/resources/$(basename "${resource_contract}")" 0644
done
ensure_root_directory "${config_dir}/network-desired" 755
ensure_root_directory "${config_dir}/release-examples" 755
install_with_backup "${deploy_dir}/network/firewall-security-group.desired.tsv" \
  "${config_dir}/network-desired/firewall-security-group.desired.tsv" 0644
install_with_backup "${deploy_dir}/release/BUILD.json.example" \
  "${config_dir}/release-examples/BUILD.json.example" 0644
ensure_root_directory "${config_dir}/env-examples" 755
for env_example in "${deploy_dir}"/env/*.env.example \
  "${deploy_dir}"/mail-ingest/mail-ingest.env.example \
  "${deploy_dir}"/stalwart/stalwart.env.example; do
  install_with_backup "${env_example}" \
    "${config_dir}/env-examples/$(basename "${env_example}")" 0644
done

systemctl daemon-reload
mv -- "${approval_file}" "${backup_dir}/prechange-approved"
echo "Foundation installed. No service, timer, Caddy route, DNS or MX was enabled."
echo "Application units remain inactive candidates under ${config_dir}/systemd-available."
echo "Previous differing files, if any, are in ${backup_dir}."
echo "The one-time pre-change marker was archived there and must be recreated for another apply."
