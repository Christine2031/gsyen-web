#!/usr/bin/env bash
set -euo pipefail

# Compatibility entry point for operators who used the original mail-ingest
# installer. It deliberately delegates to the immutable release staging gate;
# it never copies into /srv/gsyen/apps/mail-ingest and never changes `current`.

readonly program_name="${0##*/}"
readonly deploy_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly source_template="${deploy_root}/deploy/aliyun/mail-ingest"
readonly stage_script="${deploy_root}/deploy/aliyun/libexec/stage-release.sh"
readonly promote_script="/usr/local/libexec/gsyen-aliyun/promote-release.sh"

usage() {
  cat >&2 <<EOF
Usage:
  ${program_name} --check
  ${program_name} RELEASE_ID RELEASE_CANDIDATE --check|--apply

The one-argument form only checks the version-controlled source template. A
deployable RELEASE_CANDIDATE must be built separately, must contain RELEASE.json
and BUILD.json, and is validated/staged through stage-release.sh. --apply only
stages the approved immutable release; it never promotes current, installs a
live unit, starts a service, changes Caddy, DNS or MX.
EOF
}

static_check() {
  [[ -f "${source_template}/src/server.mjs" &&
     -f "${source_template}/src/smtp.mjs" &&
     -f "${source_template}/package.json" &&
     -x "${stage_script}" ]] || {
    echo "${program_name}: mail-ingest source or immutable staging gate is incomplete" >&2
    exit 66
  }
  bash -n "$0"
  node --check "${source_template}/src/server.mjs"
  node --check "${source_template}/src/smtp.mjs"
}

if [[ $# -eq 1 && "$1" == --check ]]; then
  static_check
  echo "Mail ingest sources passed static checks. No release was staged or promoted."
  exit 0
fi

[[ $# -eq 3 ]] || {
  usage
  exit 64
}
readonly release_id="$1"
readonly candidate="$2"
readonly mode="$3"
[[ "${mode}" == --check || "${mode}" == --apply ]] || {
  usage
  exit 64
}

static_check
[[ -d "${candidate}" && ! -L "${candidate}" &&
   -f "${candidate}/RELEASE.json" && ! -L "${candidate}/RELEASE.json" &&
   -f "${candidate}/BUILD.json" && ! -L "${candidate}/BUILD.json" ]] || {
  echo "${program_name}: a real candidate directory with RELEASE.json and BUILD.json is required" >&2
  exit 66
}

"${stage_script}" gsyen mail-ingest "${release_id}" "${candidate}" "${mode}"

if [[ "${mode}" == --apply ]]; then
  cat <<EOF
The immutable release was staged but was not promoted or started.
After a separate promotion approval, run:
  ${promote_script} gsyen mail-ingest ${release_id} --check
  ${promote_script} gsyen mail-ingest ${release_id} --apply
MX, Caddy and the live systemd unit remain unchanged.
EOF
fi
