// Source-side artifact qualification. This module is deliberately not published.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join, relative, resolve, sep } from 'node:path';

export const EXPECTED_FILES = Object.freeze([
  'LICENSE', 'NOTICE.md', 'README.md', 'demo.mjs', 'enforce.mjs',
  'fixtures/message.txt', 'host.mjs', 'npm-shrinkwrap.json', 'package.json',
  'profiles.mjs', 'read-fixture.mjs', 'server.mjs',
]);
export const FIXTURE = Buffer.from('Kingpin fixture v1\n');
export const TOOL = 'read_governed_fixture';
export const DIRECT_DEPENDENCIES = Object.freeze({
  '@modelcontextprotocol/client': '2.4.0', '@modelcontextprotocol/core': '2.4.0',
  '@modelcontextprotocol/server': '2.4.0', 'cross-spawn': '7.0.6',
  eventsource: '3.0.7', 'eventsource-parser': '3.1.1', isexe: '2.0.0', jose: '6.2.17',
  'kingpin-runtime': '0.1.0-rc.4', 'path-key': '3.1.1', 'pkce-challenge': '5.0.1',
  'shebang-command': '2.0.0', 'shebang-regex': '3.0.0', which: '2.0.2', zod: '4.6.7',
});

export class QualificationError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'QualificationError'; this.code = code; this.details = details;
  }
}
function demand(condition, code, message, details) {
  if (!condition) throw new QualificationError(code, message, details);
}
function same(actual, expected) {
  try { assert.deepEqual(actual, expected); return true; } catch { return false; }
}
export function packageDirectory(consumer) {
  return join(resolve(consumer), 'node_modules', 'kingpin-governed-mcp');
}
export function cleanEnvironment(extra = {}) {
  const env = { ...process.env };
  delete env.NODE_PATH; delete env.NODE_OPTIONS;
  for (const key of ['KINGPIN_PROFILE', 'KINGPIN_PRINCIPAL', 'KINGPIN_AGENT', 'KINGPIN_SESSION', 'KINGPIN_CHANNEL']) delete env[key];
  Object.assign(env, extra);
  env.PATH = dirname(process.execPath) + delimiter + (process.env.PATH ?? '');
  return env;
}

export function checkFiles(packageDir, expectedFiles = EXPECTED_FILES) {
  const files = [];
  function visit(dir, prefix = '') {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (!prefix && item.name === 'node_modules') continue; // npm-owned installed dependency tree
      const name = prefix + item.name;
      if (item.isDirectory()) visit(join(dir, item.name), name + '/');
      else {
        demand(item.isFile(), 'FILES_TYPE', 'Packaged paths must be regular files', { path: name });
        files.push(name);
      }
    }
  }
  visit(packageDir);
  const missing = expectedFiles.filter(file => !files.includes(file)).sort();
  const extra = files.filter(file => !expectedFiles.includes(file)).sort();
  demand(!missing.length, 'FILES_MISSING', 'Required packaged files are absent', { missing, extra });
  demand(!extra.length, 'FILES_EXTRA', 'Unexpected packaged files are present', { missing, extra });
  return files.sort();
}

export function checkFixture(packageDir) {
  const file = join(packageDir, 'fixtures/message.txt');
  demand(existsSync(file), 'FILES_MISSING', 'Fixture is absent', { missing: ['fixtures/message.txt'] });
  const bytes = readFileSync(file);
  demand(bytes.equals(FIXTURE), 'FIXTURE_BYTES', 'Fixture differs from the approved literal bytes', {
    expectedBase64: FIXTURE.toString('base64'), actualBase64: bytes.toString('base64'),
  });
  return bytes;
}

export function checkExecutables(consumer) {
  const dir = packageDirectory(consumer);
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json')));
  const expected = { 'kingpin-mcp': 'server.mjs', 'kingpin-mcp-demo': 'demo.mjs' };
  demand(same(manifest.bin, expected), 'EXECUTABLE_MAP', 'Unexpected executable map', { actual: manifest.bin });
  for (const [bin, file] of Object.entries(expected)) {
    const link = join(consumer, 'node_modules/.bin', bin);
    demand(existsSync(link), 'EXECUTABLE_MISSING', 'Installed executable is absent', { path: link });
    demand(realpathSync(link) === realpathSync(join(dir, file)), 'EXECUTABLE_MAP', 'Executable does not target its entry module', { path: link });
    demand(Boolean(statSync(link).mode & 0o111), 'EXECUTABLE_MODE', 'Entry module is not executable', { path: link });
    demand(readFileSync(link, 'utf8').startsWith('#!/usr/bin/env node\n'), 'EXECUTABLE_SHEBANG', 'Entry module has no Node shebang', { path: link });
  }
  return expected;
}

