#!/usr/bin/env python3
"""Fail-closed model-dataset staging and activation contracts.

The command-line interface is intentionally bound to the production GSYEN
layout.  Tests import the pure functions with temporary paths; there is no
command-line path override that could weaken the production boundary.
"""

from __future__ import annotations

import csv
import grp
import hashlib
import http.client
import io
import json
import os
from pathlib import Path
import re
import stat
import sys
import time
from dataclasses import dataclass
from typing import Mapping


PROGRAM_NAME = Path(sys.argv[0]).name
MODEL_ROOT = Path("/srv/gsyen/data/gsyen-model/datasets")
VERSIONS_ROOT = MODEL_ROOT / "versions"
CURRENT_LINK = MODEL_ROOT / "current"
PREVIOUS_LINK = MODEL_ROOT / "previous"
ENV_FILE = Path("/srv/gsyen/config/gsyen-model.env")
DATA_FILENAME = "transactions.csv"
MANIFEST_FILENAME = "MANIFEST.json"
MIN_DATA_BYTES = 1024
MAX_DATA_BYTES = 1024 * 1024 * 1024
MAX_ENV_BYTES = 1024 * 1024
MAX_MANIFEST_BYTES = 16 * 1024
VERSION_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")
REQUIRED_HEADER = (
    "order_id",
    "customer_id",
    "datetime",
    "product",
    "qty_jin",
    "unit_price",
    "amount",
    "weather",
)
SAFE_PLAN_FIELDS = {
    "action",
    "approval_digest",
    "current_dataset_sha256",
    "current_target",
    "desired_dataset_sha256",
    "desired_manifest_sha256",
    "desired_max_bytes",
    "desired_target",
    "env_sha256",
    "no_op",
    "previous_target",
    "version_id",
}


class ContractError(ValueError):
    """A model-data transaction contract was not satisfied."""


@dataclass(frozen=True)
class TransactionPaths:
    dataset_root: Path
    versions_root: Path
    current_link: Path
    previous_link: Path
    env_file: Path


PRODUCTION_PATHS = TransactionPaths(
    dataset_root=MODEL_ROOT,
    versions_root=VERSIONS_ROOT,
    current_link=CURRENT_LINK,
    previous_link=PREVIOUS_LINK,
    env_file=ENV_FILE,
)


def _fail(message: str) -> "None":
    raise ContractError(message)


def validate_version_id(version_id: str) -> str:
    if not VERSION_PATTERN.fullmatch(version_id) or version_id in {".", ".."}:
        _fail("invalid model dataset version ID")
    return version_id


def validate_max_bytes(value: int | str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise ContractError("model dataset maximum must be an integer") from error
    if parsed < MIN_DATA_BYTES or parsed > MAX_DATA_BYTES:
        _fail("model dataset maximum must be between 1024 bytes and 1 GiB")
    return parsed


def _canonical_json(value: Mapping[str, object]) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _metadata_tuple(metadata: os.stat_result) -> tuple[int, ...]:
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
        metadata.st_uid,
        metadata.st_gid,
        metadata.st_mode,
        metadata.st_nlink,
    )


def _read_regular_once(
    path: Path,
    *,
    max_bytes: int,
    expected_uid: int | None = None,
    expected_gid: int | None = None,
    expected_mode: int | None = None,
) -> tuple[bytes, os.stat_result]:
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    if not nofollow:
        _fail("model dataset transactions require O_NOFOLLOW support")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | nofollow
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise ContractError(f"unsafe or unreadable regular file: {path}") from error
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
            _fail(f"singly linked regular file required: {path}")
        if expected_uid is not None and before.st_uid != expected_uid:
            _fail(f"unexpected file owner: {path}")
        if expected_gid is not None and before.st_gid != expected_gid:
            _fail(f"unexpected file group: {path}")
        if expected_mode is not None and stat.S_IMODE(before.st_mode) != expected_mode:
            _fail(f"unexpected file mode: {path}")
        if before.st_size < 1 or before.st_size > max_bytes:
            _fail(f"file is empty or exceeds its reviewed limit: {path}")
        payload = bytearray()
        while len(payload) <= max_bytes:
            chunk = os.read(descriptor, min(1024 * 1024, max_bytes + 1 - len(payload)))
            if not chunk:
                break
            payload.extend(chunk)
        after = os.fstat(descriptor)
        if _metadata_tuple(before) != _metadata_tuple(after):
            _fail(f"file changed while being read: {path}")
        if len(payload) != before.st_size or len(payload) > max_bytes:
            _fail(f"file changed while being read or exceeds its limit: {path}")
        try:
            path_after = os.stat(path, follow_symlinks=False)
        except OSError as error:
            raise ContractError(f"file path changed while being read: {path}") from error
        if (path_after.st_dev, path_after.st_ino) != (before.st_dev, before.st_ino):
            _fail(f"file path changed while being read: {path}")
        return bytes(payload), before
    finally:
        os.close(descriptor)


