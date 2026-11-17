import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { KingpinAuthority } from 'kingpin-runtime';
import { createHost, passSignal } from './host.mjs';
import { readFixture } from './read-fixture.mjs';
import { enforce } from './enforce.mjs';

const bytes = Buffer.from('Kingpin fixture v1\n');
const native = 'authority.decision';
const eventName = suffix => 'tool.enforcement.' + suffix;

function signal(gate, reason) {
  return request => {
    const s = passSignal(request);
    return { ...s, gate, gate_label: gate === 1 ? 'EVIDENCE REQUIRED' : 'LEASE REQUIRED',
      evidence_requirements: gate === 1 ? ['dry_run', 'diff'] : [],
      authority: gate === 1 ? s.authority : { requirement: 'lease', recommendation: 'request_external_lease' },
      reason_codes: [reason], deviation: { ...s.deviation, active: true, severity: 0.5,
        ema_severity: 0.5, confidence: reason === 'LOW_CONFIDENCE' ? 0.2 : 1 } };
  };
}

// Observe actual synchronous calls and committed SDK events, independently of the host result.
function harness(t, { recordingFault, adapterFault, ...deps } = {}) {
  let authority, audit, secret;
  const decisions = [], errors = [], entries = [], attempts = [];
  class ObservedAuthority extends KingpinAuthority {
    decide(s, request, id, correlation) {
      audit = Object.freeze({ request_id: correlation.request_id, decision_id: correlation.decision_id,
        principal_id: correlation.principal_id });
      attempts.push({ id, correlation: audit, request });
      try {
        const result = super.decide(s, request, id, correlation);
        decisions.push(result);
        return result;
      } catch (error) { errors.push(error.message); throw error; }
    }
    recordEnforcement(...args) {
      if (recordingFault) throw Error('Injected precommit failure');
      return super.recordEnforcement(...args);
    }
  }
  let entryCount = 0;
  function observeAdapter(request) {
    entryCount++;
    const entry = { request };
    entries.push(entry);
    try {
      if (!audit) throw Error('No attempt correlation');
      entry.atEntry = authority.getEventsForRequest(audit.request_id);
    } catch (error) {
      entry.auditError = error;
      throw error;
    }
    if (adapterFault) throw Error(secret);
    return readFixture(request);
  }
  const host = createHost({ ...deps,
    authenticateHeader(token) {
      secret = token;
      return deps.authenticateHeader ? deps.authenticateHeader(token) : 'Bearer ' + token;
    },
    makeAuthority(options) { authority = new ObservedAuthority(options); return authority; },
    adapter: observeAdapter
  });
  t.after(host.close);
  return { decisions, errors, entries, attempts, authority, observeAdapter, get entryCount() { return entryCount; }, run(args) {
    const result = host.run(args);
    const events = result.requestId ? authority.getEventsForRequest(result.requestId) : [];
    assert.equal(entries.length, entryCount);
    const types = events.map(e => e.event_type);
    for (const [i, e] of events.entries()) {
      assert.equal(e.request_id, result.requestId);
      if (i) assert.ok(e.sequence > events[i - 1].sequence);
      assert.ok(!e.event_type.startsWith('tool.execution.'));
    }
    if (secret) assert.ok(!JSON.stringify([result, events]).includes(secret));
    const attempt = attempts.find(a => a.correlation.request_id === result.requestId);
    if (attempt) for (const e of events) {
      assert.equal(e.evaluation_id, attempt.id);
      assert.equal(e.decision_id, attempt.correlation.decision_id);
      assert.equal(e.principal_id, attempt.correlation.principal_id);
    }
    if (!result.payload) assert.ok(!Object.hasOwn(result, 'payload'));
    return { result, events, types };
  } };
}

