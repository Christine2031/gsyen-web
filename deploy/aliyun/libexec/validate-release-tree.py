#!/usr/bin/env python3
"""Validate and hash one immutable application release without exposing content."""

from __future__ import annotations

import argparse
import datetime as dt
import grp
import hashlib
import json
import os
import pwd
import re
import stat
import sys
import urllib.parse
from pathlib import Path


SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")
RFC3339_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
FORBIDDEN_EXACT = {
    ".git",
    ".npmrc",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    "id_rsa",
}
FORBIDDEN_SUFFIXES = (".p12", ".pfx")
BUILD_KEYS = {
    "schema",
    "source_commit",
    "public_origins",
    "providers",
    "allowed_google_services",
}
ALLOWED_PROVIDERS = {
    "aliyun-acr",
    "aliyun-ecs",
    "aliyun-oss",
    "aliyun-rds-postgresql",
    "aliyun-sls",
    "cloudflare-d1",
    "cloudflare-email-routing",
    "cloudflare-queue",
    "cloudflare-r2",
    "deepseek",
    "google-gemini-api",
    "google-oauth",
    "moonshot",
    "openai",
    "resend",
    "stalwart",
    "supabase",
    "tavily",
}
GOOGLE_SERVICE_HOSTS = {
    "gemini": {"generativelanguage.googleapis.com"},
    "oauth": {
        "accounts.google.com",
        "oauth2.googleapis.com",
        "www.googleapis.com",
    },
}
GOOGLE_SERVICE_PROVIDER = {
    "gemini": "google-gemini-api",
    "oauth": "google-oauth",
}
FORBIDDEN_RUNTIME_MARKERS = {
    b"run.app",
    b"storage.googleapis.com",
    b"pkg.dev",
    b"artifactregistry.googleapis.com",
    b"cloudsql.googleapis.com",
    b"secretmanager.googleapis.com",
    b"iam.gserviceaccount.com",
}
# These identifiers came from the migration control-plane/code inventory.  They
# are denied even when a URL has been encoded or split away from its hostname.
FORBIDDEN_GCP_IDENTIFIERS = {
    b"halfsphere-api-7586",
    b"gsyen-api-7586",
    b"hs-v2ryan",
    b"776196228503",
    b"827638954410",
    b"827638954474",
    b"560294832548",
    b"214548028016",
}
GOOGLE_API_HOST = re.compile(rb"(?i)(?:[a-z0-9-]+\.)*googleapis\.com")


def fail(message: str) -> None:
    print(f"validate-release-tree.py: {message}", file=sys.stderr)
    raise SystemExit(65)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("space", choices=("gsyen", "halfsphere"))
    parser.add_argument("app")
    parser.add_argument("release_id")
    parser.add_argument("release_dir", type=Path)
    parser.add_argument("--owner")
    parser.add_argument("--group")
    return parser.parse_args()


def validate_component(value: str, label: str) -> None:
    if not SAFE_NAME.fullmatch(value) or value in {".", ".."}:
        fail(f"invalid {label}")


def read_small_json(path: Path, label: str) -> object:
    try:
        raw = path.read_bytes()
    except OSError as error:
        fail(f"cannot read {label}: {error}")
    if len(raw) > 16_384:
        fail(f"{label} is unexpectedly large")
    try:
        return json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail(f"invalid {label}: {error}")