def _validate_real_directory(
    path: Path,
    *,
    expected_uid: int,
    expected_gid: int,
    expected_mode: int,
) -> None:
    try:
        metadata = path.lstat()
    except OSError as error:
        raise ContractError(f"required directory is missing: {path}") from error
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or metadata.st_uid != expected_uid
        or metadata.st_gid != expected_gid
        or stat.S_IMODE(metadata.st_mode) != expected_mode
    ):
        _fail(f"directory must have the reviewed owner/group/mode: {path}")


def _validate_protected_directory(path: Path, *, expected_uid: int) -> None:
    try:
        metadata = path.lstat()
    except OSError as error:
        raise ContractError(f"protected directory is missing: {path}") from error
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or metadata.st_uid != expected_uid
        or stat.S_IMODE(metadata.st_mode) & 0o022
    ):
        _fail(f"protected directory must be owner-controlled: {path}")


def _validate_csv(payload: bytes) -> None:
    try:
        text = payload.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ContractError("model dataset CSV must be UTF-8") from error
    if "\x00" in text:
        _fail("model dataset CSV contains a NUL byte")
    try:
        reader = csv.reader(io.StringIO(text, newline=""), strict=True)
        header = tuple(next(reader))
        next(reader)
    except (csv.Error, StopIteration) as error:
        raise ContractError("model dataset CSV must contain a header and data row") from error
    if header != REQUIRED_HEADER:
        _fail("model dataset CSV header does not match the reviewed contract")


def _candidate_is_canonical(path: Path) -> None:
    raw = os.fspath(path)
    if not path.is_absolute() or os.path.normpath(raw) != raw:
        _fail("candidate must use its canonical absolute path")
    try:
        resolved = Path(os.path.realpath(raw, strict=True))
    except OSError as error:
        raise ContractError("candidate canonical path cannot be resolved") from error
    if resolved != path:
        _fail("candidate path must not contain symbolic-link or alias components")
    if path.name != DATA_FILENAME:
        _fail(f"candidate filename must be exactly {DATA_FILENAME}")
    try:
        path.relative_to(MODEL_ROOT)
    except ValueError:
        pass
    else:
        _fail("candidate must remain outside the managed model dataset root")


def candidate_manifest(version_id: str, max_bytes: int | str, path: Path) -> tuple[dict, bytes]:
    version_id = validate_version_id(version_id)
    max_bytes = validate_max_bytes(max_bytes)
    _candidate_is_canonical(path)
    payload, _ = _read_regular_once(path, max_bytes=max_bytes)
    _validate_csv(payload)
    manifest = {
        "dataset_sha256": hashlib.sha256(payload).hexdigest(),
        "filename": DATA_FILENAME,
        "max_bytes": max_bytes,
        "schema": 1,
        "size_bytes": len(payload),
        "version_id": version_id,
    }
    manifest_bytes = _canonical_json(manifest) + b"\n"
    return manifest, payload


def manifest_digest(manifest: Mapping[str, object]) -> str:
    return hashlib.sha256(_canonical_json(manifest) + b"\n").hexdigest()


def _write_exclusive(path: Path, payload: bytes, mode: int = 0o600) -> None:
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    try:
        descriptor = os.open(path, flags, mode)
    except OSError as error:
        raise ContractError(f"refusing to replace output file: {path}") from error
    try:
        view = memoryview(payload)
        while view:
            written = os.write(descriptor, view)
            view = view[written:]
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _fill_existing_empty_file(path: Path, payload: bytes) -> None:
    flags = os.O_WRONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise ContractError(f"unsafe rendered environment temporary file: {path}") from error
    try:
        before = os.fstat(descriptor)
        if (
            not stat.S_ISREG(before.st_mode)
            or before.st_uid != 0
            or before.st_nlink != 1
            or stat.S_IMODE(before.st_mode) != 0o600
            or before.st_size != 0
        ):
            _fail("rendered environment temporary file must be root-owned, empty, mode 0600")
        view = memoryview(payload)
        while view:
            written = os.write(descriptor, view)
            view = view[written:]
        os.fsync(descriptor)
        after = os.fstat(descriptor)
        path_after = os.stat(path, follow_symlinks=False)
        if (
            (after.st_dev, after.st_ino) != (before.st_dev, before.st_ino)
            or (path_after.st_dev, path_after.st_ino) != (before.st_dev, before.st_ino)
        ):
            _fail("rendered environment temporary path changed while writing")
    finally:
        os.close(descriptor)


