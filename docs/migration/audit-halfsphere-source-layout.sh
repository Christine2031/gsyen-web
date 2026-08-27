#!/usr/bin/env bash
# Read-only point-in-time evidence for a HalfSphere source-layout handoff.
# It never prints file contents, ignored/env-like paths, or remote URLs.

set -euo pipefail

program_name="$(basename "$0")"

if [[ "$#" -lt 2 || "$#" -gt 3 ]]; then
  echo "Usage: ${program_name} SOURCE_PATH TARGET_PATH [EXPECTED_HEAD]" >&2
  exit 64
fi

readonly source_path="$1"
readonly target_path="$2"
readonly expected_head="${3:-}"

if [[ -n "$expected_head" && ! "$expected_head" =~ ^[0-9a-f]{40}$ ]]; then
  echo "${program_name}: EXPECTED_HEAD must be a lowercase full Git commit" >&2
  exit 64
fi
for required_directory in "$source_path" "$target_path"; do
  if [[ ! -d "$required_directory" || -L "$required_directory" ]]; then
    echo "${program_name}: source and target must both be real directories" >&2
    exit 66
  fi
done

hash_stream() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    echo "no SHA-256 implementation found" >&2
    return 69
  fi
}

hash_untracked_content_manifest() {
  local path="$1"
  git -C "$path" ls-files -z --others --exclude-standard |
    python3 -c '
import hashlib
import os
import stat
import sys

root = os.fsencode(sys.argv[1])
members = sorted(item for item in sys.stdin.buffer.read().split(b"\0") if item)
manifest = hashlib.sha256()

def add(value):
    manifest.update(len(value).to_bytes(8, "big"))
    manifest.update(value)

for relative in members:
    full_path = os.path.join(root, relative)
    metadata = os.lstat(full_path)
    add(relative)
    add(f"{stat.S_IMODE(metadata.st_mode):04o}".encode())
    if stat.S_ISREG(metadata.st_mode):
        add(b"file")
        content = hashlib.sha256()
        with open(full_path, "rb") as handle:
            while chunk := handle.read(1024 * 1024):
                content.update(chunk)
        add(content.digest())
    elif stat.S_ISLNK(metadata.st_mode):
        add(b"symlink")
        add(os.readlink(full_path))
    else:
        add(b"special")

print(manifest.hexdigest())
' "$path"
}

describe_path() {
  local label="$1"
  local path="$2"
  local path_type

  if [[ -L "$path" ]]; then
    path_type=symlink
  elif [[ -d "$path" ]]; then
    path_type=directory
  elif [[ -e "$path" ]]; then
    path_type=other
  else
    path_type=missing
  fi

  printf '%s_PATH=%s\n%s_TYPE=%s\n' "$label" "$path" "$label" "$path_type"
  [[ "$path_type" == directory ]] || return 0
  du -sk -- "$path" | awk -v label="$label" '{printf "%s_SIZE_KiB=%s\n", label, $1}'
  find "$path" -mindepth 1 -maxdepth 1 -print | wc -l |
    awk -v label="$label" '{printf "%s_TOP_LEVEL_ENTRIES=%s\n", label, $1}'
}

audit_git_tree() {
  local path="$1"
  local head branch upstream

  if ! git -C "$path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "GIT_WORKTREE=no"
    return 0
  fi

  head="$(git -C "$path" rev-parse HEAD)"
  branch="$(git -C "$path" symbolic-ref --short -q HEAD || true)"
  upstream="$(git -C "$path" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
  printf 'GIT_WORKTREE=yes\nHEAD=%s\nBRANCH=%s\nUPSTREAM=%s\n' \
    "$head" "${branch:-DETACHED}" "${upstream:-none}"

  if [[ -n "$expected_head" && "$head" != "$expected_head" ]]; then
    echo "EXPECTED_HEAD_MISMATCH=${expected_head}" >&2
    return 1
  fi

  git -C "$path" remote | paste -sd, - | awk '{printf "REMOTE_NAMES=%s\n", $0}'
  git -C "$path" status --porcelain=v1 --untracked-files=all | awk '
    BEGIN {total=0; staged=0; worktree=0; untracked=0; conflicted=0}
    {
      xy=substr($0,1,2); total++
      if (xy=="??") {untracked++; next}
      if (xy ~ /^(DD|AU|UD|UA|DU|AA|UU)$/) conflicted++
      if (substr(xy,1,1)!=" ") staged++
      if (substr(xy,2,1)!=" ") worktree++
    }
    END {
      printf "STATUS_ENTRIES=%d\nSTAGED_ENTRIES=%d\nWORKTREE_ENTRIES=%d\nUNTRACKED_ENTRIES=%d\nCONFLICTED_ENTRIES=%d\n", total, staged, worktree, untracked, conflicted
    }'

  printf 'STATUS_MANIFEST_SHA256='
  git -C "$path" status --porcelain=v1 -z --untracked-files=all | hash_stream
  printf 'HEAD_DIFF_BINARY_SHA256='
  git -C "$path" diff --binary HEAD -- . | hash_stream
  printf 'INDEX_DIFF_BINARY_SHA256='
  git -C "$path" diff --cached --binary -- . | hash_stream
  printf 'TRACKED_PATH_MANIFEST_SHA256='
  git -C "$path" ls-files -z | hash_stream
  printf 'UNTRACKED_CONTENT_MANIFEST_SHA256='
  hash_untracked_content_manifest "$path"

  printf 'IGNORED_ENTRIES='
  git -C "$path" status --porcelain=v1 --ignored --untracked-files=all |
    awk 'substr($0,1,2)=="!!"{n++} END{print n+0}'
  printf 'ENV_LIKE_FILES='
  find "$path" -path "$path/.git" -prune -o -type f \
    \( -name '.env' -o -name '.env.*' -o -name '*.env' \) -print |
    wc -l | awk '{print $1}'

  if git -C "$path" fsck --full --no-dangling >/dev/null 2>&1; then
    echo "GIT_FSCK=pass"
  else
    echo "GIT_FSCK=fail" >&2
    return 1
  fi
}

describe_path SOURCE "$source_path"
describe_path TARGET "$target_path"
audit_git_tree "$source_path"

if [[ -d "$target_path" ]]; then
  target_entries="$(find "$target_path" -mindepth 1 -maxdepth 1 -print | wc -l | tr -d ' ')"
  [[ "$target_entries" == 0 ]] || {
    echo "TARGET_NOT_EMPTY=yes" >&2
    exit 1
  }
fi

echo "READ_ONLY_LAYOUT_AUDIT=pass"