def validate_metadata(root: Path, space: str, app: str, release_id: str) -> dict[str, object]:
    metadata_path = root / "RELEASE.json"
    metadata = read_small_json(metadata_path, "RELEASE.json")
    expected_keys = {"schema", "space", "app", "release_id", "source_commit", "built_at"}
    if not isinstance(metadata, dict) or set(metadata) != expected_keys:
        fail("RELEASE.json has missing or unexpected keys")
    if metadata["schema"] != 1:
        fail("unsupported RELEASE.json schema")
    if metadata["space"] != space or metadata["app"] != app:
        fail("RELEASE.json business space or app does not match the target")
    if metadata["release_id"] != release_id:
        fail("RELEASE.json release_id does not match the target")
    if not isinstance(metadata["source_commit"], str) or not COMMIT.fullmatch(
        metadata["source_commit"]
    ):
        fail("RELEASE.json source_commit must be a lowercase full Git commit")
    built_at = metadata["built_at"]
    if not isinstance(built_at, str) or not RFC3339_UTC.fullmatch(built_at):
        fail("RELEASE.json built_at must be a second-precision UTC RFC3339 value")
    try:
        dt.datetime.strptime(built_at, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        fail("RELEASE.json built_at is not a real timestamp")
    return metadata


def validate_build_metadata(root: Path, source_commit: str) -> tuple[dict[str, object], set[str]]:
    metadata = read_small_json(root / "BUILD.json", "BUILD.json")
    if not isinstance(metadata, dict) or set(metadata) != BUILD_KEYS:
        fail("BUILD.json has missing or unexpected keys")
    if metadata["schema"] != 1:
        fail("unsupported BUILD.json schema")
    if metadata["source_commit"] != source_commit:
        fail("BUILD.json source_commit does not match RELEASE.json")

    origins = metadata["public_origins"]
    if not isinstance(origins, list) or any(not isinstance(origin, str) for origin in origins):
        fail("BUILD.json public_origins must be a sorted unique string array")
    if origins != sorted(set(origins)):
        fail("BUILD.json public_origins must be a sorted unique string array")
    for origin in origins:
        if len(origin) > 253:
            fail("BUILD.json has an invalid public origin")
        parsed = urllib.parse.urlsplit(origin)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
            or parsed.hostname in {"localhost", "example.invalid", "run.app", "127.0.0.1", "::1"}
            or parsed.hostname.endswith((".run.app", ".example.invalid", ".localhost"))
        ):
            fail(f"BUILD.json public origin is not an approved HTTPS origin: {origin}")

    providers = metadata["providers"]
    if not isinstance(providers, list) or any(not isinstance(item, str) for item in providers):
        fail("BUILD.json providers must be a sorted unique string array")
    if providers != sorted(set(providers)):
        fail("BUILD.json providers must be a sorted unique string array")
    if not providers or any(item not in ALLOWED_PROVIDERS for item in providers):
        fail("BUILD.json contains an unknown or forbidden provider")

    google_services = metadata["allowed_google_services"]
    if not isinstance(google_services, list) or any(
        not isinstance(item, str) for item in google_services
    ):
        fail("BUILD.json allowed_google_services must be a sorted unique string array")
    if google_services != sorted(set(google_services)):
        fail("BUILD.json allowed_google_services must be a sorted unique string array")
    if any(item not in GOOGLE_SERVICE_HOSTS for item in google_services):
        fail("only the reviewed Gemini and OAuth Google services may be allowed")
    for service in google_services:
        if GOOGLE_SERVICE_PROVIDER[service] not in providers:
            fail(f"Google service {service} lacks its matching provider declaration")
    for service, provider in GOOGLE_SERVICE_PROVIDER.items():
        if provider in providers and service not in google_services:
            fail(f"provider {provider} lacks an explicit Google service allowlist entry")

    allowed_hosts: set[str] = set()
    for service in google_services:
        allowed_hosts.update(GOOGLE_SERVICE_HOSTS[service])
    return metadata, allowed_hosts


def scan_runtime_content(path: Path, relative: str, allowed_google_hosts: set[str]) -> None:
    # Keep enough overlap for a hostname/project identifier split across chunks.
    overlap = b""
    try:
        with path.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                content = (overlap + chunk).lower()
                for marker in FORBIDDEN_RUNTIME_MARKERS | FORBIDDEN_GCP_IDENTIFIERS:
                    if marker in content:
                        fail(f"GCP runtime identifier remains in release artifact: {relative}")
                for match in GOOGLE_API_HOST.finditer(content):
                    hostname = match.group(0).decode("ascii")
                    if hostname not in allowed_google_hosts:
                        fail(f"unapproved Google API host {hostname} in release artifact: {relative}")
                overlap = content[-512:]
    except OSError as error:
        fail(f"cannot scan release member {relative}: {error}")


def reject_sensitive_name(relative: Path) -> None:
    for component in relative.parts:
        lowered = component.lower()
        if lowered in FORBIDDEN_EXACT:
            fail(f"forbidden credential or repository path: {relative}")
        if lowered == ".env" or (lowered.startswith(".env.") and lowered != ".env.example"):
            fail(f"runtime environment file is forbidden in a release: {relative}")
        if lowered.endswith(FORBIDDEN_SUFFIXES):
            fail(f"private key container is forbidden in a release: {relative}")
        if "service-account" in lowered and lowered.endswith(".json"):
            fail(f"service-account file is forbidden in a release: {relative}")


def add_field(digest: hashlib._Hash, value: bytes) -> None:
    digest.update(len(value).to_bytes(8, "big"))
    digest.update(value)


def reject_extended_attributes(path: Path, relative: str) -> None:
    listxattr = getattr(os, "listxattr", None)
    if listxattr is None:
        if sys.platform.startswith("linux"):
            fail("Python cannot inspect Linux extended attributes")
        return
    try:
        extended_attributes = listxattr(path, follow_symlinks=False)
    except OSError as error:
        fail(f"cannot inspect release member metadata {relative}: {error}")
    unexpected_attributes = [
        attribute
        for attribute in extended_attributes
        if os.fsdecode(attribute) != "security.selinux"
    ]
    if unexpected_attributes:
        # POSIX ACLs and Linux file capabilities are represented as extended
        # attributes and can make a mode-0440 release mutable or privileged
        # without changing the tree hash. A host-managed SELinux label is the
        # sole exception because it is assigned by deployment context.
        fail(f"extended attributes are forbidden: {relative}")


