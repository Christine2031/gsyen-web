#!/usr/bin/env python3
"""Deterministic content/metadata inventory for mutable business-space state."""

from __future__ import annotations

import argparse
import grp
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import re
import stat
import sys
from typing import Iterable, Mapping


SCHEMA = 1
IDENTITY_NAME = re.compile(r"[a-z_][a-z0-9_-]*[$]?")
SHA256 = re.compile(r"[0-9a-f]{64}")
IDENTITY_ALLOWLIST = {
    "gsyen": {
        "owners": {"root", "gsyen", "gsyen-mail", "stalwart"},
        "groups": {"root", "gsyen-space", "gsyen", "gsyen-mail", "stalwart"},
    },
    "halfsphere": {
        "owners": {"root", "halfsphere"},
        "groups": {"root", "halfsphere"},
    },
}
BASE_ROOTS = ("config", "data")


class InventoryError(ValueError):
    pass


def fail(message: str) -> "None":
    raise InventoryError(message)


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value, ensure_ascii=True, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")


def allowed_identities(space: str) -> tuple[set[str], set[str]]:
    try:
        policy = IDENTITY_ALLOWLIST[space]
    except KeyError as error:
        raise InventoryError("unsupported business space") from error
    return set(policy["owners"]), set(policy["groups"])


def _symbolic_identity(
    metadata: os.stat_result,
    *,
    allowed_owners: set[str],
    allowed_groups: set[str],
) -> tuple[str, str]:
    try:
        owner = pwd.getpwuid(metadata.st_uid).pw_name
        group = grp.getgrgid(metadata.st_gid).gr_name
    except KeyError as error:
        raise InventoryError("content has an unmapped numeric owner or group") from error
    if (
        not owner
        or not group
        or not IDENTITY_NAME.fullmatch(owner)
        or not IDENTITY_NAME.fullmatch(group)
        or owner not in allowed_owners
        or group not in allowed_groups
    ):
        fail("content owner or group is outside the business allowlist")
    return owner, group


def _read_file_once(path: Path, metadata: os.stat_result) -> tuple[int, str]:
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    if not nofollow:
        fail("content inventory requires O_NOFOLLOW support")
    descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC | nofollow)
    try:
        before = os.fstat(descriptor)
        if (
            not stat.S_ISREG(before.st_mode)
            or before.st_nlink != 1
            or (before.st_dev, before.st_ino) != (metadata.st_dev, metadata.st_ino)
        ):
            fail("regular backup content must be singly linked and stable")
        digest = hashlib.sha256()
        size = 0
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            size += len(chunk)
        after = os.fstat(descriptor)
        stable_fields = (
            "st_dev",
            "st_ino",
            "st_size",
            "st_mtime_ns",
            "st_ctime_ns",
            "st_uid",
            "st_gid",
            "st_mode",
            "st_nlink",
        )
        if any(getattr(before, field) != getattr(after, field) for field in stable_fields):
            fail("backup content changed while being hashed")
        path_after = os.stat(path, follow_symlinks=False)
        if (path_after.st_dev, path_after.st_ino) != (before.st_dev, before.st_ino):
            fail("backup content path changed while being hashed")
        if size != before.st_size:
            fail("backup content size changed while being hashed")
        return size, digest.hexdigest()
    finally:
        os.close(descriptor)