function lockName(path) { return path.split('node_modules/').at(-1); }
function tuple(path, record) {
  return { name: lockName(path), version: record.version, resolved: record.resolved, integrity: record.integrity };
}
export function checkDependencies(consumer) {
  const packageDir = packageDirectory(consumer);
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json')));
  demand(same(manifest.dependencies, DIRECT_DEPENDENCIES), 'DEPENDENCY_DECLARATION', 'The application must pin its complete qualified 15-package dependency closure', { actual: manifest.dependencies });
  demand(!Object.keys(manifest.devDependencies ?? {}).length, 'DEPENDENCY_DECLARATION', 'Candidate unexpectedly declares development dependencies');
  const shrinkwrap = JSON.parse(readFileSync(join(packageDir, 'npm-shrinkwrap.json')));
  const lock = JSON.parse(readFileSync(join(consumer, 'package-lock.json')));
  const expected = Object.entries(shrinkwrap.packages).filter(([path]) => path).map(([path, record]) => tuple(path, record));
  const inventory = [];
  for (const [path, record] of Object.entries(lock.packages)) {
    if (!path || lockName(path) === 'kingpin-governed-mcp') continue;
    const name = lockName(path), actualPath = join(consumer, path, 'package.json');
    demand(existsSync(actualPath), 'DEPENDENCY_MISSING', 'Locked dependency is not installed', { name, path: actualPath });
    const installed = JSON.parse(readFileSync(actualPath));
    demand(installed.name === name && installed.version === record.version, 'DEPENDENCY_VERSION', 'Installed package differs from consumer lock', { path, name, actual: installed.version, expected: record.version });
    demand(!record.dev, 'DEPENDENCY_DEVELOPMENT', 'Development dependency found in production installation', { name, path });
    demand(typeof record.integrity === 'string' && record.integrity.startsWith('sha512-'), 'DEPENDENCY_INTEGRITY', 'Registry dependency has no sha512 integrity', { name, path });
    inventory.push({ path, ...tuple(path, record), license: installed.license ?? null });
  }
  const ordered = values => values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  demand(same(ordered(inventory.map(({ path, license, ...entry }) => entry)), ordered(expected)),
    'DEPENDENCY_TREE', 'Installed versions, registry URLs, or integrities differ from the shipped shrinkwrap', { expected, actual: inventory });
  resolveDependencyEdges(consumer, inventory);
  return inventory.sort((a, b) => a.name.localeCompare(b.name));
}

function resolveDependencyEdges(consumer, inventory) {
  const consumerReal = realpathSync(consumer);
  const insideConsumer = path => {
    const rel = relative(consumerReal, path);
    return rel !== '..' && !rel.startsWith('..' + sep) && !rel.startsWith(sep);
  };
  const byRoot = new Map(inventory.map(entry => [realpathSync(join(consumer, entry.path)), entry]));
  const shrinkwrap = JSON.parse(readFileSync(join(packageDirectory(consumer), 'npm-shrinkwrap.json')));
  const qualifiedByName = new Map(Object.entries(shrinkwrap.packages).filter(([path]) => path).map(([path, entry]) => [lockName(path), entry]));
  const origins = [{ path: 'node_modules/kingpin-governed-mcp', name: 'kingpin-governed-mcp' }, ...inventory];
  const edges = [];
  for (const origin of origins) {
    const originRoot = realpathSync(join(consumer, origin.path));
    demand(insideConsumer(originRoot), 'DEPENDENCY_RESOLUTION', 'Installed dependency origin escapes the consumer', { origin: origin.path, actualPath: originRoot });
    const originManifest = JSON.parse(readFileSync(join(originRoot, 'package.json')));
    const declared = originManifest.dependencies ?? {};
    if (origin.name !== 'kingpin-governed-mcp') {
      demand(same(declared, qualifiedByName.get(origin.name)?.dependencies ?? {}), 'DEPENDENCY_DECLARATION',
        'Installed dependency declarations differ from the qualified lock', { origin: origin.path, actual: declared });
    }
    const resolver = createRequire(join(originRoot, 'package.json'));
    for (const [name, range] of Object.entries(declared)) {
      let entryPath;
      try { entryPath = realpathSync(resolver.resolve(name)); }
      catch (error) {
        throw new QualificationError('DEPENDENCY_MISSING', 'A declared dependency cannot resolve from its installed parent', {
          name, origin: origin.path, resolutionError: error.code,
        });
      }
      demand(insideConsumer(entryPath), 'DEPENDENCY_RESOLUTION', 'Node resolved a dependency outside the consumer', { name, origin: origin.path, entryPath });
      // Package exports can hide package.json; locate the owning manifest from the
      // resolved entry rather than assuming that name/package.json is exported.
      let root = dirname(entryPath), manifest;
      while (insideConsumer(root)) {
        const file = join(root, 'package.json');
        if (existsSync(file)) {
          const candidate = JSON.parse(readFileSync(file));
          if (candidate.name === name) { manifest = candidate; break; }
        }
        const parent = dirname(root);
        if (parent === root) break;
        root = parent;
      }
      const locked = byRoot.get(root), qualified = qualifiedByName.get(name);
      demand(manifest && locked && qualified && locked.name === name && manifest.version === qualified.version &&
        locked.version === qualified.version && locked.resolved === qualified.resolved && locked.integrity === qualified.integrity,
      'DEPENDENCY_RESOLUTION', 'Node selected a dependency outside the exact qualified tree', {
        name, range, origin: origin.path, entryPath, resolvedRoot: root, actualVersion: manifest?.version, expectedVersion: qualified?.version,
      });
      edges.push({ origin: origin.path, dependency: name, declared: range, resolvedPath: relative(consumerReal, root), version: manifest.version });
    }
  }
  return edges;
}

