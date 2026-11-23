// Deliberately broken copies only: never mutate the qualified archive or installation.
// Each control must fail the relevant assertion for its stated reason. A timeout,
// unrelated dependency error, or generic nonzero exit is not a successful detection.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync,
  readFileSync, readdirSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_FILES, assertOutcome, checkDemo, checkDependencies, checkFiles,
  checkFixture, probeServer, runDemo,
} from './checks.mjs';

const FIXTURE = Buffer.from('Kingpin fixture v1\n');
const PACKAGE_NAME = 'kingpin-governed-mcp';
const options = Object.fromEntries(Array.from({ length: (process.argv.length - 2) / 2 },
  (_, i) => [process.argv[2 + i * 2], process.argv[3 + i * 2]]));
for (const option of ['--consumer', '--tarball', '--output'])
  assert.ok(options[option], `Usage: node packaging/negative-controls.mjs --consumer DIR --tarball FILE --output FILE (missing ${option})`);
const consumer = realpathSync(options['--consumer']);
const tarball = realpathSync(options['--tarball']);
const output = resolve(options['--output']);
const source = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
assert.ok(relative(source, consumer).startsWith('..' + sep), 'Consumer must be outside the source checkout');
// Canonicalize macOS /var -> /private/var before containment checks on module
// resolution results; a path-spelling difference must not relax the guard.
const work = realpathSync(mkdtempSync(join(tmpdir(), 'kingpin negative controls ')));
const unrelated = join(work, 'unrelated working directory');
mkdirSync(unrelated);
const results = [];

function writableTree(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return;
  chmodSync(path, stat.isDirectory() ? 0o755 : (stat.mode & 0o111 ? 0o755 : 0o644));
  if (stat.isDirectory()) for (const entry of readdirSync(path)) writableTree(join(path, entry));
}

function copyTree(from, to) {
  // npm's relative bin links must remain relative to the copied installation.
  cpSync(from, to, { recursive: true, verbatimSymlinks: true });
  writableTree(to);
}

