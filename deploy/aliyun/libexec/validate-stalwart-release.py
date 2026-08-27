#!/usr/bin/env python3
"""Validate a pinned Stalwart binary release without executing the candidate."""

from __future__ import annotations

import hashlib
import json
import re
import stat
import sys
import urllib.parse
from pathlib import Path


EXPECTED_KEYS = {
    "schema",
    "version",
    "platform",
    "source_url",
    "archive_sha256",
    "binary_sha256",
}
VERSION = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
PLATFORMS = {"x86_64-unknown-linux-gnu"}


def fail(message: str) -> None:
    print(f"validate-stalwart-release.py: {message}", file=sys.stderr)
    raise SystemExit(65)


def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: validate-stalwart-release.py RELEASE_DIRECTORY")
    release = Path(sys.argv[1])
    if not release.is_absolute() or release.is_symlink() or not release.is_dir():
        fail("release must be an absolute, real directory")
    release = release.resolve(strict=True)
    manifest_path = release / "STALWART_RELEASE.json"
    binary_path = release / "bin" / "stalwart"
    if manifest_path.is_symlink() or binary_path.is_symlink():
        fail("manifest and binary must not be symlinks")
    try:
        raw = manifest_path.read_bytes()
    except OSError as error:
        fail(f"cannot read STALWART_RELEASE.json: {error}")
    if len(raw) > 16_384:
        fail("STALWART_RELEASE.json is unexpectedly large")
    try:
        manifest = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail(f"invalid STALWART_RELEASE.json: {error}")
    if not isinstance(manifest, dict) or set(manifest) != EXPECTED_KEYS:
        fail("STALWART_RELEASE.json has missing or unexpected keys")
    if manifest["schema"] != 1:
        fail("unsupported manifest schema")
    if not isinstance(manifest["version"], str) or not VERSION.fullmatch(manifest["version"]):
        fail("version must be an explicit semantic version; current production is not assumed")
    if manifest["platform"] not in PLATFORMS:
        fail("platform does not match the reviewed Alibaba Cloud ECS target")
    source_url = manifest["source_url"]
    if not isinstance(source_url, str):
        fail("source_url must be a string")
    parsed = urllib.parse.urlsplit(source_url)
    forbidden_hosts = {"run.app", "googleapis.com", "pkg.dev"}
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.hostname in forbidden_hosts
        or parsed.hostname.endswith(tuple(f".{host}" for host in forbidden_hosts))
    ):
        fail("source_url must be credential-free HTTPS and must not use GCP hosting")
    for key in ("archive_sha256", "binary_sha256"):
        if not isinstance(manifest[key], str) or not SHA256.fullmatch(manifest[key]):
            fail(f"{key} must be a pinned lowercase SHA-256")
    try:
        binary_stat = binary_path.stat()
    except OSError as error:
        fail(f"cannot stat bin/stalwart: {error}")
    if not stat.S_ISREG(binary_stat.st_mode) or binary_stat.st_size <= 0:
        fail("bin/stalwart must be a nonempty regular file")
    if stat.S_IMODE(binary_stat.st_mode) & 0o111 == 0:
        fail("bin/stalwart must be executable")
    digest = hashlib.sha256()
    try:
        with binary_path.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                digest.update(chunk)
    except OSError as error:
        fail(f"cannot hash bin/stalwart: {error}")
    if digest.hexdigest() != manifest["binary_sha256"]:
        fail("bin/stalwart does not match the pinned binary_sha256")
    print(
        f"Validated pinned Stalwart {manifest['version']} for {manifest['platform']}; "
        f"binary_sha256={manifest['binary_sha256']}"
    )


if __name__ == "__main__":
    main()