export function checkDependencyResolution(consumer) {
  return resolveDependencyEdges(consumer, checkDependencies(consumer));
}

export function assertOutcome(result, profile) {
  const body = result?.structuredContent;
  const code = profile === 'normal' ? 'NORMAL_BEHAVIOR' : 'REFUSED_BEHAVIOR';
  demand(body && typeof body.requestId === 'string' && body.requestId.length > 0, code, 'Missing request correlation', { result });
  demand(same(result.content, [{ type: 'text', text: JSON.stringify(body) }]), code, 'MCP content and structured content differ', { result });
  if (profile === 'normal') {
    demand(result.isError === false && body.status === 'read' && body.encoding === 'base64', code, 'Normal profile did not permit the read', { result });
    demand(body.bytes === FIXTURE.toString('base64'), 'FIXTURE_BYTES', 'Returned bytes differ from the approved literal, including its final newline', { result });
    demand(same(Object.keys(body).sort(), ['bytes', 'encoding', 'requestId', 'status']), code, 'Unexpected permitted result fields', { result });
  } else {
    demand(result.isError === true && body.status === 'refused' && body.reason === 'gate_2_requires_valid_lease', code, 'Lease profile did not return the exact expected refusal', { result });
    demand(same(Object.keys(body).sort(), ['reason', 'requestId', 'status']), code, 'Refused result contains unexpected fields or payload', { result });
  }
  return body;
}

export function checkTrace(report, profile) {
  const expected = report.results.flatMap(() => profile === 'normal' ? ['enforced', 'adapter_entry', 'result_prepared'] : ['enforced', 'result_prepared']);
  demand(same(report.events.map(event => event.event), expected), 'STDERR_DIAGNOSTICS', 'Diagnostics are missing, duplicated, or out of sequence', { events: report.events, expected });
  for (const result of report.results) {
    const body = result.structuredContent;
    const events = report.events.filter(event => event.requestId === body.requestId);
    demand(events[0]?.outcome === (profile === 'normal' ? 'allow' : 'deny') && events.at(-1)?.status === body.status,
      'STDERR_DIAGNOSTICS', 'Diagnostics do not correspond to the tool result', { events, result });
  }
}