def write_candidate_version(
    version_id: str,
    max_bytes: int | str,
    candidate: Path,
    output_directory: Path,
) -> dict:
    manifest, payload = candidate_manifest(version_id, max_bytes, candidate)
    try:
        metadata = output_directory.lstat()
    except OSError as error:
        raise ContractError("staging output directory is missing") from error
    if not stat.S_ISDIR(metadata.st_mode) or any(output_directory.iterdir()):
        _fail("staging output must be an empty real directory")
    _write_exclusive(output_directory / DATA_FILENAME, payload)
    _write_exclusive(output_directory / MANIFEST_FILENAME, _canonical_json(manifest) + b"\n")
    return manifest


def _read_approval(path: Path, expected_digest: str) -> str:
    payload, metadata = _read_regular_once(path, max_bytes=65, expected_uid=0)
    if stat.S_IMODE(metadata.st_mode) not in {0o400, 0o600}:
        _fail("approval marker must be root-owned mode 0400 or 0600")
    if payload != f"{expected_digest}\n".encode("ascii"):
        _fail("approval marker does not match the deterministic transaction digest")
    return hashlib.sha256(payload).hexdigest()


def stage_approved_candidate(
    version_id: str,
    max_bytes: int | str,
    candidate: Path,
    output_directory: Path,
    approval_file: Path,
) -> tuple[dict, str]:
    manifest, payload = candidate_manifest(version_id, max_bytes, candidate)
    digest = manifest_digest(manifest)
    approval_marker_hash = _read_approval(approval_file, digest)
    try:
        metadata = output_directory.lstat()
    except OSError as error:
        raise ContractError("staging output directory is missing") from error
    if not stat.S_ISDIR(metadata.st_mode) or any(output_directory.iterdir()):
        _fail("staging output must be an empty real directory")
    _write_exclusive(output_directory / DATA_FILENAME, payload)
    _write_exclusive(output_directory / MANIFEST_FILENAME, _canonical_json(manifest) + b"\n")
    return manifest, approval_marker_hash


def validate_version(
    version_id: str,
    version_directory: Path,
    *,
    expected_uid: int,
    expected_gid: int,
    enforce_production_layout: bool = False,
) -> dict:
    version_id = validate_version_id(version_id)
    if enforce_production_layout and version_directory != VERSIONS_ROOT / version_id:
        _fail("version directory is outside the fixed model dataset layout")
    _validate_real_directory(
        version_directory,
        expected_uid=expected_uid,
        expected_gid=expected_gid,
        expected_mode=0o750,
    )
    entries = {entry.name for entry in os.scandir(version_directory)}
    if entries != {DATA_FILENAME, MANIFEST_FILENAME}:
        _fail("immutable model dataset version has unexpected entries")
    manifest_bytes, _ = _read_regular_once(
        version_directory / MANIFEST_FILENAME,
        max_bytes=MAX_MANIFEST_BYTES,
        expected_uid=expected_uid,
        expected_gid=expected_gid,
        expected_mode=0o640,
    )
    try:
        manifest = json.loads(manifest_bytes)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ContractError("model dataset manifest is not valid JSON") from error
    if not isinstance(manifest, dict):
        _fail("model dataset manifest must be an object")
    expected_keys = {
        "dataset_sha256",
        "filename",
        "max_bytes",
        "schema",
        "size_bytes",
        "version_id",
    }
    if set(manifest) != expected_keys:
        _fail("model dataset manifest keys do not match the reviewed schema")
    if manifest_bytes != _canonical_json(manifest) + b"\n":
        _fail("model dataset manifest is not in deterministic canonical form")
    max_bytes = validate_max_bytes(manifest.get("max_bytes"))
    if (
        manifest.get("schema") != 1
        or manifest.get("version_id") != version_id
        or manifest.get("filename") != DATA_FILENAME
        or not isinstance(manifest.get("size_bytes"), int)
        or not SHA256_PATTERN.fullmatch(str(manifest.get("dataset_sha256", "")))
    ):
        _fail("model dataset manifest values are invalid")
    payload, _ = _read_regular_once(
        version_directory / DATA_FILENAME,
        max_bytes=max_bytes,
        expected_uid=expected_uid,
        expected_gid=expected_gid,
        expected_mode=0o640,
    )
    _validate_csv(payload)
    if len(payload) != manifest["size_bytes"]:
        _fail("model dataset byte count differs from its manifest")
    if hashlib.sha256(payload).hexdigest() != manifest["dataset_sha256"]:
        _fail("model dataset SHA-256 differs from its manifest")
    validated = dict(manifest)
    validated["manifest_sha256"] = hashlib.sha256(manifest_bytes).hexdigest()
    return validated


