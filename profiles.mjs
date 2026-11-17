import { passSignal } from './host.mjs';

export function selectProfile(name) {
  if (name === 'normal') return passSignal;
  if (name !== 'lease-required') throw Error('Unknown launcher profile');
  return request => {
    const s = passSignal(request);
    return { ...s, gate: 2, gate_label: 'LEASE REQUIRED',
      authority: { requirement: 'lease', recommendation: 'request_external_lease' },
      reason_codes: ['LEASE_THRESHOLD_REACHED'],
      deviation: { ...s.deviation, active: true, severity: 0.5, ema_severity: 0.5 } };
  };
}