const cases = [
  ['A01', passSignal, 'allow', 'allowed', 'full', 'allowed'],
  ['A02', signal(2,'LEASE_THRESHOLD_REACHED'), 'deny', 'gate_2_requires_valid_lease', 'read_only', 'denied'],
  ['A03', signal(1,'REVIEW_THRESHOLD_REACHED'), 'constrain', 'gate_1_requires_dry_run_and_diff', 'non_destructive', 'denied'],
  ['A04', signal(1,'LOW_CONFIDENCE'), 'human_review', 'low_confidence_requires_human_review', 'non_destructive', 'review'],
  ['A05', signal(2,'QUARANTINE_THRESHOLD_REACHED'), 'quarantine', 'kingpin_quarantined', 'quarantined', 'denied']
];
for (const [id, signalFor, outcome, reason, level, suffix] of cases) test(id, t => {
  const h = harness(t, { signalFor });
  const { result, events, types } = h.run();
  assert.equal(h.decisions.length, 1);
  const [d] = h.decisions;
  const matching = h.attempts.filter(a => a.correlation.request_id === result.requestId);
  assert.equal(matching.length, 1);
  const [attempt] = matching;
  assert.equal(d.evaluation_id, attempt.id);
  assert.equal(attempt.correlation.principal_id, 'local-agent');
  const expectedContext = { session_id: 'local', channel_id: 'cli', speaker_id: 'reader', scope_key: 'agent:reader' };
  assert.deepEqual(d.context, expectedContext);
  assert.equal(attempt.request.tool, 'fs.read');
  for (const e of events.filter(e => e.event_type === native || e.event_type.startsWith('tool.enforcement.'))) {
    assert.equal(e.agent_id, 'reader');
    assert.equal(e.tool_id, 'fs.read');
    assert.deepEqual(e.context, expectedContext);
    assert.equal(e.outcome, outcome);
  }
  assert.equal(d.outcome, outcome);
  assert.equal(d.reason, reason);
  assert.equal(d.tool_floor_gate, 0);
  assert.equal(d.capability_envelope.level, level);
  assert.equal(types.filter(type => type === native).length, 1);
  assert.equal(events.find(e => e.event_type === native).outcome, outcome);
  assert.deepEqual(types.filter(type => type.startsWith('tool.enforcement.')), [eventName(suffix)]);
  assert.equal(types.at(-1), eventName(suffix));
  assert.equal(events.at(-1).outcome, outcome);
  assert.equal(result.action, outcome === 'allow' ? 'dispatch' : 'block');
  assert.equal(h.entries.length, outcome === 'allow' ? 1 : 0);
  if (id === 'A01') {
    assert.deepEqual(result.payload, bytes);
    assert.equal(h.entries[0].atEntry.at(-1).event_type, eventName('allowed'));
    assert.equal(h.entries[0].request, h.attempts[0].request);
    assert.ok(Object.isFrozen(h.entries[0].request) && Object.isFrozen(h.entries[0].request.args));
  } else assert.ok(!Object.hasOwn(result, 'payload'));
  if (id === 'A02') {
    assert.ok(d.capability_envelope.tools.includes('fs.read'));
    assert.equal(events.find(e => e.event_type === 'lease.rejected').lease_check, 'missing');
  }
  if (id === 'A03' || id === 'A04') assert.deepEqual(d.missing_evidence, ['dry_run','diff']);
  if (id === 'A04') {
    const reviewId = h.authority.reviewIdForDecision(d);
    assert.ok(reviewId);
    assert.equal(events.find(e => e.event_type === 'review.requested').review_id, reviewId);
  }
  assert.deepEqual(types.filter(type => type.startsWith('review.')), id === 'A04' ? ['review.requested'] : []);
  if (id === 'A05') assert.ok(!types.includes('lease.rejected'));
});

for (const replay of [false,true]) test(replay ? 'A07' : 'A06', t => {
  const h = harness(t, replay ? { signalFor: cases[2][1], nextEvaluation: () => 'repeat' } :
    { signalFor: request => ({ ...passSignal(request), scope_key: 'agent:other' }) });
  let first;
  if (replay) {
    first = h.run();
    assert.equal(first.result.action, 'block');
    assert.equal(h.decisions[0].reason, cases[2][3]);
    assert.equal(h.decisions[0].outcome, 'constrain');
    assert.equal(first.types.at(-1), eventName('denied'));
    assert.ok(!Object.hasOwn(first.result, 'payload'));
  }
  const { result, types } = h.run();
  assert.deepEqual(types, [eventName('failed')]);
  assert.deepEqual(h.errors, [replay ? 'CDE evaluation already consumed' : 'Missing, inconsistent or unsupported CDE governance signal']);
  assert.equal(result.action, 'error');
  assert.equal(h.decisions.length, Number(replay));
  assert.equal(h.entries.length, 0);
  assert.ok(!Object.hasOwn(result, 'payload'));
  if (first) {
    assert.notEqual(first.result.requestId, result.requestId);
    assert.notEqual(h.attempts[0].correlation.decision_id, h.attempts[1].correlation.decision_id);
    assert.deepEqual(h.authority.getEventsForRequest(first.result.requestId), first.events);
  }
});

for (const [id, deps, reason] of [
  ['A08a', { authenticateHeader: () => 'Bearer invalid' }, 'AUTHENTICATION_REQUIRED'],
  ['A08b', { channel: 'unauthorized' }, 'FORBIDDEN']
]) test(id, t => {
  const h = harness(t, deps);
  const { types, events, result } = h.run();
  assert.equal(result.action, 'reject');
  assert.deepEqual(types, ['authentication.rejected']);
  assert.deepEqual(events[0].reason_codes, [reason]);
  assert.equal(h.attempts.length, 0);
  assert.equal(h.entries.length, 0);
  assert.ok(!Object.hasOwn(result, 'payload'));
});

