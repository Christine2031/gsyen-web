#!/usr/bin/env python3
"""Validate rendered non-secret GSYEN/HalfSphere resource allocation contracts."""

from __future__ import annotations

import re
import sys
from pathlib import Path


BOUNDARY_KEYS = {
    "BUSINESS_SPACE",
    "LINUX_USER",
    "SERVICE_PREFIX",
    "ROOT_PATH",
    "PORT_MIN",
    "PORT_MAX",
    "RDS_DATABASE",
    "RDS_SCHEMA",
    "RDS_APP_USER",
    "OSS_ISOLATION_MODE",
    "OSS_BUCKET",
    "OSS_PREFIX",
    "ACR_NAMESPACE",
    "SLS_PROJECT",
    "RAM_ROLE",
}
TOPOLOGY_KEYS = {"TOPOLOGY", "GSYEN_ECS_ID", "HALFSPHERE_ECS_ID"}
SAFE_IDENTIFIER = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{1,127}$")
SAFE_BUCKET = re.compile(r"^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$")
SAFE_PREFIX = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}/$")
ECS_ID = re.compile(r"^i-[A-Za-z0-9]{8,64}$")


def fail(message: str) -> None:
    print(f"validate-resource-boundaries.py: {message}", file=sys.stderr)
    raise SystemExit(65)


def read_contract(path: Path, expected_keys: set[str], label: str) -> dict[str, str]:
    if not path.is_absolute() or path.is_symlink() or not path.is_file():
        fail(f"{label} must be an absolute regular non-symlink file")
    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError) as error:
        fail(f"cannot read {label}: {error}")
    for line in lines:
        if not line.strip() or line.startswith("#"):
            continue
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)=([^\s]+)", line)
        if not match:
            fail(f"{label} contains a malformed assignment")
        key, value = match.groups()
        if key in values:
            fail(f"{label} contains duplicate key {key}")
        if (
            "__" in value
            or "replace-with" in value.lower()
            or "example.invalid" in value.lower()
            or "$" in value
            or "`" in value
        ):
            fail(f"{label} contains an unresolved or executable value for {key}")
        values[key] = value
    if set(values) != expected_keys:
        missing = ",".join(sorted(expected_keys - set(values))) or "none"
        extra = ",".join(sorted(set(values) - expected_keys)) or "none"
        fail(f"{label} key set mismatch (missing={missing}; extra={extra})")
    return values


def validate_one(values: dict[str, str], space: str) -> None:
    expected = {
        "BUSINESS_SPACE": space,
        "LINUX_USER": space,
        "SERVICE_PREFIX": f"{space}-",
        "ROOT_PATH": f"/srv/{space}",
        "PORT_MIN": "18080" if space == "gsyen" else "18180",
        "PORT_MAX": "18089" if space == "gsyen" else "18189",
    }
    for key, expected_value in expected.items():
        if values[key] != expected_value:
            fail(f"{space} {key} violates the fixed business-space allocation")
    for key in ("RDS_DATABASE", "RDS_SCHEMA", "RDS_APP_USER", "ACR_NAMESPACE", "SLS_PROJECT", "RAM_ROLE"):
        if not SAFE_IDENTIFIER.fullmatch(values[key]):
            fail(f"{space} {key} is not a safe explicit resource identifier")
    if not SAFE_BUCKET.fullmatch(values["OSS_BUCKET"]):
        fail(f"{space} OSS_BUCKET is not a safe explicit bucket name")
    prefix = values["OSS_PREFIX"]
    if not SAFE_PREFIX.fullmatch(prefix) or ".." in prefix.split("/"):
        fail(f"{space} OSS_PREFIX must be a normalized non-root prefix ending in /")
    if values["OSS_ISOLATION_MODE"] not in {"dedicated_bucket", "strict_prefix"}:
        fail(f"{space} OSS_ISOLATION_MODE must be dedicated_bucket or strict_prefix")


def validate_distinct(gsyen: dict[str, str], halfsphere: dict[str, str]) -> None:
    for key in ("RDS_DATABASE", "RDS_SCHEMA", "RDS_APP_USER", "ACR_NAMESPACE", "SLS_PROJECT"):
        if gsyen[key] == halfsphere[key]:
            fail(f"GSYEN and HalfSphere must not share {key}")
    if gsyen["OSS_BUCKET"] == halfsphere["OSS_BUCKET"]:
        if (
            gsyen["OSS_ISOLATION_MODE"] != "strict_prefix"
            or halfsphere["OSS_ISOLATION_MODE"] != "strict_prefix"
        ):
            fail("a shared OSS bucket requires strict_prefix mode in both contracts")
        left = gsyen["OSS_PREFIX"]
        right = halfsphere["OSS_PREFIX"]
        if left.startswith(right) or right.startswith(left):
            fail("shared OSS prefixes overlap; use disjoint prefixes or dedicated buckets")
    elif (
        gsyen["OSS_ISOLATION_MODE"] != "dedicated_bucket"
        or halfsphere["OSS_ISOLATION_MODE"] != "dedicated_bucket"
    ):
        fail("distinct OSS buckets must declare dedicated_bucket isolation")


def validate_topology(
    topology: dict[str, str], gsyen: dict[str, str], halfsphere: dict[str, str]
) -> None:
    mode = topology["TOPOLOGY"]
    if mode not in {"shared_ecs", "separate_ecs"}:
        fail("TOPOLOGY must be shared_ecs or separate_ecs")
    for key in ("GSYEN_ECS_ID", "HALFSPHERE_ECS_ID"):
        if not ECS_ID.fullmatch(topology[key]):
            fail(f"{key} must be an explicit ECS instance ID")
    same_instance = topology["GSYEN_ECS_ID"] == topology["HALFSPHERE_ECS_ID"]
    if mode == "shared_ecs":
        if not same_instance:
            fail("shared_ecs topology must name the same ECS for both spaces")
        if gsyen["RAM_ROLE"] != halfsphere["RAM_ROLE"]:
            fail(
                "one ECS can have only one instance RAM role; different GSYEN/HalfSphere "
                "RAM_ROLE values require an independent HalfSphere ECS"
            )
        fail(
            "a shared instance RAM role violates the required business permission isolation; "
            "use an independent HalfSphere ECS (no same-host broker is approved by this template)"
        )
    if same_instance:
        fail("separate_ecs topology must name different ECS instance IDs")
    if gsyen["RAM_ROLE"] == halfsphere["RAM_ROLE"]:
        fail("separate ECS instances must use distinct business RAM roles")


def main() -> None:
    if len(sys.argv) != 4:
        fail("usage: validate-resource-boundaries.py TOPOLOGY GSYEN_BOUNDARY HALFSPHERE_BOUNDARY")
    topology = read_contract(Path(sys.argv[1]), TOPOLOGY_KEYS, "topology")
    gsyen = read_contract(Path(sys.argv[2]), BOUNDARY_KEYS, "GSYEN boundary")
    halfsphere = read_contract(Path(sys.argv[3]), BOUNDARY_KEYS, "HalfSphere boundary")
    validate_one(gsyen, "gsyen")
    validate_one(halfsphere, "halfsphere")
    validate_distinct(gsyen, halfsphere)
    validate_topology(topology, gsyen, halfsphere)
    print("Validated non-secret GSYEN/HalfSphere resource boundaries; values were not printed.")


if __name__ == "__main__":
    main()