def _read_managed_link(
    link: Path,
    *,
    paths: TransactionPaths,
    expected_uid: int,
    expected_gid: int,
    required: bool,
) -> tuple[str, dict] | tuple[None, None]:
    try:
        metadata = link.lstat()
    except FileNotFoundError:
        if required:
            _fail(f"managed link is missing: {link}")
        return None, None
    except OSError as error:
        raise ContractError(f"managed link is unreadable: {link}") from error
    if not stat.S_ISLNK(metadata.st_mode):
        _fail(f"managed link path is not a symbolic link: {link}")
    if metadata.st_uid != expected_uid or metadata.st_nlink != 1:
        _fail(f"managed link must be singly linked and root-owned: {link}")
    target = os.readlink(link)
    match = re.fullmatch(r"versions/([A-Za-z0-9][A-Za-z0-9._-]{0,127})", target)
    if not match:
        _fail(f"managed link has an unsafe or legacy target: {link}")
    version_id = validate_version_id(match.group(1))
    manifest = validate_version(
        version_id,
        paths.versions_root / version_id,
        expected_uid=expected_uid,
        expected_gid=expected_gid,
        enforce_production_layout=paths == PRODUCTION_PATHS,
    )
    return target, manifest


def _parse_env(payload: bytes) -> tuple[list[str], dict[str, str]]:
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ContractError("model environment file must be UTF-8") from error
    if "\r" in text:
        _fail("model environment file must use LF line endings")
    lines = text.splitlines()
    values: dict[str, str] = {}
    for line in lines:
        if not line.strip() or line.startswith("#"):
            continue
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)=(.*)", line)
        if not match:
            _fail("model environment file contains a malformed assignment")
        key, value = match.groups()
        if key in values:
            _fail(f"model environment file contains duplicate key {key}")
        values[key] = value
    return lines, values


def _read_env(
    env_file: Path,
    *,
    expected_uid: int,
    expected_gid: int,
) -> tuple[bytes, list[str], dict[str, str]]:
    payload, _ = _read_regular_once(
        env_file,
        max_bytes=MAX_ENV_BYTES,
        expected_uid=expected_uid,
        expected_gid=expected_gid,
        expected_mode=0o640,
    )
    lines, values = _parse_env(payload)
    return payload, lines, values


def _data_path_value(paths: TransactionPaths) -> str:
    return f"{paths.current_link}/{DATA_FILENAME}"


def _validate_env_matches_manifest(
    values: Mapping[str, str],
    manifest: Mapping[str, object],
    *,
    paths: TransactionPaths,
) -> None:
    expected = {
        "GSYEN_MODEL_DATA_PATH": _data_path_value(paths),
        "GSYEN_MODEL_DATA_SHA256": manifest["dataset_sha256"],
        "GSYEN_MODEL_DATA_MAX_BYTES": str(manifest["max_bytes"]),
    }
    for key, expected_value in expected.items():
        if values.get(key) != expected_value:
            _fail(f"protected model environment is not coherent with current: {key}")


