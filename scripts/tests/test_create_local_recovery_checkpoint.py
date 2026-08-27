#!/usr/bin/env python3
"""Temporary-fixture tests for create-local-recovery-checkpoint.py."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "create-local-recovery-checkpoint.py"
NESTED_SCOPES = (
    "gsyen-api",
    "gsyen-android",
    "gsyen-model",
    "sgsyen-api",
    "sgsyen-web",
    "halfsphere",
)


def load_checkpoint_module():
    spec = importlib.util.spec_from_file_location(
        "gsyen_checkpoint_test_module", SCRIPT
    )
    if spec is None or spec.loader is None:
        raise AssertionError("checkpoint module could not be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def run(
    command: list[str],
    cwd: Path | None = None,
    environment: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        command,
        cwd=cwd,
        env=environment,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def git(repository: Path, *arguments: str) -> bytes:
    result = run(["git", "-C", os.fspath(repository), *arguments])
    if result.returncode != 0:
        raise AssertionError(f"fixture Git command failed: {arguments[0]}")
    return result.stdout


def initialize_repository(repository: Path, tracked_relative: str = "tracked.txt") -> None:
    repository.mkdir(parents=True, exist_ok=True)
    git(repository, "init", "-q")
    git(repository, "config", "user.name", "Checkpoint Test")
    git(repository, "config", "user.email", "checkpoint@example.invalid")
    tracked = repository / tracked_relative
    tracked.parent.mkdir(parents=True, exist_ok=True)
    tracked.write_text("base\n", encoding="utf-8")
    git(repository, "add", "--", tracked_relative)
    git(repository, "commit", "-q", "-m", "fixture baseline")


class RecoveryCheckpointTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        # macOS exposes /var as a symlink to /private/var. Resolve the fixture
        # root so positive tests exercise a path with no symlink components.
        temporary_root = Path(self.temporary.name).resolve()
        self.workspace = temporary_root / "workspace"
        self.output_parent = temporary_root / "checkpoints"
        self.output_parent.mkdir(mode=0o700)

        self.workspace.mkdir()
        git(self.workspace, "init", "-q")
        git(self.workspace, "config", "user.name", "Checkpoint Test")
        git(self.workspace, "config", "user.email", "checkpoint@example.invalid")
        (self.workspace / "email-worker").mkdir()
        (self.workspace / "deploy/aliyun/mail-ingest").mkdir(parents=True)
        (self.workspace / "tracked.txt").write_text("base\n", encoding="utf-8")
        (self.workspace / "email-worker/tracked.txt").write_text(
            "worker base\n", encoding="utf-8"
        )
        (self.workspace / "deploy/aliyun/mail-ingest/tracked.txt").write_text(
            "ingest base\n", encoding="utf-8"
        )
        git(self.workspace, "add", "--", "tracked.txt", "email-worker/tracked.txt", "deploy/aliyun/mail-ingest/tracked.txt")
        git(self.workspace, "commit", "-q", "-m", "root fixture baseline")

        for scope in NESTED_SCOPES:
            initialize_repository(self.workspace / scope)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def checkpoint_command(self, checkpoint_id: str, mode: str) -> list[str]:
        return [
            sys.executable,
            os.fspath(SCRIPT),
            "--workspace",
            os.fspath(self.workspace),
            "--output-parent",
            os.fspath(self.output_parent),
            "--checkpoint-id",
            checkpoint_id,
            mode,
        ]

    def populate_dirty_state(self) -> None:
        tracked = self.workspace / "tracked.txt"
        tracked.write_text("base\nstaged\n", encoding="utf-8")
        git(self.workspace, "add", "--", "tracked.txt")
        tracked.write_text("base\nstaged\nworktree\n", encoding="utf-8")
        (self.workspace / "safe.txt").write_text("safe root\n", encoding="utf-8")
        (self.workspace / ".env.example").write_text(
            "TOKEN=placeholder\n", encoding="utf-8"
        )
        (self.workspace / "email-worker/new-worker.txt").write_text(
            "safe worker\n", encoding="utf-8"
        )
        (self.workspace / "deploy/aliyun/mail-ingest/new-ingest.txt").write_text(
            "safe ingest\n", encoding="utf-8"
        )
        (self.workspace / ".env").write_text(
            "TOKEN=FAKE_SECRET_VALUE\n", encoding="utf-8"
        )
        (self.workspace / "local.sqlite").write_bytes(b"FAKE_SECRET_VALUE")
        (self.workspace / "server.key").write_text(
            "FAKE_SECRET_VALUE\n", encoding="utf-8"
        )
        (self.workspace / "node_modules/pkg").mkdir(parents=True)
        (self.workspace / "node_modules/pkg/index.js").write_text(
            "FAKE_SECRET_VALUE\n", encoding="utf-8"
        )
        nested_tracked = self.workspace / "gsyen-api/tracked.txt"
        nested_tracked.write_text("base\nnested worktree\n", encoding="utf-8")
        (self.workspace / "gsyen-api/new-source.txt").write_text(
            "safe nested\n", encoding="utf-8"
        )
        android_tracked = self.workspace / "gsyen-android/tracked.txt"
        android_tracked.write_text("base\nandroid staged\n", encoding="utf-8")
        git(self.workspace / "gsyen-android", "add", "--", "tracked.txt")

    def assert_checkpoint_modes(self, checkpoint: Path) -> None:
        for current_root, directory_names, file_names in os.walk(checkpoint):
            current = Path(current_root)
            self.assertEqual(stat.S_IMODE(current.lstat().st_mode), 0o700)
            for name in directory_names:
                member = current / name
                self.assertFalse(member.is_symlink())
                self.assertEqual(stat.S_IMODE(member.lstat().st_mode), 0o700)
            for name in file_names:
                member = current / name
                self.assertFalse(member.is_symlink())
                self.assertEqual(stat.S_IMODE(member.lstat().st_mode), 0o600)

    def assert_sha256sums(self, checkpoint: Path) -> None:
        rows = (checkpoint / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
        expected_paths = {
            path.relative_to(checkpoint).as_posix()
            for path in checkpoint.rglob("*")
            if path.is_file() and path.name != "SHA256SUMS"
        }
        actual_paths: set[str] = set()
        for row in rows:
            digest, relative = row.split("  ", 1)
            actual_paths.add(relative)
            actual = hashlib.sha256((checkpoint / relative).read_bytes()).hexdigest()
            self.assertEqual(digest, actual)
        self.assertEqual(actual_paths, expected_paths)

    def test_checkpoint_captures_repositories_without_secret_files(self) -> None:
        self.populate_dirty_state()
        preflight = run(self.checkpoint_command("fixture", "--check"))
        self.assertEqual(preflight.returncode, 0, preflight.stderr.decode())
        stdout = preflight.stdout.decode("utf-8")
        self.assertIn("CHECKPOINT_RESULT=preflight-pass", stdout)
        self.assertIn("REPOSITORY_COUNT=7", stdout)
        self.assertNotIn(os.fspath(self.workspace), stdout)
        self.assertNotIn("safe.txt", stdout)
        self.assertNotIn(".env", stdout)
        self.assertFalse(
            (self.output_parent / "gsyen-local-checkpoint-fixture").exists()
        )

        applied = run(self.checkpoint_command("fixture", "--apply"))
        self.assertEqual(applied.returncode, 0, applied.stderr.decode())
        self.assertNotIn(os.fspath(self.workspace), applied.stdout.decode("utf-8"))
        checkpoint = self.output_parent / "gsyen-local-checkpoint-fixture"
        self.assertTrue((checkpoint / "CHECKPOINT_COMPLETE").is_file())
        self.assert_checkpoint_modes(checkpoint)
        self.assert_sha256sums(checkpoint)

        repository_labels = {"root", *NESTED_SCOPES}
        self.assertEqual(
            {path.name for path in (checkpoint / "repos").iterdir()},
            repository_labels,
        )
        scope_rows = [
            json.loads(row)
            for row in (checkpoint / "scope-map.jsonl")
            .read_text(encoding="utf-8")
            .splitlines()
        ]
        self.assertEqual(len(scope_rows), 9)
        scope_by_name = {row["scope"]: row for row in scope_rows}
        self.assertEqual(scope_by_name["email-worker"]["repository_label"], "root")
        self.assertEqual(scope_by_name["mail-ingest"]["repository_label"], "root")

        root_snapshot = checkpoint / "repos/root"
        manifest_rows = [
            json.loads(row)
            for row in (root_snapshot / "untracked-manifest.jsonl")
            .read_text(encoding="utf-8")
            .splitlines()
        ]
        self.assertTrue(manifest_rows)
        self.assertTrue(
            all(set(row) == {"path", "type", "mode", "sha256"} for row in manifest_rows)
        )
        included_paths = {row["path"] for row in manifest_rows}
        self.assertIn("safe.txt", included_paths)
        self.assertIn(".env.example", included_paths)
        self.assertIn("email-worker/new-worker.txt", included_paths)
        self.assertIn("deploy/aliyun/mail-ingest/new-ingest.txt", included_paths)
        self.assertNotIn(".env", included_paths)
        self.assertNotIn("local.sqlite", included_paths)
        self.assertNotIn("server.key", included_paths)
        with tarfile.open(root_snapshot / "untracked.tar", "r") as archive:
            archived_names = set(archive.getnames())
        self.assertEqual(archived_names, included_paths)

        fake_secret = b"FAKE_SECRET_VALUE"
        for file_path in checkpoint.rglob("*"):
            if file_path.is_file():
                self.assertNotIn(fake_secret, file_path.read_bytes())

        for label in repository_labels:
            bundle = checkpoint / "repos" / label / "repository.bundle"
            verified = run(
                ["git", "-C", os.fspath(self.workspace / label if label != "root" else self.workspace), "bundle", "verify", os.fspath(bundle)]
            )
            self.assertEqual(verified.returncode, 0)

            restored = Path(self.temporary.name).resolve() / f"restored-{label}"
            cloned_repository = run(
                ["git", "clone", "-q", os.fspath(bundle), os.fspath(restored)]
            )
            self.assertEqual(
                cloned_repository.returncode,
                0,
                cloned_repository.stderr.decode(),
            )
            index_patch = checkpoint / "repos" / label / "index.patch"
            if index_patch.stat().st_size:
                restored_index = run(
                    [
                        "git",
                        "-C",
                        os.fspath(restored),
                        "apply",
                        "--index",
                        os.fspath(index_patch),
                    ]
                )
                self.assertEqual(
                    restored_index.returncode,
                    0,
                    restored_index.stderr.decode(),
                )
            worktree_patch = (
                checkpoint / "repos" / label / "tracked-working-tree.patch"
            )
            if worktree_patch.stat().st_size:
                restored_worktree = run(
                    [
                        "git",
                        "-C",
                        os.fspath(restored),
                        "apply",
                        os.fspath(worktree_patch),
                    ]
                )
                self.assertEqual(
                    restored_worktree.returncode,
                    0,
                    restored_worktree.stderr.decode(),
                )

        restored_root = Path(self.temporary.name).resolve() / "restored-root-detailed"
        cloned = run(
            [
                "git",
                "clone",
                "-q",
                os.fspath(root_snapshot / "repository.bundle"),
                os.fspath(restored_root),
            ]
        )
        self.assertEqual(cloned.returncode, 0, cloned.stderr.decode())
        applied_index = run(
            [
                "git",
                "-C",
                os.fspath(restored_root),
                "apply",
                "--index",
                os.fspath(root_snapshot / "index.patch"),
            ]
        )
        self.assertEqual(applied_index.returncode, 0, applied_index.stderr.decode())
        applied_worktree = run(
            [
                "git",
                "-C",
                os.fspath(restored_root),
                "apply",
                os.fspath(root_snapshot / "tracked-working-tree.patch"),
            ]
        )
        self.assertEqual(applied_worktree.returncode, 0, applied_worktree.stderr.decode())
        self.assertEqual(
            (restored_root / "tracked.txt").read_bytes(),
            (self.workspace / "tracked.txt").read_bytes(),
        )

        before = hashlib.sha256((checkpoint / "SHA256SUMS").read_bytes()).hexdigest()
        repeated = run(self.checkpoint_command("fixture", "--apply"))
        self.assertEqual(repeated.returncode, 0, repeated.stderr.decode())
        self.assertIn(
            "CHECKPOINT_RESULT=already-complete",
            repeated.stdout.decode("utf-8"),
        )
        after = hashlib.sha256((checkpoint / "SHA256SUMS").read_bytes()).hexdigest()
        self.assertEqual(before, after)
        (self.workspace / "safe.txt").write_text(
            "safe root changed after checkpoint\n", encoding="utf-8"
        )
        mismatched_repeat = run(self.checkpoint_command("fixture", "--apply"))
        self.assertEqual(mismatched_repeat.returncode, 75)
        final = hashlib.sha256((checkpoint / "SHA256SUMS").read_bytes()).hexdigest()
        self.assertEqual(before, final)

    def test_untracked_symlink_is_rejected_without_printing_target(self) -> None:
        outside = Path(self.temporary.name) / "outside-value"
        outside.write_text("not read\n", encoding="utf-8")
        (self.workspace / "unsafe-link").symlink_to(outside)
        checked = run(self.checkpoint_command("symlink-negative", "--check"))
        self.assertEqual(checked.returncode, 66)
        combined = checked.stdout + checked.stderr
        self.assertNotIn(os.fsencode(outside), combined)
        self.assertNotIn(b"unsafe-link", combined)

    def test_existing_symlink_target_is_never_followed(self) -> None:
        outside = Path(self.temporary.name) / "outside-directory"
        outside.mkdir()
        target = self.output_parent / "gsyen-local-checkpoint-target-negative"
        target.symlink_to(outside, target_is_directory=True)
        applied = run(self.checkpoint_command("target-negative", "--apply"))
        self.assertEqual(applied.returncode, 73)
        self.assertEqual(list(outside.iterdir()), [])

    def test_open_target_fd_prevents_concurrent_path_substitution(self) -> None:
        module = load_checkpoint_module()
        outside = Path(self.temporary.name).resolve() / "outside-substitution"
        outside.mkdir()
        target_name = "gsyen-local-checkpoint-fd-binding"
        target = self.output_parent / target_name
        retained = self.output_parent / "retained-checkpoint-inode"
        checkpoint = module.CheckpointTree.create_new(
            self.output_parent, target_name
        )
        try:
            target.rename(retained)
            target.symlink_to(outside, target_is_directory=True)
            checkpoint.write_bytes("probe", b"anchored\n")
            with self.assertRaises(module.CheckpointError) as raised:
                checkpoint.verify_public_binding()
            self.assertEqual(raised.exception.exit_code, 75)
        finally:
            checkpoint.close()
        self.assertEqual(list(outside.iterdir()), [])
        self.assertEqual((retained / "probe").read_bytes(), b"anchored\n")

    def test_tracked_sensitive_path_change_fails_before_capture(self) -> None:
        sensitive = self.workspace / ".env"
        sensitive.write_text("TOKEN=fixture-old\n", encoding="utf-8")
        git(self.workspace, "add", "--", ".env")
        git(self.workspace, "commit", "-q", "-m", "fixture sensitive baseline")
        sensitive.write_text("TOKEN=FAKE_TRACKED_SECRET\n", encoding="utf-8")
        checked = run(self.checkpoint_command("tracked-secret", "--check"))
        self.assertEqual(checked.returncode, 77)
        combined = checked.stdout + checked.stderr
        self.assertNotIn(b"FAKE_TRACKED_SECRET", combined)
        self.assertFalse(
            (self.output_parent / "gsyen-local-checkpoint-tracked-secret").exists()
        )

    def test_hidden_index_flags_fail_before_capture(self) -> None:
        git(self.workspace, "update-index", "--assume-unchanged", "tracked.txt")
        (self.workspace / "tracked.txt").write_text(
            "change hidden by assume-unchanged\n", encoding="utf-8"
        )
        nested = self.workspace / "gsyen-api"
        git(nested, "update-index", "--skip-worktree", "tracked.txt")
        (nested / "tracked.txt").write_text(
            "change hidden by skip-worktree\n", encoding="utf-8"
        )
        checked = run(self.checkpoint_command("hidden-index", "--check"))
        self.assertEqual(checked.returncode, 76)
        self.assertFalse(
            (self.output_parent / "gsyen-local-checkpoint-hidden-index").exists()
        )

    def test_intent_to_add_fails_before_capture(self) -> None:
        candidate = self.workspace / "intent-source.txt"
        candidate.write_text("intent content\n", encoding="utf-8")
        git(self.workspace, "add", "-N", "intent-source.txt")
        checked = run(self.checkpoint_command("intent-to-add", "--check"))
        self.assertEqual(checked.returncode, 76)
        self.assertFalse(
            (self.output_parent / "gsyen-local-checkpoint-intent-to-add").exists()
        )

    def test_inherited_git_redirection_environment_is_ignored(self) -> None:
        decoy = Path(self.temporary.name).resolve() / "decoy-repository"
        initialize_repository(decoy)
        environment = os.environ.copy()
        environment.update(
            {
                "GIT_DIR": os.fspath(decoy / ".git"),
                "GIT_WORK_TREE": os.fspath(decoy),
                "GIT_INDEX_FILE": os.fspath(decoy / ".git/index"),
                "GIT_CONFIG_COUNT": "1",
                "GIT_CONFIG_KEY_0": "core.hooksPath",
                "GIT_CONFIG_VALUE_0": os.fspath(decoy),
            }
        )
        checked = run(
            self.checkpoint_command("git-environment", "--check"),
            environment=environment,
        )
        self.assertEqual(checked.returncode, 0, checked.stderr.decode())
        self.assertIn(
            "REPOSITORY_COUNT=7", checked.stdout.decode("utf-8")
        )
        self.assertFalse(
            (self.output_parent / "gsyen-local-checkpoint-git-environment").exists()
        )

    def test_bound_repository_rejects_public_path_substitution(self) -> None:
        module = load_checkpoint_module()
        repositories, _ = module.discover_repositories(self.workspace)
        retained = self.workspace.with_name("retained-workspace-inode")
        decoy = self.workspace.with_name("decoy-workspace")
        initialize_repository(decoy)
        try:
            self.workspace.rename(retained)
            self.workspace.symlink_to(decoy, target_is_directory=True)
            with self.assertRaises(module.CheckpointError) as raised:
                module.run_git(
                    repositories[0], "root", "rev-parse", "--verify", "HEAD"
                )
            self.assertEqual(raised.exception.exit_code, 75)
        finally:
            module.close_repositories(repositories)

    def test_local_core_worktree_cannot_redirect_capture(self) -> None:
        module = load_checkpoint_module()
        repositories, _ = module.discover_repositories(self.workspace)
        external = self.workspace.with_name("external-worktree")
        external.mkdir()
        (external / "tracked.txt").write_text(
            "EXTERNAL CONTENT\n", encoding="utf-8"
        )
        git(self.workspace, "config", "core.worktree", os.fspath(external))
        try:
            captured = module.run_git(
                repositories[0], "root", "diff", "--", "tracked.txt"
            )
            self.assertEqual(captured, b"")
        finally:
            module.close_repositories(repositories)


if __name__ == "__main__":
    unittest.main()
