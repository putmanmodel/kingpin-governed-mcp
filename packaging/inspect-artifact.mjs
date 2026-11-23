// Source-side qualification evidence; deliberately excluded from the npm archive.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform, release, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_FILES, checkDependencies, checkDependencyResolution, checkFiles, checkFixture, packageDirectory } from './checks.mjs';

const [archiveArg, consumerArg, outputArg] = process.argv.slice(2);
assert.ok(archiveArg && consumerArg && outputArg,
  'Usage: node packaging/inspect-artifact.mjs TARBALL CONSUMER OUTPUT_JSON');
const archive = resolve(archiveArg), consumer = resolve(consumerArg), output = resolve(outputArg);
const source = fileURLToPath(new URL('../', import.meta.url));
const baseline = 'd825ff7997c443003ec9d2880db2db195e648353';
const run = (command, args, cwd = source) => execFileSync(command, args, { cwd });
const digest = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
const original = file => run('git', ['show', `${baseline}:${file}`]);
const packageDir = packageDirectory(consumer);
const bytes = readFileSync(archive);
const temporary = mkdtempSync(join(tmpdir(), 'kingpin archive inspection '));
try {
  const sourceCommit = run('git', ['rev-parse', 'HEAD']).toString().trim();
  // Qualification must also work after committing the reviewed packaging changes.
  // The approved baseline remains the oracle for every unchanged-file comparison.
  run('git', ['merge-base', '--is-ancestor', baseline, sourceCommit]);
  const entries = run('tar', ['-tzf', archive]).toString().trim().split('\n');
  assert.deepEqual(entries.slice().sort(), EXPECTED_FILES.map(file => 'package/' + file).sort());
  run('tar', ['-xzf', archive, '-C', temporary]);
  const unpacked = join(temporary, 'package');
  checkFiles(unpacked); checkFixture(unpacked);
  const manifest = JSON.parse(readFileSync(join(unpacked, 'package.json')));
  assert.deepEqual(manifest.files.slice().sort(), EXPECTED_FILES.slice().sort());
  assert.equal(manifest.license, 'SEE LICENSE IN LICENSE');
  assert.equal(manifest._hasShrinkwrap, undefined);
  assert.equal(manifest.private, undefined);
  for (const name of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack'])
    assert.equal(manifest.scripts[name], undefined, 'Unexpected lifecycle script: ' + name);
  const files = EXPECTED_FILES.map(file => {
    const packed = readFileSync(join(unpacked, file));
    assert.deepEqual(packed, readFileSync(join(source, file)), 'Archive/source mismatch: ' + file);
    assert.deepEqual(packed, readFileSync(join(packageDir, file)), 'Archive/consumer mismatch: ' + file);
    const mode = lstatSync(join(unpacked, file)).mode & 0o777;
    assert.equal(mode, ['server.mjs', 'demo.mjs'].includes(file) ? 0o755 : 0o644);
    return { path: file, size: packed.length, mode: mode.toString(8), sha256: digest(packed) };
  });
  const unchanged = ['LICENSE', 'fixtures/message.txt', 'host.mjs', 'enforce.mjs', 'profiles.mjs',
    'read-fixture.mjs', 'acceptance.test.mjs', 'mcp.test.mjs', '.mcp.json'].map(file => {
    const current = readFileSync(join(source, file));
    assert.deepEqual(current, original(file), 'Approved file changed: ' + file);
    return { path: file, sha256: digest(current), unchanged: true };
  });
  for (const file of ['server.mjs', 'demo.mjs']) {
    const current = readFileSync(join(source, file));
    assert.deepEqual(current, Buffer.concat([Buffer.from('#!/usr/bin/env node\n'), original(file)]));
  }
  const prior = JSON.parse(original('package-lock.json'));
  const lock = JSON.parse(readFileSync(join(unpacked, 'npm-shrinkwrap.json')));
  assert.equal(Object.keys(lock.packages).length, Object.keys(prior.packages).length);
  for (const [path, record] of Object.entries(prior.packages)) if (path) {
    for (const key of ['version', 'resolved', 'integrity', 'license'])
      assert.equal(lock.packages[path][key], record[key], `${path} ${key}`);
    assert.ok(!lock.packages[path].dev);
  }
  const dependencies = checkDependencies(consumer);
  const resolution = checkDependencyResolution(consumer);
  const licenses = dependencies.map(dependency => {
    const root = join(consumer, dependency.path);
    const notices = readdirSync(root).filter(name => /^(license|licence|notice)(\.|$)/i.test(name)).map(file => {
      const contents = readFileSync(join(root, file));
      return { file, size: contents.length, sha256: digest(contents) };
    });
    assert.ok(notices.some(notice => /^licen[sc]e/i.test(notice.file)), 'Missing dependency license: ' + dependency.name);
    if (dependency.name === 'kingpin-runtime') assert.ok(notices.some(notice => /^notice/i.test(notice.file)));
    return { name: dependency.name, version: dependency.version, license: dependency.license, notices };
  });
  const consumerLock = JSON.parse(readFileSync(join(consumer, 'package-lock.json')));
  const integrity = 'sha512-' + digest(bytes, 'sha512', 'base64');
  assert.equal(consumerLock.packages['node_modules/kingpin-governed-mcp'].integrity, integrity);
  const report = {
    baseline, sourceCommit, branch: run('git', ['branch', '--show-current']).toString().trim(),
    environment: { node: process.version, npm: run('npm', ['--version']).toString().trim(), platform: platform(), arch: arch(), release: release(),
      macOS: platform() === 'darwin' ? run('sw_vers', ['-productVersion']).toString().trim() : null },
    archive: { path: archive, name: manifest.name, version: manifest.version, size: bytes.length,
      sha256: digest(bytes), sha1: digest(bytes, 'sha1'), integrity, fileCount: files.length, files },
    consumer, dependencies, resolution, dependencyLicenses: licenses, unchanged,
    serverAndDemoOnlyShebangAdded: true, approvedDependencyTuplesUnchanged: true,
    integrationLicense: { metadata: manifest.license, sha256: digest(original('LICENSE')), unchanged: true },
    integrityScope: 'npm archive integrity values recorded from consumer lock and compared to approved lock; actual versions and module resolution checked. This is not an independent hash audit of every extracted dependency file.',
  };
  copyFileSync(join(consumer, 'package-lock.json'), join(dirname(output), 'consumer-package-lock.json'));
  writeFileSync(join(dirname(output), 'installed-npm-ls.json'), run('npm', ['ls', '--omit=dev', '--all', '--json'], consumer));
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ archive: report.archive.path, sha256: report.archive.sha256,
    files: files.length, dependencies: dependencies.length, dependencyEdges: resolution.length, output }, null, 2));
} finally { rmSync(temporary, { recursive: true, force: true }); }
