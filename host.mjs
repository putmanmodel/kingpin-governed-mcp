import { randomBytes, randomUUID } from 'node:crypto';
import { KingpinAuthority, MemoryStateStore } from 'kingpin-runtime';
import { AccessError, createAuthentication } from 'kingpin-runtime/auth';
import { enforce } from './enforce.mjs';
import { readFixture } from './read-fixture.mjs';

const defaultContext = Object.freeze({ session_id: 'local', channel_id: 'cli', scene_id: null, task_id: null });

export function passSignal(request) {
  return { schema_version: '1.0', scope_key: 'agent:' + request.speaker_id, gate: 0,
    gate_label: 'PASS', evidence_requirements: [], authority: { requirement: 'none', recommendation: 'none' },
    reason_codes: ['DEVIATION_INACTIVE'], deviation: { active: false, enter: false, exit: false,
      severity: 0, ema_severity: 0, confidence: 1, vector: {} } };
}

// Construction dependencies belong to the embedding host. run() accepts only CLI arguments.
export function createHost({ signalFor = passSignal, adapter = readFixture, nextEvaluation = randomUUID,
  makeAuthority = options => new KingpinAuthority(options), authenticateHeader = token => 'Bearer ' + token,
  observe = () => {}, principalId = 'local-agent', agentId = 'reader', context = defaultContext, channel = context.channel_id } = {}) {
  const token = randomBytes(32).toString('base64url');
  const auth = createAuthentication({ schema_version: '1.0', principals: [{ principal_id: principalId,
    role: 'agent', agent_id: agentId, token, allowed_contexts: [context] }] });
  const store = new MemoryStateStore();
  let authority;
  try { authority = makeAuthority({ store }); } catch (error) { store.close(); throw error; }

  function run(args = []) {
    if (!Array.isArray(args) || args.length) return { action: 'reject', error: 'This command takes no arguments' };
    const audit = { request_id: randomUUID(), decision_id: randomUUID(), redact: auth.redact };
    let request;
    try {
      const principal = auth.authenticate(authenticateHeader(token));
      audit.principal_id = principal.principal_id;
      request = Object.freeze({ ...context, channel_id: channel, speaker_id: principal.agent_id,
        tool: 'fs.read', args: Object.freeze({ fixture: 'message-v1' }) });
      auth.authorize(principal, 'runtime.evaluate', request);
    } catch (error) {
      if (!(error instanceof AccessError) || ![401, 403].includes(error.status)) throw error;
      const reason = error.status === 401 ? 'AUTHENTICATION_REQUIRED' : 'FORBIDDEN';
      authority.recordAuthenticationRejection(audit, reason);
      return { action: 'reject', error: 'Access rejected', requestId: audit.request_id };
    }
    const evaluationId = nextEvaluation();
    const ids = { requestId: audit.request_id, decisionId: audit.decision_id, evaluationId };
    const record = (outcome, reason_codes) => {
      authority.recordEnforcement(request, audit,
      { outcome, reason_codes, evaluation_id: evaluationId });
      observe({ ...ids, event: "enforced", outcome });
    };
    let decision;
    try {
      decision = authority.decide(signalFor(request), request, evaluationId, audit);
    } catch {
      try { record('failed', ['EVALUATION_FAILED']); } catch { /* Still blocked. */ }
      return { action: 'error', error: 'Evaluation failed', requestId: audit.request_id };
    }
    const result = enforce(decision, request, evaluationId, record, req =>
      adapter(req, () => observe({ ...ids, event: 'adapter_entry' })));
    return { ...result, ...ids };
  }
  return { run, close: () => store.close() };
}

if (import.meta.main) {
  let host;
  try {
    host = createHost();
    const result = host.run(process.argv.slice(2));
    if (result.payload) process.stdout.write(result.payload);
    else {
      console.error(result.error ?? result.reason);
      process.exitCode = 1;
    }
  } catch {
    console.error('Consumer failed');
    process.exitCode = 1;
  } finally {
    host?.close();
  }
}
