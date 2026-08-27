#!/usr/bin/env python3
"""Fail-closed path/type validation for a decrypted migration tar archive."""

from __future__ import annotations

import posixpath
import argparse
import grp
import hashlib
import os
import pwd
import sys
import tarfile
from pathlib import PurePosixPath

from content_inventory import (
    IDENTITY_NAME,
    InventoryError,
    allowed_identities,
    parse_manifest_bytes,
)


def fail(message: str) -> None:
    print(f"validate-tar-archive.py: {message}", file=sys.stderr)
    raise SystemExit(65)


def normalized_member(name: str, allowed_top_levels: set[str]) -> str:
    if not name or name.startswith("/") or "\x00" in name or "\n" in name or "\r" in name:
        fail("archive contains an empty, absolute or control-character path")
    normalized = posixpath.normpath(name)
    if normalized in {"", "."} or name.rstrip("/") != normalized:
        fail("archive contains a non-canonical path")
    if normalized == ".." or normalized.startswith("../"):
        fail("archive path escapes the restore root")
    top_level = PurePosixPath(normalized).parts[0]
    if top_level not in allowed_top_levels:
        fail(f"unexpected top-level member: {top_level}")
    return normalized


def validate_link(
    member_name: str, link_name: str, symbolic: bool, allowed_top_levels: set[str]
) -> str:
    if (
        not link_name
        or link_name.startswith("/")
        or "\x00" in link_name
        or "\n" in link_name
        or "\r" in link_name
    ):
        fail("archive contains an absolute or empty link target")
    base = posixpath.dirname(member_name) if symbolic else ""
    target = posixpath.normpath(posixpath.join(base, link_name))
    if target == ".." or target.startswith("../"):
        fail("archive link target escapes the restore root")
    target_parts = PurePosixPath(target).parts
    if not target_parts or target_parts[0] not in allowed_top_levels:
        fail("archive link target has an unexpected top-level path")
    return target


def validate_pax_metadata(member: tarfile.TarInfo, name: str) -> None:
    for key in member.pax_headers:
        lowered = key.lower()
        if (
            "acl" in lowered
            or ".security." in lowered
            or ".trusted." in lowered
            or "capability" in lowered
        ):
            fail(f"privileged ACL/xattr metadata is forbidden: {name}")


def validate_symbolic_identity(member: tarfile.TarInfo, space: str, name: str) -> None:
    owners, groups = allowed_identities(space)
    if (
        not member.uname
        or not member.gname
        or not IDENTITY_NAME.fullmatch(member.uname)
        or not IDENTITY_NAME.fullmatch(member.gname)
        or member.uname not in owners
        or member.gname not in groups
    ):
        fail(f"empty, invalid or unapproved symbolic owner/group: {name}")
    try:
        pwd.getpwnam(member.uname)
        grp.getgrnam(member.gname)
    except KeyError:
        fail(f"symbolic owner/group does not exist on the target host: {name}")


def read_member(archive: tarfile.TarFile, member: tarfile.TarInfo, limit: int) -> bytes:
    if not member.isfile() or member.size < 0 or member.size > limit:
        fail(f"required inventory member is absent or too large: {member.name}")
    source = archive.extractfile(member)
    if source is None:
        fail(f"cannot read archive member: {member.name}")
    payload = source.read(limit + 1)
    if len(payload) != member.size or len(payload) > limit:
        fail(f"archive member changed size while reading: {member.name}")
    return payload


def hash_member(archive: tarfile.TarFile, member: tarfile.TarInfo) -> tuple[int, str]:
    source = archive.extractfile(member)
    if source is None:
        fail(f"cannot read archive member for hashing: {member.name}")
    digest = hashlib.sha256()
    size = 0
    while True:
        chunk = source.read(1024 * 1024)
        if not chunk:
            break
        digest.update(chunk)
        size += len(chunk)
        if size > member.size:
            fail(f"archive member exceeds declared size while hashing: {member.name}")
    if size != member.size:
        fail(f"archive member differs from declared size while hashing: {member.name}")
    return size, digest.hexdigest()


