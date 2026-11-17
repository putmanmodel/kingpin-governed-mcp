import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { createHost } from './host.mjs';
import { selectProfile } from './profiles.mjs';

function observe(event) { process.stderr.write(JSON.stringify(event) + '\n'); }

export function present(result) {
  let body;
  if (result.action === 'dispatch' && Buffer.isBuffer(result.payload))
    body = { status: 'read', encoding: 'base64', bytes: result.payload.toString('base64') };
  else if (result.action === 'dispatch') body = { status: 'adapter_error' };
  else if (result.action === 'block') body = { status: 'refused', reason: result.reason };
  else body = { status: 'host_error' };
  if (result.requestId) body.requestId = result.requestId;
  return { structuredContent: body, content: [{ type: 'text', text: JSON.stringify(body) }], isError: body.status !== 'read' };
}

export async function invoke(host, signal, report = observe) {
  await new Promise(resolve => setImmediate(resolve));
  if (signal?.aborted) {
    report({ event: 'cancelled_before_dispatch' });
    return present({});
  }
  let result;
  try { result = host.run(); } catch { result = {}; }
  const reply = present(result);
  report({ event: 'result_prepared', requestId: result.requestId, status: reply.structuredContent.status });
  return reply;
}

if (import.meta.main) {
  try {
    const env = process.env;
    const host = createHost({
      signalFor: selectProfile(env.KINGPIN_PROFILE ?? 'normal'), observe,
      principalId: env.KINGPIN_PRINCIPAL ?? 'local-agent', agentId: env.KINGPIN_AGENT ?? 'reader',
      context: Object.freeze({ session_id: env.KINGPIN_SESSION ?? 'local', channel_id: env.KINGPIN_CHANNEL ?? 'cli',
        scene_id: null, task_id: null })
    });
    serveStdio(() => {
      const server = new McpServer({ name: 'kingpin-governed-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });
      server.registerTool('read_governed_fixture', { description: 'Read the fixed fixture under Kingpin governance.', inputSchema: z.strictObject({}) },
        (_, ctx) => invoke(host, ctx.mcpReq.signal));
      return server;
    }, { onerror: () => observe({ event: 'protocol_error' }) });
    process.once('exit', host.close);
  } catch { observe({ event: 'startup_failed' }); process.exitCode = 1; }
}
