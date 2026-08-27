#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"

usage() {
  echo "Usage: ${program_name} {gsyen|gsyen-mail|gsyen-stalwart|halfsphere} ENV_FILE REQUIRED_KEY..." >&2
}

if [[ $# -lt 3 ]]; then
  usage
  exit 64
fi
readonly space="$1"
readonly env_file="$2"
shift 2
case "${space}" in
  gsyen) expected_group=gsyen; root_space=gsyen; port_regex='1808[0-9]' ;;
  gsyen-mail) expected_group=gsyen-mail; root_space=gsyen; port_regex='18085' ;;
  gsyen-stalwart) expected_group=stalwart; root_space=gsyen; port_regex='1808[0-9]' ;;
  halfsphere) expected_group=halfsphere; root_space=halfsphere; port_regex='1818[0-9]' ;;
  *) usage; exit 64 ;;
esac
case "${env_file}" in
  "/srv/${root_space}/config/"*.env) ;;
  *)
    echo "${program_name}: env file must stay inside /srv/${root_space}/config" >&2
    exit 65
    ;;
esac
readonly resource_contract="/etc/gsyen-aliyun/resources/${root_space}.boundaries.env"

# EnvironmentFile= assignments override Environment= assignments in systemd.
# Bind each reviewed service env file to one exact listener so an accidental or
# hostile PORT/HOST entry cannot make the service start on a sibling's port and
# then pass that sibling listener as its own health evidence.
expected_listener_key=""
expected_listener_host=""
expected_listener_port=""
forbid_listener_override=false
require_production_node_env=false
case "${env_file}" in
  /srv/gsyen/config/gsyen-web.env)
    expected_listener_key=HOST
    expected_listener_host=127.0.0.1
    expected_listener_port=18080
    require_production_node_env=true
    ;;
  /srv/gsyen/config/gsyen-api.env)
    expected_listener_key=HOST
    expected_listener_host=127.0.0.1
    expected_listener_port=18081
    require_production_node_env=true
    ;;
  /srv/gsyen/config/sgsyen-api.env)
    expected_listener_key=HOST
    expected_listener_host=127.0.0.1
    expected_listener_port=18084
    require_production_node_env=true
    ;;
  /srv/gsyen/config/mail-ingest.env)
    expected_listener_key=HOST
    expected_listener_host=127.0.0.1
    expected_listener_port=18085
    require_production_node_env=true
    ;;
  /srv/gsyen/config/gsyen-model.env)
    forbid_listener_override=true
    ;;
  /srv/halfsphere/config/halfsphere-web.env)
    expected_listener_key=HOSTNAME
    expected_listener_host=127.0.0.1
    expected_listener_port=18180
    require_production_node_env=true
    ;;
  /srv/halfsphere/config/halfsphere-api.env)
    expected_listener_key=HOST
    expected_listener_host=127.0.0.1
    expected_listener_port=18181
    ;;
esac
[[ -f "${env_file}" && ! -L "${env_file}" ]] || {
  echo "${program_name}: regular env file required: ${env_file}" >&2
  exit 66
}

owner="$(stat -c '%U' "${env_file}")"
group="$(stat -c '%G' "${env_file}")"
mode="$(stat -c '%a' "${env_file}")"
[[ "${owner}" == root && "${group}" == "${expected_group}" && "${mode}" == 640 ]] || {
  echo "${program_name}: env file must be root:${expected_group} mode 0640" >&2
  exit 77
}