def build_plan(
    action: str,
    version_id: str,
    *,
    paths: TransactionPaths,
    expected_uid: int,
    expected_gid: int,
) -> dict:
    if action not in {"promote", "rollback"}:
        _fail("model dataset action must be promote or rollback")
    version_id = validate_version_id(version_id)
    _validate_real_directory(
        paths.dataset_root,
        expected_uid=expected_uid,
        expected_gid=expected_gid,
        expected_mode=0o750,
    )
    _validate_real_directory(
        paths.versions_root,
        expected_uid=expected_uid,
        expected_gid=expected_gid,
        expected_mode=0o750,
    )
    _validate_protected_directory(paths.env_file.parent, expected_uid=expected_uid)
    current_target, current_manifest = _read_managed_link(
        paths.current_link,
        paths=paths,
        expected_uid=expected_uid,
        expected_gid=expected_gid,
        required=True,
    )
    previous_target, _ = _read_managed_link(
        paths.previous_link,
        paths=paths,
        expected_uid=expected_uid,
        expected_gid=expected_gid,
        required=False,
    )
    if previous_target == current_target:
        _fail("previous and current must not identify the same model dataset version")
    env_payload, _, env_values = _read_env(
        paths.env_file,
        expected_uid=expected_uid,
        expected_gid=expected_gid,
    )
    _validate_env_matches_manifest(env_values, current_manifest, paths=paths)
    desired_target = f"versions/{version_id}"
    if desired_target == current_target:
        desired_manifest = current_manifest
    else:
        desired_manifest = validate_version(
            version_id,
            paths.versions_root / version_id,
            expected_uid=expected_uid,
            expected_gid=expected_gid,
            enforce_production_layout=paths == PRODUCTION_PATHS,
        )
    if action == "rollback" and desired_target != previous_target:
        _fail("rollback target must exactly match the protected previous link")
    plan = {
        "action": action,
        "current_dataset_sha256": current_manifest["dataset_sha256"],
        "current_target": current_target,
        "desired_dataset_sha256": desired_manifest["dataset_sha256"],
        "desired_manifest_sha256": desired_manifest["manifest_sha256"],
        "desired_max_bytes": desired_manifest["max_bytes"],
        "desired_target": desired_target,
        "env_sha256": hashlib.sha256(env_payload).hexdigest(),
        "no_op": action == "promote" and desired_target == current_target,
        "previous_target": previous_target or "none",
        "schema": 1,
        "version_id": version_id,
    }
    approval_digest = hashlib.sha256(_canonical_json(plan)).hexdigest()
    return {**plan, "approval_digest": approval_digest}


def render_env_for_version(
    version_id: str,
    destination: Path,
    *,
    paths: TransactionPaths,
    expected_uid: int,
    expected_gid: int,
) -> None:
    version_id = validate_version_id(version_id)
    _validate_protected_directory(paths.env_file.parent, expected_uid=expected_uid)
    manifest = validate_version(
        version_id,
        paths.versions_root / version_id,
        expected_uid=expected_uid,
        expected_gid=expected_gid,
        enforce_production_layout=paths == PRODUCTION_PATHS,
    )
    _, lines, values = _read_env(
        paths.env_file,
        expected_uid=expected_uid,
        expected_gid=expected_gid,
    )
    replacements = {
        "GSYEN_MODEL_DATA_PATH": _data_path_value(paths),
        "GSYEN_MODEL_DATA_SHA256": str(manifest["dataset_sha256"]),
        "GSYEN_MODEL_DATA_MAX_BYTES": str(manifest["max_bytes"]),
    }
    if not set(replacements).issubset(values):
        _fail("protected model environment lacks a required data transaction key")
    rendered: list[str] = []
    for line in lines:
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)=(.*)", line)
        if match and match.group(1) in replacements:
            rendered.append(f"{match.group(1)}={replacements[match.group(1)]}")
        else:
            rendered.append(line)
    payload = ("\n".join(rendered) + "\n").encode("utf-8")
    if paths == PRODUCTION_PATHS:
        try:
            destination.relative_to(paths.env_file.parent)
        except ValueError:
            _fail("rendered environment must remain in the protected config directory")
        if not re.fullmatch(r"\.gsyen-model\.env\.[A-Za-z0-9]+\.env", destination.name):
            _fail("rendered environment temporary filename is outside the reviewed contract")
    if paths == PRODUCTION_PATHS:
        _fill_existing_empty_file(destination, payload)
    else:
        _write_exclusive(destination, payload)


def validate_coherence(
    *,
    paths: TransactionPaths,
    expected_uid: int,
    expected_gid: int,
) -> dict:
    current_target, current_manifest = _read_managed_link(
        paths.current_link,
        paths=paths,
        expected_uid=expected_uid,
        expected_gid=expected_gid,
        required=True,
    )
    _, _, values = _read_env(
        paths.env_file,
        expected_uid=expected_uid,
        expected_gid=expected_gid,
    )
    _validate_env_matches_manifest(values, current_manifest, paths=paths)
    return {
        "current_target": current_target,
        "dataset_sha256": current_manifest["dataset_sha256"],
    }


