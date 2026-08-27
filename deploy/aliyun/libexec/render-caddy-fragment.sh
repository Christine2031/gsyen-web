#!/usr/bin/env bash
set -euo pipefail

readonly program_name="${0##*/}"
readonly script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly deploy_dir="$(cd "${script_dir}/.." && pwd)"

usage() {
  cat >&2 <<EOF
Usage:
  ${program_name} gsyen OUTPUT WEB_DOMAIN API_DOMAIN SGSYEN_WEB_DOMAIN SGSYEN_API_DOMAIN MAIL_INGEST_DOMAIN
  ${program_name} halfsphere OUTPUT WEB_DOMAIN API_DOMAIN

This only renders a candidate fragment. It never imports or reloads Caddy.
EOF
}

valid_domain() {
  local domain="$1"
  local label
  local labels=()
  [[ ${#domain} -le 253 && "${domain}" == *.* && "${domain}" != *.invalid &&
     "${domain}" != *.localhost && "${domain}" != *..* && "${domain}" != *.run.app ]] || return 1
  IFS='.' read -r -a labels <<<"${domain}"
  for label in "${labels[@]}"; do
    [[ ${#label} -ge 1 && ${#label} -le 63 &&
       "${label}" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$ ]] || return 1
  done
  return 0
}

if [[ $# -lt 1 ]]; then
  usage
  exit 64
fi

space="$1"
shift
case "${space}" in
  gsyen)
    [[ $# -eq 6 ]] || { usage; exit 64; }
    output="$1"; shift
    names=(GSYEN_WEB GSYEN_API SGSYEN_WEB SGSYEN_API GSYEN_MAIL_INGEST)
    template="${deploy_dir}/caddy/gsyen.Caddyfile.template"
    ;;
  halfsphere)
    [[ $# -eq 3 ]] || { usage; exit 64; }
    output="$1"; shift
    names=(HALFSPHERE_WEB HALFSPHERE_API)
    template="${deploy_dir}/caddy/halfsphere.Caddyfile.template"
    ;;
  *) usage; exit 64 ;;
esac

[[ "${output}" = /* && ! -d "${output}" && ! -L "${output}" ]] || {
  echo "${program_name}: OUTPUT must be an absolute, non-symlink file path" >&2
  exit 64
}
[[ -f "${template}" ]] || {
  echo "${program_name}: missing template ${template}" >&2
  exit 66
}

domains=("$@")
for domain in "${domains[@]}"; do
  valid_domain "${domain}" || {
    echo "${program_name}: invalid or unsafe domain: ${domain}" >&2
    exit 65
  }
done

output_dir="$(dirname "${output}")"
[[ -d "${output_dir}" ]] || {
  echo "${program_name}: output directory does not exist: ${output_dir}" >&2
  exit 66
}

umask 022
temporary="$(mktemp "${output_dir}/.${program_name}.XXXXXX")"
trap 'rm -f "${temporary}"' EXIT
cp "${template}" "${temporary}"

for index in "${!names[@]}"; do
  token="__${names[$index]}_SITE__"
  domain="${domains[$index]}"
  sed -i.bak "s|${token}|https://${domain}|g" "${temporary}"
  rm -f "${temporary}.bak"
done

if grep -Eq '__[A-Z0-9_]+__|run\.app|googleapis\.com|storage\.googleapis\.com' "${temporary}"; then
  echo "${program_name}: unresolved or forbidden GCP value remains" >&2
  exit 65
fi

if command -v caddy >/dev/null 2>&1; then
  caddy fmt --overwrite "${temporary}" >/dev/null
  caddy validate --adapter caddyfile --config "${temporary}" >/dev/null
else
  echo "${program_name}: caddy is required for syntax validation" >&2
  exit 69
fi

if [[ -e "${output}" ]]; then
  if cmp -s "${temporary}" "${output}"; then
    echo "Rendered candidate is unchanged: ${output}"
    exit 0
  fi
  echo "${program_name}: refusing to overwrite differing candidate ${output}" >&2
  echo "Render to a new path and review the diff." >&2
  exit 73
fi
install -m 0644 "${temporary}" "${output}"
echo "Rendered ${output}; it is not active and Caddy was not reloaded."
