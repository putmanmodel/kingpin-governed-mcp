---
name: Independent reproduction
about: Report a successful, partial or failed independent reproduction of the developer preview.
title: "Reproduction: success / partial / blocked — environment"
---

Successful reproductions are welcome. Mark unfinished steps “not run” and remove
credentials, tokens, private paths and other private data from evidence. Reports
are public; do not attach complete environment dumps.

### Revision and environment

- Full commit SHA (`git rev-parse HEAD`):
- OS version / architecture:
- Node / npm versions:
- MCP client/editor and extension versions, or CLI only:
- Active configuration path / harness, if using an editor:
- How you found Kingpin (optional):

### Commands and deviations

Exact commands used, working directory, and any source, dependency, fixture or
configuration changes from the documented baseline:

### Results

- Overall: success / partial / blocked
- `npm test`: pass / fail / not run; counts and exit status:
- `npm run demo`: pass / fail / not run; exit status:
- `normal`: `status: read`, expected fixture bytes, `isError: false`? Observed:
- `lease-required`: `status: refused`, `reason: gate_2_requires_valid_lease`, no
  `bytes` field, `isError: true`? Observed:

The documented lease-required refusal is an expected result, even if the editor
labels the tool call failed. A startup failure or missing result is not that refusal.

### First blocking or confusing step

What did you expect, and what happened? Write “none” if the instructions worked.
Time to first result (optional):

### Sanitized evidence

Relevant test summary, error message or structured tool results; include request
IDs when available. State which command/profile produced each excerpt:

### Assistance

None / AI assistant / maintainer / other. What help or undocumented steps were
needed? Distinguish what you observed from what an assistant suggested.
