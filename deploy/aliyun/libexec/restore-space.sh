#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"
readonly libexec_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat >&2 <<EOF
Usage: ${program_name} {gsyen|halfsphere} ARCHIVE AGE_IDENTITY_FILE BACKUP_CONFIG --apply

The script refuses active services, verifies the archive checksum, creates a
fresh encrypted pre-restore backup, restores apps/config/data, and leaves all
services stopped. It never changes DNS, Caddy, GCP, database endpoints or MX.
EOF
}

if [[ $# -ne 5 || "$5" != --apply ]]; then
  usage
  exit 64
fi
(( EUID == 0 )) || {
  echo "${program_name}: restore must run as root" >&2
  exit 77
}

readonly space="$1"
readonly archive="$2"
readonly identity_file="$3"
readonly backup_config="$4"
readonly restore_gate_dir="/etc/gsyen-aliyun/locks"
readonly restore_gate="${restore_gate_dir}/${space}-restore-in-progress"
case "${space}" in
  gsyen)
    units=(gsyen-web gsyen-api sgsyen-web gsyen-model sgsyen-api gsyen-mail-ingest stalwart)
    ;;
  halfsphere)
    units=(halfsphere-web halfsphere-api)
    ;;
  *) usage; exit 64 ;;
esac
readonly space_root="/srv/${space}"

for command_name in age zstd tar sha256sum systemctl rsync mktemp flock python3 install head df awk stat wc realpath; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "${program_name}: required command not found: ${command_name}" >&2
    exit 69
  }
