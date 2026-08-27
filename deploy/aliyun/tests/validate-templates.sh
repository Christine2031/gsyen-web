#!/usr/bin/env bash
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1

readonly program_name="${0##*/}"
readonly deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  echo "${program_name}: $*" >&2
  exit 1
}

assert_file_contains() {
  local file="$1"
  local pattern="$2"
  grep -Eq -- "${pattern}" "${file}" || fail "${file} lacks ${pattern}"
}

assert_file_not_contains() {
  local file="$1"
  local pattern="$2"
  if grep -Eq -- "${pattern}" "${file}"; then
    fail "${file} unexpectedly contains ${pattern}"
  fi
}

assert_file_order() {
  local file="$1"
  local first="$2"
  local second="$3"
  local first_line second_line

  first_line="$(awk -v needle="${first}" 'index($0, needle) { print NR; exit }' "${file}")"
  second_line="$(awk -v needle="${second}" 'index($0, needle) { print NR; exit }' "${file}")"
  [[ "${first_line}" =~ ^[0-9]+$ && "${second_line}" =~ ^[0-9]+$ &&
     first_line -lt second_line ]] || {
    fail "${file} does not place '${first}' before '${second}'"
  }
}

for script in "${deploy_dir}"/*.sh "${deploy_dir}"/libexec/*.sh \
              "${deploy_dir}"/tests/*.sh "${deploy_dir}"/backup/pre-backup.example; do
  bash -n "${script}"
done
for python_file in "${deploy_dir}"/libexec/*.py; do
  python3 -c 'import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_text(), sys.argv[1], "exec")' \
    "${python_file}"
done

assert_file_contains "${deploy_dir}/sysusers.d/halfsphere.conf" '^u halfsphere '
assert_file_contains "${deploy_dir}/sysusers.d/gsyen.conf" '^g gsyen-space '
assert_file_contains "${deploy_dir}/sysusers.d/gsyen.conf" '^m gsyen-mail gsyen-space$'
assert_file_contains "${deploy_dir}/sysusers.d/gsyen.conf" '^u stalwart '
assert_file_contains "${deploy_dir}/sysusers.d/gsyen.conf" '^m stalwart gsyen-space$'
for directory in apps config data logs backups; do
  assert_file_contains "${deploy_dir}/tmpfiles.d/halfsphere.conf" "/srv/halfsphere/${directory}"
  assert_file_contains "${deploy_dir}/tmpfiles.d/gsyen.conf" "/srv/gsyen/${directory}"
done

for unit in halfsphere-web.service halfsphere-api.service; do
  file="${deploy_dir}/systemd/${unit}"
  assert_file_contains "${file}" '^Slice=halfsphere\.slice$'
  assert_file_contains "${file}" '^User=halfsphere$'
  assert_file_contains "${file}" '^Group=halfsphere$'
  assert_file_contains "${file}" '/srv/halfsphere/'
  assert_file_contains "${file}" 'validate-env-file\.sh halfsphere '
  assert_file_contains "${file}" 'validate-boundary-gate\.sh halfsphere'
  assert_file_contains "${file}" '^ConditionPathExists=!/etc/gsyen-aliyun/locks/halfsphere-restore-in-progress$'
  if grep -q '/srv/gsyen/' "${file}"; then
    fail "${unit} crosses into the GSYEN data space"
  fi
done
assert_file_contains "${deploy_dir}/systemd/halfsphere-web.service" '^Environment=PORT=18180$'
assert_file_contains "${deploy_dir}/systemd/halfsphere-api.service" '^Environment=PORT=18181$'
assert_file_contains "${deploy_dir}/systemd/halfsphere-web.service" \
  'assert-loopback-listener\.sh 18180 30 \$MAINPID$'
assert_file_contains "${deploy_dir}/systemd/halfsphere-api.service" \
  'assert-loopback-listener\.sh 18181 30 \$MAINPID$'

for port in 18180 18181; do
  (( port >= 18180 && port <= 18189 )) || fail "HalfSphere port outside 18180-18189"
done
for mapping in \
  'gsyen-web.service:18080' \
  'gsyen-api.service:18081' \
  'sgsyen-web.service:18082' \
  'gsyen-model.service:18083' \
  'sgsyen-api.service:18084' \
  'gsyen-mail-ingest.service:18085'; do
  unit="${mapping%%:*}"
  port="${mapping##*:}"
  assert_file_contains "${deploy_dir}/systemd/${unit}" "assert-loopback-listener\\.sh ${port} [0-9]+ \\\$MAINPID$"
  assert_file_contains "${deploy_dir}/systemd/${unit}" '^Slice=gsyen\.slice$'
  assert_file_contains "${deploy_dir}/systemd/${unit}" '^ConditionPathExists=!/etc/gsyen-aliyun/locks/gsyen-restore-in-progress$'
  assert_file_contains "${deploy_dir}/systemd/${unit}" 'validate-boundary-gate\.sh gsyen'
done
for unit in gsyen-web.service gsyen-api.service sgsyen-web.service \
            sgsyen-api.service gsyen-model.service gsyen-mail-ingest.service \
            stalwart.service halfsphere-web.service halfsphere-api.service; do
  assert_file_contains "${deploy_dir}/systemd/${unit}" '^WorkingDirectory=/srv/(gsyen|halfsphere)/apps/[a-z-]+/current$'
done
for unit in gsyen-web.service gsyen-api.service sgsyen-web.service \
            sgsyen-api.service gsyen-model.service gsyen-mail-ingest.service \
            stalwart.service; do
  if grep -q '/srv/halfsphere/' "${deploy_dir}/systemd/${unit}"; then
    fail "${unit} crosses into the HalfSphere data space"
  fi
done
assert_file_contains "${deploy_dir}/systemd/stalwart.service" '^KillMode=mixed$'
assert_file_contains "${deploy_dir}/systemd/stalwart.service" '^User=stalwart$'
assert_file_contains "${deploy_dir}/systemd/stalwart.service" '/srv/gsyen/apps/stalwart/current/bin/stalwart'
assert_file_contains "${deploy_dir}/systemd/stalwart.service" '/srv/gsyen/config/stalwart/stalwart\.env'
assert_file_contains "${deploy_dir}/systemd/stalwart.service" '/srv/gsyen/data/stalwart'
for mail_key in MAIL_MIRROR_MAX_BYTES MAIL_MIRROR_MAX_CONCURRENT_DELIVERIES \
                MAIL_MIRROR_RECEIPT_DIR MAIL_MIRROR_MIN_FREE_BYTES \
                MAIL_MIRROR_LEASE_MS MAIL_MIRROR_SMTP_TIMEOUT_MS \
                MAIL_MIRROR_HEALTH_SMTP_TIMEOUT_MS \
                STALWART_DUPLICATE_GUARD_VERIFIED; do
  assert_file_contains "${deploy_dir}/systemd/gsyen-mail-ingest.service" "${mail_key}"
done
if grep -Eq '^SupplementaryGroups=gsyen$|/srv/gsyen/stalwart' \
  "${deploy_dir}/systemd/stalwart.service" "${deploy_dir}/systemd/gsyen-mail-ingest.service"; then
  fail "mail services retain broad GSYEN group access or the legacy Stalwart runtime layout"
fi
assert_file_contains "${deploy_dir}/systemd/gsyen-model.service" \
  '^ExecStart=/srv/gsyen/apps/gsyen-model/current/\.venv/bin/python -m uvicorn .* --workers 1$'
assert_file_contains "${deploy_dir}/systemd/gsyen-model.service" '^StartLimitBurst=5$'
assert_file_contains "${deploy_dir}/systemd/gsyen-model.service" \
  '^Environment=WEB_CONCURRENCY=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1$'
assert_file_contains "${deploy_dir}/systemd/gsyen-model.service" \
  '^EnvironmentFile=/srv/gsyen/config/gsyen-model\.env$'
assert_file_contains "${deploy_dir}/systemd/gsyen-model.service" \
  'validate-env-file\.sh gsyen /srv/gsyen/config/gsyen-model\.env GSYEN_MODEL_DATA_MODE GSYEN_MODEL_DATA_PATH GSYEN_MODEL_MAX_DATA_AGE_DAYS GSYEN_MODEL_DATA_MAX_BYTES GSYEN_MODEL_DATA_SHA256 GSYEN_MODEL_CORS_ORIGINS OMP_NUM_THREADS OPENBLAS_NUM_THREADS MKL_NUM_THREADS NUMEXPR_NUM_THREADS PYTHONUNBUFFERED PYTHONDONTWRITEBYTECODE$'
assert_file_contains "${deploy_dir}/systemd/gsyen-model.service" \
  '^ReadOnlyPaths=/srv/gsyen/data/gsyen-model$'
assert_file_contains "${deploy_dir}/systemd/gsyen-model.service" \
  '^ReadWritePaths=/srv/gsyen/logs/gsyen-model$'
assert_file_contains "${deploy_dir}/env/gsyen-model.env.example" \
  '^GSYEN_MODEL_DATA_MODE=production$'
assert_file_contains "${deploy_dir}/env/gsyen-model.env.example" \
  '^GSYEN_MODEL_DATA_PATH=/srv/gsyen/data/gsyen-model/datasets/current/transactions\.csv$'
assert_file_contains "${deploy_dir}/env/gsyen-model.env.example" \
  '^GSYEN_MODEL_DATA_MAX_BYTES=268435456$'
assert_file_contains "${deploy_dir}/env/gsyen-model.env.example" \
  '^GSYEN_MODEL_DATA_SHA256=__REQUIRED_64_HEX_SHA256__$'
assert_file_contains "${deploy_dir}/env/gsyen-model.env.example" \
  '^GSYEN_MODEL_CORS_ORIGINS=$'
for model_env_case in GSYEN_MODEL_DATA_MODE GSYEN_MODEL_DATA_PATH \
                      GSYEN_MODEL_MAX_DATA_AGE_DAYS GSYEN_MODEL_DATA_MAX_BYTES \
                      GSYEN_MODEL_DATA_SHA256 GSYEN_MODEL_CORS_ORIGINS; do
  assert_file_contains "${deploy_dir}/libexec/validate-env-file.sh" \
    "^[[:space:]]*${model_env_case}\\)"
done
assert_file_contains "${deploy_dir}/libexec/validate-env-file.sh" \
  '^[[:space:]]*OMP_NUM_THREADS\|OPENBLAS_NUM_THREADS\|MKL_NUM_THREADS\|NUMEXPR_NUM_THREADS\|PYTHONUNBUFFERED\|PYTHONDONTWRITEBYTECODE\)'
assert_file_contains "${deploy_dir}/healthchecks/gsyen.urls.example" \
  '^gsyen-model\|http://127\.0\.0\.1:18083/readyz\|200$'
assert_file_contains "${deploy_dir}/tmpfiles.d/gsyen.conf" \
  '^d /srv/gsyen/data/gsyen-model/datasets 0750 root gsyen '
assert_file_contains "${deploy_dir}/tmpfiles.d/gsyen.conf" \
  '^d /srv/gsyen/data[[:space:]]+0710 root[[:space:]]+gsyen-space '
assert_file_contains "${deploy_dir}/tmpfiles.d/gsyen.conf" \
  '^d /srv/gsyen/logs[[:space:]]+0710 root[[:space:]]+gsyen-space '
assert_file_contains "${deploy_dir}/tmpfiles.d/gsyen.conf" \
  '^d /srv/gsyen/data/gsyen-api/agent-sandboxes 0700 gsyen gsyen '
assert_file_contains "${deploy_dir}/env/gsyen-api.env.example" \
  '^AGENT_SANDBOX_ROOT=/srv/gsyen/data/gsyen-api/agent-sandboxes$'
for sandbox_contract in \
  'AGENT_SANDBOX_USER_MAX_BYTES=20971520' \
  'AGENT_SANDBOX_USER_MAX_FILES=256' \
  'AGENT_SANDBOX_MAX_DEPTH=8' \
  'AGENT_SANDBOX_MAX_FILE_BYTES=524288' \
  'AGENT_SANDBOX_OPERATION_MAX_NODES=512' \
  'AGENT_SANDBOX_OPERATION_MAX_BYTES=2097152' \
  'AGENT_SANDBOX_OPERATION_TIMEOUT_MS=1000' \
  'AGENT_SANDBOX_MIN_FREE_BYTES=5368709120'; do
  assert_file_contains "${deploy_dir}/env/gsyen-api.env.example" "^${sandbox_contract}$"
  assert_file_contains "${deploy_dir}/systemd/gsyen-api.service" " ${sandbox_contract%%=*} "
  assert_file_contains "${deploy_dir}/libexec/validate-env-file.sh" \
    "^[[:space:]]*${sandbox_contract%%=*}\\)"
done
assert_file_contains "${deploy_dir}/systemd/gsyen-api.service" \
  '^ReadWritePaths=/srv/gsyen/data/gsyen-api/agent-sandboxes$'
assert_file_contains "${deploy_dir}/systemd/gsyen-api.service" ' AGENT_SANDBOX_ROOT '
assert_file_contains "${deploy_dir}/libexec/validate-env-file.sh" \
  '^[[:space:]]*AGENT_SANDBOX_ROOT\)'
for read_only_app_unit in gsyen-web.service sgsyen-web.service sgsyen-api.service; do
  assert_file_not_contains "${deploy_dir}/systemd/${read_only_app_unit}" \
    '^ReadWritePaths=/srv/gsyen/(data|logs)([[:space:]]|$)'
done
if grep -q '/\.venv/bin/uvicorn' "${deploy_dir}/systemd/gsyen-model.service"; then
  fail "model unit depends on a non-relocatable virtualenv console-script shebang"
fi
assert_file_contains "${deploy_dir}/systemd/sgsyen-api.service" '^UnsetEnvironment=DEBUG$'
assert_file_contains "${deploy_dir}/systemd/sgsyen-api.service" \
  'OBJECT_STORAGE_TEXT_MAX_BYTES'
assert_file_contains "${deploy_dir}/env/sgsyen-api.env.example" \
  '^OBJECT_STORAGE_TEXT_MAX_BYTES=5242880$'
assert_file_contains "${deploy_dir}/env/gsyen-web.env.example" '^SUPABASE_URL=__REQUIRED__$'
assert_file_contains "${deploy_dir}/env/gsyen-web.env.example" '^SUPABASE_ANON_KEY=__REQUIRED__$'
assert_file_contains "${deploy_dir}/systemd/gsyen-web.service" 'SUPABASE_URL SUPABASE_ANON_KEY'
assert_file_contains "${deploy_dir}/env/sgsyen-web.env.example" \
  '^# Build-time public configuration only\.'
assert_file_contains "${deploy_dir}/env/sgsyen-web.env.example" \
  '^VITE_SGSYEN_API_URL=https://sg-api\.gsyen\.example\.invalid$'
assert_file_not_contains "${deploy_dir}/env/sgsyen-web.env.example" '^VITE_API_URL='
assert_file_not_contains "${deploy_dir}/systemd/sgsyen-web.service" \
  '^EnvironmentFile=.*sgsyen-web\.env$'
assert_file_not_contains "${deploy_dir}/systemd/sgsyen-web.service" 'VITE_[A-Z0-9_]+'
assert_file_contains "${deploy_dir}/../../gsyen-api/.env.example" '^GEMINI_API_KEY='
assert_file_contains "${deploy_dir}/../../gsyen-api/Dockerfile" '^ENV HOST=0\.0\.0\.0$'

for listener_contract in \
  'gsyen-api.env.example:HOST:127.0.0.1:18081' \
  'gsyen-web.env.example:HOST:127.0.0.1:18080' \
  'sgsyen-api.env.example:HOST:127.0.0.1:18084' \
  'halfsphere-api.env.example:HOST:127.0.0.1:18181' \
  'halfsphere-web.env.example:HOSTNAME:127.0.0.1:18180'; do
  IFS=: read -r listener_file listener_key listener_host listener_port <<< "${listener_contract}"
  assert_file_contains "${deploy_dir}/env/${listener_file}" "^${listener_key}=${listener_host//./\\.}$"
  assert_file_contains "${deploy_dir}/env/${listener_file}" "^PORT=${listener_port}$"
  if [[ "${listener_file}" != halfsphere-api.env.example ]]; then
    assert_file_contains "${deploy_dir}/env/${listener_file}" '^NODE_ENV=production$'
  fi
done
assert_file_contains "${deploy_dir}/mail-ingest/mail-ingest.env.example" '^HOST=127\.0\.0\.1$'
assert_file_contains "${deploy_dir}/mail-ingest/mail-ingest.env.example" '^PORT=18085$'
assert_file_contains "${deploy_dir}/mail-ingest/mail-ingest.env.example" '^NODE_ENV=production$'
assert_file_contains "${deploy_dir}/libexec/validate-env-file.sh" 'expected_listener_port=18081'
assert_file_contains "${deploy_dir}/libexec/validate-env-file.sh" 'must not override the command-line model listener'
assert_file_contains "${deploy_dir}/libexec/validate-env-file.sh" 'multiple listener host keys are forbidden'
assert_file_contains "${deploy_dir}/libexec/validate-env-file.sh" 'NODE_ENV must equal production'

for slice in gsyen.slice halfsphere.slice; do
  assert_file_contains "${deploy_dir}/systemd/${slice}" '^CPUQuota=[0-9]+%$'
  assert_file_contains "${deploy_dir}/systemd/${slice}" '^MemoryHigh='
  assert_file_contains "${deploy_dir}/systemd/${slice}" '^MemoryMax='
  assert_file_contains "${deploy_dir}/systemd/${slice}" '^TasksMax='
done
assert_file_contains "${deploy_dir}/logrotate.d/gsyen" '^/srv/gsyen/logs/mail-ingest/\*\.log \{$'
assert_file_contains "${deploy_dir}/logrotate.d/gsyen" '^[[:space:]]*su gsyen-mail gsyen-mail$'
assert_file_contains "${deploy_dir}/logrotate.d/gsyen" '^/srv/gsyen/logs/stalwart/\*\.log \{$'
assert_file_contains "${deploy_dir}/logrotate.d/gsyen" '^[[:space:]]*su stalwart stalwart$'

assert_file_contains "${deploy_dir}/resources/gsyen.boundaries.env.example" '^ROOT_PATH=/srv/gsyen$'
assert_file_contains "${deploy_dir}/resources/halfsphere.boundaries.env.example" '^ROOT_PATH=/srv/halfsphere$'
assert_file_contains "${deploy_dir}/resources/gsyen.boundaries.env.example" '^OSS_ISOLATION_MODE=dedicated_bucket$'
assert_file_contains "${deploy_dir}/resources/topology.env.example" '^TOPOLOGY=__REQUIRED_'
for key in RDS_DATABASE RDS_SCHEMA RDS_APP_USER OSS_PREFIX ACR_NAMESPACE; do
  gsyen_value="$(awk -F= -v key="${key}" '$1 == key { print $2 }' \
    "${deploy_dir}/resources/gsyen.boundaries.env.example")"
  halfsphere_value="$(awk -F= -v key="${key}" '$1 == key { print $2 }' \
    "${deploy_dir}/resources/halfsphere.boundaries.env.example")"
  [[ -n "${gsyen_value}" && -n "${halfsphere_value}" &&
     "${gsyen_value}" != "${halfsphere_value}" ]] || fail "shared ${key} boundary"
done

assert_file_contains "${deploy_dir}/caddy/gsyen.Caddyfile.template" 'reverse_proxy 127\.0\.0\.1:18080'
assert_file_contains "${deploy_dir}/caddy/gsyen.Caddyfile.template" 'path /api/auth /api/auth/\* /api/model /api/model/\*'
assert_file_contains "${deploy_dir}/caddy/gsyen.Caddyfile.template" 'reverse_proxy 127\.0\.0\.1:18081'
assert_file_contains "${deploy_dir}/caddy/gsyen.Caddyfile.template" 'reverse_proxy 127\.0\.0\.1:18084'
assert_file_contains "${deploy_dir}/caddy/halfsphere.Caddyfile.template" 'reverse_proxy 127\.0\.0\.1:18180'
assert_file_contains "${deploy_dir}/caddy/halfsphere.Caddyfile.template" 'reverse_proxy 127\.0\.0\.1:18181'
assert_file_contains "${deploy_dir}/caddy/gsyen.Caddyfile.template" '__GSYEN_MAIL_INGEST_SITE__'
assert_file_contains "${deploy_dir}/caddy/gsyen.Caddyfile.template" 'path /internal/mail/mirror'
assert_file_contains "${deploy_dir}/caddy/gsyen.Caddyfile.template" 'method POST'
assert_file_contains "${deploy_dir}/caddy/gsyen.Caddyfile.template" 'header Content-Type message/rfc822'
assert_file_contains "${deploy_dir}/caddy/gsyen.Caddyfile.template" '^[[:space:]]*header X-GSYEN-Envelope-From[[:space:]]*$'
assert_file_contains "${deploy_dir}/caddy/gsyen.Caddyfile.template" 'X-GSYEN-Envelope-To \(\?i\)\^'
assert_file_contains "${deploy_dir}/caddy/gsyen.Caddyfile.template" 'max_size 5MiB'
assert_file_contains "${deploy_dir}/caddy/gsyen.Caddyfile.template" 'header_up Authorization'
assert_file_contains "${deploy_dir}/caddy/gsyen.Caddyfile.template" 'response_header_timeout 65s'
assert_file_contains "${deploy_dir}/caddy/gsyen.Caddyfile.template" 'reverse_proxy 127\.0\.0\.1:18085'

if grep -ERn --include='*.service' --include='*.template' --include='*.env.example' \
  '(run\.app|storage\.googleapis\.com|pkg\.dev|halfsphere-api-7586)' "${deploy_dir}"; then
  fail "runtime template still contains a GCP production dependency"
fi

while IFS= read -r env_file; do
  awk -F= '
    /^[[:space:]]*#/ || NF < 2 { next }
    $1 ~ /(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE_KEY|API_KEY|ENCRYPTION_KEY|ACCESS_KEY_ID|ACCESS_KEY_SECRET|DATABASE_URL)$/ {
      value=substr($0, index($0, "=") + 1)
      if (value !~ /^__[A-Z0-9_]+__$/ && value !~ /^replace-with-/) {
        print FILENAME ": possible real secret for " $1 > "/dev/stderr"
        exit 1
      }
    }
  ' "${env_file}" || fail "secret-like value in ${env_file}"
done < <(find "${deploy_dir}" -name '*.env.example' -type f -print)

temporary_dir="$(mktemp -d)"
cleanup() {
  rm -rf -- "${temporary_dir}"
}
trap cleanup EXIT

backup_link_space="${temporary_dir}/backup-link-space"
install -d -m 0755 "${backup_link_space}/apps/releases/test-release" \
  "${backup_link_space}/config" "${backup_link_space}/data"
ln -s releases/test-release "${backup_link_space}/apps/current"
python3 "${deploy_dir}/libexec/validate-backup-symlinks.py" \
  "${backup_link_space}" "${backup_link_space}/apps" \
  "${backup_link_space}/config" "${backup_link_space}/data" >/dev/null
ln -s ../../outside "${backup_link_space}/apps/escape"
if python3 "${deploy_dir}/libexec/validate-backup-symlinks.py" \
  "${backup_link_space}" "${backup_link_space}/apps" \
  "${backup_link_space}/config" "${backup_link_space}/data" >/dev/null 2>&1; then
  fail "escaping backup symlink incorrectly passed validation"
fi
rm -- "${backup_link_space}/apps/escape"

managed_directory="${temporary_dir}/managed-release-directory"
install -d -m 0750 "${managed_directory}"
install -d "${temporary_dir}/metadata-test-bin"
printf '%s\n' '#!/usr/bin/env bash' \
  'case "${2:-}" in' \
  '  %u) printf "%s\\n" "${TEST_STAT_OWNER}" ;;' \
  '  %G) printf "%s\\n" "${TEST_STAT_GROUP}" ;;' \
  '  %a) printf "%s\\n" "${TEST_STAT_MODE}" ;;' \
  '  *) exit 64 ;;' \
  'esac' > "${temporary_dir}/metadata-test-bin/stat"
chmod 0755 "${temporary_dir}/metadata-test-bin/stat"
managed_directory_function="$(sed -n \
  '/^validate_existing_managed_release_directory()/,/^}/p' \
  "${deploy_dir}/libexec/stage-release.sh")"
validate_test_managed_directory() {
  local owner="$1"
  local group="$2"
  local mode="$3"

  TEST_STAT_OWNER="${owner}" TEST_STAT_GROUP="${group}" TEST_STAT_MODE="${mode}" \
  MANAGED_DIRECTORY_FUNCTION="${managed_directory_function}" \
  PATH="${temporary_dir}/metadata-test-bin:${PATH}" \
    bash -c 'set -euo pipefail
eval "${MANAGED_DIRECTORY_FUNCTION}"
program_name=stage-release-test
business_group=gsyen
validate_existing_managed_release_directory "$1"' \
    _ "${managed_directory}"
}
validate_test_managed_directory 0 gsyen 750
for mismatch in '502:gsyen:750' '0:halfsphere:750' '0:gsyen:755'; do
  IFS=: read -r test_owner test_group test_mode <<< "${mismatch}"
  if validate_test_managed_directory \
    "${test_owner}" "${test_group}" "${test_mode}" >/dev/null 2>&1; then
    fail "managed release directory metadata mismatch incorrectly passed: ${mismatch}"
  fi
done

gsyen_boundary="${temporary_dir}/gsyen.boundaries.env"
halfsphere_boundary="${temporary_dir}/halfsphere.boundaries.env"
topology="${temporary_dir}/topology.env"
printf '%s\n' \
  'BUSINESS_SPACE=gsyen' 'LINUX_USER=gsyen' 'SERVICE_PREFIX=gsyen-' \
  'ROOT_PATH=/srv/gsyen' 'PORT_MIN=18080' 'PORT_MAX=18089' \
  'RDS_DATABASE=gsyen' 'RDS_SCHEMA=gsyen' 'RDS_APP_USER=gsyen_app' \
  'OSS_ISOLATION_MODE=dedicated_bucket' 'OSS_BUCKET=gsyen-prod-objects' \
  'OSS_PREFIX=gsyen/' 'ACR_NAMESPACE=gsyen' 'SLS_PROJECT=gsyen-prod-logs' \
  'RAM_ROLE=GsyenProductionRole' > "${gsyen_boundary}"
printf '%s\n' \
  'BUSINESS_SPACE=halfsphere' 'LINUX_USER=halfsphere' 'SERVICE_PREFIX=halfsphere-' \
  'ROOT_PATH=/srv/halfsphere' 'PORT_MIN=18180' 'PORT_MAX=18189' \
  'RDS_DATABASE=halfsphere' 'RDS_SCHEMA=halfsphere' 'RDS_APP_USER=halfsphere_app' \
  'OSS_ISOLATION_MODE=dedicated_bucket' 'OSS_BUCKET=halfsphere-prod-objects' \
  'OSS_PREFIX=halfsphere/' 'ACR_NAMESPACE=halfsphere' \
  'SLS_PROJECT=halfsphere-prod-logs' 'RAM_ROLE=HalfSphereProductionRole' \
  > "${halfsphere_boundary}"
printf '%s\n' 'TOPOLOGY=separate_ecs' 'GSYEN_ECS_ID=i-gsyen12345678' \
  'HALFSPHERE_ECS_ID=i-halfsphere1234' > "${topology}"
python3 "${deploy_dir}/libexec/validate-resource-boundaries.py" \
  "${topology}" "${gsyen_boundary}" "${halfsphere_boundary}" >/dev/null
printf '%s\n' 'TOPOLOGY=shared_ecs' 'GSYEN_ECS_ID=i-shared12345678' \
  'HALFSPHERE_ECS_ID=i-shared12345678' > "${topology}"
if python3 "${deploy_dir}/libexec/validate-resource-boundaries.py" \
  "${topology}" "${gsyen_boundary}" "${halfsphere_boundary}" >/dev/null 2>&1; then
  fail "different ECS RAM roles incorrectly passed on one shared ECS"
fi

release_dir="${temporary_dir}/release"
install -d -m 0755 "${release_dir}"
printf '%s\n' \
  '{"schema":1,"space":"gsyen","app":"gsyen-web","release_id":"test-1","source_commit":"0123456789abcdef0123456789abcdef01234567","built_at":"2026-08-26T00:00:00Z"}' \
  > "${release_dir}/RELEASE.json"
printf '%s\n' \
  '{"schema":1,"source_commit":"0123456789abcdef0123456789abcdef01234567","public_origins":["https://www.gsyen.com"],"providers":["aliyun-ecs","google-gemini-api","supabase"],"allowed_google_services":["gemini"]}' \
  > "${release_dir}/BUILD.json"
printf '%s\n' 'release payload' > "${release_dir}/server.cjs"
release_hash="$(python3 "${deploy_dir}/libexec/validate-release-tree.py" \
  gsyen gsyen-web test-1 "${release_dir}")"
[[ "${release_hash}" =~ ^[0-9a-f]{64}$ ]] || fail "release validator did not return SHA-256"
printf '%s\n' 'https://generativelanguage.googleapis.com/v1/models' \
  > "${release_dir}/allowed-google-api.txt"
python3 "${deploy_dir}/libexec/validate-release-tree.py" \
  gsyen gsyen-web test-1 "${release_dir}" >/dev/null
printf '%s\n' 'https://us-central1-aiplatform.googleapis.com/v1/projects/test' \
  > "${release_dir}/forbidden-google-api.txt"
if python3 "${deploy_dir}/libexec/validate-release-tree.py" \
  gsyen gsyen-web test-1 "${release_dir}" >/dev/null 2>&1; then
  fail "unapproved Google/GCP API host incorrectly passed release validation"
fi
rm -- "${release_dir}/forbidden-google-api.txt"
printf '%s\n' 'https://old-service.run.app' > "${release_dir}/forbidden-run-app.txt"
if python3 "${deploy_dir}/libexec/validate-release-tree.py" \
  gsyen gsyen-web test-1 "${release_dir}" >/dev/null 2>&1; then
  fail "run.app artifact incorrectly passed release validation"
fi
rm -- "${release_dir}/forbidden-run-app.txt"
bash "${deploy_dir}/libexec/stage-release.sh" \
  gsyen gsyen-web test-1 "${release_dir}" --check >/dev/null
chmod 0664 "${release_dir}/server.cjs"
if python3 "${deploy_dir}/libexec/validate-release-tree.py" \
  gsyen gsyen-web test-1 "${release_dir}" >/dev/null 2>&1; then
  fail "group-writable release incorrectly passed validation"
fi
chmod 0644 "${release_dir}/server.cjs"
if python3 - "${release_dir}/server.cjs" <<'PY'
import os
import sys

try:
    os.setxattr(sys.argv[1], b"user.gsyen-release-test", b"1")
except (AttributeError, OSError):
    raise SystemExit(77)
PY
then
  if python3 "${deploy_dir}/libexec/validate-release-tree.py" \
    gsyen gsyen-web test-1 "${release_dir}" >/dev/null 2>&1; then
    fail "extended-attribute release incorrectly passed validation"
  fi
  python3 - "${release_dir}/server.cjs" <<'PY'
import os
import sys

os.removexattr(sys.argv[1], b"user.gsyen-release-test")
PY
fi
chmod 4644 "${release_dir}/server.cjs"
if python3 "${deploy_dir}/libexec/validate-release-tree.py" \
  gsyen gsyen-web test-1 "${release_dir}" >/dev/null 2>&1; then
  fail "setuid release incorrectly passed validation"
fi
chmod 0644 "${release_dir}/server.cjs"
printf '%s\n' linked > "${release_dir}/linked-target"
ln -s linked-target "${release_dir}/safe-link"
python3 "${deploy_dir}/libexec/validate-release-tree.py" \
  gsyen gsyen-web test-1 "${release_dir}" >/dev/null
rm -- "${release_dir}/safe-link" "${release_dir}/linked-target"
ln -s ../../outside "${release_dir}/escape"
if python3 "${deploy_dir}/libexec/validate-release-tree.py" \
  gsyen gsyen-web test-1 "${release_dir}" >/dev/null 2>&1; then
  fail "escaping release symlink incorrectly passed validation"
fi
rm -- "${release_dir}/escape"
ln -s missing-target "${release_dir}/dangling"
if python3 "${deploy_dir}/libexec/validate-release-tree.py" \
  gsyen gsyen-web test-1 "${release_dir}" >/dev/null 2>&1; then
  fail "dangling release symlink incorrectly passed validation"
fi
rm -- "${release_dir}/dangling"
printf '%s\n' 'forbidden' > "${release_dir}/.env.production"
if python3 "${deploy_dir}/libexec/validate-release-tree.py" \
  gsyen gsyen-web test-1 "${release_dir}" >/dev/null 2>&1; then
  fail "release-bundled runtime environment incorrectly passed validation"
fi
rm -- "${release_dir}/.env.production"

stalwart_candidate="${temporary_dir}/stalwart-candidate"
install -d -m 0755 "${stalwart_candidate}/bin"
printf '%s\n' '#!/usr/bin/env sh' 'exit 0' > "${stalwart_candidate}/bin/stalwart"
chmod 0755 "${stalwart_candidate}/bin/stalwart"
stalwart_binary_hash="$(sha256sum "${stalwart_candidate}/bin/stalwart" | awk '{print $1}')"
printf '%s\n' \
  '{"schema":1,"space":"gsyen","app":"stalwart","release_id":"stalwart-test","source_commit":"0123456789abcdef0123456789abcdef01234567","built_at":"2026-08-26T00:00:00Z"}' \
  > "${stalwart_candidate}/RELEASE.json"
printf '%s\n' \
  '{"schema":1,"source_commit":"0123456789abcdef0123456789abcdef01234567","public_origins":[],"providers":["aliyun-ecs","stalwart"],"allowed_google_services":[]}' \
  > "${stalwart_candidate}/BUILD.json"
printf '%s\n' \
  "{\"schema\":1,\"version\":\"99.99.99\",\"platform\":\"x86_64-unknown-linux-gnu\",\"source_url\":\"https://github.com/stalwartlabs/stalwart/releases/download/v99.99.99/stalwart.tar.gz\",\"archive_sha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"binary_sha256\":\"${stalwart_binary_hash}\"}" \
  > "${stalwart_candidate}/STALWART_RELEASE.json"
python3 "${deploy_dir}/libexec/validate-stalwart-release.py" \
  "${stalwart_candidate}" >/dev/null
cp "${stalwart_candidate}/STALWART_RELEASE.json" \
  "${stalwart_candidate}/STALWART_RELEASE.json.safe"
python3 - "${stalwart_candidate}/STALWART_RELEASE.json" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
manifest = json.loads(path.read_text(encoding="utf-8"))
manifest["source_url"] = "https://googleapis.com/stalwart.tar.gz"
path.write_text(json.dumps(manifest), encoding="utf-8")
PY
if python3 "${deploy_dir}/libexec/validate-stalwart-release.py" \
  "${stalwart_candidate}" >/dev/null 2>&1; then
  fail "an exact GCP-hosted Stalwart source incorrectly passed validation"
fi
mv "${stalwart_candidate}/STALWART_RELEASE.json.safe" \
  "${stalwart_candidate}/STALWART_RELEASE.json"
bash "${deploy_dir}/libexec/stage-release.sh" \
  gsyen stalwart stalwart-test "${stalwart_candidate}" --check >/dev/null

empty_apps="${temporary_dir}/empty-apps"
install -d -m 0755 "${empty_apps}"
if python3 "${deploy_dir}/libexec/verify-release-inventory.py" create gsyen \
  "${empty_apps}" "${temporary_dir}/empty-release-inventory.json" >/dev/null 2>&1; then
  fail "a backup inventory missing required GSYEN applications incorrectly passed"
fi

mail_candidate="${temporary_dir}/mail-candidate"
install -d -m 0755 "${mail_candidate}/src"
printf '%s\n' 'export const candidate = true;' > "${mail_candidate}/src/server.mjs"
printf '%s\n' \
  '{"schema":1,"space":"gsyen","app":"mail-ingest","release_id":"mail-test","source_commit":"0123456789abcdef0123456789abcdef01234567","built_at":"2026-08-26T00:00:00Z"}' \
  > "${mail_candidate}/RELEASE.json"
printf '%s\n' \
  '{"schema":1,"source_commit":"0123456789abcdef0123456789abcdef01234567","public_origins":["https://mail-ingest.gsyen.com"],"providers":["aliyun-ecs","cloudflare-queue","stalwart"],"allowed_google_services":[]}' \
  > "${mail_candidate}/BUILD.json"
bash "${deploy_dir}/install-mail-ingest.sh" \
  mail-test "${mail_candidate}" --check >/dev/null
if grep -Eq 'rsync[^#\n]*--delete|app_dir=' "${deploy_dir}/install-mail-ingest.sh"; then
  fail "legacy mail installer still writes or deletes the mutable application root"
fi

PYTHONDONTWRITEBYTECODE=1 python3 \
  "${deploy_dir}/tests/test_content_inventory.py" >/dev/null 2>&1
assert_file_contains "${deploy_dir}/libexec/validate-tar-archive.py" \
  'archive link target escapes the restore root'
assert_file_contains "${deploy_dir}/libexec/validate-tar-archive.py" \
  'hard-link target is absent or not a regular file'
assert_file_contains "${deploy_dir}/libexec/validate-tar-archive.py" \
  'privileged ACL/xattr metadata is forbidden'
: > "${temporary_dir}/empty.urls"
if bash "${deploy_dir}/libexec/healthcheck-space.sh" gsyen "${temporary_dir}/empty.urls" >/dev/null 2>&1; then
  fail "empty health configuration incorrectly succeeded"
fi
printf '%s\n' 'bad|http://example.com:18180/|200' > "${temporary_dir}/external.urls"
if bash "${deploy_dir}/libexec/healthcheck-space.sh" halfsphere "${temporary_dir}/external.urls" >/dev/null 2>&1; then
  fail "external health-check URL incorrectly succeeded"
fi
install -d "${temporary_dir}/bin"
printf '%s\n' '#!/usr/bin/env bash' \
  'printf "%s\\n" "LISTEN 0 128 0.0.0.0:18180 0.0.0.0:*"' > "${temporary_dir}/bin/ss"
chmod 0755 "${temporary_dir}/bin/ss"
if PATH="${temporary_dir}/bin:${PATH}" \
  bash "${deploy_dir}/libexec/assert-loopback-listener.sh" 18180 1 >/dev/null 2>&1; then
  fail "public listener incorrectly passed loopback guard"
fi
printf '%s\n' '#!/usr/bin/env bash' \
  'printf "%s\\n" "LISTEN 0 128 127.0.0.1:18180 0.0.0.0:* users:((\\"node\\",pid=456,fd=10))"' \
  'printf "%s\\n" "LISTEN 0 128 [::1]:18180 [::]:* users:((\\"node\\",pid=123,fd=11))"' > "${temporary_dir}/bin/ss"
chmod 0755 "${temporary_dir}/bin/ss"
if PATH="${temporary_dir}/bin:${PATH}" \
  bash "${deploy_dir}/libexec/assert-loopback-listener.sh" 18180 1 123 >/dev/null 2>&1; then
  fail "mixed-PID dual-stack listeners incorrectly passed ownership guard"
fi
printf '%s\n' '#!/usr/bin/env bash' \
  'printf "%s\\n" "LISTEN 0 128 127.0.0.1:18180 0.0.0.0:* users:((\\"node\\",pid=123,fd=10))"' > "${temporary_dir}/bin/ss"
chmod 0755 "${temporary_dir}/bin/ss"
PATH="${temporary_dir}/bin:${PATH}" \
  bash "${deploy_dir}/libexec/assert-loopback-listener.sh" 18180 1 123 >/dev/null
if PATH="${temporary_dir}/bin:${PATH}" \
  bash "${deploy_dir}/libexec/assert-loopback-listener.sh" 18180 1 456 >/dev/null 2>&1; then
  fail "listener owned by a different PID incorrectly passed ownership guard"
fi
if bash "${deploy_dir}/libexec/backup-space.sh" gsyen /missing/config >/dev/null 2>&1; then
  fail "backup without --apply incorrectly succeeded"
fi
if bash "${deploy_dir}/libexec/validate-env-file.sh" halfsphere \
  /srv/gsyen/config/wrong.env REQUIRED >/dev/null 2>&1; then
  fail "cross-space environment path incorrectly succeeded"
fi
assert_file_contains "${deploy_dir}/libexec/validate-env-file.sh" 'gsyen-api-7586'
assert_file_contains "${deploy_dir}/libexec/validate-env-file.sh" '560294832548'
if bash "${deploy_dir}/libexec/restore-space.sh" halfsphere /missing/archive /missing/identity /missing/config >/dev/null 2>&1; then
  fail "restore without --apply incorrectly succeeded"
fi
if bash "${deploy_dir}/libexec/render-caddy-fragment.sh" halfsphere \
  "${temporary_dir}/candidate.caddy" localhost api.example.com >/dev/null 2>&1; then
  fail "unsafe Caddy domain incorrectly succeeded"
fi

bash "${deploy_dir}/install-foundation.sh" --check >/dev/null
bash "${deploy_dir}/install-mail-ingest.sh" --check >/dev/null
assert_file_contains "${deploy_dir}/install-foundation.sh" 'systemd-available'
assert_file_contains "${deploy_dir}/install-foundation.sh" 'validate_existing_tmpfiles_paths'
assert_file_contains "${deploy_dir}/install-foundation.sh" 'permissions were not changed'
assert_file_contains "${deploy_dir}/install-foundation.sh" 'ensure_root_directory "\$\{config_dir\}/caddy-active" 755'
assert_file_contains "${deploy_dir}/install-foundation.sh" 'systemd-sysusers --dry-run'
assert_file_contains "${deploy_dir}/install-foundation.sh" 'validate_existing_account_contract'
assert_file_contains "${deploy_dir}/install-foundation.sh" 'validate_install_destination'
assert_file_contains "${deploy_dir}/install-foundation.sh" 'LOCKED_PREFLIGHT_BEFORE_MANAGED_WRITE'
assert_file_order "${deploy_dir}/install-foundation.sh" \
  'run_apply_preflight # APPLY_PREFLIGHT_BEFORE_FIRST_WRITE' \
  '# FIRST_SYSTEM_WRITE:'
assert_file_order "${deploy_dir}/install-foundation.sh" \
  'run_apply_preflight # LOCKED_PREFLIGHT_BEFORE_MANAGED_WRITE' \
  'install -d -o root -g root -m 0700 /var/backups/gsyen-aliyun-foundation'
assert_file_order "${deploy_dir}/install-foundation.sh" \
  'validate_existing_tmpfiles_paths \' \
  'run_apply_preflight # APPLY_PREFLIGHT_BEFORE_FIRST_WRITE'
assert_file_contains "${deploy_dir}/libexec/stage-release.sh" 'validate-boundary-gate\.sh'
assert_file_contains "${deploy_dir}/libexec/stage-release.sh" 'gsyen:stalwart'
assert_file_contains "${deploy_dir}/libexec/stage-release.sh" \
  'existing managed directory must already be root:\$\{business_group\} mode 0750'
assert_file_contains "${deploy_dir}/libexec/stage-release.sh" 'permissions were not changed'
assert_file_not_contains "${deploy_dir}/libexec/stage-release.sh" \
  'install -d .*\$\{app_root\}.*\$\{releases_dir\}'
assert_file_order "${deploy_dir}/libexec/stage-release.sh" \
  'flock -n 9' 'validate_existing_managed_release_directory "${app_root}"'
assert_file_order "${deploy_dir}/libexec/stage-release.sh" \
  'validate_existing_managed_release_directory "${app_root}"' \
  'if [[ -e "${release_dir}" || -L "${release_dir}" ]]'
assert_file_order "${deploy_dir}/libexec/stage-release.sh" \
  'ensure_managed_release_directory "${app_root}"' \
  'mktemp -d "${app_root}/.stage-'
assert_file_contains "${deploy_dir}/libexec/promote-release.sh" \
  '^"\$\{libexec_dir\}/validate-boundary-gate\.sh" "\$\{space\}" >/dev/null$'
assert_file_order "${deploy_dir}/libexec/promote-release.sh" \
  'flock -n 9' '"${libexec_dir}/validate-boundary-gate.sh" "${space}" >/dev/null'
assert_file_order "${deploy_dir}/libexec/promote-release.sh" \
  '"${libexec_dir}/validate-boundary-gate.sh" "${space}" >/dev/null' \
  'mv -Tf -- "${temporary_link}" "${current_link}"'
assert_file_contains "${deploy_dir}/libexec/backup-space.sh" 'gsyen-aliyun-storage-capacity\.lock'
assert_file_contains "${deploy_dir}/libexec/backup-space.sh" 'verify-release-inventory\.py'
assert_file_contains "${deploy_dir}/libexec/backup-space.sh" 'content_inventory\.py" create'
assert_file_contains "${deploy_dir}/libexec/backup-space.sh" 'content_inventory\.py" verify'
assert_file_contains "${deploy_dir}/libexec/backup-space.sh" 'validate-backup-symlinks\.py'
assert_file_not_contains "${deploy_dir}/libexec/backup-space.sh" '-type s'
assert_file_contains "${deploy_dir}/libexec/backup-space.sh" 'findmnt --kernel --raw --noheadings --output TARGET'
assert_file_contains "${deploy_dir}/libexec/backup-space.sh" 'du -scx --apparent-size -B1'
assert_file_contains "${deploy_dir}/libexec/backup-space.sh" 'archive_paths\+=\(stalwart\)'
assert_file_contains "${deploy_dir}/libexec/backup-space.sh" 'OFFHOST_COPY_REQUIRED'
assert_file_not_contains "${deploy_dir}/libexec/backup-space.sh" \
  'tar --create .*--numeric-owner'
assert_file_order "${deploy_dir}/libexec/backup-space.sh" \
  'content_inventory.py" create' 'tar --create'
assert_file_order "${deploy_dir}/libexec/backup-space.sh" \
  'tar --create' 'content_inventory.py" verify'
assert_file_contains "${deploy_dir}/libexec/restore-space.sh" 'effective_tar_limit'
assert_file_contains "${deploy_dir}/libexec/restore-space.sh" 'verify-release-inventory\.py'
assert_file_contains "${deploy_dir}/libexec/restore-space.sh" \
  'tar --extract --no-same-owner'
assert_file_contains "${deploy_dir}/libexec/restore-space.sh" \
  'apply-tar-symbolic-owners\.py'
assert_file_contains "${deploy_dir}/libexec/restore-space.sh" \
  'content_inventory\.py" verify'
assert_file_contains "${deploy_dir}/libexec/restore-space.sh" 'staging_dir}/stalwart'
assert_file_order "${deploy_dir}/libexec/restore-space.sh" \
  'validate-tar-archive.py' 'tar --extract --no-same-owner'
assert_file_order "${deploy_dir}/libexec/restore-space.sh" \
  'apply-tar-symbolic-owners.py' 'content_inventory.py" verify'
assert_file_order "${deploy_dir}/libexec/restore-space.sh" \
  '"${space_root}" "${staging_dir}/exports/content-inventory.json" >/dev/null' \
  'restore_exports_root='
assert_file_contains "${deploy_dir}/libexec/validate-tar-archive.py" \
  'empty, invalid or unapproved symbolic owner/group'
assert_file_contains "${deploy_dir}/libexec/validate-tar-archive.py" \
  'source\.read\(1024 \* 1024\)'
assert_file_contains "${deploy_dir}/tests/test_content_inventory.py" \
  'legacy-without-inventory\.tar'
assert_file_contains "${deploy_dir}/libexec/activate-caddy-fragment.sh" 'caddy validate'
assert_file_contains "${deploy_dir}/libexec/activate-caddy-fragment.sh" 'systemctl reload caddy'
assert_file_contains "${deploy_dir}/libexec/activate-caddy-fragment.sh" 'active fragment changed after approval'
assert_file_contains "${deploy_dir}/libexec/activate-caddy-fragment.sh" 'candidate has an external or unexpected import'
assert_file_contains "${deploy_dir}/libexec/activate-caddy-fragment.sh" 'a reviewed immutable baseline fragment is required'
assert_file_contains "${deploy_dir}/libexec/rollback-caddy-fragment.sh" 'new approved atomic activation'
assert_file_contains "${deploy_dir}/libexec/rollback-caddy-fragment.sh" '\[0-9a-f\]\{64\}'
assert_file_contains "${deploy_dir}/network/firewall-security-group.desired.tsv" \
  $'phase1\tdedicated-target-sg\tingress\ttcp\t25,465,587,993,995,4190,8080,46477\t0.0.0.0/0\tABSENT'
for approval_path in \
  'release-approvals/gsyen/gsyen-web' \
  'release-approvals/gsyen/gsyen-api' \
  'release-approvals/gsyen/sgsyen-web' \
  'release-approvals/gsyen/sgsyen-api' \
  'release-approvals/gsyen/gsyen-model' \
  'release-approvals/gsyen/mail-ingest' \
  'release-approvals/gsyen/stalwart' \
  'release-approvals/halfsphere/halfsphere-web' \
  'release-approvals/halfsphere/halfsphere-api'; do
  assert_file_contains "${deploy_dir}/install-foundation.sh" "${approval_path}"
done
assert_file_contains "${deploy_dir}/install-foundation.sh" \
  'install -d -o root -g root -m 0700'
assert_file_contains "${deploy_dir}/README.md" \
  'python3 -m venv --copies \.venv'
assert_file_contains "${deploy_dir}/libexec/stage-release.sh" \
  'minimum_free_after_stage=.*5 \* 1024 \* 1024 \* 1024'
assert_file_contains "${deploy_dir}/tmpfiles.d/gsyen.conf" \
  '^d /srv/gsyen/data/gsyen-model/datasets/versions 0750 root gsyen '
assert_file_contains "${deploy_dir}/install-foundation.sh" 'model-data-approvals'
assert_file_contains "${deploy_dir}/install-foundation.sh" \
  '/var/backups/gsyen-aliyun-model-data:700'
assert_file_contains "${deploy_dir}/libexec/stage-model-dataset.sh" \
  '^readonly approval_root="/etc/gsyen-aliyun/model-data-approvals"$'
assert_file_contains "${deploy_dir}/libexec/stage-model-dataset.sh" \
  'VERSION_ID\.stage'
assert_file_contains "${deploy_dir}/libexec/stage-model-dataset.sh" \
  'mv -Tn -- "\$\{staging_dir\}" "\$\{version_dir\}"'
assert_file_contains "${deploy_dir}/libexec/model_dataset_transaction.py" \
  'candidate path must not contain symbolic-link or alias components'
assert_file_contains "${deploy_dir}/libexec/model_dataset_transaction.py" \
  'manifest is not in deterministic canonical form'
assert_file_contains "${deploy_dir}/libexec/activate-model-dataset.sh" \
  '^readonly service_name="gsyen-model\.service"$'
assert_file_contains "${deploy_dir}/libexec/activate-model-dataset.sh" \
  'gsyen-model\.env\.before'
assert_file_contains "${deploy_dir}/libexec/activate-model-dataset.sh" \
  'atomic_set_link "\$\{current_link\}"'
assert_file_contains "${deploy_dir}/libexec/activate-model-dataset.sh" \
  'atomic_set_link "\$\{previous_link\}"'
assert_file_contains "${deploy_dir}/libexec/activate-model-dataset.sh" \
  'validate-env-file\.sh'
assert_file_contains "${deploy_dir}/libexec/activate-model-dataset.sh" \
  'health "\$\{desired_dataset_sha\}"'
if grep -Eo '[A-Za-z0-9_-]+\.service' \
  "${deploy_dir}/libexec/activate-model-dataset.sh" | \
  grep -Ev 'gsyen-model\.service'; then
  fail "model dataset transaction names a non-model service"
fi
PYTHONDONTWRITEBYTECODE=1 python3 \
  "${deploy_dir}/tests/test_model_dataset_transaction.py" >/dev/null
bash "${deploy_dir}/tests/validate-systemd-transaction.sh" >/dev/null
echo "Alibaba Cloud deployment template validation passed."