seen_keys=()
mail_mirror_lease_ms=""
mail_mirror_smtp_timeout_ms=""
mail_mirror_health_timeout_ms=""
configured_listener_key=""
configured_listener_host=""
configured_listener_port=""
configured_node_env=""
while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ -z "${line//[[:space:]]/}" || "${line}" == \#* ]] && continue
  [[ "${line}" != *$'\r'* && "${line}" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]] || {
    echo "${program_name}: malformed environment assignment" >&2
    exit 65
  }
  key="${BASH_REMATCH[1]}"
  value="${BASH_REMATCH[2]}"
  normalized_value="$(printf '%s' "${value}" | LC_ALL=C tr '[:upper:]' '[:lower:]')"
  for seen_key in "${seen_keys[@]}"; do
    [[ "${seen_key}" != "${key}" ]] || {
      echo "${program_name}: duplicate environment key ${key}" >&2
      exit 65
    }
  done
  seen_keys+=("${key}")

  case "${key}" in
    PORT)
      configured_listener_port="${value}"
      ;;
    HOST|HOSTNAME)
      [[ -z "${configured_listener_key}" ]] || {
        echo "${program_name}: multiple listener host keys are forbidden" >&2
        exit 65
      }
      configured_listener_key="${key}"
      configured_listener_host="${value}"
      ;;
    NODE_ENV)
      configured_node_env="${value}"
      ;;
  esac

  if [[ "${normalized_value}" == *'__'* || "${normalized_value}" == *replace-with* ||
        "${normalized_value}" == *your-project* || "${normalized_value}" == *.example.invalid* ||
        "${normalized_value}" == *.run.app* || "${normalized_value}" == *storage.googleapis.com* ||
        "${normalized_value}" == *pkg.dev* ||
        "${normalized_value}" == *artifactregistry.googleapis.com* ||
        "${normalized_value}" == *cloudsql.googleapis.com* ||
        "${normalized_value}" == *secretmanager.googleapis.com* ||
        "${normalized_value}" == *iam.gserviceaccount.com* ||
        "${normalized_value}" == *halfsphere-api-7586* ||
        "${normalized_value}" == *gsyen-api-7586* ||
        "${normalized_value}" == *hs-v2ryan* ||
        "${normalized_value}" == *776196228503* ||
        "${normalized_value}" == *827638954410* ||
        "${normalized_value}" == *827638954474* ||
        "${normalized_value}" == *560294832548* ||
        "${normalized_value}" == *214548028016* ]]; then
    echo "${program_name}: unresolved or forbidden value for ${key}" >&2
    exit 65
  fi
  case "${key}" in
    PORT)
      [[ "${value}" =~ ^${port_regex}$ ]] || {
        echo "${program_name}: PORT is outside the ${root_space} allocation" >&2
        exit 65
      }
      ;;
    NODE_ENV)
      [[ "${value}" == production ]] || {
        echo "${program_name}: NODE_ENV must equal production" >&2
        exit 65
      }
      ;;
    HOST|HOSTNAME|STALWART_SMTP_HOST)
      [[ "${value}" == 127.0.0.1 || "${value}" == ::1 ]] || {
        echo "${program_name}: ${key} must be loopback" >&2
        exit 65
      }
      ;;
    STORAGE_PROVIDER|OBJECT_STORAGE_PROVIDER)
      [[ "${value}" == oss ]] || {
        echo "${program_name}: target storage provider must be oss" >&2
        exit 65
      }
      ;;
    OSS_AUTH_MODE)
      [[ "${value}" == ecs_ram_role ]] || {
        echo "${program_name}: OSS auth must use an isolated ECS RAM role" >&2
        exit 65
      }
      ;;
    OSS_BUCKET|OSS_RAM_ROLE)
      [[ -f "${resource_contract}" && ! -L "${resource_contract}" ]] || {
        echo "${program_name}: rendered resource contract is required before validating ${key}" >&2
        exit 66
      }
      contract_key=OSS_BUCKET
      [[ "${key}" == OSS_RAM_ROLE ]] && contract_key=RAM_ROLE
      expected_value="$(awk -F= -v wanted="${contract_key}" '$1 == wanted {print $2}' "${resource_contract}")"
      [[ -n "${expected_value}" && "${value}" == "${expected_value}" ]] || {
        echo "${program_name}: ${key} does not match the rendered business boundary" >&2
        exit 65
      }
      ;;
    OBJECT_STORAGE_TEXT_MAX_BYTES)
      [[ "${value}" =~ ^[1-9][0-9]{0,7}$ ]] &&
        (( 10#${value} <= 10 * 1024 * 1024 )) || {
        echo "${program_name}: ${key} must be between 1 and 10485760 bytes" >&2
        exit 65
      }
      ;;
    SIGNUP_REQUIRE_CAPTCHA|SIGNUP_REQUIRE_VERIFICATION)
      [[ "${value}" == true || "${value}" == false ]] || {
        echo "${program_name}: ${key} must be an explicit boolean" >&2
        exit 65
      }
      ;;
    ALLOWED_ORIGINS)
      [[ "${value}" != *"*"* ]] || {
        echo "${program_name}: wildcard CORS origin is forbidden" >&2
        exit 65
      }
      ;;
    AGENT_SANDBOX_ROOT)
      [[ "${value}" == /srv/gsyen/data/gsyen-api/agent-sandboxes ]] || {
        echo "${program_name}: agent sandbox root must use the reviewed persistent path" >&2
        exit 65
      }
      ;;
    AGENT_SANDBOX_USER_MAX_BYTES)
      [[ "${value}" == 20971520 ]] || {
        echo "${program_name}: per-user sandbox byte quota must equal the reviewed 20 MiB limit" >&2
        exit 65
      }
      ;;
    AGENT_SANDBOX_USER_MAX_FILES)
      [[ "${value}" == 256 ]] || {
        echo "${program_name}: per-user sandbox file quota must equal 256" >&2
        exit 65
      }
      ;;
    AGENT_SANDBOX_MAX_DEPTH)
      [[ "${value}" == 8 ]] || {
        echo "${program_name}: sandbox path depth must equal the reviewed limit" >&2
        exit 65
      }
      ;;
    AGENT_SANDBOX_MAX_FILE_BYTES)
      [[ "${value}" == 524288 ]] || {
        echo "${program_name}: sandbox single-file limit must equal 512 KiB" >&2
        exit 65
      }
      ;;
    AGENT_SANDBOX_OPERATION_MAX_NODES)
      [[ "${value}" == 512 ]] || {
        echo "${program_name}: sandbox operation node budget must equal 512" >&2
        exit 65
      }
      ;;
    AGENT_SANDBOX_OPERATION_MAX_BYTES)
      [[ "${value}" == 2097152 ]] || {
        echo "${program_name}: sandbox operation byte budget must equal 2 MiB" >&2
        exit 65
      }
      ;;
    AGENT_SANDBOX_OPERATION_TIMEOUT_MS)
      [[ "${value}" == 1000 ]] || {
        echo "${program_name}: sandbox operation timeout must equal 1000 ms" >&2
        exit 65
      }
      ;;
    AGENT_SANDBOX_MIN_FREE_BYTES)
      [[ "${value}" == 5368709120 ]] || {
        echo "${program_name}: sandbox filesystem reserve must equal 5 GiB" >&2
        exit 65
      }
      ;;
    GSYEN_MODEL_DATA_MODE)
      [[ "${value}" == production ]] || {
        echo "${program_name}: systemd model data mode must be production" >&2
        exit 65
      }
      ;;
    GSYEN_MODEL_DATA_PATH)
      [[ "${value}" == /srv/gsyen/data/gsyen-model/datasets/* &&
         "${value}" != *..* && "${value}" != *//* ]] || {
        echo "${program_name}: model data path must stay under the model data root" >&2
        exit 65
      }
      ;;
    GSYEN_MODEL_MAX_DATA_AGE_DAYS)
      [[ "${value}" =~ ^[1-9][0-9]{0,3}$ ]] && (( 10#${value} <= 3650 )) || {
        echo "${program_name}: model data age must be between 1 and 3650 days" >&2
        exit 65
      }
      ;;
    GSYEN_MODEL_DATA_MAX_BYTES)
      [[ "${value}" =~ ^[1-9][0-9]{3,9}$ ]] &&
        (( 10#${value} >= 1024 && 10#${value} <= 1024 * 1024 * 1024 )) || {
        echo "${program_name}: model dataset limit must be between 1024 bytes and 1 GiB" >&2
        exit 65
      }
      ;;
    GSYEN_MODEL_DATA_SHA256)
      [[ "${value}" =~ ^[0-9a-f]{64}$ ]] || {
        echo "${program_name}: model dataset SHA-256 must be 64 lowercase hex characters" >&2
        exit 65
      }
      ;;
    GSYEN_MODEL_CORS_ORIGINS)
      [[ -z "${value}" ]] || {
        echo "${program_name}: production model CORS must remain disabled" >&2
        exit 65
      }
      ;;
    OMP_NUM_THREADS|OPENBLAS_NUM_THREADS|MKL_NUM_THREADS|NUMEXPR_NUM_THREADS|PYTHONUNBUFFERED|PYTHONDONTWRITEBYTECODE)
      [[ "${value}" == 1 ]] || {
        echo "${program_name}: ${key} must equal 1 for the reviewed model runtime" >&2
        exit 65
      }
      ;;
    MAIL_MIRROR_TOKEN)
      [[ ${#value} -ge 43 && ${#value} -le 128 && "${value}" =~ ^[A-Za-z0-9_-]+$ ]] || {
        echo "${program_name}: MAIL_MIRROR_TOKEN must be a 32-byte-or-stronger base64url value" >&2
        exit 65
      }
      ;;
    MAIL_DOMAIN)
      [[ "${value}" == gsyen.com ]] || {
        echo "${program_name}: mail mirror domain must remain gsyen.com" >&2
        exit 65
      }
      ;;
    MAIL_HOSTNAME)
      [[ "${value}" == mail.gsyen.com ]] || {
        echo "${program_name}: MAIL_HOSTNAME must remain the reviewed non-MX Stalwart identity" >&2
        exit 65
      }
      ;;
    MAIL_MIRROR_MAX_BYTES)
      [[ "${value}" == 5242880 ]] || {
        echo "${program_name}: MAIL_MIRROR_MAX_BYTES must equal the reviewed 5-MiB Caddy limit" >&2
        exit 65
      }
      ;;
    MAIL_MIRROR_MAX_CONCURRENT_DELIVERIES)
      [[ "${value}" =~ ^[1-9][0-9]?$ ]] && (( 10#${value} <= 32 )) || {
        echo "${program_name}: mail mirror concurrency must be between 1 and 32" >&2
        exit 65
      }
      ;;
    MAIL_MIRROR_RECEIPT_DIR)
      [[ "${value}" == /srv/gsyen/data/mail-mirror/receipts ]] || {
        echo "${program_name}: mail mirror receipts must stay in the reviewed recoverable data path" >&2
        exit 65
      }
      ;;
    MAIL_MIRROR_MIN_FREE_BYTES)
      [[ "${value}" =~ ^[1-9][0-9]{9,10}$ ]] &&
        (( 10#${value} >= 1024 * 1024 * 1024 && 10#${value} <= 80 * 1024 * 1024 * 1024 )) || {
        echo "${program_name}: mail mirror free-space reserve must be between 1 and 80 GiB" >&2
        exit 65
      }
      ;;
    MAIL_MIRROR_LEASE_MS)
      [[ "${value}" =~ ^[1-9][0-9]{4,6}$ ]] &&
        (( 10#${value} >= 30000 && 10#${value} <= 1800000 )) || {
        echo "${program_name}: mail mirror lease is outside the reviewed range" >&2
        exit 65
      }
      mail_mirror_lease_ms="${value}"
      ;;
    MAIL_MIRROR_SMTP_TIMEOUT_MS)
      [[ "${value}" =~ ^[1-9][0-9]{3,4}$ ]] &&
        (( 10#${value} >= 1000 && 10#${value} <= 60000 )) || {
        echo "${program_name}: mail mirror SMTP timeout is outside the reviewed range" >&2
        exit 65
      }
      mail_mirror_smtp_timeout_ms="${value}"
      ;;
    MAIL_MIRROR_HEALTH_SMTP_TIMEOUT_MS)
      [[ "${value}" =~ ^[1-9][0-9]{3,4}$ ]] &&
        (( 10#${value} >= 1000 && 10#${value} <= 10000 )) || {
        echo "${program_name}: mail mirror health SMTP timeout is outside the reviewed range" >&2
        exit 65
      }
      mail_mirror_health_timeout_ms="${value}"
      ;;
    STALWART_DUPLICATE_GUARD_VERIFIED)
      [[ "${value}" == true || "${value}" == false ]] || {
        echo "${program_name}: Stalwart duplicate guard must be an explicit boolean" >&2
        exit 65
      }
      ;;
    STALWART_SMTP_PORT)
      [[ "${value}" =~ ^[1-9][0-9]{0,4}$ ]] && (( 10#${value} <= 65535 )) || {
        echo "${program_name}: Stalwart SMTP port is invalid" >&2
        exit 65
      }
      ;;
    STALWART_CONFIG_PATH)
      [[ "${value}" == /srv/gsyen/config/stalwart/* && "${value}" != *..* ]] || {
        echo "${program_name}: STALWART_CONFIG_PATH must stay under the reviewed Stalwart config directory" >&2
        exit 65
      }
      ;;
  esac
done < "${env_file}"

if [[ -n "${expected_listener_port}" ]]; then
  [[ "${configured_listener_key}" == "${expected_listener_key}" &&
     "${configured_listener_host}" == "${expected_listener_host}" &&
     "${configured_listener_port}" == "${expected_listener_port}" ]] || {
    echo "${program_name}: ${env_file} must declare ${expected_listener_key}=${expected_listener_host} and PORT=${expected_listener_port}" >&2
    exit 65
  }
elif [[ "${forbid_listener_override}" == true &&
        ( -n "${configured_listener_key}" || -n "${configured_listener_port}" ) ]]; then
  echo "${program_name}: ${env_file} must not override the command-line model listener" >&2
  exit 65
fi
if [[ "${require_production_node_env}" == true &&
      "${configured_node_env}" != production ]]; then
  echo "${program_name}: ${env_file} must declare NODE_ENV=production" >&2
  exit 65
fi

if [[ "${space}" == gsyen-mail ]]; then
  [[ -n "${mail_mirror_lease_ms}" && -n "${mail_mirror_smtp_timeout_ms}" &&
     -n "${mail_mirror_health_timeout_ms}" ]] || {
    echo "${program_name}: explicit mail mirror lease/SMTP/health timeouts are required" >&2
    exit 65
  }
  if (( 10#${mail_mirror_lease_ms} < 2 * 10#${mail_mirror_smtp_timeout_ms} ||
        10#${mail_mirror_health_timeout_ms} > 10#${mail_mirror_smtp_timeout_ms} )); then
    echo "${program_name}: mail mirror lease/SMTP/health timeouts violate the reviewed ordering" >&2
    exit 65
  fi
fi

for required_key in "$@"; do
  [[ "${required_key}" =~ ^[A-Z][A-Z0-9_]*$ ]] || {
    echo "${program_name}: invalid required key name" >&2
    exit 64
  }
  found=false
  for seen_key in "${seen_keys[@]}"; do
    if [[ "${seen_key}" == "${required_key}" ]]; then
      found=true
      break
    fi
  done
  [[ "${found}" == true ]] || {
    echo "${program_name}: missing required environment key ${required_key}" >&2
    exit 78
  }
  required_value="$(sed -n "s/^${required_key}=//p" "${env_file}")"
  [[ -n "${required_value}" || "${required_key}" == GSYEN_MODEL_CORS_ORIGINS ]] || {
    echo "${program_name}: required environment key ${required_key} is empty" >&2
    exit 78
  }
done

echo "Validated ${space} environment metadata for ${env_file}; values were not printed."