def validate_content_inventory(
    archive: tarfile.TarFile,
    members: dict[str, tarfile.TarInfo],
    space: str,
) -> None:
    inventory_member = members.get("exports/content-inventory.json")
    if inventory_member is None:
        fail("deterministic mutable-content inventory is missing")
    try:
        manifest = parse_manifest_bytes(read_member(archive, inventory_member, 128 * 1024 * 1024), space)
    except InventoryError as error:
        fail(str(error))
    entries = {entry["path"]: entry for entry in manifest["entries"]}
    roots = set(manifest["roots"])
    mutable_top_levels = {"config", "data", "stalwart"}
    for name, member in members.items():
        if PurePosixPath(name).parts[0] in mutable_top_levels and name not in entries:
            fail(f"archive mutable content is absent from its inventory: {name}")
    for name, entry in entries.items():
        member = members.get(name)
        if member is None:
            fail(f"inventory path is absent from archive: {name}")
        expected_type = entry["type"]
        observed_type = (
            "directory" if member.isdir() else "symlink" if member.issym() else "file" if member.isfile() else "other"
        )
        if observed_type != expected_type:
            fail(f"archive type differs from content inventory: {name}")
        if member.uname != entry["owner"] or member.gname != entry["group"]:
            fail(f"archive symbolic identity differs from content inventory: {name}")
        if f"{member.mode & 0o7777:04o}" != entry["mode"]:
            fail(f"archive mode differs from content inventory: {name}")
        if expected_type == "file":
            if member.size != entry["size"]:
                fail(f"archive size differs from content inventory: {name}")
            observed_size, observed_hash = hash_member(archive, member)
            if observed_size != entry["size"] or observed_hash != entry["sha256"]:
                fail(f"archive hash differs from content inventory: {name}")
        elif expected_type == "symlink" and member.linkname != entry["symlink_target"]:
            fail(f"archive symlink differs from content inventory: {name}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive")
    parser.add_argument("--space", choices=("gsyen", "halfsphere"), required=True)
    parser.add_argument("--max-members", type=int, required=True)
    parser.add_argument("--max-total-bytes", type=int, required=True)
    args = parser.parse_args()
    if not 1 <= args.max_members <= 1_000_000:
        fail("max-members is outside the reviewed range")
    if not 1 <= args.max_total_bytes <= 80 * 1024 * 1024 * 1024:
        fail("max-total-bytes is outside the reviewed range")
    archive_path = args.archive
    allowed_top_levels = {"apps", "config", "data", "exports"}
    if args.space == "gsyen":
        allowed_top_levels.add("stalwart")
    count = 0
    total_bytes = 0
    names: set[str] = set()
    symbolic_links: set[str] = set()
    hard_links: dict[str, str] = {}
    member_types: dict[str, str] = {}
    try:
        with tarfile.open(archive_path, mode="r:") as archive:
            members: dict[str, tarfile.TarInfo] = {}
            for member in archive:
                name = normalized_member(member.name, allowed_top_levels)
                if name in names:
                    fail(f"duplicate archive member is forbidden: {name}")
                names.add(name)
                members[name] = member
                if member.mode & 0o6000:
                    fail(f"setuid/setgid mode is forbidden: {name}")
                if not member.issym() and member.mode & 0o022:
                    fail(f"group/world-writable archive member is forbidden: {name}")
                validate_symbolic_identity(member, args.space, name)
                validate_pax_metadata(member, name)
                if member.ischr() or member.isblk() or member.isfifo() or member.isdev():
                    fail(f"special file is forbidden: {name}")
                if member.issym():
                    validate_link(
                        name,
                        member.linkname,
                        symbolic=True,
                        allowed_top_levels=allowed_top_levels,
                    )
                    symbolic_links.add(name)
                    member_types[name] = "symlink"
                elif member.islnk():
                    hard_links[name] = validate_link(
                        name,
                        member.linkname,
                        symbolic=False,
                        allowed_top_levels=allowed_top_levels,
                    )
                    member_types[name] = "hardlink"
                elif member.isdir():
                    member_types[name] = "directory"
                elif member.isfile():
                    member_types[name] = "file"
                else:
                    fail(f"unsupported archive member type: {name}")
                count += 1
                if member.isfile():
                    total_bytes += member.size
                if count > args.max_members:
                    fail("archive exceeds the configured member-count limit")
                if total_bytes > args.max_total_bytes:
                    fail("archive exceeds the configured expanded-byte limit")
            validate_content_inventory(archive, members, args.space)
    except (OSError, tarfile.TarError) as error:
        fail(f"cannot read tar archive: {error}")
    if count == 0:
        fail("archive has no members")
    for link in symbolic_links:
        prefix = f"{link}/"
        if any(name.startswith(prefix) for name in names):
            fail(f"archive places members below a symbolic link: {link}")
    for link, target in hard_links.items():
        if member_types.get(target) != "file":
            fail(f"hard-link target is absent or not a regular file: {link}")
        for symbolic_link in symbolic_links:
            if target == symbolic_link or target.startswith(f"{symbolic_link}/"):
                fail(f"hard-link target traverses a symbolic link: {link}")
    print(f"Validated {count} archive members within configured size limits.")


if __name__ == "__main__":
    main()
