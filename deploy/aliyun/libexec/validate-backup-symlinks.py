#!/usr/bin/env python3
"""Fail closed when a protected backup-tree symlink escapes its business space."""

from __future__ import annotations

import os
import stat
import sys
from pathlib import Path


def fail(message: str) -> None:
    print(f"validate-backup-symlinks.py: {message}", file=sys.stderr)
    raise SystemExit(78)


def real_directory(path: Path, label: str) -> Path:
    if not path.is_absolute():
        fail(f"{label} must be absolute")
    try:
        metadata = path.lstat()
    except OSError as error:
        fail(f"cannot inspect {label}: {error}")
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
        fail(f"{label} must be a real directory")
    try:
        return path.resolve(strict=True)
    except (OSError, RuntimeError) as error:
        fail(f"cannot resolve {label}: {error}")


def is_beneath(path: Path, root: Path) -> bool:
    try:
        return os.path.commonpath((path, root)) == str(root) and path != root
    except ValueError:
        return False


def walk_error(error: OSError) -> None:
    fail(f"cannot scan protected backup tree: {error}")


def main() -> None:
    if len(sys.argv) < 3:
        fail("usage: validate-backup-symlinks.py SPACE_ROOT PROTECTED_ROOT...")

    space_root = real_directory(Path(sys.argv[1]), "space root")
    protected_roots: list[Path] = []
    for raw_root in sys.argv[2:]:
        protected_root = real_directory(Path(raw_root), "protected root")
        if not is_beneath(protected_root, space_root):
            fail("protected root is outside the business space")
        protected_roots.append(protected_root)

    link_count = 0
    for protected_root in protected_roots:
        for directory, directory_names, file_names in os.walk(
            protected_root, followlinks=False, onerror=walk_error
        ):
            for name in (*directory_names, *file_names):
                link_path = Path(directory, name)
                if not link_path.is_symlink():
                    continue
                link_count += 1
                try:
                    resolved_link = link_path.resolve(strict=False)
                except (OSError, RuntimeError) as error:
                    fail(f"cannot resolve protected symlink {link_path}: {error}")
                if not is_beneath(resolved_link, space_root):
                    fail(f"symlink escapes {space_root}: {link_path}")

    print(f"Validated {link_count} protected backup symlink(s).")


if __name__ == "__main__":
    main()