done
[[ -f "${archive}" && ! -L "${archive}" && -s "${archive}" ]] || {
  echo "${program_name}: encrypted archive must be a nonempty regular file" >&2
  exit 66
}
archive_real="$(realpath -e -- "${archive}")" || {
  echo "${program_name}: cannot canonicalize encrypted archive" >&2
  exit 66
}
[[ "${archive}" = /* && "${archive_real}" == "${archive}" ]] || {
  echo "${program_name}: encrypted archive path must be absolute and canonical" >&2
  exit 66
}
case "${archive_real}" in
  "${space_root}/backups/"*) ;;
  *)
    echo "${program_name}: copy the reviewed archive into the selected root-only backup tree before restore" >&2
    exit 66
    ;;
esac
[[ -f "${archive}.sha256" && ! -L "${archive}.sha256" ]] || {
  echo "${program_name}: checksum file is required: ${archive}.sha256" >&2
  exit 66
}
checksum_real="$(realpath -e -- "${archive}.sha256")" || {
  echo "${program_name}: cannot canonicalize archive checksum" >&2
  exit 66
}
[[ "${checksum_real}" == "${archive}.sha256" ]] || {
  echo "${program_name}: archive checksum path must be canonical" >&2
  exit 66
}
for protected_file in "${archive}" "${archive}.sha256"; do
  protected_owner="$(stat -c '%u' "${protected_file}")"
  protected_mode="$(stat -c '%a' "${protected_file}")"
  [[ "${protected_owner}" == 0 && $((8#${protected_mode} & 8#022)) -eq 0 ]] || {
    echo "${program_name}: archive and checksum must be root-owned and not group/world-writable" >&2
    exit 77
  }
done
[[ -f "${identity_file}" && ! -L "${identity_file}" && -s "${identity_file}" ]] || {
  echo "${program_name}: age identity must be a nonempty regular file" >&2
  exit 66
}
[[ -f "${backup_config}" && ! -L "${backup_config}" ]] || {
  echo "${program_name}: regular backup config is required" >&2
  exit 66
}
backup_config_owner="$(stat -c '%u' "${backup_config}")"
backup_config_mode="$(stat -c '%a' "${backup_config}")"
[[ "${backup_config_owner}" == 0 && $((8#${backup_config_mode} & 8#022)) -eq 0 ]] || {
  echo "${program_name}: backup config must be root-owned and not group/world-writable" >&2
  exit 77
}
minimum_free_bytes=""
max_restore_tar_bytes=""
max_archive_members=""
age_recipient_file=""
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
done < "${backup_config}"
[[ "${seen_age_recipient}" == true && -n "${age_recipient_file}" &&
   "${minimum_free_bytes}" =~ ^[0-9]+$ &&
   "${max_restore_tar_bytes}" =~ ^[0-9]+$ &&
   "${max_archive_members}" =~ ^[0-9]+$ ]] || {
  echo "${program_name}: backup restore limits are missing or invalid" >&2
  exit 65
}
(( minimum_free_bytes >= 5 * 1024 * 1024 * 1024 &&
   max_restore_tar_bytes >= 1024 * 1024 &&
   max_restore_tar_bytes <= 80 * 1024 * 1024 * 1024 &&
   max_archive_members >= 1000 && max_archive_members <= 1000000 )) || {
  echo "${program_name}: backup restore limits are outside reviewed safety bounds" >&2
  exit 65
}
identity_owner="$(stat -c '%u' "${identity_file}")"
identity_mode="$(stat -c '%a' "${identity_file}")"
[[ "${identity_owner}" == 0 && "${identity_mode}" =~ ^[46]00$ ]] || {
  echo "${program_name}: age identity must be root-owned and mode 0400 or 0600" >&2
  exit 77
}

read -r expected_hash checksum_name checksum_extra < "${archive}.sha256" || true
[[ "${expected_hash:-}" =~ ^[0-9a-fA-F]{64}$ &&
   "${checksum_name:-}" == "$(basename "${archive}")" && -z "${checksum_extra:-}" &&
   "$(wc -l < "${archive}.sha256" | tr -d '[:space:]')" == 1 ]] || {
  echo "${program_name}: checksum file has an unexpected format or filename" >&2
  exit 74
}
actual_hash="$(sha256sum "${archive}" | awk '{print $1}')"
expected_hash_lower="$(printf '%s' "${expected_hash}" | tr 'A-F' 'a-f')"
[[ "${actual_hash}" == "${expected_hash_lower}" ]] || {
  echo "${program_name}: archive checksum verification failed" >&2
  exit 74
}

for unit in "${units[@]}"; do
  if systemctl is-active --quiet "${unit}.service"; then
    echo "${program_name}: ${unit}.service is active; stop and verify it before restore" >&2
    exit 75
  fi
done

umask 077
exec 9>"/run/lock/gsyen-aliyun-restore-${space}.lock"
flock -n 9 || {
  echo "${program_name}: another ${space} restore is running" >&2
  exit 75
}
exec 7>"/run/lock/gsyen-aliyun-storage-capacity.lock"
flock -n 7 || {
  echo "${program_name}: another host storage operation is running" >&2
  exit 75
}
install -d -m 0700 "${restore_gate_dir}"
[[ ! -e "${restore_gate}" ]] || {
  echo "${program_name}: an earlier restore gate still exists: ${restore_gate}" >&2
  exit 75
}
install -m 0600 /dev/null "${restore_gate}"

# Close the race between the first inactive check and creation of the persistent
# systemd ConditionPathExists gate. The gate intentionally survives all exits.
for unit in "${units[@]}"; do
  if systemctl is-active --quiet "${unit}.service"; then
    echo "${program_name}: ${unit}.service became active; restore gate remains closed" >&2
    exit 75
  fi
done

readonly staging_dir="$(mktemp -d "/srv/${space}/backups/.restore.XXXXXX")"
readonly uncompressed_tar="${staging_dir}/payload.tar"
cleanup() {
  rm -rf -- "${staging_dir}"
}
trap cleanup EXIT

available_bytes="$(df -P -B1 -- "/srv/${space}/backups" | awk 'NR == 2 {print $4}')"
[[ "${available_bytes}" =~ ^[0-9]+$ ]] || {
  echo "${program_name}: cannot determine restore disk capacity" >&2
  exit 74
}
if (( available_bytes <= minimum_free_bytes + 2 * 1024 * 1024 )); then
  echo "${program_name}: insufficient free space for a bounded restore" >&2
  exit 74
fi
effective_tar_limit=$(((available_bytes - minimum_free_bytes) / 2))
if (( effective_tar_limit > max_restore_tar_bytes )); then
  effective_tar_limit="${max_restore_tar_bytes}"
fi
limit_plus_one=$((effective_tar_limit + 1))

set +e
set +o pipefail
age --decrypt --identity "${identity_file}" "${archive}" \
  | zstd --decompress --quiet --stdout \
  | head -c "${limit_plus_one}" > "${uncompressed_tar}"
pipeline_status=("${PIPESTATUS[@]}")
set -o pipefail
set -e
tar_bytes="$(stat -c '%s' "${uncompressed_tar}")"
[[ "${tar_bytes}" =~ ^[0-9]+$ ]] || {
  echo "${program_name}: cannot determine decrypted tar size" >&2
  exit 74
}
if (( tar_bytes > effective_tar_limit )); then
  echo "${program_name}: decrypted archive exceeds the host-safe expanded-size limit" >&2
  exit 74
fi
if (( pipeline_status[0] != 0 || pipeline_status[1] != 0 || pipeline_status[2] != 0 )); then
  echo "${program_name}: authenticated decrypt/decompression failed" >&2
  exit 74
fi
python3 "${libexec_dir}/validate-tar-archive.py" "${uncompressed_tar}" \
  --space "${space}" --max-members "${max_archive_members}" \
  --max-total-bytes "${effective_tar_limit}"
tar --extract --no-same-owner --acls --xattrs --directory "${staging_dir}" \
  --file "${uncompressed_tar}"
python3 "${libexec_dir}/apply-tar-symbolic-owners.py" "${uncompressed_tar}" \
  "${staging_dir}" --space "${space}" >/dev/null
for directory in apps config data; do
  [[ -d "${staging_dir}/${directory}" && ! -L "${staging_dir}/${directory}" ]] || {
    echo "${program_name}: archive is missing ${directory}/" >&2
    exit 74
  }
done
[[ -f "${staging_dir}/exports/release-inventory.json" &&
   ! -L "${staging_dir}/exports/release-inventory.json" ]] || {
  echo "${program_name}: hashed release inventory is missing from the archive" >&2
  exit 74
}
[[ -f "${staging_dir}/exports/content-inventory.json" &&
   ! -L "${staging_dir}/exports/content-inventory.json" ]] || {
  echo "${program_name}: hashed mutable-content inventory is missing from the archive" >&2
  exit 74
}
python3 "${libexec_dir}/verify-release-inventory.py" verify "${space}" \
  "${staging_dir}/apps" "${staging_dir}/exports/release-inventory.json" \
  --owner-check >/dev/null
python3 "${libexec_dir}/content_inventory.py" verify "${space}" \
  "${staging_dir}" "${staging_dir}/exports/content-inventory.json" >/dev/null

# This must succeed before the first overwrite. It uses the current system's
# reviewed consistency hook and encryption recipient.
GSYEN_STORAGE_LOCK_FD=7 \
  "${libexec_dir}/backup-space.sh" "${space}" "${backup_config}" --apply

# Exclude a scheduled backup from the overwrite window. If a timer wins this
# race, abort before changing the selected space.
exec 8>"/run/lock/gsyen-aliyun-backup-${space}.lock"
flock -n 8 || {
  echo "${program_name}: a scheduled ${space} backup started; no files were overwritten" >&2
  exit 75
}

for directory in apps config data; do
  rsync --archive --hard-links --acls --xattrs --numeric-ids --delete \
    "${staging_dir}/${directory}/" "${space_root}/${directory}/"
done
if [[ "${space}" == gsyen && -d "${staging_dir}/stalwart" ]]; then
  install -d -m 0750 "${space_root}/stalwart"
  rsync --archive --hard-links --acls --xattrs --numeric-ids --delete \
    "${staging_dir}/stalwart/" "${space_root}/stalwart/"
fi
python3 "${libexec_dir}/verify-release-inventory.py" verify "${space}" \
  "${space_root}/apps" "${staging_dir}/exports/release-inventory.json" \
  --owner-check >/dev/null
python3 "${libexec_dir}/content_inventory.py" verify "${space}" \
  "${space_root}" "${staging_dir}/exports/content-inventory.json" >/dev/null

# Evidence exports are deliberately copied only after the restored live trees
# match both inventories. Adding them earlier would itself change data/ and make
# the post-copy mutable-content verification meaningless.
if [[ -d "${staging_dir}/exports" && ! -L "${staging_dir}/exports" ]]; then
  restore_exports_root="${space_root}/data/restore-exports"
  [[ ! -L "${restore_exports_root}" &&
     ( ! -e "${restore_exports_root}" || -d "${restore_exports_root}" ) ]] || {
    echo "${program_name}: restore export root is unsafe" >&2
    exit 73
  }
  install -d -m 0700 "${restore_exports_root}"
  restore_exports="${restore_exports_root}/$(date -u +%Y%m%dT%H%M%SZ)"
  [[ ! -e "${restore_exports}" && ! -L "${restore_exports}" ]] || {
    echo "${program_name}: restore export destination already exists or is unsafe" >&2
    exit 73
  }
  install -d -m 0700 "${restore_exports}"
  rsync --archive --hard-links --acls --xattrs --numeric-ids \
    "${staging_dir}/exports/" "${restore_exports}/"
fi

echo "${space} files restored. Services remain stopped."
echo "Persistent restore gate remains: ${restore_gate}"
echo "Run reviewed imports and tests, then remove that gate only in an approved start window."
