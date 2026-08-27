#!/usr/bin/env python3
from __future__ import annotations

import grp
import hashlib
import importlib.util
import io
import contextlib
import os
from pathlib import Path
import pwd
import subprocess
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock


DEPLOY = Path(__file__).resolve().parents[1]
CONTENT_PATH = DEPLOY / "libexec/content_inventory.py"
VALIDATOR = DEPLOY / "libexec/validate-tar-archive.py"
OWNERS = DEPLOY / "libexec/apply-tar-symbolic-owners.py"
SPEC = importlib.util.spec_from_file_location("content_inventory", CONTENT_PATH)
CONTENT = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CONTENT
SPEC.loader.exec_module(CONTENT)
VALIDATOR_SPEC = importlib.util.spec_from_file_location("validate_tar_archive", VALIDATOR)
TAR_CONTRACT = importlib.util.module_from_spec(VALIDATOR_SPEC)
VALIDATOR_SPEC.loader.exec_module(TAR_CONTRACT)
OWNER_SPEC = importlib.util.spec_from_file_location("apply_tar_symbolic_owners", OWNERS)
OWNER_CONTRACT = importlib.util.module_from_spec(OWNER_SPEC)
OWNER_SPEC.loader.exec_module(OWNER_CONTRACT)


class ContentInventoryTest(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.root = Path(self.temporary_directory.name).resolve()
        self.owner = pwd.getpwuid(os.getuid()).pw_name
        self.group = grp.getgrgid(os.getgid()).gr_name

    def _space(self):
        space = self.root / "space"
        (space / "config").mkdir(parents=True, mode=0o750)
        (space / "data").mkdir(mode=0o750)
        state = space / "config/state.txt"
        state.write_bytes(b"state")
        state.chmod(0o640)
        return space, state

    def _inventory(self, space):
        with mock.patch.object(
            CONTENT.pwd, "getpwuid", return_value=SimpleNamespace(pw_name="fixtureuser")
        ), mock.patch.object(
            CONTENT.grp, "getgrgid", return_value=SimpleNamespace(gr_name="fixturegroup")
        ):
            return CONTENT.inventory(
                "halfsphere",
                space,
                allowed_owners={"fixtureuser"},
                allowed_groups={"fixturegroup"},
            )

    def test_inventory_detects_hash_and_mode_changes(self):
        space, state = self._space()
        baseline = self._inventory(space)
        state.write_bytes(b"changed")
        self.assertNotEqual(baseline, self._inventory(space))
        state.chmod(0o660)
        with self.assertRaisesRegex(CONTENT.InventoryError, "writable"):
            self._inventory(space)

    def test_inventory_rejects_symbolic_identity_outside_allowlist(self):
        space, _ = self._space()
        with self.assertRaisesRegex(CONTENT.InventoryError, "allowlist"):
            CONTENT.inventory(
                "halfsphere",
                space,
                allowed_owners={"definitely-not-current-owner"},
                allowed_groups={self.group},
            )

    def _tar(self, *, owner="root", file_mode=0o640, hash_value=None):
        archive_path = self.root / f"fixture-{owner}-{file_mode}-{hash_value}.tar"
        payload = b"state"
        digest = hash_value or hashlib.sha256(payload).hexdigest()
        manifest = {
            "entries": [
                {"group":"root","mode":"0750","owner":"root","path":"config","sha256":None,"size":0,"symlink_target":None,"type":"directory"},
                {"group":"root","mode":"0640","owner":"root","path":"config/state.txt","sha256":digest,"size":len(payload),"symlink_target":None,"type":"file"},
                {"group":"root","mode":"0750","owner":"root","path":"data","sha256":None,"size":0,"symlink_target":None,"type":"directory"},
            ],
            "roots": ["config", "data"],
            "schema": 1,
            "space": "halfsphere",
        }
        manifest_payload = CONTENT.canonical_json(manifest) + b"\n"
        with tarfile.open(archive_path, "w") as archive:
            def add(name, mode, data=None, uname="root"):
                member = tarfile.TarInfo(name)
                member.uid = 424242
                member.gid = 434343
                member.uname = uname
                member.gname = "root"
                member.mode = mode
                if data is None:
                    member.type = tarfile.DIRTYPE
                    archive.addfile(member)
                else:
                    member.size = len(data)
                    archive.addfile(member, io.BytesIO(data))
            add("apps", 0o750)
            add("config", 0o750)
            add("config/state.txt", file_mode, payload, owner)
            add("data", 0o750)
            add("exports", 0o700)
            add("exports/content-inventory.json", 0o600, manifest_payload)
        return archive_path

    def _validate(self, archive_path):
        with tarfile.open(archive_path, "r:") as archive:
            members = {member.name: member for member in archive.getmembers()}
            TAR_CONTRACT.validate_content_inventory(archive, members, "halfsphere")

    def test_tar_accepts_numeric_id_drift_when_symbolic_names_map(self):
        self._validate(self._tar())
        with mock.patch.object(
            OWNER_CONTRACT.pwd, "getpwnam", return_value=SimpleNamespace(pw_uid=1234)
        ), mock.patch.object(
            OWNER_CONTRACT.grp, "getgrnam", return_value=SimpleNamespace(gr_gid=2345)
        ):
            self.assertEqual(OWNER_CONTRACT.target_identity("halfsphere", "root", "root"), (1234, 2345))

    def test_symbolic_mapping_rejects_empty_or_missing_target_accounts(self):
        with self.assertRaisesRegex(OWNER_CONTRACT.OwnershipError, "empty"):
            OWNER_CONTRACT.target_identity("halfsphere", "", "root")
        with mock.patch.object(OWNER_CONTRACT.pwd, "getpwnam", side_effect=KeyError):
            with self.assertRaisesRegex(OWNER_CONTRACT.OwnershipError, "absent"):
                OWNER_CONTRACT.target_identity("halfsphere", "root", "root")

    def test_tar_rejects_wrong_owner_mode_and_hash(self):
        for archive in (
            self._tar(owner="unknown-fixture-owner"),
            self._tar(file_mode=0o660),
            self._tar(hash_value="0" * 64),
        ):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                self._validate(archive)

    def test_archive_without_content_inventory_fails_closed(self):
        archive_path = self.root / "legacy-without-inventory.tar"
        with tarfile.open(archive_path, "w") as archive:
            member = tarfile.TarInfo("config")
            member.type = tarfile.DIRTYPE
            member.mode = 0o750
            member.uname = "root"
            member.gname = "root"
            archive.addfile(member)
        with tarfile.open(archive_path, "r:") as archive, \
             contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            TAR_CONTRACT.validate_content_inventory(
                archive, {member.name: member for member in archive.getmembers()}, "halfsphere"
            )


if __name__ == "__main__":
    unittest.main()
