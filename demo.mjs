#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

export const name = 'read_governed_fixture';
export async function session(profile, mode, run, root = new URL('.', import.meta.url)) {
  const client = new Client({ name: 'fixture-check', version: '1' }, { versionNegotiation: { mode } });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('server.mjs', root))], env: { KINGPIN_PROFILE: profile }, stderr: 'pipe' });
  let log = '';
  transport.stderr.on('data', chunk => { log += chunk; });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(t => t.name), [name]);
    await run(client, () => log);
    return client.getNegotiatedProtocolVersion();
  } finally { await client.close(); }
}

export async function demonstrate(profile, mode) {
  return session(profile, mode, async client => {
    const result = await client.callTool({ name, arguments: {} });
    const body = result.structuredContent;
    if (profile === 'normal') {
      assert.equal(result.isError, false);
      assert.equal(body.status, 'read');
      assert.deepEqual(Buffer.from(body.bytes, 'base64'), readFileSync(new URL('./fixtures/message.txt', import.meta.url)));
    } else {
      assert.equal(result.isError, true);
      assert.equal(body.status, 'refused');
      assert.equal(body.reason, 'gate_2_requires_valid_lease');
      assert.ok(!Object.hasOwn(body, 'bytes'));
    }
    if (import.meta.main) console.log(JSON.stringify(body));
  });
}
if (import.meta.main) for (const profile of ['normal','lease-required']) await demonstrate(profile, 'auto');
