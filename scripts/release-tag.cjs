#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const pkg = require('../package.json');

function git(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });

  if (!options.allowFailure && result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args[0]} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function output(args) {
  return git(args).stdout.trim();
}

function fail(message) {
  console.error(`Release refused: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const confirmIndex = args.indexOf('--confirm');
const confirmation = confirmIndex >= 0 ? args[confirmIndex + 1] : undefined;
const expectedTag = `v${pkg.version}`;

if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expectedTag)) {
  fail(`package version does not produce a supported tag: ${expectedTag}`);
}

const repositoryRoot = output(['rev-parse', '--show-toplevel']);
if (path.resolve(repositoryRoot) !== path.resolve(process.cwd())) {
  fail(`run from repository root ${repositoryRoot}`);
}

const status = output(['status', '--porcelain=v1', '--untracked-files=all']);
if (status) {
  fail('worktree is not clean; review and commit only the intended files first');
}

const branch = output(['branch', '--show-current']);
if (!branch) {
  fail('detached HEAD cannot be released');
}

if (!dryRun && confirmation !== expectedTag) {
  fail(`pass --confirm ${expectedTag} after reviewing the dry run`);
}

const localTag = git(['rev-parse', '--verify', '--quiet', `refs/tags/${expectedTag}`], {
  allowFailure: true,
});
if (localTag.status === 0) {
  fail(`local tag ${expectedTag} already exists`);
}

const remote = output(['remote', 'get-url', 'origin']);
if (!remote) {
  fail('origin remote is not configured');
}

const remoteTag = git(
  ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${expectedTag}`],
  { allowFailure: true },
);
if (remoteTag.status === 0) {
  fail(`remote tag ${expectedTag} already exists`);
}
if (remoteTag.status !== 2) {
  fail('could not prove that the release tag is absent on origin');
}

console.log(`Release candidate: ${expectedTag}`);
console.log(`Branch: ${branch}`);
console.log(`Commit: ${output(['rev-parse', 'HEAD'])}`);
console.log('Remote: origin');

if (dryRun) {
  console.log(`Dry run complete. To publish: npm run version:release -- --confirm ${expectedTag}`);
  process.exit(0);
}

git(['tag', '--annotate', expectedTag, '--message', `release: ${expectedTag}`], {
  inherit: true,
});
git(['push', 'origin', `HEAD:refs/heads/${branch}`], { inherit: true });
git(['push', 'origin', `refs/tags/${expectedTag}`], { inherit: true });
