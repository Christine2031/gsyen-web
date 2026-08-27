#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"

usage() {
  echo "Usage: ${program_name} {gsyen|halfsphere} CONFIG_FILE --apply" >&2
}

if [[ $# -ne 3 || "$3" != --apply ]]; then
  usage
  exit 64
fi
(( EUID == 0 )) || {
  echo "${program_name}: backup must run as root" >&2
  exit 77
}

readonly space="$1"
readonly config_file="$2"
case "${space}" in
  gsyen|halfsphere) ;;
  *) usage; exit 64 ;;
esac
readonly space_root="/srv/${space}"
readonly backup_root="${space_root}/backups"
readonly pre_hook="${space_root}/config/backup.d/pre-backup"

for command_name in age zstd tar sha256sum flock install mktemp find findmnt du df awk stat python3; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "${program_name}: required command not found: ${command_name}" >&2
    exit 69
  }
done

for path in "${space_root}" "${space_root}/apps" "${space_root}/config" \
            "${space_root}/data" "${backup_root}"; do
  [[ -d "${path}" && ! -L "${path}" ]] || {
    echo "${program_name}: expected regular directory: ${path}" >&2
    exit 66
  }
done
[[ -f "${config_file}" && ! -L "${config_file}" ]] || {
  echo "${program_name}: regular config file required: ${config_file}" >&2
  exit 66
}
config_owner="$(stat -c '%u' "${config_file}")"
config_mode="$(stat -c '%a' "${config_file}")"
[[ "${config_owner}" == 0 && "${config_mode}" =~ ^[0-7][0145][0145]$ ]] || {
  echo "${program_name}: config must be root-owned and not group/world-writable" >&2
  exit 77
}

age_recipient_file=""
minimum_free_bytes=""
max_restore_tar_bytes=""
max_archive_members=""
seen_age_recipient=false
seen_minimum_free=false
seen_max_restore_tar=false
seen_max_archive_members=false
while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ -z "${line//[[:space:]]/}" || "${line}" == \#* ]] && continue
  case "${line}" in
    AGE_RECIPIENT_FILE=*)
      [[ "${seen_age_recipient}" == false ]] || {
        echo "${program_name}: duplicate AGE_RECIPIENT_FILE" >&2
        exit 65
      }
      seen_age_recipient=true
      age_recipient_file="${line#AGE_RECIPIENT_FILE=}"
      ;;
    MINIMUM_FREE_BYTES=*)
      [[ "${seen_minimum_free}" == false ]] || {
        echo "${program_name}: duplicate MINIMUM_FREE_BYTES" >&2
        exit 65
      }
      seen_minimum_free=true
      minimum_free_bytes="${line#MINIMUM_FREE_BYTES=}"
      ;;
    MAX_RESTORE_TAR_BYTES=*)
      [[ "${seen_max_restore_tar}" == false ]] || {
        echo "${program_name}: duplicate MAX_RESTORE_TAR_BYTES" >&2
        exit 65
      }
      seen_max_restore_tar=true
      max_restore_tar_bytes="${line#MAX_RESTORE_TAR_BYTES=}"
      ;;
    MAX_ARCHIVE_MEMBERS=*)
      [[ "${seen_max_archive_members}" == false ]] || {
        echo "${program_name}: duplicate MAX_ARCHIVE_MEMBERS" >&2
        exit 65
      }
      seen_max_archive_members=true
      max_archive_members="${line#MAX_ARCHIVE_MEMBERS=}"
      ;;
    *)
      echo "${program_name}: unsupported backup config key" >&2
      exit 65
      ;;
  esac
done < "${config_file}"

[[ "${minimum_free_bytes}" =~ ^[0-9]+$ &&
   "${max_restore_tar_bytes}" =~ ^[0-9]+$ &&
   "${max_archive_members}" =~ ^[0-9]+$ ]] || {
  echo "${program_name}: all backup capacity limits must be explicit integers" >&2
  exit 65
}
(( minimum_free_bytes >= 5 * 1024 * 1024 * 1024 &&
   max_restore_tar_bytes >= 1024 * 1024 &&
   max_restore_tar_bytes <= 80 * 1024 * 1024 * 1024 &&
   max_archive_members >= 1000 && max_archive_members <= 1000000 )) || {
  echo "${program_name}: backup capacity limits are outside reviewed safety bounds" >&2
  exit 65
}