def wait_for_readiness(expected_sha256: str, timeout_seconds: int) -> None:
    if not SHA256_PATTERN.fullmatch(expected_sha256):
        _fail("health-check SHA-256 is invalid")
    if timeout_seconds < 1 or timeout_seconds > 120:
        _fail("health-check timeout must be between 1 and 120 seconds")
    deadline = time.monotonic() + timeout_seconds
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        connection = http.client.HTTPConnection("127.0.0.1", 18083, timeout=2)
        try:
            connection.request("GET", "/readyz", headers={"Accept": "application/json"})
            response = connection.getresponse()
            payload = response.read(65537)
            if len(payload) > 65536:
                raise ContractError("model readiness response is too large")
            value = json.loads(payload)
            if (
                response.status == 200
                and isinstance(value, dict)
                and value.get("status") == "ready"
                and value.get("data_sha256") == expected_sha256
            ):
                return
            last_error = ContractError("model readiness did not match the promoted dataset")
        except (OSError, json.JSONDecodeError, ContractError) as error:
            last_error = error
        finally:
            connection.close()
        time.sleep(1)
    raise ContractError("model readiness did not pass before timeout") from last_error


def _production_ids() -> tuple[int, int]:
    try:
        gid = grp.getgrnam("gsyen").gr_gid
    except KeyError as error:
        raise ContractError("required gsyen group is unavailable") from error
    return 0, gid


def _safe_plan_field() -> None:
    if len(sys.argv) != 3 or sys.argv[2] not in SAFE_PLAN_FIELDS:
        _fail("unsupported safe plan field")
    try:
        plan = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        raise ContractError("invalid safe plan JSON") from error
    value = plan.get(sys.argv[2])
    if isinstance(value, bool):
        print("true" if value else "false")
    elif isinstance(value, (str, int)):
        print(value)
    else:
        _fail("safe plan field is absent or has an invalid type")


def main() -> int:
    try:
        if len(sys.argv) < 2:
            _fail("missing model dataset transaction command")
        command = sys.argv[1]
        if command == "candidate" and len(sys.argv) == 5:
            manifest, _ = candidate_manifest(sys.argv[2], sys.argv[3], Path(sys.argv[4]))
            print(manifest_digest(manifest))
        elif command == "stage" and len(sys.argv) == 7:
            manifest, approval_hash = stage_approved_candidate(
                sys.argv[2],
                sys.argv[3],
                Path(sys.argv[4]),
                Path(sys.argv[5]),
                Path(sys.argv[6]),
            )
            print(f"{manifest_digest(manifest)} {approval_hash}")
        elif command == "version" and len(sys.argv) == 3:
            uid, gid = _production_ids()
            version_id = validate_version_id(sys.argv[2])
            manifest = validate_version(
                version_id,
                VERSIONS_ROOT / version_id,
                expected_uid=uid,
                expected_gid=gid,
                enforce_production_layout=True,
            )
            print(manifest["manifest_sha256"])
        elif command == "plan" and len(sys.argv) == 4:
            uid, gid = _production_ids()
            plan = build_plan(
                sys.argv[2],
                sys.argv[3],
                paths=PRODUCTION_PATHS,
                expected_uid=uid,
                expected_gid=gid,
            )
            print(_canonical_json(plan).decode("ascii"))
        elif command == "field":
            _safe_plan_field()
        elif command == "render-env" and len(sys.argv) == 4:
            uid, gid = _production_ids()
            render_env_for_version(
                sys.argv[2],
                Path(sys.argv[3]),
                paths=PRODUCTION_PATHS,
                expected_uid=uid,
                expected_gid=gid,
            )
        elif command == "coherence" and len(sys.argv) == 2:
            uid, gid = _production_ids()
            validate_coherence(paths=PRODUCTION_PATHS, expected_uid=uid, expected_gid=gid)
        elif command == "health" and len(sys.argv) == 4:
            wait_for_readiness(sys.argv[2], int(sys.argv[3]))
        else:
            _fail("invalid model dataset transaction command or arguments")
    except (ContractError, OSError, ValueError) as error:
        print(f"{PROGRAM_NAME}: {error}", file=sys.stderr)
        return 65
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