def _entry(
    path: Path,
    relative: str,
    *,
    allowed_owners: set[str],
    allowed_groups: set[str],
) -> dict[str, object]:
    try:
        metadata = path.lstat()
    except OSError as error:
        raise InventoryError(f"cannot inspect backup content: {relative}") from error
    owner, group = _symbolic_identity(
        metadata, allowed_owners=allowed_owners, allowed_groups=allowed_groups
    )
    mode = stat.S_IMODE(metadata.st_mode)
    if stat.S_ISDIR(metadata.st_mode):
        kind = "directory"
        size = 0
        digest = None
        target = None
    elif stat.S_ISREG(metadata.st_mode):
        kind = "file"
        size, digest = _read_file_once(path, metadata)
        target = None
    elif stat.S_ISLNK(metadata.st_mode):
        kind = "symlink"
        mode = 0o777
        try:
            target = os.readlink(path)
        except OSError as error:
            raise InventoryError(f"cannot read backup symlink: {relative}") from error
        if not target or os.path.isabs(target) or any(character in target for character in "\x00\r\n"):
            fail("backup content has an empty, absolute or control-character symlink")
        target_bytes = os.fsencode(target)
        size = len(target_bytes)
        digest = hashlib.sha256(target_bytes).hexdigest()
    else:
        fail("backup content contains an unsupported file type")
    if kind != "symlink" and (mode & 0o022 or mode & 0o7000):
        fail("group/world-writable or special-mode backup content is forbidden")
    return {
        "group": group,
        "mode": f"{mode:04o}",
        "owner": owner,
        "path": relative,
        "sha256": digest,
        "size": size,
        "symlink_target": target,
        "type": kind,
    }


def _walk_root(root: Path) -> Iterable[tuple[Path, str]]:
    yield root, root.name
    for current, directory_names, file_names in os.walk(root, followlinks=False):
        directory_names.sort(key=os.fsencode)
        file_names.sort(key=os.fsencode)
        current_path = Path(current)
        for name in [*directory_names, *file_names]:
            path = current_path / name
            yield path, path.relative_to(root.parent).as_posix()


def inventory(
    space: str,
    space_root: Path,
    *,
    allowed_owners: set[str] | None = None,
    allowed_groups: set[str] | None = None,
) -> dict[str, object]:
    if not space_root.is_absolute() or space_root.is_symlink() or not space_root.is_dir():
        fail("space root must be an absolute real directory")
    policy_owners, policy_groups = allowed_identities(space)
    allowed_owners = policy_owners if allowed_owners is None else set(allowed_owners)
    allowed_groups = policy_groups if allowed_groups is None else set(allowed_groups)
    roots = list(BASE_ROOTS)
    if space == "gsyen" and (space_root / "stalwart").exists():
        roots.append("stalwart")
    entries: list[dict[str, object]] = []
    seen: set[str] = set()
    for root_name in roots:
        root = space_root / root_name
        if root.is_symlink() or not root.is_dir():
            fail(f"required inventory root is missing or unsafe: {root_name}")
        for path, relative in _walk_root(root):
            if relative in seen:
                fail("content inventory encountered a duplicate path")
            seen.add(relative)
            if any(ord(character) < 32 or ord(character) == 127 for character in relative):
                fail("content inventory path contains a control character")
            entries.append(
                _entry(
                    path,
                    relative,
                    allowed_owners=allowed_owners,
                    allowed_groups=allowed_groups,
                )
            )
    entries.sort(key=lambda item: os.fsencode(str(item["path"])))
    return {"entries": entries, "roots": roots, "schema": SCHEMA, "space": space}


def _validate_identity_name(name: object, allowed: set[str], label: str) -> str:
    if not isinstance(name, str) or not name or not IDENTITY_NAME.fullmatch(name):
        fail(f"content inventory has an empty or invalid symbolic {label}")
    if name not in allowed:
        fail(f"content inventory symbolic {label} is outside the business allowlist")
    return name


