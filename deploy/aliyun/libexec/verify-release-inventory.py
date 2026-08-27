#!/usr/bin/env python3
"""Create or verify a hash inventory for immutable business-space releases."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


APP_GROUPS = {
    "gsyen": {
        "gsyen-web": "gsyen",
        "gsyen-api": "gsyen",
        "sgsyen-web": "gsyen",
        "sgsyen-api": "gsyen",
        "gsyen-model": "gsyen",
        "mail-ingest": "gsyen-mail",
        "stalwart": "stalwart",
    },
    "halfsphere": {
        "halfsphere-web": "halfsphere",
        "halfsphere-api": "halfsphere",
    },
}


def fail(message: str) -> None:
    print(f"verify-release-inventory.py: {message}", file=sys.stderr)
    raise SystemExit(65)


def validate_release(
    validator: Path,
    stalwart_validator: Path,
    space: str,
    app: str,
    release_id: str,
    release: Path,
    owner_check: bool,
) -> str:
    command = [str(validator), space, app, release_id, str(release)]
    if owner_check:
        command.extend(["--owner", "root", "--group", APP_GROUPS[space][app]])
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        fail(f"release validation failed for {space}/{app}/{release_id}")
    tree_hash = result.stdout.strip()
    if len(tree_hash) != 64 or any(character not in "0123456789abcdef" for character in tree_hash):
        fail("release validator returned an invalid tree hash")
    if space == "gsyen" and app == "stalwart":
        result = subprocess.run(
            [str(stalwart_validator), str(release)],
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            fail("pinned Stalwart release validation failed")
    return tree_hash


def inventory(space: str, apps_root: Path, owner_check: bool) -> dict[str, object]:
    script_dir = Path(__file__).resolve().parent
    validator = script_dir / "validate-release-tree.py"
    stalwart_validator = script_dir / "validate-stalwart-release.py"
    if not validator.is_file() or not stalwart_validator.is_file():
        fail("release validators are unavailable")
    if not apps_root.is_absolute() or apps_root.is_symlink() or not apps_root.is_dir():
        fail("apps root must be an absolute real directory")
    allowed = APP_GROUPS[space]
    entries: list[dict[str, object]] = []
    observed_apps: set[str] = set()
    for app_root in sorted(apps_root.iterdir(), key=lambda path: path.name):
        if app_root.name.startswith(".stage-"):
            fail("unfinished release staging directory exists")
        if not app_root.is_dir() or app_root.is_symlink():
            fail("apps root contains a non-directory or symlink entry")
        if app_root.name not in allowed:
            fail(f"unmanaged application directory must be classified before backup: {app_root.name}")
        observed_apps.add(app_root.name)
        children = {child.name for child in app_root.iterdir()}
        if children != {"current", "releases"}:
            fail(f"incomplete, legacy or mutable layout is forbidden for backup: {app_root.name}")
        releases_root = app_root / "releases"
        if releases_root.is_symlink() or not releases_root.is_dir():
            fail(f"unsafe releases directory: {app_root.name}")
        releases: list[dict[str, str]] = []
        for release in sorted(releases_root.iterdir(), key=lambda path: path.name):
            if release.is_symlink() or not release.is_dir():
                fail(f"unsafe release entry: {app_root.name}/{release.name}")
            tree_hash = validate_release(
                validator,
                stalwart_validator,
                space,
                app_root.name,
                release.name,
                release,
                owner_check,
            )
            releases.append({"release_id": release.name, "tree_sha256": tree_hash})
        if not releases:
            fail(f"application has no immutable release to back up: {app_root.name}")
        current_link = app_root / "current"
        if current_link.is_symlink():
            current = os.readlink(current_link)
            if not current.startswith("releases/") or "/" in current[len("releases/") :]:
                fail(f"unsafe current link: {app_root.name}")
            if current[len("releases/") :] not in {item["release_id"] for item in releases}:
                fail(f"current points to an unvalidated release: {app_root.name}")
        else:
            fail(f"current is missing or is not a symlink: {app_root.name}")
        entries.append({"app": app_root.name, "current": current, "releases": releases})
    missing_apps = set(allowed) - observed_apps
    if missing_apps:
        fail(f"required application is absent from backup: {','.join(sorted(missing_apps))}")
    return {"schema": 1, "space": space, "apps": entries}


def main() -> None:
    if len(sys.argv) not in {5, 6}:
        fail(
            "usage: verify-release-inventory.py {create|verify} {gsyen|halfsphere} "
            "APPS_ROOT MANIFEST [--owner-check]"
        )
    mode, space, apps_root_raw, manifest_raw = sys.argv[1:5]
    if mode not in {"create", "verify"} or space not in APP_GROUPS:
        fail("invalid mode or business space")
    owner_check = len(sys.argv) == 6 and sys.argv[5] == "--owner-check"
    if len(sys.argv) == 6 and not owner_check:
        fail("unknown option")
    apps_root = Path(apps_root_raw)
    manifest_path = Path(manifest_raw)
    if not manifest_path.is_absolute() or manifest_path.is_symlink():
        fail("manifest path must be absolute and must not be a symlink")
    observed = inventory(space, apps_root, owner_check)
    if mode == "create":
        if manifest_path.exists():
            fail("refusing to overwrite an existing release inventory")
        try:
            with manifest_path.open("x", encoding="utf-8") as handle:
                json.dump(observed, handle, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
        except OSError as error:
            fail(f"cannot write release inventory: {error}")
    else:
        if not manifest_path.is_file():
            fail("release inventory is missing")
        try:
            expected = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            fail(f"cannot read release inventory: {error}")
        if expected != observed:
            fail("release inventory/tree/current link mismatch")
    print(f"Validated immutable release inventory for {space}; no file contents were printed.")


if __name__ == "__main__":
    main()