for (const recordingFault of [true,false]) test(recordingFault ? 'A09' : 'A10', t => {
  const h = harness(t, { recordingFault, adapterFault: !recordingFault });
  const { types, result } = h.run();
  assert.equal(h.decisions.length, 1);
  assert.equal(h.decisions[0].outcome, 'allow');
  assert.equal(h.decisions[0].reason, 'allowed');
  assert.equal(types.filter(type => type === native).length, 1);
  assert.equal(result.action, recordingFault ? 'error' : 'dispatch');
  assert.equal(result.error, recordingFault ? 'Enforcement recording failed' : 'Fixture read failed');
  assert.ok(!Object.hasOwn(result, 'payload'));
  assert.equal(h.entries.length, recordingFault ? 0 : 1);
  assert.equal(types.at(-1), recordingFault ? native : eventName('allowed'));
  if (!recordingFault) assert.deepEqual(h.entries[0].atEntry.map(e => e.event_type), types);
});

for (const kind of ['absent','unknown outcome','wrong evaluation','wrong context',
  'schema','issuer','speaker','channel','scope','missing primary code','allow with lease refusal','deny with allow reason','unknown reason']) test('A11 ' + kind, t => {
  const h = harness(t);
  // Direct boundary probe. No decide call or adapter setup invocation.
  const request = Object.freeze({ speaker_id: 'reader', channel_id: 'cli', session_id: 'local',
    tool: 'fs.read', args: Object.freeze({ fixture: 'message-v1' }) });
  const id = 'boundary-evaluation';
  const d = { schema_version: '1.0', issuer: 'kingpin', outcome: 'allow', reason: 'allowed',
    reason_codes: ['ALLOWED'], evaluation_id: id, context: { speaker_id: 'reader',
      channel_id: 'cli', session_id: 'local', scope_key: 'agent:reader' } };
  const invalid = {
    schema: { ...d, schema_version: '2.0' }, issuer: { ...d, issuer: 'other' },
    speaker: { ...d, context: { ...d.context, speaker_id: 'other' } },
    channel: { ...d, context: { ...d.context, channel_id: 'other' } },
    scope: { ...d, context: { ...d.context, scope_key: 'agent:other' } },
    'missing primary code': { ...d, reason_codes: ['REENTRY_PENDING'] },
    'allow with lease refusal': { ...d, reason: 'gate_2_requires_valid_lease', reason_codes: ['GATE_2_REQUIRES_VALID_LEASE'] },
    'deny with allow reason': { ...d, outcome: 'deny' },
    'unknown reason': { ...d, reason: 'unknown', reason_codes: ['UNKNOWN'] },
    absent: null, 'unknown outcome': { ...d, outcome: 'unknown' },
    'wrong evaluation': { ...d, evaluation_id: id + '-' },
    'wrong context': { ...d, context: { ...d.context, session_id: 'other' } } }[kind];
  let entries = 0;
  const audit = { request_id: 'boundary-request', principal_id: 'local-agent', decision_id: 'boundary-attempt' };
  const result = enforce(invalid, request, id, (outcome, reason_codes) =>
    h.authority.recordEnforcement(request, audit, { outcome, evaluation_id: id, reason_codes }),
    () => { entries++; return bytes; });
  assert.equal(result.action, 'error');
  assert.ok(!Object.hasOwn(result, 'payload'));
  const events = h.authority.getEventsForRequest(audit.request_id);
  assert.deepEqual(events.map(e => e.event_type), [eventName('failed')]);
  assert.equal(events[0].evaluation_id, id);
  assert.equal(events[0].decision_id, audit.decision_id);
  assert.equal(h.attempts.length, 0);
  assert.equal(entries, 0);
});

for (const arg of ['--path=fixtures/message.txt','--identity=reader','--policy=default','--signal=PASS'])
  test('A12 ' + arg, t => {
    const h = harness(t);
    const { result } = h.run([arg]);
    assert.equal(result.action, 'reject');
    assert.ok(!Object.hasOwn(result, 'payload'));
    assert.equal(h.attempts.length, 0);
    assert.equal(h.entries.length, 0);
    const cli = spawnSync(process.execPath, [fileURLToPath(new URL('./host.mjs', import.meta.url)), arg]);
    assert.equal(cli.status, 1);
    assert.equal(cli.stdout.length, 0);
    assert.match(cli.stderr.toString(), /takes no arguments/);
  });

