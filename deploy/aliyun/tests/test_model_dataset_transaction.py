#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest


HELPER = Path(__file__).resolve().parents[1] / "libexec/model_dataset_transaction.py"
SPEC = importlib.util.spec_from_file_location("model_dataset_transaction", HELPER)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


HEADER = "order_id,customer_id,datetime,product,qty_jin,unit_price,amount,weather\n"


class ModelDatasetTransactionTest(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.root = Path(self.temporary_directory.name).resolve()
        self.uid = os.getuid()
        self.gid = os.getgid()

    def _candidate(self, parent: str, row: str) -> Path:
        directory = self.root / parent
        directory.mkdir(mode=0o750)
        candidate = directory / "transactions.csv"
        candidate.write_text("\ufeff" + HEADER + row + "\n", encoding="utf-8")
        return candidate

    def _write_version(self, versions: Path, version_id: str, candidate: Path) -> dict:
        manifest, payload = MODULE.candidate_manifest(version_id, 1024, candidate)
        version = versions / version_id
        version.mkdir(mode=0o750)
        (version / "transactions.csv").write_bytes(payload)
        (version / "MANIFEST.json").write_bytes(MODULE._canonical_json(manifest) + b"\n")
        (version / "transactions.csv").chmod(0o640)
        (version / "MANIFEST.json").chmod(0o640)
        return MODULE.validate_version(
            version_id,
            version,
            expected_uid=self.uid,
            expected_gid=self.gid,
        )

    def _transaction_state(self):
        datasets = self.root / "datasets"
        versions = datasets / "versions"
        config = self.root / "config"
        datasets.mkdir(mode=0o750)
        versions.mkdir(mode=0o750)
        config.mkdir(mode=0o750)
        first = self._write_version(
            versions,
            "v1",
            self._candidate("candidate-v1", "1,c1,2026-08-01 10:00:00,明虾,1,2,2,晴"),
        )
        second = self._write_version(
            versions,
            "v2",
            self._candidate("candidate-v2", "2,c2,2026-08-02 10:00:00,明虾,2,3,6,晴"),
        )
        current = datasets / "current"
        current.symlink_to("versions/v1")
        env = config / "gsyen-model.env"
        env.write_text(
            "GSYEN_MODEL_DATA_MODE=production\n"
            f"GSYEN_MODEL_DATA_PATH={current}/transactions.csv\n"
            "GSYEN_MODEL_DATA_MAX_BYTES=1024\n"
            f"GSYEN_MODEL_DATA_SHA256={first['dataset_sha256']}\n"
            "GSYEN_MODEL_CORS_ORIGINS=\n"
            "FIXTURE_SECRET=not-a-real-secret\n",
            encoding="utf-8",
        )
        env.chmod(0o640)
        paths = MODULE.TransactionPaths(datasets, versions, current, datasets / "previous", env)
        return paths, first, second

    def test_candidate_manifest_is_deterministic_and_binds_filename_size_and_hash(self):
        candidate = self._candidate(
            "candidate", "0001,0007,2026-08-01 10:00:00,明虾,1,2,2,晴"
        )
        first, payload = MODULE.candidate_manifest("data-1", 1024, candidate)
        second, _ = MODULE.candidate_manifest("data-1", 1024, candidate)
        self.assertEqual(first, second)
        self.assertEqual(first["filename"], "transactions.csv")
        self.assertEqual(first["size_bytes"], len(payload))
        self.assertEqual(first["dataset_sha256"], hashlib.sha256(payload).hexdigest())
        self.assertEqual(MODULE.manifest_digest(first), MODULE.manifest_digest(second))

    def test_candidate_rejects_symlink_wrong_filename_and_size_limit(self):
        candidate = self._candidate(
            "candidate", "1,c1,2026-08-01 10:00:00,明虾,1,2,2,晴"
        )
        linked = self.root / "linked.csv"
        linked.symlink_to(candidate)
        with self.assertRaisesRegex(MODULE.ContractError, "symbolic-link|filename"):
            MODULE.candidate_manifest("data-1", 1024, linked)
        wrong = candidate.with_name("model.csv")
        wrong.write_bytes(candidate.read_bytes())
        with self.assertRaisesRegex(MODULE.ContractError, "filename"):
            MODULE.candidate_manifest("data-1", 1024, wrong)
        with self.assertRaisesRegex(MODULE.ContractError, "between 1024"):
            MODULE.candidate_manifest("data-1", 10, candidate)

    def test_version_rejects_metadata_or_manifest_tampering(self):
        versions = self.root / "versions"
        versions.mkdir(mode=0o750)
        candidate = self._candidate(
            "candidate", "1,c1,2026-08-01 10:00:00,明虾,1,2,2,晴"
        )
        self._write_version(versions, "v1", candidate)
        (versions / "v1/transactions.csv").chmod(0o660)
        with self.assertRaisesRegex(MODULE.ContractError, "mode"):
            MODULE.validate_version(
                "v1", versions / "v1", expected_uid=self.uid, expected_gid=self.gid
            )

    def test_promote_plan_is_deterministic_and_render_preserves_unrelated_values(self):
        paths, _, second = self._transaction_state()
        first_plan = MODULE.build_plan(
            "promote", "v2", paths=paths, expected_uid=self.uid, expected_gid=self.gid
        )
        second_plan = MODULE.build_plan(
            "promote", "v2", paths=paths, expected_uid=self.uid, expected_gid=self.gid
        )
        self.assertEqual(first_plan, second_plan)
        self.assertFalse(first_plan["no_op"])
        self.assertEqual(first_plan["current_target"], "versions/v1")
        output = self.root / "rendered.env"
        MODULE.render_env_for_version(
            "v2", output, paths=paths, expected_uid=self.uid, expected_gid=self.gid
        )
        rendered = output.read_text(encoding="utf-8")
        self.assertIn("FIXTURE_SECRET=not-a-real-secret\n", rendered)
        self.assertIn(f"GSYEN_MODEL_DATA_SHA256={second['dataset_sha256']}\n", rendered)
        self.assertIn("GSYEN_MODEL_DATA_MAX_BYTES=1024\n", rendered)

    def test_rollback_must_equal_previous_and_legacy_current_is_rejected(self):
        paths, _, _ = self._transaction_state()
        paths.previous_link.symlink_to("versions/v2")
        plan = MODULE.build_plan(
            "rollback", "v2", paths=paths, expected_uid=self.uid, expected_gid=self.gid
        )
        self.assertEqual(plan["previous_target"], "versions/v2")
        with self.assertRaisesRegex(MODULE.ContractError, "previous"):
            MODULE.build_plan(
                "rollback", "v1", paths=paths, expected_uid=self.uid, expected_gid=self.gid
            )
        paths.current_link.unlink()
        paths.current_link.symlink_to(paths.versions_root / "v1")
        with self.assertRaisesRegex(MODULE.ContractError, "unsafe or legacy"):
            MODULE.build_plan(
                "promote", "v2", paths=paths, expected_uid=self.uid, expected_gid=self.gid
            )


if __name__ == "__main__":
    unittest.main()
