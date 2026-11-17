const primaryReasons = new Map([
  ['allow', ['allowed', 'gate_2_lease_valid']],
  ['deny', ['capability_revoked', 'outside_capability_envelope', 'gate_2_requires_valid_lease']],
  ['constrain', ['gate_1_requires_dry_run_and_diff']],
  ['human_review', ['low_confidence_requires_human_review']],
  ['quarantine', ['kingpin_quarantined']],
]);

// Trusted, synchronous call site only. Structural checks cannot authenticate a decision.
export function enforce(decision, request, evaluationId, record, adapter) {
  const ctx = decision?.context;
  const bound = decision?.schema_version === '1.0' && decision.issuer === 'kingpin' &&
    decision.evaluation_id === evaluationId && ctx?.speaker_id === request.speaker_id &&
    ctx.channel_id === request.channel_id && ctx.session_id === request.session_id &&
    ctx.scope_key === 'agent:' + request.speaker_id && primaryReasons.get(decision.outcome)?.includes(decision.reason) &&
    typeof decision.reason === 'string' && Array.isArray(decision.reason_codes) &&
    decision.reason_codes.includes(decision.reason.toUpperCase());
  if (!bound) {
    try { record('failed', ['INVALID_DECISION']); } catch { /* Still blocked. */ }
    return { action: 'error', error: 'Invalid authority decision' };
  }
  try {
    record(decision.outcome, decision.reason_codes);
  } catch {
    return { action: 'error', error: 'Enforcement recording failed' };
  }
  if (decision.outcome !== 'allow') return { action: 'block', reason: decision.reason };
  try {
    const payload = adapter(request);
    if (!Buffer.isBuffer(payload)) throw Error('Invalid adapter result');
    return { action: 'dispatch', payload };
  } catch {
    return { action: 'dispatch', error: 'Fixture read failed' };
  }
}
