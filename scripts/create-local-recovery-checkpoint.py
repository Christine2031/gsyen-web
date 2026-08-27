#!/usr/bin/env python3
"""Create a private, non-overwriting recovery checkpoint for the migration workspace.

The script intentionally has no restore, cleanup, Git staging, commit, or network
operation. Use --check first. --apply repeats the preflight and creates a new
checkpoint directory that must not already exist.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import datetime as dt
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import tarfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import BinaryIO


FORMAT_VERSION = 2
CHECKPOINT_NAME_PREFIX = "gsyen-local-checkpoint-"
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
SCOPES = (
    ("root", Path(".")),
    ("gsyen-api", Path("gsyen-api")),
    ("gsyen-android", Path("gsyen-android")),
    ("gsyen-model", Path("gsyen-model")),
    ("sgsyen-api", Path("sgsyen-api")),
    ("sgsyen-web", Path("sgsyen-web")),
    ("halfsphere", Path("halfsphere")),
    ("email-worker", Path("email-worker")),
    ("mail-ingest", Path("deploy/aliyun/mail-ingest")),
)
BUILD_DIRECTORY_NAMES = {
    ".cache",
    ".git",
    ".gradle",
    ".next",
    ".turbo",
    ".venv",
    ".wrangler",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "target",
    "venv",
}
PRIVATE_CONTAINER_SUFFIXES = {
    ".cer",
    ".crt",
    ".der",
    ".jks",
    ".key",
    ".kdbx",
    ".keystore",
    ".mobileprovision",
    ".ovpn",
    ".p12",
    ".pem",
    ".pfx",
}
DATABASE_SUFFIXES = {
    ".accdb",
    ".bak",
    ".backup",
    ".db",
    ".db3",
    ".dump",
    ".mdb",
    ".rdb",
    ".sqlite",
    ".sqlite3",
}
PRIVATE_EXACT_NAMES = {
    ".git-credentials",
    ".netrc",
    ".npmrc",
    ".pypirc",
    "google-services.json",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    "id_rsa",
    "key.properties",
    "local.properties",
    "secret.json",
    "secret.toml",
    "secret.yaml",
    "secret.yml",
    "secrets.json",
    "secrets.toml",
    "secrets.yaml",
    "secrets.yml",
    "token.json",
}
PRIVATE_DIRECTORY_NAMES = {".aws", ".docker", ".gnupg", ".kube", ".ssh"}
SAFE_ENV_TEMPLATE_SUFFIXES = (".example", ".sample", ".template")


class CheckpointError(Exception):
    def __init__(self, public_message: str, exit_code: int = 1) -> None:
        super().__init__(public_message)
        self.public_message = public_message
        self.exit_code = exit_code


@dataclass(frozen=True)
class Repository:
    label: str
    root: Path
    excluded_repository_roots: tuple[Path, ...]
    directory_fd: int
    git_directory_fd: int
    root_identity: tuple[int, int]
    git_directory_identity: tuple[int, int]


@dataclass(frozen=True)
class ScopeResolution:
    scope: str
    relative_path: str
    repository_label: str
    classification: str


@dataclass(frozen=True)
class UntrackedPlan:
    eligible: tuple[bytes, ...]
    excluded_counts: dict[str, int]


@dataclass(frozen=True)
class RepositoryFingerprint:
    status: bytes
    refs: bytes
    worktree_patch_sha256: str
    index_patch_sha256: str
    remote_names: tuple[str, ...]
    untracked_manifest: tuple[tuple[str, str, str, str], ...]


class CheckpointTree:
    """A checkpoint directory held open and accessed only through directory fds.

    Keeping both the output parent and checkpoint root open prevents a concurrent
    pathname substitution from redirecting later writes into the workspace or an
    unrelated directory. The public target name is checked again before success.
    """

    def __init__(
        self,
        output_parent: Path,
        output_parent_fd: int,
        target_name: str,
        root_fd: int,
    ) -> None:
        self.output_parent = output_parent
        self.output_parent_fd = output_parent_fd
        self.target_name = target_name
        self.root_fd = root_fd
        self.output_parent_identity = self._identity(os.fstat(output_parent_fd))
        self.root_identity = self._identity(os.fstat(root_fd))

    @staticmethod
    def _identity(metadata: os.stat_result) -> tuple[int, int]:
        return metadata.st_dev, metadata.st_ino

    @staticmethod
    def _directory_flags() -> int:
        flags = os.O_RDONLY
        if hasattr(os, "O_DIRECTORY"):
            flags |= os.O_DIRECTORY
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        return flags

    @staticmethod
    def _file_flags() -> int:
        flags = os.O_RDONLY
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        return flags

    @staticmethod
    def _parts(relative: str) -> tuple[str, ...]:
        path = PurePosixPath(relative)
        parts = path.parts
        if (
            not relative
            or path.is_absolute()
            or not parts
            or any(part in {"", ".", ".."} for part in parts)
            or any("/" in part or "\x00" in part for part in parts)
            or any(any(ord(character) < 32 or ord(character) == 127 for character in part) for part in parts)
        ):
            fail("checkpoint member path is unsafe", 74)
        return parts

    @classmethod
    def _open_output_parent(cls, output_parent: Path) -> int:
        try:
            descriptor = os.open(output_parent, cls._directory_flags())
        except OSError:
            fail("output parent could not be opened safely", 73)
        metadata = os.fstat(descriptor)
        path_metadata = output_parent.lstat()
        if (
            cls._identity(metadata) != cls._identity(path_metadata)
            or not stat.S_ISDIR(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or stat.S_IMODE(metadata.st_mode) & 0o022
        ):
            os.close(descriptor)
            fail("output parent changed or is unsafe", 73)
        return descriptor

    @classmethod
    def open_existing(
        cls, output_parent: Path, target_name: str
    ) -> CheckpointTree | None:
        output_parent_fd = cls._open_output_parent(output_parent)
        try:
            try:
                before = os.stat(
                    target_name,
                    dir_fd=output_parent_fd,
                    follow_symlinks=False,
                )
            except FileNotFoundError:
                os.close(output_parent_fd)
                return None
            if (
                not stat.S_ISDIR(before.st_mode)
                or stat.S_ISLNK(before.st_mode)
                or before.st_uid != os.geteuid()
            ):
                fail("checkpoint target already exists with an unsafe type or owner", 73)
            root_fd = os.open(
                target_name,
                cls._directory_flags(),
                dir_fd=output_parent_fd,
            )
            after = os.fstat(root_fd)
            if cls._identity(before) != cls._identity(after):
                os.close(root_fd)
                fail("checkpoint target changed while it was opened", 73)
            return cls(output_parent, output_parent_fd, target_name, root_fd)
        except BaseException:
            os.close(output_parent_fd)
            raise

    @classmethod
    def create_new(cls, output_parent: Path, target_name: str) -> CheckpointTree:
        output_parent_fd = cls._open_output_parent(output_parent)
        try:
            try:
                os.mkdir(target_name, 0o700, dir_fd=output_parent_fd)
            except FileExistsError:
                fail("checkpoint target appeared during capture", 73)
            before = os.stat(
                target_name,
                dir_fd=output_parent_fd,
                follow_symlinks=False,
            )
            root_fd = os.open(
                target_name,
                cls._directory_flags(),
                dir_fd=output_parent_fd,
            )
            after = os.fstat(root_fd)
            if (
                cls._identity(before) != cls._identity(after)
                or not stat.S_ISDIR(after.st_mode)
                or after.st_uid != os.geteuid()
                or stat.S_IMODE(after.st_mode) != 0o700
            ):
                os.close(root_fd)
                fail("new checkpoint target changed or is unsafe", 73)
            return cls(output_parent, output_parent_fd, target_name, root_fd)
        except BaseException:
            os.close(output_parent_fd)
            raise

    def close(self) -> None:
        os.close(self.root_fd)
        os.close(self.output_parent_fd)

    def verify_public_binding(self) -> None:
        try:
            parent_now = require_real_directory(self.output_parent, "output parent")
            parent_metadata = parent_now.lstat()
            target_metadata = os.stat(
                self.target_name,
                dir_fd=self.output_parent_fd,
                follow_symlinks=False,
            )
        except (OSError, CheckpointError):
            fail("checkpoint output pathname changed during capture", 75)
        if (
            self._identity(parent_metadata) != self.output_parent_identity
            or self._identity(target_metadata) != self.root_identity
            or not stat.S_ISDIR(target_metadata.st_mode)
        ):
            fail("checkpoint output pathname changed during capture", 75)

    def open_directory(self, relative: str | None = None) -> int:
        descriptor = os.dup(self.root_fd)
        if relative is None:
            return descriptor
        try:
            for part in self._parts(relative):
                next_descriptor = os.open(
                    part,
                    self._directory_flags(),
                    dir_fd=descriptor,
                )
                os.close(descriptor)
                descriptor = next_descriptor
                metadata = os.fstat(descriptor)
                if (
                    not stat.S_ISDIR(metadata.st_mode)
                    or metadata.st_uid != os.geteuid()
                    or stat.S_IMODE(metadata.st_mode) != 0o700
                ):
                    fail("checkpoint directory permissions are unsafe", 74)
            return descriptor
        except BaseException:
            os.close(descriptor)
            raise

    def _open_parent(self, relative: str) -> tuple[int, str]:
        parts = self._parts(relative)
        parent = self.open_directory(
            "/".join(parts[:-1]) if len(parts) > 1 else None
        )
        return parent, parts[-1]

    def mkdir(self, relative: str) -> None:
        parent, name = self._open_parent(relative)
        try:
            os.mkdir(name, 0o700, dir_fd=parent)
            descriptor = os.open(
                name, self._directory_flags(), dir_fd=parent
            )
            try:
                metadata = os.fstat(descriptor)
                if (
                    not stat.S_ISDIR(metadata.st_mode)
                    or metadata.st_uid != os.geteuid()
                    or stat.S_IMODE(metadata.st_mode) != 0o700
                ):
                    fail("new checkpoint directory is unsafe", 74)
            finally:
                os.close(descriptor)
        finally:
            os.close(parent)

    def create_file(self, relative: str) -> int:
        parent, name = self._open_parent(relative)
        try:
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
            if hasattr(os, "O_NOFOLLOW"):
                flags |= os.O_NOFOLLOW
            descriptor = os.open(name, flags, 0o600, dir_fd=parent)
        finally:
            os.close(parent)
        metadata = os.fstat(descriptor)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or stat.S_IMODE(metadata.st_mode) != 0o600
        ):
            os.close(descriptor)
            fail("new checkpoint file is unsafe", 74)
        return descriptor

    def open_file(self, relative: str) -> int:
        parent, name = self._open_parent(relative)
        try:
            descriptor = os.open(name, self._file_flags(), dir_fd=parent)
        finally:
            os.close(parent)
        metadata = os.fstat(descriptor)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or stat.S_IMODE(metadata.st_mode) != 0o600
        ):
            os.close(descriptor)
            fail("checkpoint file permissions are unsafe", 74)
        return descriptor

    def write_bytes(self, relative: str, payload: bytes) -> None:
        descriptor = self.create_file(relative)
        with os.fdopen(descriptor, "wb") as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())

    def write_json(self, relative: str, payload: object) -> None:
        encoded = (
            json.dumps(
                payload,
                ensure_ascii=True,
                sort_keys=True,
                separators=(",", ":"),
            )
            + "\n"
        ).encode("utf-8")
        self.write_bytes(relative, encoded)

    def read_bytes(self, relative: str) -> bytes:
        descriptor = self.open_file(relative)
        with os.fdopen(descriptor, "rb") as source:
            return source.read()

    def read_text(self, relative: str) -> str:
        try:
            return self.read_bytes(relative).decode("utf-8")
        except UnicodeError:
            fail("checkpoint text file is invalid", 74)

    def hash_file(self, relative: str) -> str:
        descriptor = self.open_file(relative)
        digest = hashlib.sha256()
        with os.fdopen(descriptor, "rb") as source:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
        return digest.hexdigest()

    def member_metadata(self, relative: str) -> os.stat_result:
        parent, name = self._open_parent(relative)
        try:
            return os.stat(name, dir_fd=parent, follow_symlinks=False)
        finally:
            os.close(parent)

    def exists(self, relative: str) -> bool:
        try:
            self.member_metadata(relative)
        except FileNotFoundError:
            return False
        return True

    @staticmethod
    def _validate_member_name(name: str) -> None:
        if (
            name in {"", ".", ".."}
            or "/" in name
            or "\x00" in name
            or any(ord(character) < 32 or ord(character) == 127 for character in name)
        ):
            fail("checkpoint contains an unsafe member name", 74)

    def list_directory(self, relative: str) -> list[str]:
        descriptor = self.open_directory(relative)
        try:
            names = sorted(os.listdir(descriptor))
        finally:
            os.close(descriptor)
        for name in names:
            self._validate_member_name(name)
        return names

    def snapshot_members(self) -> tuple[list[str], list[str]]:
        directories: list[str] = []
        files: list[str] = []

        def visit(relative: str | None) -> None:
            descriptor = self.open_directory(relative)
            try:
                names = sorted(os.listdir(descriptor))
                for name in names:
                    self._validate_member_name(name)
                    child = name if relative is None else f"{relative}/{name}"
                    metadata = os.stat(
                        name, dir_fd=descriptor, follow_symlinks=False
                    )
                    if stat.S_ISDIR(metadata.st_mode):
                        child_descriptor = os.open(
                            name,
                            self._directory_flags(),
                            dir_fd=descriptor,
                        )
                        try:
                            opened = os.fstat(child_descriptor)
                            if self._identity(metadata) != self._identity(opened):
                                fail("checkpoint member changed during validation", 74)
                        finally:
                            os.close(child_descriptor)
                        directories.append(child)
                        visit(child)
                    elif stat.S_ISREG(metadata.st_mode):
                        child_descriptor = self.open_file(child)
                        try:
                            opened = os.fstat(child_descriptor)
                            if self._identity(metadata) != self._identity(opened):
                                fail("checkpoint member changed during validation", 74)
                        finally:
                            os.close(child_descriptor)
                        files.append(child)
                    else:
                        fail("checkpoint contains an unsupported member type", 74)
            finally:
                os.close(descriptor)

        visit(None)
        return directories, files

    def validate_modes(self) -> None:
        root_metadata = os.fstat(self.root_fd)
        if (
            not stat.S_ISDIR(root_metadata.st_mode)
            or root_metadata.st_uid != os.geteuid()
            or stat.S_IMODE(root_metadata.st_mode) != 0o700
        ):
            fail("checkpoint root permissions are unsafe", 74)
        directories, files = self.snapshot_members()
        for relative in directories:
            descriptor = self.open_directory(relative)
            os.close(descriptor)
        for relative in files:
            descriptor = self.open_file(relative)
            os.close(descriptor)

    def write_sha256sums(self) -> None:
        _, files = self.snapshot_members()
        rows = [
            f"{self.hash_file(relative)}  {relative}\n"
            for relative in files
            if relative != "SHA256SUMS"
        ]
        self.write_bytes("SHA256SUMS", "".join(rows).encode("utf-8"))

    def verify_sha256sums(self) -> None:
        try:
            rows = self.read_text("SHA256SUMS").splitlines()
        except (OSError, CheckpointError):
            fail("SHA256SUMS cannot be read safely", 74)
        _, files = self.snapshot_members()
        expected_files = {item for item in files if item != "SHA256SUMS"}
        verified_files: set[str] = set()
        for row in rows:
            if not re.fullmatch(r"[0-9a-f]{64}  [^\r\n]+", row):
                fail("SHA256SUMS has an invalid record", 74)
            expected_hash, relative = row.split("  ", 1)
            self._parts(relative)
            if relative in verified_files or relative not in expected_files:
                fail("SHA256SUMS membership is invalid", 74)
            if self.hash_file(relative) != expected_hash:
                fail("SHA256SUMS verification failed", 74)
            verified_files.add(relative)
        if verified_files != expected_files:
            fail("SHA256SUMS does not cover the complete checkpoint", 74)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create or preflight a private GSYEN migration checkpoint."
    )
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument("--output-parent", required=True, type=Path)
    parser.add_argument("--checkpoint-id", required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    return parser.parse_args()


def fail(message: str, exit_code: int = 1) -> None:
    raise CheckpointError(message, exit_code)


def require_absolute_without_parent_reference(path: Path, label: str) -> Path:
    if not path.is_absolute() or ".." in path.parts:
        fail(f"{label} must be an absolute path without parent traversal", 64)
    return Path(os.path.normpath(os.fspath(path)))


def require_real_directory(path: Path, label: str) -> Path:
    path = require_absolute_without_parent_reference(path, label)
    current = Path(path.anchor)
    try:
        for component in path.parts[1:]:
            current = current / component
            metadata = current.lstat()
            if stat.S_ISLNK(metadata.st_mode):
                fail(f"{label} contains a symbolic-link component", 66)
        if not path.is_dir():
            fail(f"{label} must be a real directory", 66)
    except FileNotFoundError:
        fail(f"{label} does not exist", 66)
    return path.resolve(strict=True)


def git_environment() -> dict[str, str]:
    environment = os.environ.copy()
    for name in tuple(environment):
        if name.startswith("GIT_"):
            environment.pop(name, None)
    environment.update(
        {
            "GIT_ATTR_NOSYSTEM": "1",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_OPTIONAL_LOCKS": "0",
            "GIT_NO_LAZY_FETCH": "1",
            "GIT_TERMINAL_PROMPT": "0",
            "LC_ALL": "C",
        }
    )
    return environment


def verify_repository_binding(repository: Repository) -> None:
    try:
        current_root = require_real_directory(
            repository.root, f"repository scope {repository.label}"
        )
        root_metadata = current_root.lstat()
        git_entry = os.stat(
            ".git",
            dir_fd=repository.directory_fd,
            follow_symlinks=False,
        )
        opened_git = os.fstat(repository.git_directory_fd)
    except (OSError, CheckpointError):
        fail(f"repository path changed for scope {repository.label}", 75)
    if (
        (root_metadata.st_dev, root_metadata.st_ino) != repository.root_identity
        or (git_entry.st_dev, git_entry.st_ino)
        != repository.git_directory_identity
        or (opened_git.st_dev, opened_git.st_ino)
        != repository.git_directory_identity
        or not stat.S_ISDIR(git_entry.st_mode)
    ):
        fail(f"repository path changed for scope {repository.label}", 75)


def git_command(
    repository: Path | Repository, *arguments: str
) -> list[str]:
    command = [
        "git",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "gc.auto=0",
        "-c",
        "maintenance.auto=false",
    ]
    if isinstance(repository, Repository):
        command.extend(["-C", ".", "--git-dir=.git", "--work-tree=."])
    else:
        command.extend(["-C", os.fspath(repository)])
    command.extend(arguments)
    return command


@contextmanager
def git_working_directory(repository: Path | Repository):
    if not isinstance(repository, Repository):
        yield
        return
    original_fd = os.open(".", CheckpointTree._directory_flags())
    try:
        os.fchdir(repository.directory_fd)
        yield
    finally:
        os.fchdir(original_fd)
        os.close(original_fd)


def run_git(
    repository: Path | Repository,
    label: str,
    *arguments: str,
    accepted_return_codes: tuple[int, ...] = (0,),
) -> bytes:
    if isinstance(repository, Repository):
        verify_repository_binding(repository)
    with git_working_directory(repository):
        result = subprocess.run(
            git_command(repository, *arguments),
            env=git_environment(),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    if result.returncode not in accepted_return_codes:
        fail(f"Git read failed for repository scope {label}", 74)
    return result.stdout


def run_git_to_new_file(
    repository: Path | Repository,
    label: str,
    checkpoint: CheckpointTree,
    destination: str,
    *arguments: str,
    combine_stderr: bool = False,
    stdin_descriptor: int | None = None,
) -> None:
    if isinstance(repository, Repository):
        verify_repository_binding(repository)
    descriptor = checkpoint.create_file(destination)
    with os.fdopen(descriptor, "wb") as output:
        with git_working_directory(repository):
            result = subprocess.run(
                git_command(repository, *arguments),
                env=git_environment(),
                stdin=(stdin_descriptor if stdin_descriptor is not None else subprocess.DEVNULL),
                stdout=output,
                stderr=(subprocess.STDOUT if combine_stderr else subprocess.PIPE),
                check=False,
            )
        output.flush()
        os.fsync(output.fileno())
    if result.returncode != 0:
        fail(f"Git capture failed for repository scope {label}", 74)


def git_output_sha256(
    repository: Path | Repository, label: str, *arguments: str
) -> str:
    if isinstance(repository, Repository):
        verify_repository_binding(repository)
    with git_working_directory(repository):
        process = subprocess.Popen(
            git_command(repository, *arguments),
            env=git_environment(),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    assert process.stdout is not None
    digest = hashlib.sha256()
    while chunk := process.stdout.read(1024 * 1024):
        digest.update(chunk)
    process.stdout.close()
    if process.wait() != 0:
        fail(f"Git verification failed for repository scope {label}", 74)
    return digest.hexdigest()


def create_git_bundle(
    repository: Path | Repository,
    label: str,
    checkpoint: CheckpointTree,
    destination: str,
) -> None:
    run_git_to_new_file(
        repository,
        label,
        checkpoint,
        destination,
        "bundle",
        "create",
        "-",
        "--all",
        "HEAD",
    )


def verify_git_bundle(
    repository: Path | Repository,
    label: str,
    checkpoint: CheckpointTree,
    bundle_relative: str,
    report_destination: str | None = None,
) -> None:
    if isinstance(repository, Repository):
        verify_repository_binding(repository)
    bundle_descriptor = checkpoint.open_file(bundle_relative)
    try:
        if report_destination is not None:
            run_git_to_new_file(
                repository,
                label,
                checkpoint,
                report_destination,
                "bundle",
                "verify",
                "-",
                combine_stderr=True,
                stdin_descriptor=bundle_descriptor,
            )
            return
        with git_working_directory(repository):
            result = subprocess.run(
                git_command(repository, "bundle", "verify", "-"),
                env=git_environment(),
                stdin=bundle_descriptor,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
        if result.returncode != 0:
            fail(f"Git bundle verification failed for repository scope {label}", 74)
    finally:
        os.close(bundle_descriptor)


def safe_decode(raw: bytes) -> str:
    return os.fsdecode(raw.rstrip(b"\n"))


def open_bound_repository(
    root: Path, label: str
) -> tuple[int, int, tuple[int, int], tuple[int, int]]:
    try:
        root_before = root.lstat()
        directory_fd = os.open(root, CheckpointTree._directory_flags())
        root_after = os.fstat(directory_fd)
    except OSError:
        fail(f"repository scope {label} could not be opened safely", 66)
    root_identity = root_after.st_dev, root_after.st_ino
    if (
        (root_before.st_dev, root_before.st_ino) != root_identity
        or not stat.S_ISDIR(root_after.st_mode)
        or root_after.st_uid != os.geteuid()
    ):
        os.close(directory_fd)
        fail(f"repository scope {label} changed while it was opened", 66)
    try:
        git_before = os.stat(
            ".git", dir_fd=directory_fd, follow_symlinks=False
        )
        if not stat.S_ISDIR(git_before.st_mode):
            fail(f"repository scope {label} has an unsafe .git entry", 66)
        git_directory_fd = os.open(
            ".git",
            CheckpointTree._directory_flags(),
            dir_fd=directory_fd,
        )
        git_after = os.fstat(git_directory_fd)
        git_identity = git_after.st_dev, git_after.st_ino
        if (
            (git_before.st_dev, git_before.st_ino) != git_identity
            or git_after.st_uid != os.geteuid()
        ):
            os.close(git_directory_fd)
            fail(f"repository scope {label} .git changed while it was opened", 66)
    except BaseException:
        os.close(directory_fd)
        raise
    return directory_fd, git_directory_fd, root_identity, git_identity


def close_repositories(repositories: list[Repository]) -> None:
    for repository in repositories:
        os.close(repository.git_directory_fd)
        os.close(repository.directory_fd)


def open_scope_directory(
    workspace_fd: int, relative: Path, label: str
) -> tuple[int, tuple[int, int]]:
    descriptor = os.dup(workspace_fd)
    try:
        for component in relative.parts:
            before = os.stat(
                component,
                dir_fd=descriptor,
                follow_symlinks=False,
            )
            if not stat.S_ISDIR(before.st_mode) or stat.S_ISLNK(before.st_mode):
                fail(f"scope {label} contains an unsafe path component", 66)
            next_descriptor = os.open(
                component,
                CheckpointTree._directory_flags(),
                dir_fd=descriptor,
            )
            after = os.fstat(next_descriptor)
            if (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
                os.close(next_descriptor)
                fail(f"scope {label} changed while it was opened", 66)
            os.close(descriptor)
            descriptor = next_descriptor
    except BaseException:
        os.close(descriptor)
        raise
    metadata = os.fstat(descriptor)
    return descriptor, (metadata.st_dev, metadata.st_ino)


def open_optional_git_directory(
    directory_fd: int, label: str
) -> tuple[int, tuple[int, int]] | None:
    try:
        before = os.stat(".git", dir_fd=directory_fd, follow_symlinks=False)
    except FileNotFoundError:
        return None
    if not stat.S_ISDIR(before.st_mode) or stat.S_ISLNK(before.st_mode):
        fail(f"scope {label} must use an in-place real .git directory", 66)
    descriptor = os.open(
        ".git",
        CheckpointTree._directory_flags(),
        dir_fd=directory_fd,
    )
    after = os.fstat(descriptor)
    identity = after.st_dev, after.st_ino
    if (
        (before.st_dev, before.st_ino) != identity
        or after.st_uid != os.geteuid()
    ):
        os.close(descriptor)
        fail(f"scope {label} .git changed while it was opened", 66)
    return descriptor, identity


def discover_repositories(
    workspace: Path,
) -> tuple[list[Repository], list[ScopeResolution]]:
    (
        root_fd,
        root_git_fd,
        root_identity,
        root_git_identity,
    ) = open_bound_repository(workspace, "root")
    independent: list[Repository] = []
    scope_paths: list[tuple[str, Path, Path, str | None]] = []
    try:
        for scope, relative in SCOPES:
            scope_path = workspace if relative == Path(".") else workspace / relative
            if relative == Path("."):
                scope_paths.append((scope, relative, workspace, "root"))
                continue
            scope_fd, scope_identity = open_scope_directory(
                root_fd, relative, scope
            )
            try:
                public_scope = require_real_directory(scope_path, f"scope {scope}")
                public_metadata = public_scope.lstat()
                if (public_metadata.st_dev, public_metadata.st_ino) != scope_identity:
                    fail(f"scope {scope} public path changed", 66)
                git_result = open_optional_git_directory(scope_fd, scope)
                if git_result is None:
                    scope_paths.append((scope, relative, scope_path, None))
                    continue
                git_fd, git_identity = git_result
                independent.append(
                    Repository(
                        scope,
                        scope_path,
                        (),
                        scope_fd,
                        git_fd,
                        scope_identity,
                        git_identity,
                    )
                )
                scope_fd = -1
                scope_paths.append((scope, relative, scope_path, scope))
            finally:
                if scope_fd >= 0:
                    os.close(scope_fd)

        independent_paths = {repository.root for repository in independent}
        for scope, _, scope_path, repository_label in scope_paths:
            if repository_label is not None:
                continue
            if any(
                scope_path != independent_path
                and scope_path.is_relative_to(independent_path)
                for independent_path in independent_paths
            ):
                fail(f"scope {scope} is inside another nested repository", 66)

        independent.sort(
            key=lambda repository: os.fsencode(
                repository.root.relative_to(workspace).as_posix()
            )
        )
        independent = [
            Repository(
                repository.label,
                repository.root,
                tuple(
                    other.root
                    for other in independent
                    if other is not repository
                    and other.root.is_relative_to(repository.root)
                ),
                repository.directory_fd,
                repository.git_directory_fd,
                repository.root_identity,
                repository.git_directory_identity,
            )
            for repository in independent
        ]
        nested_roots = tuple(repository.root for repository in independent)
        root_repository = Repository(
            "root",
            workspace,
            nested_roots,
            root_fd,
            root_git_fd,
            root_identity,
            root_git_identity,
        )
        root_fd = -1
        root_git_fd = -1
        repositories = [root_repository, *independent]
        independent = []
        labels_by_path = {
            repository.root: repository.label for repository in repositories
        }
        scope_resolutions = [
            ScopeResolution(
                scope=scope,
                relative_path=relative.as_posix(),
                repository_label=(repository_label or "root"),
                classification=(
                    "independent-repository"
                    if repository_label not in {None, "root"}
                    else "root-repository-content"
                ),
            )
            for scope, relative, scope_path, repository_label in scope_paths
            if (repository_label or "root")
            == labels_by_path.get(scope_path, "root")
        ]
        if len(scope_resolutions) != len(SCOPES):
            fail("scope-to-repository mapping is inconsistent", 66)
        for repository in repositories:
            top_level = safe_decode(
                run_git(repository, repository.label, "rev-parse", "--show-toplevel")
            )
            if require_real_directory(
                Path(top_level), f"repository for scope {repository.label}"
            ) != repository.root:
                fail(
                    f"scope {repository.label} resolves to an unexpected repository",
                    66,
                )
        return repositories, scope_resolutions
    except BaseException:
        close_repositories(independent)
        if root_git_fd >= 0:
            os.close(root_git_fd)
        if root_fd >= 0:
            os.close(root_fd)
        raise


def validate_relative_git_path(raw_path: bytes) -> tuple[bytes, ...]:
    normalized = raw_path.rstrip(b"/")
    if not normalized or normalized.startswith(b"/"):
        fail("Git returned an unsafe repository path", 66)
    if any(byte < 32 or byte == 127 for byte in normalized):
        fail("Git returned a repository path with a control character", 66)
    components = tuple(normalized.split(b"/"))
    if any(component in {b"", b".", b".."} for component in components):
        fail("Git returned an unsafe repository path", 66)
    return components


def nested_repository_prefixes(repository: Repository) -> tuple[bytes, ...]:
    return tuple(
        os.fsencode(path.relative_to(repository.root).as_posix())
        for path in repository.excluded_repository_roots
    )


def classify_untracked_path(
    raw_path: bytes, nested_prefixes: tuple[bytes, ...]
) -> str | None:
    normalized = raw_path.rstrip(b"/")
    for prefix in nested_prefixes:
        if normalized == prefix or normalized.startswith(prefix + b"/"):
            return "nested_repository"

    components = validate_relative_git_path(raw_path)
    lowered_components = tuple(os.fsdecode(item).lower() for item in components)
    if any(component in BUILD_DIRECTORY_NAMES for component in lowered_components):
        return "build_or_dependency"

    name = lowered_components[-1]
    safe_env_template = name.endswith(SAFE_ENV_TEMPLATE_SUFFIXES)
    if not safe_env_template and (
        name == ".env"
        or name.startswith(".env.")
        or ".env." in name
        or name.endswith(".env")
        or name.endswith(".env.local")
        or name.startswith(".dev.vars.")
        or name in {".dev.vars", ".envrc", ".flaskenv", ".secrets"}
    ):
        return "environment_or_secret"

    if (
        name in PRIVATE_EXACT_NAMES
        or any(
            name.endswith(suffix)
            or any(
                name.endswith(suffix + template_suffix)
                for template_suffix in SAFE_ENV_TEMPLATE_SUFFIXES
            )
            for suffix in PRIVATE_CONTAINER_SUFFIXES
        )
        or "private_key" in name
        or "private-key" in name
        or ("service-account" in name and name.endswith(".json"))
        or ("service_account" in name and name.endswith(".json"))
        or ("client_secret" in name and name.endswith(".json"))
        or ("credentials" in name and name.endswith(".json"))
        or name == "credentials"
        or name.startswith("credentials.")
        or name.endswith((".secret", ".secrets"))
        or any(
            component
            in {"certs", "certificates", "secrets", *PRIVATE_DIRECTORY_NAMES}
            for component in lowered_components
        )
    ):
        return "key_or_certificate"

    if (
        any(
            name.endswith(suffix)
            or any(
                name.endswith(suffix + template_suffix)
                for template_suffix in SAFE_ENV_TEMPLATE_SUFFIXES
            )
            for suffix in DATABASE_SUFFIXES
        )
        or name.endswith(
            (
                "-wal",
                "-shm",
                ".dump.gz",
                ".dump.zst",
                ".sql.gz",
                ".sql.zst",
            )
        )
    ):
        return "database_or_dump"
    return None


def lstat_untracked(
    repository: Repository, components: tuple[bytes, ...]
) -> os.stat_result:
    directory_descriptor = os.dup(repository.directory_fd)
    metadata: os.stat_result | None = None
    try:
        for index, component in enumerate(components):
            try:
                metadata = os.stat(
                    component,
                    dir_fd=directory_descriptor,
                    follow_symlinks=False,
                )
            except FileNotFoundError:
                fail("an untracked file changed during preflight", 75)
            if stat.S_ISLNK(metadata.st_mode):
                fail("an untracked symbolic link was detected", 66)
            if index < len(components) - 1:
                if not stat.S_ISDIR(metadata.st_mode):
                    fail("an untracked path traverses a non-directory", 66)
                next_descriptor = os.open(
                    component,
                    CheckpointTree._directory_flags(),
                    dir_fd=directory_descriptor,
                )
                opened = os.fstat(next_descriptor)
                if (metadata.st_dev, metadata.st_ino) != (
                    opened.st_dev,
                    opened.st_ino,
                ):
                    os.close(next_descriptor)
                    fail("an untracked directory changed during preflight", 75)
                os.close(directory_descriptor)
                directory_descriptor = next_descriptor
    finally:
        os.close(directory_descriptor)
    assert metadata is not None
    return metadata


def open_untracked_regular(
    repository: Repository, components: tuple[bytes, ...]
) -> tuple[int, os.stat_result]:
    directory_flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        directory_flags |= os.O_DIRECTORY
    if hasattr(os, "O_NOFOLLOW"):
        directory_flags |= os.O_NOFOLLOW
    try:
        directory_descriptor = os.dup(repository.directory_fd)
        try:
            for component in components[:-1]:
                next_descriptor = os.open(
                    component,
                    directory_flags,
                    dir_fd=directory_descriptor,
                )
                os.close(directory_descriptor)
                directory_descriptor = next_descriptor
            file_flags = os.O_RDONLY
            if hasattr(os, "O_NOFOLLOW"):
                file_flags |= os.O_NOFOLLOW
            file_descriptor = os.open(
                components[-1], file_flags, dir_fd=directory_descriptor
            )
        finally:
            os.close(directory_descriptor)
    except OSError:
        fail("an untracked path became unsafe during capture", 66)
    metadata = os.fstat(file_descriptor)
    if not stat.S_ISREG(metadata.st_mode):
        os.close(file_descriptor)
        fail("an untracked path is not a regular file", 66)
    return file_descriptor, metadata


def plan_untracked(repository: Repository) -> UntrackedPlan:
    raw = run_git(
        repository,
        repository.label,
        "ls-files",
        "-z",
        "--others",
        "--exclude-standard",
        "--",
    )
    candidates = sorted({item for item in raw.split(b"\0") if item})
    eligible: list[bytes] = []
    excluded_counts = {
        "nested_repository": 0,
        "build_or_dependency": 0,
        "environment_or_secret": 0,
        "key_or_certificate": 0,
        "database_or_dump": 0,
    }
    prefixes = nested_repository_prefixes(repository)
    for raw_path in candidates:
        components = validate_relative_git_path(raw_path)
        exclusion = classify_untracked_path(raw_path, prefixes)
        if exclusion is not None:
            excluded_counts[exclusion] += 1
            continue
        metadata = lstat_untracked(repository, components)
        if not stat.S_ISREG(metadata.st_mode):
            fail("an unsupported untracked file type was detected", 66)
        if stat.S_IMODE(metadata.st_mode) & 0o7000:
            fail("an untracked file has privileged mode bits", 66)
        eligible.append(raw_path.rstrip(b"/"))
    return UntrackedPlan(tuple(eligible), excluded_counts)


def reject_sensitive_tracked_changes(repository: Repository) -> None:
    raw = run_git(
        repository,
        repository.label,
        "diff",
        "--name-only",
        "-z",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "HEAD",
        "--",
    )
    prefixes = nested_repository_prefixes(repository)
    sensitive_reasons = {
        "environment_or_secret",
        "key_or_certificate",
        "database_or_dump",
    }
    for raw_path in (item for item in raw.split(b"\0") if item):
        validate_relative_git_path(raw_path)
        if classify_untracked_path(raw_path, prefixes) in sensitive_reasons:
            fail(
                f"repository scope {repository.label} has a tracked sensitive-path change",
                77,
            )


def reject_unmerged_index(repository: Repository) -> None:
    unmerged = run_git(
        repository,
        repository.label,
        "ls-files",
        "-z",
        "--unmerged",
    )
    if unmerged:
        fail(
            f"repository scope {repository.label} has unresolved index entries",
            76,
        )


def reject_hidden_index_entries(repository: Repository) -> None:
    tagged = run_git(
        repository,
        repository.label,
        "ls-files",
        "-v",
        "-z",
    )
    for entry in (item for item in tagged.split(b"\0") if item):
        if len(entry) < 3 or entry[1:2] != b" " or entry[:1] != b"H":
            fail(
                f"repository scope {repository.label} has hidden index state",
                76,
            )


def reject_intent_to_add(repository: Repository) -> None:
    status = run_git(
        repository,
        repository.label,
        "status",
        "--porcelain=v2",
        "-z",
        "--untracked-files=all",
        "--ignore-submodules=none",
        "--no-renames",
    )
    for record in (item for item in status.split(b"\0") if item):
        if not record.startswith((b"1 ", b"2 ")):
            continue
        fields = record.split(b" ", 3)
        if len(fields) < 2 or len(fields[1]) != 2:
            fail(
                f"repository scope {repository.label} has invalid status data",
                76,
            )
        if fields[1][1:2] == b"A":
            fail(
                f"repository scope {repository.label} has intent-to-add state",
                76,
            )


def reject_external_or_partial_object_store(repository: Repository) -> None:
    directory_descriptor = os.dup(repository.git_directory_fd)
    try:
        for component in (b"objects", b"info"):
            next_descriptor = os.open(
                component,
                CheckpointTree._directory_flags(),
                dir_fd=directory_descriptor,
            )
            os.close(directory_descriptor)
            directory_descriptor = next_descriptor
        try:
            alternates_metadata = os.stat(
                b"alternates",
                dir_fd=directory_descriptor,
                follow_symlinks=False,
            )
        except FileNotFoundError:
            alternates_metadata = None
    except OSError:
        fail(
            f"repository scope {repository.label} object store is unsafe",
            78,
        )
    finally:
        os.close(directory_descriptor)
    if alternates_metadata is not None:
        if (
            stat.S_ISLNK(alternates_metadata.st_mode)
            or not stat.S_ISREG(alternates_metadata.st_mode)
            or alternates_metadata.st_size > 0
        ):
            fail(
                f"repository scope {repository.label} uses an external object store",
                78,
            )
    partial_clone = run_git(
        repository,
        repository.label,
        "config",
        "--local",
        "--get-regexp",
        r"^(extensions\.partialclone|remote\..*\.promisor)$",
        accepted_return_codes=(0, 1),
    )
    if partial_clone:
        fail(
            f"repository scope {repository.label} is a partial/promisor clone",
            78,
        )


def reject_unmanaged_gitlinks(repository: Repository) -> None:
    index_entries = run_git(
        repository,
        repository.label,
        "ls-files",
        "--stage",
        "-z",
    )
    if any(entry.startswith(b"160000 ") for entry in index_entries.split(b"\0") if entry):
        fail(
            f"repository scope {repository.label} contains an unmanaged Git submodule",
            78,
        )


class HashingReader:
    def __init__(self, source: BinaryIO) -> None:
        self.source = source
        self.digest = hashlib.sha256()
        self.bytes_read = 0

    def read(self, size: int = -1) -> bytes:
        data = self.source.read(size)
        self.digest.update(data)
        self.bytes_read += len(data)
        return data


def archive_untracked(
    repository: Repository,
    plan: UntrackedPlan,
    checkpoint: CheckpointTree,
    destination: str,
) -> list[dict[str, str]]:
    archive_relative = f"{destination}/untracked.tar"
    manifest: list[dict[str, str]] = []
    archive_descriptor = checkpoint.create_file(archive_relative)
    with os.fdopen(archive_descriptor, "w+b") as archive_output:
        with tarfile.open(
            fileobj=archive_output,
            mode="w",
            format=tarfile.PAX_FORMAT,
            encoding="utf-8",
            errors="surrogateescape",
        ) as archive:
            for raw_path in plan.eligible:
                components = validate_relative_git_path(raw_path)
                before = lstat_untracked(repository, components)
                descriptor, opened = open_untracked_regular(
                    repository, components
                )
                with os.fdopen(descriptor, "rb") as source:
                    if (
                        not stat.S_ISREG(opened.st_mode)
                        or opened.st_dev != before.st_dev
                        or opened.st_ino != before.st_ino
                    ):
                        fail("an untracked file changed type during capture", 75)
                    relative_text = os.fsdecode(raw_path)
                    member = tarfile.TarInfo(relative_text)
                    member.type = tarfile.REGTYPE
                    member.mode = stat.S_IMODE(opened.st_mode)
                    member.size = opened.st_size
                    member.mtime = int(opened.st_mtime)
                    member.uid = 0
                    member.gid = 0
                    member.uname = ""
                    member.gname = ""
                    reader = HashingReader(source)
                    archive.addfile(member, reader)
                    after = os.fstat(source.fileno())
                    if (
                        reader.bytes_read != opened.st_size
                        or after.st_size != opened.st_size
                        or after.st_mtime_ns != opened.st_mtime_ns
                        or after.st_ctime_ns != opened.st_ctime_ns
                        or after.st_dev != opened.st_dev
                        or after.st_ino != opened.st_ino
                    ):
                        fail("an untracked file changed during capture", 75)
                    manifest.append(
                        {
                            "path": relative_text,
                            "type": "file",
                            "mode": f"{stat.S_IMODE(opened.st_mode):04o}",
                            "sha256": reader.digest.hexdigest(),
                        }
                    )
        archive_output.flush()
        os.fsync(archive_output.fileno())
    return manifest


def hash_untracked_source(
    repository: Repository, raw_path: bytes
) -> tuple[str, str]:
    components = validate_relative_git_path(raw_path)
    before = lstat_untracked(repository, components)
    descriptor, opened = open_untracked_regular(repository, components)
    digest = hashlib.sha256()
    with os.fdopen(descriptor, "rb") as source:
        if (
            not stat.S_ISREG(opened.st_mode)
            or opened.st_dev != before.st_dev
            or opened.st_ino != before.st_ino
        ):
            fail("an untracked file changed type during verification", 75)
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
        after = os.fstat(source.fileno())
        if (
            after.st_size != opened.st_size
            or after.st_mtime_ns != opened.st_mtime_ns
            or after.st_ctime_ns != opened.st_ctime_ns
            or after.st_dev != opened.st_dev
            or after.st_ino != opened.st_ino
        ):
            fail("an untracked file changed during verification", 75)
    return f"{stat.S_IMODE(opened.st_mode):04o}", digest.hexdigest()


def normalize_untracked_manifest(
    manifest: list[dict[str, str]],
) -> tuple[tuple[str, str, str, str], ...]:
    return tuple(
        (row["path"], row["type"], row["mode"], row["sha256"])
        for row in manifest
    )


def verify_untracked_source(
    repository: Repository,
    original_plan: UntrackedPlan,
    expected_manifest: tuple[tuple[str, str, str, str], ...],
) -> None:
    current_plan = plan_untracked(repository)
    if current_plan != original_plan or len(expected_manifest) != len(original_plan.eligible):
        fail(f"untracked set changed for repository scope {repository.label}", 75)
    for raw_path, expected in zip(original_plan.eligible, expected_manifest, strict=True):
        path, path_type, expected_mode, expected_hash = expected
        if path != os.fsdecode(raw_path) or path_type != "file":
            fail(f"untracked manifest mismatch for repository scope {repository.label}", 74)
        actual_mode, actual_hash = hash_untracked_source(repository, raw_path)
        if actual_mode != expected_mode or actual_hash != expected_hash:
            fail(f"untracked content changed for repository scope {repository.label}", 75)


def status_bytes(repository: Repository) -> bytes:
    return run_git(
        repository,
        repository.label,
        "status",
        "--porcelain=v2",
        "-z",
        "--untracked-files=all",
        "--ignore-submodules=none",
        "--no-renames",
    )


def optional_git_text(
    repository: Repository, *arguments: str
) -> str:
    return safe_decode(
        run_git(
            repository,
            repository.label,
            *arguments,
            accepted_return_codes=(0, 1, 128),
        )
    )


def capture_repository(
    repository: Repository,
    plan: UntrackedPlan,
    checkpoint: CheckpointTree,
    repository_destination: str,
) -> RepositoryFingerprint:
    checkpoint.mkdir(repository_destination)
    status_before = status_bytes(repository)
    head = safe_decode(
        run_git(repository, repository.label, "rev-parse", "--verify", "HEAD^{commit}")
    )
    head_tree = safe_decode(
        run_git(repository, repository.label, "rev-parse", "HEAD^{tree}")
    )
    branch = optional_git_text(repository, "symbolic-ref", "--short", "-q", "HEAD")
    upstream = optional_git_text(
        repository,
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{upstream}",
    )
    object_format = safe_decode(
        run_git(repository, repository.label, "rev-parse", "--show-object-format")
    )
    remote_names = sorted(
        item for item in safe_decode(run_git(repository, repository.label, "remote")).splitlines() if item
    )
    refs_before = run_git(
        repository, repository.label, "show-ref", "--head", "-d"
    )

    checkpoint.write_bytes(
        f"{repository_destination}/status.porcelain-v2.z", status_before
    )
    run_git_to_new_file(
        repository,
        repository.label,
        checkpoint,
        f"{repository_destination}/tracked-working-tree.patch",
        "diff",
        "--binary",
        "--full-index",
        "--no-ext-diff",
        "--no-textconv",
        "--",
    )
    run_git_to_new_file(
        repository,
        repository.label,
        checkpoint,
        f"{repository_destination}/index.patch",
        "diff",
        "--cached",
        "--binary",
        "--full-index",
        "--no-ext-diff",
        "--no-textconv",
        "--",
    )
    checkpoint.write_bytes(f"{repository_destination}/refs.txt", refs_before)
    bundle_relative = f"{repository_destination}/repository.bundle"
    create_git_bundle(
        repository,
        repository.label,
        checkpoint,
        bundle_relative,
    )
    verify_git_bundle(
        repository,
        repository.label,
        checkpoint,
        bundle_relative,
        f"{repository_destination}/bundle.verify.txt",
    )

    untracked_manifest = archive_untracked(
        repository, plan, checkpoint, repository_destination
    )
    normalized_untracked_manifest = normalize_untracked_manifest(untracked_manifest)
    manifest_payload = b"".join(
        (
            json.dumps(row, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
            + "\n"
        ).encode("utf-8")
        for row in untracked_manifest
    )
    checkpoint.write_bytes(
        f"{repository_destination}/untracked-manifest.jsonl", manifest_payload
    )
    checkpoint.write_json(
        f"{repository_destination}/untracked-exclusions.json",
        {"counts_by_reason": plan.excluded_counts},
    )

    status_after = status_bytes(repository)
    if status_after != status_before:
        fail(f"repository scope {repository.label} changed during capture", 75)
    worktree_patch_sha256 = checkpoint.hash_file(
        f"{repository_destination}/tracked-working-tree.patch"
    )
    worktree_patch_bytes = checkpoint.member_metadata(
        f"{repository_destination}/tracked-working-tree.patch"
    ).st_size
    index_patch_sha256 = checkpoint.hash_file(
        f"{repository_destination}/index.patch"
    )
    index_patch_bytes = checkpoint.member_metadata(
        f"{repository_destination}/index.patch"
    ).st_size
    fingerprint = RepositoryFingerprint(
        status=status_before,
        refs=refs_before,
        worktree_patch_sha256=worktree_patch_sha256,
        index_patch_sha256=index_patch_sha256,
        remote_names=tuple(remote_names),
        untracked_manifest=normalized_untracked_manifest,
    )
    verify_repository_unchanged(repository, plan, fingerprint)
    metadata = {
        "format": FORMAT_VERSION,
        "repository_label": repository.label,
        "head": head,
        "head_tree": head_tree,
        "branch": branch or "DETACHED",
        "upstream": upstream or "none",
        "object_format": object_format,
        "remote_names": remote_names,
        "status_sha256": hashlib.sha256(status_before).hexdigest(),
        "status_bytes": len(status_before),
        "index_patch_bytes": index_patch_bytes,
        "worktree_patch_bytes": worktree_patch_bytes,
        "eligible_untracked_files": len(plan.eligible),
        "excluded_untracked_files": sum(plan.excluded_counts.values()),
    }
    checkpoint.write_json(f"{repository_destination}/metadata.json", metadata)
    return fingerprint


def verify_repository_unchanged(
    repository: Repository,
    plan: UntrackedPlan,
    fingerprint: RepositoryFingerprint,
) -> None:
    if status_bytes(repository) != fingerprint.status:
        fail(f"repository scope {repository.label} changed during capture", 75)
    current_refs = run_git(
        repository, repository.label, "show-ref", "--head", "-d"
    )
    if current_refs != fingerprint.refs:
        fail(f"repository refs changed for scope {repository.label}", 75)
    current_remote_names = tuple(
        sorted(
            item
            for item in safe_decode(
                run_git(repository, repository.label, "remote")
            ).splitlines()
            if item
        )
    )
    if current_remote_names != fingerprint.remote_names:
        fail(f"repository remotes changed for scope {repository.label}", 75)
    worktree_hash = git_output_sha256(
        repository,
        repository.label,
        "diff",
        "--binary",
        "--full-index",
        "--no-ext-diff",
        "--no-textconv",
        "--",
    )
    if worktree_hash != fingerprint.worktree_patch_sha256:
        fail(f"working-tree patch changed for scope {repository.label}", 75)
    index_hash = git_output_sha256(
        repository,
        repository.label,
        "diff",
        "--cached",
        "--binary",
        "--full-index",
        "--no-ext-diff",
        "--no-textconv",
        "--",
    )
    if index_hash != fingerprint.index_patch_sha256:
        fail(f"index patch changed for scope {repository.label}", 75)
    verify_untracked_source(repository, plan, fingerprint.untracked_manifest)


def checkpoint_target(output_parent: Path, checkpoint_id: str) -> Path:
    if not SAFE_ID.fullmatch(checkpoint_id) or checkpoint_id in {".", ".."}:
        fail("checkpoint ID is invalid", 64)
    return output_parent / f"{CHECKPOINT_NAME_PREFIX}{checkpoint_id}"


def inspect_checkpoint_target(
    target: Path,
    workspace: Path,
    checkpoint_id: str,
    checkpoint: CheckpointTree | None,
) -> bool:
    if target == workspace or target.is_relative_to(workspace):
        fail("checkpoint target must be outside the workspace", 64)
    if checkpoint is None:
        return False
    checkpoint.verify_public_binding()
    required = {
        "CHECKPOINT_COMPLETE",
        "SHA256SUMS",
        "checkpoint.json",
        "scope-map.jsonl",
        "repos",
    }
    if not all(checkpoint.exists(name) for name in required):
        fail("checkpoint target already exists but is incomplete", 73)
    checkpoint.validate_modes()
    checkpoint.verify_sha256sums()
    try:
        checkpoint_metadata = json.loads(
            checkpoint.read_text("checkpoint.json")
        )
    except json.JSONDecodeError:
        fail("existing checkpoint metadata is invalid", 73)
    if (
        not isinstance(checkpoint_metadata, dict)
        or checkpoint_metadata.get("format") != FORMAT_VERSION
        or checkpoint_metadata.get("checkpoint_id") != checkpoint_id
        or checkpoint_metadata.get("completion_files_required")
        != ["CHECKPOINT_COMPLETE", "SHA256SUMS"]
    ):
        fail("existing checkpoint metadata does not match the request", 73)
    checkpoint.verify_public_binding()
    return True


def load_json_lines(
    checkpoint: CheckpointTree, relative: str
) -> list[dict[str, object]]:
    try:
        rows = checkpoint.read_text(relative).splitlines()
        decoded = [json.loads(row) for row in rows]
    except json.JSONDecodeError:
        fail("existing checkpoint JSON records are invalid", 73)
    if not all(isinstance(row, dict) for row in decoded):
        fail("existing checkpoint JSON records are invalid", 73)
    return decoded


def verify_existing_checkpoint(
    checkpoint: CheckpointTree,
    repositories: list[Repository],
    scopes: list[ScopeResolution],
    plans: dict[str, UntrackedPlan],
) -> None:
    expected_scope_rows = [
        {
            "scope": row.scope,
            "relative_path": row.relative_path,
            "repository_label": row.repository_label,
            "classification": row.classification,
        }
        for row in scopes
    ]
    if load_json_lines(checkpoint, "scope-map.jsonl") != expected_scope_rows:
        fail("existing checkpoint scope map does not match the workspace", 73)
    actual_repository_labels = set(checkpoint.list_directory("repos"))
    expected_repository_labels = {repository.label for repository in repositories}
    if actual_repository_labels != expected_repository_labels:
        fail("existing checkpoint repository set does not match the workspace", 73)

    for repository in repositories:
        destination = f"repos/{repository.label}"
        directory_descriptor = checkpoint.open_directory(destination)
        os.close(directory_descriptor)
        try:
            metadata = json.loads(
                checkpoint.read_text(f"{destination}/metadata.json")
            )
            status = checkpoint.read_bytes(
                f"{destination}/status.porcelain-v2.z"
            )
            refs = checkpoint.read_bytes(f"{destination}/refs.txt")
            manifest_rows = load_json_lines(
                checkpoint, f"{destination}/untracked-manifest.jsonl"
            )
            exclusions = json.loads(
                checkpoint.read_text(
                    f"{destination}/untracked-exclusions.json"
                )
            )
        except json.JSONDecodeError:
            fail("existing repository checkpoint metadata is invalid", 73)
        if (
            not isinstance(metadata, dict)
            or metadata.get("repository_label") != repository.label
            or metadata.get("status_sha256")
            != hashlib.sha256(status).hexdigest()
            or not isinstance(metadata.get("remote_names"), list)
            or not all(
                isinstance(name, str) for name in metadata.get("remote_names", [])
            )
            or metadata.get("index_patch_bytes")
            != checkpoint.member_metadata(f"{destination}/index.patch").st_size
            or metadata.get("worktree_patch_bytes")
            != checkpoint.member_metadata(
                f"{destination}/tracked-working-tree.patch"
            ).st_size
            or exclusions != {"counts_by_reason": plans[repository.label].excluded_counts}
        ):
            fail("existing repository checkpoint metadata does not match", 73)
        typed_manifest: list[dict[str, str]] = []
        for row in manifest_rows:
            if set(row) != {"path", "type", "mode", "sha256"} or not all(
                isinstance(value, str) for value in row.values()
            ):
                fail("existing untracked manifest is invalid", 73)
            typed_manifest.append({key: str(value) for key, value in row.items()})
        fingerprint = RepositoryFingerprint(
            status=status,
            refs=refs,
            worktree_patch_sha256=checkpoint.hash_file(
                f"{destination}/tracked-working-tree.patch"
            ),
            index_patch_sha256=checkpoint.hash_file(
                f"{destination}/index.patch"
            ),
            remote_names=tuple(metadata["remote_names"]),
            untracked_manifest=normalize_untracked_manifest(typed_manifest),
        )
        verify_git_bundle(
            repository,
            repository.label,
            checkpoint,
            f"{destination}/repository.bundle",
        )
        verify_repository_unchanged(
            repository, plans[repository.label], fingerprint
        )
    checkpoint.verify_public_binding()


def validate_output_parent_security(output_parent: Path) -> None:
    metadata = output_parent.lstat()
    if metadata.st_uid != os.geteuid() or stat.S_IMODE(metadata.st_mode) & 0o022:
        fail(
            "output parent must be owned by the current user and not group/world writable",
            77,
        )


def print_plan(
    repositories: list[Repository],
    scopes: list[ScopeResolution],
    plans: dict[str, UntrackedPlan],
    result: str,
) -> None:
    totals = {
        key: sum(plan.excluded_counts[key] for plan in plans.values())
        for key in next(iter(plans.values())).excluded_counts
    }
    print(f"CHECKPOINT_RESULT={result}")
    print(f"REPOSITORY_COUNT={len(repositories)}")
    print(f"EXPLICIT_SCOPE_COUNT={len(scopes)}")
    print(
        "ELIGIBLE_UNTRACKED_FILES="
        f"{sum(len(plan.eligible) for plan in plans.values())}"
    )
    for reason in sorted(totals):
        print(f"EXCLUDED_{reason.upper()}={totals[reason]}")


def create_checkpoint(
    workspace: Path,
    checkpoint: CheckpointTree,
    checkpoint_id: str,
    repositories: list[Repository],
    scopes: list[ScopeResolution],
    plans: dict[str, UntrackedPlan],
) -> None:
    checkpoint.verify_public_binding()
    checkpoint.mkdir("repos")
    checkpoint.write_json(
        "checkpoint.json",
        {
            "format": FORMAT_VERSION,
            "checkpoint_id": checkpoint_id,
            "created_at": dt.datetime.now(dt.timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
            "workspace_name": workspace.name,
            "repository_count": len(repositories),
            "explicit_scope_count": len(scopes),
            "path_classified_untracked_secrets_opened": False,
            "completion_files_required": ["CHECKPOINT_COMPLETE", "SHA256SUMS"],
        },
    )
    scope_payload = b"".join(
        (
            json.dumps(
                {
                    "scope": row.scope,
                    "relative_path": row.relative_path,
                    "repository_label": row.repository_label,
                    "classification": row.classification,
                },
                ensure_ascii=True,
                sort_keys=True,
                separators=(",", ":"),
            )
            + "\n"
        ).encode("utf-8")
        for row in scopes
    )
    checkpoint.write_bytes("scope-map.jsonl", scope_payload)
    fingerprints: dict[str, RepositoryFingerprint] = {}
    for repository in repositories:
        checkpoint.verify_public_binding()
        fingerprints[repository.label] = capture_repository(
            repository,
            plans[repository.label],
            checkpoint,
            f"repos/{repository.label}",
        )
    # A later repository can take long enough for an earlier worktree to change.
    # Recheck every source only after all captures have finished.
    for repository in repositories:
        verify_repository_unchanged(
            repository,
            plans[repository.label],
            fingerprints[repository.label],
        )
    checkpoint.write_bytes(
        "CHECKPOINT_COMPLETE",
        f"format={FORMAT_VERSION}\nid={checkpoint_id}\n".encode("ascii"),
    )
    checkpoint.validate_modes()
    checkpoint.write_sha256sums()
    checkpoint.validate_modes()
    checkpoint.verify_sha256sums()
    checkpoint.verify_public_binding()
    os.sync()


def main() -> None:
    os.umask(0o077)
    args = parse_args()
    workspace = require_real_directory(args.workspace, "workspace")
    output_parent = require_real_directory(args.output_parent, "output parent")
    validate_output_parent_security(output_parent)
    target = checkpoint_target(output_parent, args.checkpoint_id)
    existing_tree = CheckpointTree.open_existing(output_parent, target.name)
    repositories: list[Repository] = []
    try:
        existing_checkpoint = inspect_checkpoint_target(
            target,
            workspace,
            args.checkpoint_id,
            existing_tree,
        )
        repositories, scopes = discover_repositories(workspace)
        try:
            plans: dict[str, UntrackedPlan] = {}
            for repository in repositories:
                reject_external_or_partial_object_store(repository)
                reject_unmanaged_gitlinks(repository)
                reject_unmerged_index(repository)
                reject_hidden_index_entries(repository)
                reject_intent_to_add(repository)
                reject_sensitive_tracked_changes(repository)
                plans[repository.label] = plan_untracked(repository)
            if existing_checkpoint:
                assert existing_tree is not None
                verify_existing_checkpoint(
                    existing_tree, repositories, scopes, plans
                )
                print_plan(repositories, scopes, plans, "already-complete")
                return
            if args.check:
                print_plan(repositories, scopes, plans, "preflight-pass")
                return
            checkpoint = CheckpointTree.create_new(output_parent, target.name)
            try:
                create_checkpoint(
                    workspace,
                    checkpoint,
                    args.checkpoint_id,
                    repositories,
                    scopes,
                    plans,
                )
            finally:
                checkpoint.close()
            print_plan(repositories, scopes, plans, "complete")
        finally:
            close_repositories(repositories)
    finally:
        if existing_tree is not None:
            existing_tree.close()


if __name__ == "__main__":
    try:
        main()
    except CheckpointError as error:
        print(
            f"{Path(sys.argv[0]).name}: {error.public_message}",
            file=sys.stderr,
        )
        raise SystemExit(error.exit_code) from None
    except KeyboardInterrupt:
        print(
            f"{Path(sys.argv[0]).name}: interrupted; any created directory is incomplete",
            file=sys.stderr,
        )
        raise SystemExit(130) from None
    except Exception:
        print(
            f"{Path(sys.argv[0]).name}: local capture failed; any created directory is incomplete",
            file=sys.stderr,
        )
        raise SystemExit(74) from None
