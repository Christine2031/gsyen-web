#!/usr/bin/env python3
"""Map validated tar symbolic identities to fresh-host UID/GID values."""

from __future__ import annotations

import argparse
import grp
import os
from pathlib import Path, PurePosixPath
import posixpath
import pwd
import stat
import sys
import tarfile

from content_inventory import IDENTITY_NAME, allowed_identities


class OwnershipError(ValueError):
    pass


def fail(message: str) -> "None":
    raise OwnershipError(message)


def normalized_name(name: str) -> str:
    if not name or name.startswith("/") or any(character in name for character in "\x00\r\n"):
        fail("archive member path is empty, absolute or contains a control character")
    normalized = posixpath.normpath(name)
    if normalized in {"", "."} or name.rstrip("/") != normalized:
        fail("archive member path is non-canonical")
    if normalized == ".." or normalized.startswith("../"):
        fail("archive member path escapes the extraction root")
    if PurePosixPath(normalized).parts[0] not in {"apps", "config", "data", "exports", "stalwart"}:
        fail("archive member has an unexpected top-level path")
    return normalized


def target_identity(space: str, owner: str, group: str) -> tuple[int, int]:
    owners, groups = allowed_identities(space)
    if (
        not owner
        or not group
        or not IDENTITY_NAME.fullmatch(owner)
        or not IDENTITY_NAME.fullmatch(group)
        or owner not in owners
        or group not in groups
    ):
        fail("archive has an empty, invalid or unapproved symbolic identity")
    try:
        target_uid = pwd.getpwnam(owner).pw_uid
        target_gid = grp.getgrnam(group).gr_gid
    except KeyError as error:
        raise OwnershipError("archive symbolic owner or group is absent on the target host") from error
    return target_uid, target_gid


def expected_type(member: tarfile.TarInfo, metadata: os.stat_result) -> bool:
    if member.isdir():
        return stat.S_ISDIR(metadata.st_mode)
    if member.issym():
        return stat.S_ISLNK(metadata.st_mode)
    if member.isfile() or member.islnk():
        return stat.S_ISREG(metadata.st_mode)
    return False


def apply_ownership(archive_path: Path, extraction_root: Path, space: str) -> None:
    if (
        not archive_path.is_absolute()
        or archive_path.is_symlink()
        or not archive_path.is_file()
        or not extraction_root.is_absolute()
        or extraction_root.is_symlink()
        or not extraction_root.is_dir()
    ):
        fail("archive and extraction root must be absolute real paths")
    members: list[tuple[str, tarfile.TarInfo]] = []
    try:
        with tarfile.open(archive_path, mode="r:") as archive:
            for member in archive:
                members.append((normalized_name(member.name), member))
    except (OSError, tarfile.TarError) as error:
        raise OwnershipError("cannot read validated tar for symbolic ownership mapping") from error

    # Files and links first; directories deepest-first so their final restrictive
    # modes cannot interfere with descendants still being normalized.
    members.sort(key=lambda item: (item[1].isdir(), -item[0].count("/"), item[0]))
    for name, member in members:
        target = extraction_root.joinpath(*PurePosixPath(name).parts)
        try:
            metadata = target.lstat()
        except OSError as error:
            raise OwnershipError(f"extracted archive member is missing: {name}") from error
        if not expected_type(member, metadata):
            fail(f"extracted archive member type differs from validated tar: {name}")
        if member.issym() and os.readlink(target) != member.linkname:
            fail(f"extracted symbolic-link target differs from validated tar: {name}")
        uid, gid = target_identity(space, member.uname, member.gname)
        os.chown(target, uid, gid, follow_symlinks=False)
        if not member.issym():
            os.chmod(target, member.mode & 0o7777, follow_symlinks=False)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("extraction_root", type=Path)
    parser.add_argument("--space", choices=("gsyen", "halfsphere"), required=True)
    args = parser.parse_args()
    try:
        apply_ownership(args.archive, args.extraction_root, args.space)
    except (OwnershipError, OSError) as error:
        print(f"apply-tar-symbolic-owners.py: {error}", file=sys.stderr)
        return 65
    print(f"Mapped validated {args.space} symbolic archive identities; numeric source IDs were ignored.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
