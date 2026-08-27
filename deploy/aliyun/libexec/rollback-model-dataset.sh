#!/usr/bin/env bash
set -euo pipefail

readonly libexec_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ $# -eq 2 ]] || {
  echo "Usage: ${0##*/} PREVIOUS_VERSION_ID --check|--apply" >&2
  exit 64
}
exec "${libexec_dir}/activate-model-dataset.sh" rollback "$1" "$2"
