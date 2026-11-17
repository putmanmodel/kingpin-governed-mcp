import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdtempSync, copyFileSync, mkdirSync, writeFileSync, rmSync, unlinkSync, symlinkSync } from 'node:fs';
import { session, name, demonstrate } from './demo.mjs';
import { invoke } from './server.mjs';

const call = (client, args = {}, meta = {}) => client.callTool({ name, arguments: args, _meta: meta });
const events = log => log.trim() ? log.trim().split('\n').map(line => JSON.parse(line)) : [];
for (const [mode, version] of [['auto','2026-07-28'],['legacy','2025-11-25']])
  test(mode + ' negotiation and native outcomes', async () => {
    for (const profile of ['normal','lease-required']) assert.equal(await demonstrate(profile, mode), version);
  });

test('caller arguments and metadata cannot grant authority', async () => {
  await session('lease-required','auto', async (client, log) => {
    assert.deepEqual(events(log()), []);
    for (const key of ['path','token','principal_id','policy','signal','reviewer','lease','profile']) {
      const r = await call(client, { [key]: 'private-test-claim' });
      assert.equal(r.isError, true);
    }
    const r = await call(client, {}, { principal_id:'private-test-claim', profile:'normal', lease:'valid' });
    assert.equal(r.structuredContent.reason,'gate_2_requires_valid_lease');
    assert.equal(r.isError,true);
    assert.ok(!log().includes('private-test-claim'));
    assert.equal(events(log()).filter(e => e.event === 'enforced').length,1);
    assert.equal(events(log()).filter(e => e.event === 'adapter_entry').length,0);
  });
});

test('binary challenge, size boundary and failure after native allow', async t => {
  const dir = mkdtempSync(new URL('./.binary-',import.meta.url));
  t.after(() => rmSync(dir,{ recursive:true, force:true }));
  const root = new URL(dir + '/',import.meta.url);
  for (const file of ['host','enforce','read-fixture','server','profiles']) copyFileSync(new URL(file+'.mjs',import.meta.url),new URL(file+'.mjs',root));
  mkdirSync(new URL('fixtures',root));
  const fixture = new URL('fixtures/message.txt',root);
  const bytes = randomBytes(4096);
  await session('normal','auto', async (client,log) => {
    const ids = new Set();
    for (const effect of ['missing','symlink','oversize','binary','binary','empty']) {
      if (effect === 'symlink') symlinkSync('../server.mjs',fixture);
      if (effect === 'oversize') { unlinkSync(fixture); writeFileSync(fixture,Buffer.alloc(4097)); }
      if (effect === 'binary') writeFileSync(fixture,bytes);
      if (effect === 'empty') writeFileSync(fixture,'');
      const r = await call(client);
      const body = r.structuredContent;
      assert.deepEqual(JSON.parse(r.content[0].text), body);
      if (['empty','binary'].includes(effect)) {
        assert.equal(r.isError,false);
        assert.deepEqual(Buffer.from(body.bytes,'base64'),effect === 'empty' ? Buffer.alloc(0) : bytes);
      } else {
        assert.equal(body.status,'adapter_error'); assert.equal(r.isError,true); assert.ok(!('bytes' in body));
      }
      const trace = events(log()).filter(e => e.requestId === body.requestId);
      assert.deepEqual(trace.slice(0,2).map(e => e.event),['enforced','adapter_entry']);
      assert.equal(trace[0].outcome,'allow');
      for (const key of ['requestId','decisionId','evaluationId']) {
        assert.equal(trace[0][key], trace[1][key]); assert.ok(!ids.has(trace[0][key])); ids.add(trace[0][key]);
      }
    }
  },root);
});

test('cancellation before dispatch and after synchronous entry', async () => {
  for (const early of [true,false]) {
    const ac = new AbortController(); let entries = 0; const log = [];
    const result = invoke({ run() { entries++; ac.abort(); return { action:'dispatch',payload:Buffer.alloc(0) }; } },ac.signal,e => log.push(e));
    if (early) ac.abort();
    assert.equal((await result).structuredContent.status,early ? 'host_error' : 'read');
    assert.equal(entries,early ? 0 : 1);
    assert.equal(log[0].event,early ? 'cancelled_before_dispatch' : 'result_prepared');
  }
});

test('stdio launcher from workspace root, EOF and restart without replay', { timeout:10000 }, async () => {
  const config = (await import('./.mcp.json',{ with: { type:'json' } })).default.mcpServers.kingpin;
  for (const execute of [true,false]) {
    const child = spawn(config.command,config.args,{ cwd:new URL('.',import.meta.url),env:{ ...process.env,...config.env } });
    const closed = once(child,'close');
    let log = ''; child.stderr.on('data',c => { log += c; });
    const lines = createInterface({input:child.stdout})[Symbol.asyncIterator]();
    const send = msg => child.stdin.write(JSON.stringify({jsonrpc:'2.0',...msg})+'\n');
    const reply = async id => { const msg = JSON.parse((await lines.next()).value); assert.equal(msg.id,id); return msg.result; };
    send({id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'probe',version:'1'}}});
    assert.equal((await reply(1)).protocolVersion,'2025-11-25');
    send({method:'notifications/initialized'});
    send({id:2,method:'tools/list',params:{}});
    assert.equal((await reply(2)).tools.length,1);
    if (execute) {
      send({id:3,method:'tools/call',params:{name,arguments:{}}});
      assert.equal((await reply(3)).structuredContent.status,'read');
    }
    child.stdin.end();
    assert.deepEqual(await closed,[0,null]);
    assert.equal((await lines.next()).done,true);
    assert.equal(events(log).filter(e => e.event === 'adapter_entry').length,Number(execute));
  }
});

test('legacy wire cancellation in same stdin write stops before adapter', {timeout:10000}, async t => {
  const child = spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,KINGPIN_PROFILE:'normal'}});
  t.after(() => child.kill());
  const closed = once(child,'close');
  const lines = createInterface({input:child.stdout})[Symbol.asyncIterator]();
  let log = ''; child.stderr.on('data',chunk => { log += chunk; });
  const frame = msg => JSON.stringify({jsonrpc:'2.0',...msg}) + '\n';
  child.stdin.write(frame({id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'probe',version:'1'}}}));
  assert.equal(JSON.parse((await lines.next()).value).id,1);
  child.stdin.write([
    {method:'notifications/initialized'},
    {id:2,method:'tools/call',params:{name,arguments:{}}},
    {method:'notifications/cancelled',params:{requestId:2}},
    {id:3,method:'tools/list',params:{}}
  ].map(frame).join(''));
  assert.equal(JSON.parse((await lines.next()).value).id,3);
  child.stdin.end(); assert.deepEqual(await closed,[0,null]);
  assert.deepEqual(events(log).map(e => e.event),['cancelled_before_dispatch']);
});