// The wire probe deliberately does not import a source-checkout SDK or assume a cwd.
// It uses the already-qualified legacy wire version; the installed demo exercises auto negotiation.
export async function probeServer(consumer, { cwd, profile = 'normal', calls = 1, shutdown = 'eof', command, args = [] } = {}) {
  command ??= join(resolve(consumer), 'node_modules/.bin/kingpin-mcp');
  const child = spawn(command, args, { cwd, env: cleanEnvironment({ KINGPIN_PROFILE: profile }), stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', buffer = '', wireError, spawnError, exit, initialized = false;
  const records = [], pending = new Map();
  const closed = new Promise(resolveClose => child.once('close', (code, signal) => { exit = { code, signal }; resolveClose(exit); }));
  child.on('error', error => { spawnError = error; });
  child.stdin.on('error', () => {});
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.on('data', chunk => {
    stdout += chunk; buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      try {
        const record = JSON.parse(line);
        if (record.jsonrpc !== '2.0' || !Object.hasOwn(record, 'id') || !pending.has(record.id)) throw Error('Unexpected non-response protocol output');
        records.push(record); pending.get(record.id)(record); pending.delete(record.id);
      } catch (error) { wireError ??= error; }
    }
  });
  const details = () => ({ stdout, stderr, exit, spawnError: spawnError?.message });
  async function deadline(promise, code, message) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new QualificationError(code, message + ' (8s timeout)', details())), 8000);
      })]);
    } finally { clearTimeout(timer); }
  }
  async function request(id, method, params) {
    const response = new Promise(resolveReply => pending.set(id, resolveReply));
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    const code = initialized ? 'SERVER_PROTOCOL' : 'SERVER_STARTUP';
    const record = await deadline(Promise.race([response, closed.then(() => {
      throw new QualificationError(code, 'Executable exited before its protocol response', details());
    })]), code, 'Executable did not respond');
    demand(!record.error && Object.hasOwn(record, 'result'), code, 'MCP request failed', { ...details(), record });
    return record.result;
  }
  try {
    const init = await request(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'installed-artifact-check', version: '1' } });
    initialized = true;
    demand(init.protocolVersion === '2025-11-25', 'SERVER_PROTOCOL', 'Unexpected protocol negotiation', { init });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const list = await request(2, 'tools/list', {});
    demand(same(list.tools?.map(tool => tool.name), [TOOL]) && !Object.hasOwn(list, 'nextCursor'),
      'TOOL_COUNT', 'Exactly the original fixture tool must be exposed, with no additional tool pages', { list });
    const results = [];
    for (let i = 0; i < calls; i++) results.push(await request(3 + i, 'tools/call', { name: TOOL, arguments: {} }));
    if (shutdown === 'eof') child.stdin.end();
    else { demand(shutdown === 'SIGTERM', 'SHUTDOWN', 'Unknown shutdown mode'); child.kill('SIGTERM'); }
    await deadline(closed, 'SHUTDOWN', 'Executable did not shut down');
    demand(same(exit, shutdown === 'eof' ? { code: 0, signal: null } : { code: null, signal: 'SIGTERM' }), 'SHUTDOWN', 'Unexpected process shutdown status', details());
    demand(!wireError && buffer.length === 0 && records.length === 2 + calls, 'STDOUT_PROTOCOL', 'stdout contained non-protocol or unexpected output', { ...details(), wireError: wireError?.message });
    let events;
    try { events = stderr.trim() ? stderr.trim().split('\n').map(line => JSON.parse(line)) : []; }
    catch { throw new QualificationError('STDERR_DIAGNOSTICS', 'stderr was not newline-delimited diagnostic JSON', details()); }
    demand(events.every(event => typeof event.event === 'string' && !Object.hasOwn(event, 'jsonrpc')), 'STDERR_DIAGNOSTICS', 'Protocol data leaked to diagnostics', { ...details(), events });
    return { results, list, stderr, stdout, exit, events, records };
  } finally {
    if (!exit) {
      child.kill('SIGKILL');
      await deadline(closed, 'SHUTDOWN', 'Could not reap failed executable');
    }
  }
}

export function runDemo(consumer, { cwd, command, args = [] } = {}) {
  command ??= join(resolve(consumer), 'node_modules/.bin/kingpin-mcp-demo');
  return spawnSync(command, args, { cwd, env: cleanEnvironment(), encoding: 'utf8', timeout: 15000 });
}
export function checkDemo(output) {
  const details = { stdout: output.stdout, stderr: output.stderr, exit: { code: output.status, signal: output.signal }, error: output.error?.message };
  demand(!output.error && output.status === 0 && output.signal === null, 'DEMO_STARTUP', 'Installed demo did not exit successfully', details);
  demand(Boolean(output.stdout.trim()), 'DEMO_STARTUP', 'Demo executable exited without running its entry point', details);
  let bodies;
  try { bodies = output.stdout.trim().split('\n').map(line => JSON.parse(line)); }
  catch { throw new QualificationError('DEMO_OUTPUT', 'Demo stdout is not JSON results', details); }
  demand(bodies.length === 2, 'DEMO_OUTPUT', 'Demo must print exactly two results', details);
  for (const [i, body] of bodies.entries()) {
    assertOutcome({ structuredContent: body, content: [{ type: 'text', text: JSON.stringify(body) }], isError: i !== 0 }, i === 0 ? 'normal' : 'lease-required');
  }
  demand(bodies[0].requestId !== bodies[1].requestId, 'DEMO_OUTPUT', 'Demo reused a request ID', details);
  demand(output.stderr === '', 'DEMO_OUTPUT', 'Installed demo emitted unexpected stderr', details);
  return bodies;
}
