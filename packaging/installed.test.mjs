import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assertOutcome, checkDemo, checkDependencies, checkExecutables, checkFiles,
  checkFixture, checkTrace, cleanEnvironment, packageDirectory, probeServer, runDemo,
} from './checks.mjs';

assert.ok(process.env.KINGPIN_CONSUMER, 'Set KINGPIN_CONSUMER to a fresh installed consumer outside the source checkout');
const consumer = resolve(process.env.KINGPIN_CONSUMER);
const source = fileURLToPath(new URL('../', import.meta.url));
assert.ok(!consumer.startsWith(source), 'Consumer must be outside the source checkout');
const packageDir = packageDirectory(consumer);
const work = mkdtempSync(join(tmpdir(), 'kingpin unrelated working directories '));
const directories = ['ordinary', 'working directory with spaces'].map(name => join(work, name));
for (const cwd of directories) {
  mkdirSync(join(cwd, 'fixtures'), { recursive: true });
  writeFileSync(join(cwd, 'fixtures/message.txt'), 'Wrong cwd fixture\n');
}
test.after(() => rmSync(work, { recursive: true, force: true }));

test('installed package has exactly the 12 intended files and literal fixture bytes', () => {
  assert.equal(checkFiles(packageDir).length, 12);
  assert.equal(checkFixture(packageDir).at(-1), 10);
  checkExecutables(consumer);
});

test('production-only installed dependency versions and integrities match the shipped shrinkwrap', t => {
  const inventory = checkDependencies(consumer);
  assert.ok(inventory.length > 0);
  t.diagnostic(`${inventory.length} registry dependencies: actual package versions and consumer-lock integrity values match`);
});

for (const [index, cwd] of directories.entries()) {
  for (const profile of ['normal', 'lease-required']) {
    test(`installed server ${profile} from unrelated cwd${index ? ' with spaces' : ''}`, async () => {
      const report = await probeServer(consumer, { cwd, profile, calls: 2 });
      for (const result of report.results) assertOutcome(result, profile);
      assert.notEqual(report.results[0].structuredContent.requestId, report.results[1].structuredContent.requestId);
      checkTrace(report, profile);
    });
  }
  test(`installed demo from unrelated cwd${index ? ' with spaces' : ''}`, () => {
    checkDemo(runDemo(consumer, { cwd }));
  });
}

test('entry modules imported by Node do not auto-start or print results', () => {
  for (const file of ['server.mjs', 'demo.mjs']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `await import(${JSON.stringify(pathToFileURL(join(packageDir, file)).href)})`], {
      cwd: directories[1], env: cleanEnvironment(), encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  }
});

test('EOF restart has no replay; a new process accepts a fresh profile and fresh request', async () => {
  const first = await probeServer(consumer, { cwd: directories[1], profile: 'normal' });
  assertOutcome(first.results[0], 'normal'); checkTrace(first, 'normal');
  const idle = await probeServer(consumer, { cwd: directories[0], calls: 0 });
  assert.deepEqual(idle.events, []);
  const refused = await probeServer(consumer, { cwd: directories[1], profile: 'lease-required' });
  assertOutcome(refused.results[0], 'lease-required'); checkTrace(refused, 'lease-required');
  const restarted = await probeServer(consumer, { cwd: directories[1], profile: 'normal' });
  assertOutcome(restarted.results[0], 'normal'); checkTrace(restarted, 'normal');
  assert.equal(new Set([first, refused, restarted].map(report => report.results[0].structuredContent.requestId)).size, 3);
});

test('installed server exits on SIGTERM and can start again', async () => {
  const report = await probeServer(consumer, { cwd: directories[1], shutdown: 'SIGTERM' });
  assertOutcome(report.results[0], 'normal'); checkTrace(report, 'normal');
  const restarted = await probeServer(consumer, { cwd: directories[1] });
  assertOutcome(restarted.results[0], 'normal'); checkTrace(restarted, 'normal');
});

test('server and demo run with the complete installed dependency tree effectively read-only', async () => {
  assert.notEqual(process.getuid?.(), 0, 'This permission qualification requires an unprivileged user');
  const modes = [];
  function visit(path) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return;
    modes.push([path, stat.mode & 0o777]);
    if (stat.isDirectory()) for (const name of readdirSync(path)) visit(join(path, name));
  }
  visit(join(consumer, 'node_modules'));
  try {
    for (const [path, mode] of modes) chmodSync(path, mode & ~0o222);
    const probe = spawnSync(process.execPath, ['--input-type=module', '--eval', `
      import { openSync, closeSync, writeFileSync, rmSync } from 'node:fs';
      const denied = [];
      try { const fd = openSync(${JSON.stringify(join(packageDir, 'fixtures/message.txt'))}, 'r+'); closeSync(fd); }
      catch (error) { denied.push(error.code); }
      const target = ${JSON.stringify(join(packageDir, '.qualification-write-probe'))};
      try { writeFileSync(target, 'probe'); rmSync(target); }
      catch (error) { denied.push(error.code); }
      process.stdout.write(JSON.stringify(denied));
      if (denied.length !== 2 || denied.some(code => !['EACCES', 'EPERM', 'EROFS'].includes(code))) process.exitCode = 1;
    `], { cwd: directories[1], env: cleanEnvironment(), encoding: 'utf8', timeout: 10000 });
    assert.equal(probe.error, undefined); assert.equal(probe.status, 0, `${probe.stdout}\n${probe.stderr}`);
    assert.equal(JSON.parse(probe.stdout).length, 2);
    for (const profile of ['normal', 'lease-required']) {
      const report = await probeServer(consumer, { cwd: directories[1], profile });
      assertOutcome(report.results[0], profile); checkTrace(report, profile);
    }
    checkDemo(runDemo(consumer, { cwd: directories[1] }));
    checkFixture(packageDir);
  } finally {
    for (const [path, mode] of modes) chmodSync(path, mode);
  }
});