[[ "${age_recipient_file}" = /* && -s "${age_recipient_file}" && ! -L "${age_recipient_file}" ]] || {
  echo "${program_name}: AGE_RECIPIENT_FILE must name a nonempty absolute regular file" >&2
  exit 65
}
recipient_owner="$(stat -c '%u' "${age_recipient_file}")"
recipient_mode="$(stat -c '%a' "${age_recipient_file}")"
[[ "${recipient_owner}" == 0 && "${recipient_mode}" =~ ^[0-7][0145][0145]$ ]] || {
  echo "${program_name}: age recipient file must be root-owned and not group/world-writable" >&2
  exit 77
}
[[ -x "${pre_hook}" && ! -L "${pre_hook}" ]] || {
  echo "${program_name}: reviewed consistency hook is required: ${pre_hook}" >&2
  exit 78
}

protected_roots=("${space_root}/apps" "${space_root}/config" "${space_root}/data")
archive_paths=(apps config data)
if [[ "${space}" == gsyen && -e "${space_root}/stalwart" ]]; then
  [[ -d "${space_root}/stalwart" && ! -L "${space_root}/stalwart" ]] || {
    echo "${program_name}: legacy Stalwart path is not a real directory" >&2
    exit 78
  }
  protected_roots+=("${space_root}/stalwart")
  archive_paths+=(stalwart)
fi
if [[ "${space}" == gsyen && -L "${space_root}/apps/stalwart/current" ]]; then
  [[ -d "${space_root}/config/stalwart" && ! -L "${space_root}/config/stalwart" &&
     -f "${space_root}/config/stalwart/stalwart.env" &&
     ! -L "${space_root}/config/stalwart/stalwart.env" &&
     -d "${space_root}/data/stalwart" && ! -L "${space_root}/data/stalwart" ]] || {
    echo "${program_name}: deployed Stalwart is missing an explicit recoverable path" >&2
    exit 78
  }
fi

# GNU tar --one-file-system intentionally omits descendants mounted from a
# different filesystem. Silently producing such an archive would be worse than
# failing, so any mount at or below a protected tree needs a separate reviewed
# snapshot/export plan before this generic backup may run.
mount_targets="$(findmnt --kernel --raw --noheadings --output TARGET)" || {
  echo "${program_name}: cannot inventory protected-tree mount points" >&2
  exit 74
}
while IFS= read -r mount_target; do
  [[ -n "${mount_target}" ]] || continue
  for protected_root in "${protected_roots[@]}"; do
    case "${mount_target}" in
      "${protected_root}"|"${protected_root}/"*)
        echo "${program_name}: protected tree has a separate mount requiring an explicit backup plan: ${mount_target}" >&2
        exit 78
        ;;
    esac
  done
done <<< "${mount_targets}"

if special_file="$(find "${protected_roots[@]}" \
  \( -type b -o -type c -o -type p \) -print -quit)" && [[ -n "${special_file}" ]]; then
  echo "${program_name}: special file must be quiesced or excluded before backup: ${special_file}" >&2
  exit 78
fi
python3 "$(dirname "$0")/validate-backup-symlinks.py" \
  "${space_root}" "${protected_roots[@]}" >/dev/null
hook_owner="$(stat -c '%u' "${pre_hook}")"
hook_mode="$(stat -c '%a' "${pre_hook}")"
[[ "${hook_owner}" == 0 && "${hook_mode}" =~ ^[1357][0145][0145]$ ]] || {
  echo "${program_name}: pre-backup hook must be root-owned and not group/world-writable" >&2
  exit 77
}

umask 077
exec 9>"/run/lock/gsyen-aliyun-backup-${space}.lock"
flock -n 9 || {
  echo "${program_name}: another ${space} backup is running" >&2
  exit 75
}
if [[ -n "${GSYEN_STORAGE_LOCK_FD:-}" ]]; then
  [[ "${GSYEN_STORAGE_LOCK_FD}" =~ ^[3-9]$ &&
     -e "/proc/self/fd/${GSYEN_STORAGE_LOCK_FD}" ]] || {
    echo "${program_name}: invalid inherited host storage lock" >&2
    exit 75
  }
  flock -n "${GSYEN_STORAGE_LOCK_FD}" || {
    echo "${program_name}: inherited host storage lock is not held" >&2
    exit 75
  }
else
  exec 8>"/run/lock/gsyen-aliyun-storage-capacity.lock"
  flock -n 8 || {
    echo "${program_name}: another host storage operation is running" >&2
    exit 75
  }
fi

readonly timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
readonly destination_dir="${backup_root}/${timestamp}"
[[ ! -e "${destination_dir}" ]] || {
  echo "${program_name}: backup destination already exists: ${destination_dir}" >&2
  exit 73
}
readonly staging_dir="$(mktemp -d "${backup_root}/.staging-${timestamp}.XXXXXX")"
readonly temporary_archive="${staging_dir}/${space}-${timestamp}.tar.zst.age"
cleanup() {
  rm -rf -- "${staging_dir}"
}
trap cleanup EXIT

install -d -m 0700 "${staging_dir}/exports"
env -i \
  PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  BACKUP_SPACE="${space}" \
  BACKUP_SPACE_ROOT="${space_root}" \
  BACKUP_STAGING_DIR="${staging_dir}" \
  "${pre_hook}"

[[ -f "${staging_dir}/consistency-confirmed" && ! -L "${staging_dir}/consistency-confirmed" ]] || {
  echo "${program_name}: consistency hook did not create consistency-confirmed" >&2
  exit 78
}

python3 "$(dirname "$0")/verify-release-inventory.py" create "${space}" \
  "${space_root}/apps" "${staging_dir}/exports/release-inventory.json" --owner-check >/dev/null
python3 "$(dirname "$0")/content_inventory.py" create "${space}" \
  "${space_root}" "${staging_dir}/exports/content-inventory.json" >/dev/null

source_bytes="$(du -scx --apparent-size -B1 -- "${protected_roots[@]}" "${staging_dir}/exports" | awk 'END {print $1}')"
available_bytes="$(df -P -B1 -- "${backup_root}" | awk 'NR == 2 {print $4}')"
[[ "${source_bytes}" =~ ^[0-9]+$ && "${available_bytes}" =~ ^[0-9]+$ ]] || {
  echo "${program_name}: cannot determine backup disk-space requirement" >&2
  exit 74
}
required_bytes=$((source_bytes * 2 + minimum_free_bytes))
if (( source_bytes > max_restore_tar_bytes || required_bytes > available_bytes )); then
  echo "${program_name}: backup exceeds the configured restore limit or would consume host reserve" >&2
  exit 74
fi

tar --create --one-file-system --acls --xattrs \
  --directory "${space_root}" "${archive_paths[@]}" \
  --directory "${staging_dir}" exports \
  | zstd --quiet --threads=0 \
  | age --recipients-file "${age_recipient_file}" --output "${temporary_archive}"

[[ -s "${temporary_archive}" ]] || {
  echo "${program_name}: encrypted archive was not created" >&2
  exit 74
}

# Recompute both inventories after tar has consumed every source path. The
# encrypted package carries the pre-read manifests; restore also hashes package
# members against them, so a mid-archive mutation cannot silently pass.
python3 "$(dirname "$0")/content_inventory.py" verify "${space}" \
  "${space_root}" "${staging_dir}/exports/content-inventory.json" >/dev/null
python3 "$(dirname "$0")/verify-release-inventory.py" verify "${space}" \
  "${space_root}/apps" "${staging_dir}/exports/release-inventory.json" --owner-check >/dev/null
python3 "$(dirname "$0")/validate-backup-symlinks.py" \
  "${space_root}" "${protected_roots[@]}" >/dev/null

install -d -m 0700 "${destination_dir}"
install -m 0600 "${temporary_archive}" "${destination_dir}/$(basename "${temporary_archive}")"
(
  cd "${destination_dir}"
  sha256sum "$(basename "${temporary_archive}")" > "$(basename "${temporary_archive}").sha256"
)
chmod 0600 "${destination_dir}/$(basename "${temporary_archive}").sha256"
touch "${destination_dir}/LOCAL_ARCHIVE_COMPLETE"
chmod 0600 "${destination_dir}/LOCAL_ARCHIVE_COMPLETE"
printf '%s\n' \
  'An independently verified off-host copy has not been performed by this script.' \
  > "${destination_dir}/OFFHOST_COPY_REQUIRED"
chmod 0600 "${destination_dir}/OFFHOST_COPY_REQUIRED"

echo "Encrypted ${space} backup completed: ${destination_dir}/$(basename "${temporary_archive}")"
echo "This is only a local encrypted archive. No retention, off-host copy or off-host restore verification was performed."
