#!/usr/bin/env node
/**
 * Spustí server ako podproces a prejde reálnym MCP handshake.
 * Bez siete — testuje protokol, nie e-shop.
 */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const HERE = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [resolve(HERE, 'index.mjs')], {
  stdio: ['pipe', 'pipe', 'pipe'],
});
child.stderr.on('data', (d) => process.stderr.write(`  [server] ${d}`));

const pending = new Map();
createInterface({ input: child.stdout }).on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  const r = pending.get(msg.id);
  if (r) {
    pending.delete(msg.id);
    r(msg);
  }
});

let id = 0;
const call = (method, params) =>
  new Promise((res, rej) => {
    const myId = ++id;
    pending.set(myId, res);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
    setTimeout(() => rej(new Error(`timeout na ${method}`)), 10000);
  });

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('SEO ACE MCP selftest\n');

const init = await call('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'selftest', version: '1.0.0' },
});
check('initialize odpovedá', !!init.result, init.result?.serverInfo?.name);
check('protokolová verzia', init.result?.protocolVersion === '2025-06-18', init.result?.protocolVersion);
check('server má instructions', !!init.result?.instructions);

child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const pong = await call('ping', {});
check('ping', !!pong.result);

const list = await call('tools/list', {});
const names = (list.result?.tools ?? []).map((t) => t.name);
check('tools/list vracia nástroje', names.length >= 11, `${names.length}: ${names.join(', ')}`);
check(
  'každý nástroj má popis a schému',
  (list.result?.tools ?? []).every((t) => t.description && t.inputSchema?.type === 'object')
);

const bad = await call('tools/call', { name: 'neexistuje', arguments: {} });
check('neznámy nástroj vracia isError, nie crash', bad.result?.isError === true);

const readEmpty = await call('tools/call', {
  name: 'read_batch_data',
  arguments: { date: '1999-01-01' },
});
check('read_batch_data zvládne prázdny dátum', !readEmpty.result?.isError);

const qEmpty = await call('tools/call', { name: 'queue_process', arguments: {} });
const qText = qEmpty.result?.content?.[0]?.text ?? '';
check('queue_process na prázdnom fronte nekončí chybou', !qEmpty.result?.isError && qText.includes('processed'));

const qReject = await call('tools/call', {
  name: 'queue_add',
  arguments: { urls: ['https://www.google.com/', '/77-zlate-nausnice'] },
});
const qrText = qReject.result?.content?.[0]?.text ?? '';
const qr = (() => { try { return JSON.parse(qrText); } catch { return {}; } })();
check('queue_add odmietne cudziu doménu a prijme vlastnú', qr.added === 1 && qr.rejected?.length === 1,
  `pridané ${qr.added}, odmietnuté ${qr.rejected?.length}`);

const gscStatus = await call('tools/call', { name: 'gsc_status', arguments: {} });
const gscText = gscStatus.result?.content?.[0]?.text ?? '';
check('gsc_status odpovedá bez tokenu', gscText.includes('authorized'), gscText.slice(0, 60).replace(/\s+/g, ' '));

child.stdin.end();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} testov prešlo.`);
process.exit(failed.length ? 1 : 0);