def parse_manifest_bytes(payload: bytes, space: str) -> dict[str, object]:
    try:
        value = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise InventoryError("content inventory is not valid JSON") from error
    if not isinstance(value, dict) or canonical_json(value) + b"\n" != payload:
        fail("content inventory is not deterministic canonical JSON")
    if set(value) != {"entries", "roots", "schema", "space"}:
        fail("content inventory top-level schema is invalid")
    roots = value.get("roots")
    expected_root_sets = [list(BASE_ROOTS)]
    if space == "gsyen":
        expected_root_sets.append([*BASE_ROOTS, "stalwart"])
    if value.get("schema") != SCHEMA or value.get("space") != space or roots not in expected_root_sets:
        fail("content inventory business space or roots are invalid")
    entries = value.get("entries")
    if not isinstance(entries, list) or not entries:
        fail("content inventory entries are missing")
    owners, groups = allowed_identities(space)
    observed_paths: list[str] = []
    root_set = set(roots)
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {
            "group", "mode", "owner", "path", "sha256", "size", "symlink_target", "type"
        }:
            fail("content inventory entry schema is invalid")
        path = entry["path"]
        if not isinstance(path, str) or not path or path.startswith("/"):
            fail("content inventory path is invalid")
        pure_path = PurePosixPath(path)
        if pure_path.as_posix() != path or ".." in pure_path.parts or pure_path.parts[0] not in root_set:
            fail("content inventory path escapes its root or is non-canonical")
        observed_paths.append(path)
        _validate_identity_name(entry["owner"], owners, "owner")
        _validate_identity_name(entry["group"], groups, "group")
        kind = entry["type"]
        mode_text = entry["mode"]
        size = entry["size"]
        digest = entry["sha256"]
        target = entry["symlink_target"]
        if kind not in {"directory", "file", "symlink"}:
            fail("content inventory type is invalid")
        if not isinstance(mode_text, str) or not re.fullmatch(r"[0-7]{4}", mode_text):
            fail("content inventory mode is invalid")
        mode = int(mode_text, 8)
        if not isinstance(size, int) or isinstance(size, bool) or size < 0:
            fail("content inventory size is invalid")
        if kind == "directory":
            if size != 0 or digest is not None or target is not None:
                fail("content inventory directory fields are invalid")
        elif kind == "file":
            if not isinstance(digest, str) or not SHA256.fullmatch(digest) or target is not None:
                fail("content inventory file hash or link fields are invalid")
        else:
            if (
                mode != 0o777
                or not isinstance(target, str)
                or not target
                or os.path.isabs(target)
                or any(character in target for character in "\x00\r\n")
                or size != len(os.fsencode(target))
                or digest != hashlib.sha256(os.fsencode(target)).hexdigest()
            ):
                fail("content inventory symlink fields are invalid")
        if kind != "symlink" and (mode & 0o022 or mode & 0o7000):
            fail("content inventory permits writable or special-mode content")
    if observed_paths != sorted(observed_paths, key=os.fsencode) or len(observed_paths) != len(set(observed_paths)):
        fail("content inventory paths are duplicate or not deterministically sorted")
    if not root_set.issubset(observed_paths):
        fail("content inventory omits a required root directory")
    return value


def read_manifest(path: Path, space: str) -> tuple[bytes, dict[str, object]]:
    if not path.is_absolute() or path.is_symlink() or not path.is_file():
        fail("content inventory path must be an absolute regular non-symlink file")
    try:
        payload = path.read_bytes()
    except OSError as error:
        raise InventoryError("cannot read content inventory") from error
    return payload, parse_manifest_bytes(payload, space)


def write_manifest(path: Path, value: Mapping[str, object]) -> None:
    if not path.is_absolute() or path.is_symlink() or path.exists():
        fail("refusing unsafe or existing content inventory output")
    payload = canonical_json(value) + b"\n"
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC, 0o600)
    try:
        view = memoryview(payload)
        while view:
            written = os.write(descriptor, view)
            view = view[written:]
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("create", "verify"))
    parser.add_argument("space", choices=tuple(IDENTITY_ALLOWLIST))
    parser.add_argument("space_root", type=Path)
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    try:
        if args.mode == "create":
            observed = inventory(args.space, args.space_root)
            write_manifest(args.manifest, observed)
        else:
            _, expected = read_manifest(args.manifest, args.space)
            observed = inventory(args.space, args.space_root)
            if expected != observed:
                fail("content inventory differs from the protected source tree")
    except (InventoryError, OSError) as error:
        print(f"content_inventory.py: {error}", file=sys.stderr)
        return 65
    print(f"Validated deterministic mutable-content inventory for {args.space}; values were not printed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