def main() -> None:
    args = parse_args()
    validate_component(args.app, "app")
    validate_component(args.release_id, "release_id")
    if bool(args.owner) != bool(args.group):
        fail("--owner and --group must be supplied together")
    try:
        expected_uid = pwd.getpwnam(args.owner).pw_uid if args.owner else None
        expected_gid = grp.getgrnam(args.group).gr_gid if args.group else None
    except KeyError:
        fail("expected release owner or group does not exist")

    root = args.release_dir
    if not root.is_absolute() or root.is_symlink() or not root.is_dir():
        fail("release root must be an absolute, real directory")
    root = root.resolve(strict=True)
    release_metadata = validate_metadata(root, args.space, args.app, args.release_id)
    _, allowed_google_hosts = validate_build_metadata(
        root, str(release_metadata["source_commit"])
    )
    reject_extended_attributes(root, ".")
    entries: list[tuple[str, Path, os.stat_result]] = [(".", root, root.lstat())]
    for current_root, directory_names, file_names in os.walk(root, followlinks=False):
        directory_names.sort()
        file_names.sort()
        current = Path(current_root)
        for name in [*directory_names, *file_names]:
            path = current / name
            relative = path.relative_to(root)
            relative_text = relative.as_posix()
            if any(ord(char) < 32 or ord(char) == 127 for char in relative_text):
                fail("release path contains a control character")
            reject_sensitive_name(relative)
            try:
                metadata = path.lstat()
            except OSError as error:
                fail(f"cannot stat release member {relative}: {error}")
            reject_extended_attributes(path, relative_text)
            entries.append((relative_text, path, metadata))

    if not entries:
        fail("release tree is empty")
    entries.sort(key=lambda item: item[0].encode("utf-8", "surrogateescape"))
    digest = hashlib.sha256()
    for relative_text, path, metadata in entries:
        mode = stat.S_IMODE(metadata.st_mode)
        if expected_uid is not None and metadata.st_uid != expected_uid:
            fail(f"release member has unexpected owner: {relative_text}")
        if expected_gid is not None and metadata.st_gid != expected_gid:
            fail(f"release member has unexpected group: {relative_text}")
        if stat.S_ISDIR(metadata.st_mode):
            kind = b"directory"
            if mode & 0o022:
                fail(f"group/world-writable release member: {relative_text}")
            if mode & 0o7000:
                fail(f"setuid, setgid or sticky release member: {relative_text}")
            if mode & 0o050 != 0o050:
                fail(f"release directory is not group-readable/traversable: {relative_text}")
            payload = b""
        elif stat.S_ISREG(metadata.st_mode):
            kind = b"file"
            if mode & 0o022:
                fail(f"group/world-writable release member: {relative_text}")
            if mode & 0o7000:
                fail(f"setuid, setgid or sticky release member: {relative_text}")
            if metadata.st_nlink != 1:
                fail(f"hard-linked release file is forbidden: {relative_text}")
            if mode & 0o040 == 0:
                fail(f"release file is not group-readable: {relative_text}")
            if mode & 0o100 and mode & 0o010 == 0:
                fail(f"owner-only executable is unusable by the service: {relative_text}")
            payload = b""
        elif stat.S_ISLNK(metadata.st_mode):
            kind = b"symlink"
            # POSIX symlink permission bits are not an access-control surface
            # and commonly read as 0777. Hash a canonical value while still
            # checking link ownership and the resolved target below.
            mode = 0o777
            try:
                link_target = os.readlink(path)
            except OSError as error:
                fail(f"cannot read release symlink {relative_text}: {error}")
            if not link_target or os.path.isabs(link_target):
                fail(f"absolute or empty release symlink: {relative_text}")
            try:
                resolved_target = (path.parent / link_target).resolve(strict=True)
            except (OSError, RuntimeError) as error:
                fail(f"dangling or cyclic release symlink {relative_text}: {error}")
            try:
                resolved_target.relative_to(root)
            except ValueError:
                fail(f"release symlink escapes its release root: {relative_text}")
            payload = os.fsencode(link_target)
        else:
            fail(f"unsupported release member type: {relative_text}")

        add_field(digest, kind)
        add_field(digest, relative_text.encode("utf-8", "surrogateescape"))
        add_field(digest, f"{mode:04o}".encode())
        if kind == b"file":
            add_field(digest, str(metadata.st_size).encode())
            try:
                with path.open("rb") as handle:
                    while chunk := handle.read(1024 * 1024):
                        digest.update(chunk)
            except OSError as error:
                fail(f"cannot hash release member {relative_text}: {error}")
            scan_runtime_content(path, relative_text, allowed_google_hosts)
        else:
            add_field(digest, payload)

    print(digest.hexdigest())


if __name__ == "__main__":
    main()