function tar(args) {
  const result = spawnSync('tar', args, { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined, 'tar operation failed');
  assert.equal(result.status, 0, `tar operation failed: ${result.stderr}`);
}

async function expectFailure(run, expectedCode, verify = () => {}) {
  let failure;
  try { await run(); } catch (error) { failure = error; }
  assert.ok(failure, `Mutation survived: expected ${expectedCode}`);
  assert.equal(failure.code, expectedCode, `Unrelated failure: ${failure.stack ?? failure}`);
  verify(failure);
  return { code: failure.code, details: failure.details ?? null, message: failure.message };
}

async function control(name, expected, run) {
  const started = Date.now();
  try {
    const evidence = await run();
    results.push({ name, expected, detected: true, elapsedMs: Date.now() - started, evidence });
  } catch (error) {
    results.push({ name, expected, detected: false, elapsedMs: Date.now() - started,
      failure: { code: error.code ?? null, message: error.message, stack: error.stack } });
  }
}

function installCopy(name) {
  const path = join(work, name);
  copyTree(consumer, path);
  return { path, pkg: join(path, 'node_modules', PACKAGE_NAME) };
}

function replaceOnce(file, original, replacement) {
  const contents = readFileSync(file, 'utf8');
  assert.equal(contents.split(original).length, 2, `Mutation anchor must occur exactly once: ${original}`);
  writeFileSync(file, contents.replace(original, replacement));
}

function dependencyDir(pkg, name) {
  let path = dirname(createRequire(join(pkg, 'package.json')).resolve(name));
  while (true) {
    const manifest = join(path, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === name) return path;
    const parent = dirname(path);
    assert.notEqual(parent, path, `Unable to locate installed dependency ${name}`);
    path = parent;
  }
}

function cleanNoStartup(error) {
  assert.equal(error.details.exit.code, 0, 'Import-only entry must exit cleanly, rather than fail for an unrelated reason');
  assert.equal(error.details.exit.signal, null);
  assert.equal(error.details.stdout, '', 'Import-only entry must emit no protocol response');
  assert.doesNotMatch(error.details.stderr, /ERR_MODULE_NOT_FOUND|SyntaxError|ReferenceError/);
}

function missingDependencyRuntime(path, command, name) {
  const result = spawnSync(join(path, 'node_modules', '.bin', command), [],
    { cwd: unrelated, env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined, 'Missing dependency must fail at module loading, not spawning or timeout');
  assert.equal(result.status, 1);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /ERR_MODULE_NOT_FOUND/);
  assert.ok(result.stderr.includes(`Cannot find package '${name}'`), result.stderr);
  return { status: result.status, signal: result.signal, stdout: result.stdout,
    errorCode: 'ERR_MODULE_NOT_FOUND', missingPackage: name };
}

let baseline;
try {
  const extracted = join(work, 'original archive');
  mkdirSync(extracted);
  tar(['-xzf', tarball, '-C', extracted]);
  const archivePackage = join(extracted, 'package');
  checkFiles(archivePackage, EXPECTED_FILES);
  checkFixture(archivePackage);
  checkFiles(join(consumer, 'node_modules', PACKAGE_NAME), EXPECTED_FILES);
  checkFixture(join(consumer, 'node_modules', PACKAGE_NAME));
  const dependencies = checkDependencies(consumer);
  const normal = await probeServer(consumer, { cwd: unrelated, profile: 'normal' });
  const refused = await probeServer(consumer, { cwd: unrelated, profile: 'lease-required' });
  assertOutcome(normal.results[0], 'normal');
  assertOutcome(refused.results[0], 'lease-required');
  checkDemo(runDemo(consumer, { cwd: unrelated }));
  baseline = { passed: true, archiveFiles: EXPECTED_FILES, dependencies,
    normal: normal.results[0].structuredContent, refused: refused.results[0].structuredContent };

  for (const missing of EXPECTED_FILES) await control(`archive omits ${missing}`, 'FILES_MISSING', async () => {
    const id = results.length;
    const stage = join(work, `archive mutation ${id}`);
    const unpacked = join(work, `archive inspection ${id}`);
    const brokenArchive = join(work, `missing ${id}.tgz`);
    mkdirSync(stage);
    mkdirSync(unpacked);
    copyTree(archivePackage, join(stage, 'package'));
    rmSync(join(stage, 'package', missing));
    tar(['-czf', brokenArchive, '-C', stage, 'package']);
    tar(['-xzf', brokenArchive, '-C', unpacked]);
    const evidence = await expectFailure(() => checkFiles(join(unpacked, 'package'), EXPECTED_FILES),
      'FILES_MISSING', error => assert.deepEqual(error.details.missing, [missing]));
    return { ...evidence, mutation: { archive: true, omitted: missing } };
  });

  await control('server bin imports entry instead of executing it', 'SERVER_STARTUP with clean exit and no response', async () => {
    const { path, pkg } = installCopy('server import wrapper');
    copyFileSync(join(pkg, 'server.mjs'), join(pkg, 'server-imported.mjs'));
    writeFileSync(join(pkg, 'server.mjs'), "#!/usr/bin/env node\nimport './server-imported.mjs';\n");
    return expectFailure(() => probeServer(path, { cwd: unrelated }), 'SERVER_STARTUP', cleanNoStartup);
  });

  await control('demo bin imports entry instead of executing it', 'DEMO_STARTUP with clean exit and no results', async () => {
    const { path, pkg } = installCopy('demo import wrapper');
    copyFileSync(join(pkg, 'demo.mjs'), join(pkg, 'demo-imported.mjs'));
    writeFileSync(join(pkg, 'demo.mjs'), "#!/usr/bin/env node\nimport './demo-imported.mjs';\n");
    const result = runDemo(path, { cwd: unrelated });
    assert.equal(result.status, 0);
    assert.equal(result.signal, null);
    assert.equal(result.stdout, '');
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|SyntaxError|ReferenceError/);
    return expectFailure(() => checkDemo(result), 'DEMO_STARTUP');
  });

  await control('fixture loses its final newline', 'FIXTURE_BYTES on file and successful MCP read', async () => {
    const { path, pkg } = installCopy('missing final newline');
    assert.deepEqual(readFileSync(join(pkg, 'fixtures/message.txt')), FIXTURE);
    const shortened = FIXTURE.subarray(0, -1);
    writeFileSync(join(pkg, 'fixtures/message.txt'), shortened);
    const file = await expectFailure(() => checkFixture(pkg), 'FIXTURE_BYTES');
    const report = await probeServer(path, { cwd: unrelated, profile: 'normal' });
    const result = report.results[0];
    assert.equal(result.structuredContent.status, 'read');
    assert.equal(result.isError, false);
    assert.deepEqual(Buffer.from(result.structuredContent.bytes, 'base64'), shortened);
    const wire = await expectFailure(() => assertOutcome(result, 'normal'), 'FIXTURE_BYTES');
    return { file, wire, originalBytes: FIXTURE.length, mutatedBytes: shortened.length };
  });

  for (const [dependency, command] of [
    ['kingpin-runtime', 'kingpin-mcp'],
    ['@modelcontextprotocol/server', 'kingpin-mcp'],
    ['zod', 'kingpin-mcp'],
    ['@modelcontextprotocol/client', 'kingpin-mcp-demo'],
  ]) await control(`missing installed dependency ${dependency}`, 'DEPENDENCY_MISSING and exact module-loading error', async () => {
    const { path, pkg } = installCopy(`missing dependency ${results.length}`);
    const removed = dependencyDir(pkg, dependency);
    assert.ok(relative(path, removed).startsWith('node_modules' + sep), 'Remove only a dependency in this disposable consumer');
    rmSync(removed, { recursive: true });
    const metadata = await expectFailure(() => checkDependencies(path), 'DEPENDENCY_MISSING', error => {
      assert.ok(error.details.name === dependency || error.details.path?.endsWith(`node_modules/${dependency}`),
        `Wrong missing dependency: ${JSON.stringify(error.details)}`);
    });
    return { metadata, runtime: missingDependencyRuntime(path, command, dependency) };
  });

  await control('transitive dependency integrity differs from qualified tree', 'DEPENDENCY_TREE for the exact changed integrity tuple', async () => {
    const { path } = installCopy('transitive integrity drift');
    checkDependencies(path);
    const lockFile = join(path, 'package-lock.json');
    const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
    const [dependencyPath, record] = Object.entries(lock.packages).find(([key]) =>
      key.split('node_modules/').at(-1) === 'cross-spawn') ?? [];
    assert.ok(dependencyPath, 'Qualified tree must include cross-spawn');
    const qualifiedIntegrity = record.integrity;
    assert.match(qualifiedIntegrity, /^sha512-/);
    record.integrity = 'sha512-' + (qualifiedIntegrity[7] === 'A' ? 'B' : 'A') + qualifiedIntegrity.slice(8);
    const changedIntegrity = record.integrity;
    assert.notEqual(changedIntegrity, qualifiedIntegrity);
    writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
    const failure = await expectFailure(() => checkDependencies(path), 'DEPENDENCY_TREE', error => {
      assert.equal(error.details.expected.find(item => item.name === 'cross-spawn').integrity, qualifiedIntegrity);
      assert.equal(error.details.actual.find(item => item.name === 'cross-spawn').integrity, changedIntegrity);
    });
    return { ...failure, changedDependency: 'cross-spawn', qualifiedIntegrity, changedIntegrity };
  });

  await control('installed transitive dependency has the wrong version', 'DEPENDENCY_VERSION for the exact changed package version', async () => {
    const { path, pkg } = installCopy('transitive installed version drift');
    checkDependencies(path);
    const file = join(dependencyDir(pkg, 'cross-spawn'), 'package.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    const qualifiedVersion = manifest.version;
    manifest.version = '0.0.0-negative-control';
    writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    const failure = await expectFailure(() => checkDependencies(path), 'DEPENDENCY_VERSION', error => {
      assert.equal(error.details.name, 'cross-spawn');
      assert.equal(error.details.expected, qualifiedVersion);
      assert.equal(error.details.actual, '0.0.0-negative-control');
    });
    return { ...failure, changedDependency: 'cross-spawn', qualifiedVersion, changedVersion: manifest.version };
  });

  await control('server accidentally exposes a second MCP tool', 'TOOL_COUNT with exactly the injected additional tool', async () => {
    const { path, pkg } = installCopy('additional exposed tool');
    replaceOnce(join(pkg, 'server.mjs'), "server.registerTool('read_governed_fixture',",
      "server.registerTool('negative_control_tool', { inputSchema: z.strictObject({}) }, () => ({ content: [] }));\n      server.registerTool('read_governed_fixture',");
    return expectFailure(() => probeServer(path, { cwd: unrelated }), 'TOOL_COUNT', error => {
      assert.deepEqual(error.details.list.tools.map(tool => tool.name).sort(),
        ['negative_control_tool', 'read_governed_fixture']);
    });
  });

  await control('server diagnostics accidentally contaminate protocol stdout', 'STDOUT_PROTOCOL while the normal read still succeeds', async () => {
    const { path, pkg } = installCopy('diagnostic stdout contamination');
    replaceOnce(join(pkg, 'server.mjs'), 'serveStdio(() => {',
      "console.log('negative-control-diagnostic');\n    serveStdio(() => {");
    return expectFailure(() => probeServer(path, { cwd: unrelated }), 'STDOUT_PROTOCOL', error => {
      assert.deepEqual(error.details.exit, { code: 0, signal: null });
      const lines = error.details.stdout.trim().split('\n');
      assert.equal(lines.filter(line => line === 'negative-control-diagnostic').length, 1);
      const replies = lines.filter(line => line !== 'negative-control-diagnostic').map(line => JSON.parse(line));
      const response = replies.find(reply => reply.id === 3);
      assert.ok(response, 'Control must successfully complete the normal tool call');
      assertOutcome(response.result, 'normal');
    });
  });

  await control('normal profile accidentally refuses', 'NORMAL_BEHAVIOR for exact lease-required refusal', async () => {
    const { path, pkg } = installCopy('normal profile refusal');
    replaceOnce(join(pkg, 'profiles.mjs'), "if (name === 'normal') return passSignal;",
      "if (name === 'normal') name = 'lease-required';");
    const report = await probeServer(path, { cwd: unrelated, profile: 'normal' });
    const result = report.results[0];
    assert.equal(result.structuredContent.status, 'refused');
    assert.equal(result.structuredContent.reason, 'gate_2_requires_valid_lease');
    assert.equal(result.isError, true);
    assert.ok(!Object.hasOwn(result.structuredContent, 'bytes'));
    return expectFailure(() => assertOutcome(result, 'normal'), 'NORMAL_BEHAVIOR');
  });

  await control('lease-required profile accidentally permits', 'REFUSED_BEHAVIOR for exact fixture read', async () => {
    const { path, pkg } = installCopy('lease profile permits');
    replaceOnce(join(pkg, 'profiles.mjs'), "if (name === 'normal') return passSignal;",
      "if (name === 'normal' || name === 'lease-required') return passSignal;");
    const report = await probeServer(path, { cwd: unrelated, profile: 'lease-required' });
    const result = report.results[0];
    assert.equal(result.structuredContent.status, 'read');
    assert.equal(result.isError, false);
    assert.deepEqual(Buffer.from(result.structuredContent.bytes, 'base64'), FIXTURE);
    return expectFailure(() => assertOutcome(result, 'lease-required'), 'REFUSED_BEHAVIOR');
  });

  await control('refusal accidentally includes payload bytes', 'REFUSED_BEHAVIOR while refusal reason is unchanged', async () => {
    const { path, pkg } = installCopy('refusal includes payload');
    replaceOnce(join(pkg, 'server.mjs'), "body = { status: 'refused', reason: result.reason };",
      `body = { status: 'refused', reason: result.reason, bytes: '${FIXTURE.toString('base64')}' };`);
    const report = await probeServer(path, { cwd: unrelated, profile: 'lease-required' });
    const result = report.results[0];
    assert.equal(result.structuredContent.status, 'refused');
    assert.equal(result.structuredContent.reason, 'gate_2_requires_valid_lease');
    assert.equal(result.isError, true);
    assert.deepEqual(Buffer.from(result.structuredContent.bytes, 'base64'), FIXTURE);
    return expectFailure(() => assertOutcome(result, 'lease-required'), 'REFUSED_BEHAVIOR');
  });

  await control('fixture lookup depends on checkout working directory', 'NORMAL_BEHAVIOR only outside package working directory', async () => {
    const { path, pkg } = installCopy('cwd relative fixture');
    const file = join(pkg, 'read-fixture.mjs');
    const original = readFileSync(file, 'utf8');
    assert.equal(original.split('import.meta.url').length, 3, 'Expected both fixture URL anchors');
    writeFileSync(file, "import { pathToFileURL } from 'node:url';\n" +
      original.replaceAll('import.meta.url', "pathToFileURL(process.cwd() + '/')"));
    const packageCwd = await probeServer(path, { cwd: pkg, profile: 'normal' });
    assertOutcome(packageCwd.results[0], 'normal');
    const unrelatedCwd = await probeServer(path, { cwd: unrelated, profile: 'normal' });
    const result = unrelatedCwd.results[0];
    assert.equal(result.structuredContent.status, 'adapter_error');
    assert.equal(result.isError, true);
    assert.ok(unrelatedCwd.events.some(event => event.event === 'adapter_entry'), 'Must reach adapter, not fail startup');
    const failure = await expectFailure(() => assertOutcome(result, 'normal'), 'NORMAL_BEHAVIOR');
    return { packageWorkingDirectoryPassed: true, unrelatedWorkingDirectoryStatus: 'adapter_error', ...failure };
  });
} catch (error) {
  baseline ??= { passed: false, failure: { code: error.code ?? null, message: error.message, stack: error.stack } };
  if (baseline.passed) results.push({ name: 'negative-control runner', detected: false,
    failure: { code: error.code ?? null, message: error.message, stack: error.stack } });
} finally {
  const report = { schema: 1, consumer, tarball, platform: process.platform, arch: process.arch,
    node: process.version, baseline, total: results.length, detected: results.filter(item => item.detected).length,
    failed: results.filter(item => !item.detected).length, controls: results };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, baselinePassed: baseline?.passed, total: report.total,
    detected: report.detected, failed: report.failed }));
  process.exitCode = baseline?.passed && report.failed === 0 && report.total > 0 ? 0 : 1;
  rmSync(work, { recursive: true, force: true });
}