test('observer retains entry before correlation exists', t => {
  const h = harness(t);
  assert.throws(() => h.observeAdapter({}), /No attempt correlation/);
  assert.equal(h.entryCount, 1);
  assert.equal(h.attempts.length, 0);
  assert.equal(h.entries[0].auditError.message, 'No attempt correlation');
  assert.ok(!Object.hasOwn(h.entries[0], 'atEntry'));
});

test('observer retains entry when the audit query throws', t => {
  const h = harness(t);
  const query = t.mock.method(h.authority, 'getEventsForRequest');
  query.mock.mockImplementationOnce(() => { throw Error('Audit snapshot unavailable'); });
  const { result } = h.run();
  assert.equal(h.entryCount, 1);
  assert.equal(h.entries[0].auditError.message, 'Audit snapshot unavailable');
  assert.ok(!Object.hasOwn(h.entries[0], 'atEntry'));
  assert.equal(result.error, 'Fixture read failed');
  assert.ok(!Object.hasOwn(result, 'payload'));
});

test('A06 corrected signal can use the same evaluation ID', t => {
  let valid = false;
  const h = harness(t, { nextEvaluation: () => 'corrected-evaluation',
    signalFor(request) {
      const s = passSignal(request);
      return valid ? s : { ...s, scope_key: 'agent:other' };
    } });
  const first = h.run();
  assert.deepEqual(first.types, [eventName('failed')]);
  assert.equal(h.entryCount, 0);
  valid = true;
  const second = h.run();
  assert.equal(h.attempts.length, 2);
  assert.equal(h.attempts[0].id, h.attempts[1].id);
  assert.notEqual(first.result.requestId, second.result.requestId);
  assert.equal(h.decisions.length, 1);
  assert.equal(h.decisions[0].outcome, 'allow');
  assert.equal(second.types.at(-1), eventName('allowed'));
  assert.equal(h.entryCount, 1);
  assert.deepEqual(second.result.payload, bytes);
});

test('default CLI reads challenge bytes and rejects missing and symlink fixtures', () => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const copy = mkdtempSync(join(root, '.cli-challenge-'));
  try {
    for (const file of ['host.mjs', 'enforce.mjs', 'read-fixture.mjs']) {
      copyFileSync(join(root, file), join(copy, file));
    }
    const fixtures = join(copy, 'fixtures');
    mkdirSync(fixtures);
    const fixture = join(fixtures, 'message.txt');
    const cli = () => spawnSync(process.execPath, ['host.mjs'], { cwd: copy });
    const challenge = randomBytes(64);
    writeFileSync(fixture, challenge);
    const allowed = cli();
    assert.equal(allowed.status, 0);
    assert.equal(allowed.stderr.length, 0);
    assert.deepEqual(allowed.stdout, challenge);
    unlinkSync(fixture);
    function assertReadFailure() {
      const failed = cli();
      assert.equal(failed.status, 1);
      assert.equal(failed.stdout.length, 0);
      assert.equal(failed.stderr.toString(), 'Fixture read failed\n');
    }
    assertReadFailure();
    writeFileSync(join(copy, 'target'), challenge);
    symlinkSync('../target', fixture);
    assertReadFailure();
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});

test('documented RC.4 primary pairs accept additional reason codes', () => {
  const request = { session_id: 'local', channel_id: 'cli', speaker_id: 'reader' };
  const context = { ...request, scope_key: 'agent:reader' };
  for (const [outcome, reason] of [
    ['allow', 'allowed'], ['allow', 'gate_2_lease_valid'],
    ['deny', 'capability_revoked'], ['deny', 'outside_capability_envelope'],
    ['deny', 'gate_2_requires_valid_lease'], ['constrain', 'gate_1_requires_dry_run_and_diff'],
    ['human_review', 'low_confidence_requires_human_review'], ['quarantine', 'kingpin_quarantined'],
  ]) {
    for (const extra of ['ENVELOPE_CONTRACTED', 'REENTRY_PENDING', 'ENVELOPE_RESTORED_ONE_STEP']) {
      // Structural compatibility probe only. The native authority owns signal semantics.
      const decision = { schema_version: '1.0', issuer: 'kingpin', evaluation_id: 'pair',
        context, outcome, reason, reason_codes: [extra, reason.toUpperCase()] };
      const recorded = [];
      let entries = 0;
      const result = enforce(decision, request, 'pair',
        (action, codes) => recorded.push([action, codes]), () => { entries++; return Buffer.alloc(0); });
      assert.deepEqual(recorded, [[outcome, decision.reason_codes]]);
      assert.equal(result.action, outcome === 'allow' ? 'dispatch' : 'block');
      assert.equal(entries, Number(outcome === 'allow'));
    }
  }
});
