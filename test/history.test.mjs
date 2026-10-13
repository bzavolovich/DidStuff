import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { initialize } from '../dist/install.js';
import { captureHook } from '../dist/codex.js';
import { config, readActivities, MARKER } from '../dist/core.js';
import { select, saveManual } from '../dist/drafts.js';
import { syncHistory, readHistoryReport } from '../dist/history.js';

function project(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'did-stuff-history-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', dir]); initialize(dir, { timezone: 'Europe/Moscow' }); return dir;
}
const at = value => Date.parse(value) / 1000;
const turn = (id, text = 'Fixed the retry loop; release still pending.', start = '2026-10-13T10:00:00Z', end = '2026-10-13T10:01:00Z') => ({
  id, status: 'completed', startedAt: at(start), completedAt: at(end), items: [
    { id: id + '-u', type: 'userMessage', content: [{ type: 'text', text: 'Fix the retry loop' }] },
    { id: id + '-a', type: 'agentMessage', phase: 'final_answer', text }
  ]
});
const thread = (root, id = 's1', turns = [turn('t1')]) => ({ id, cwd: root, turns,
  createdAt: at('2026-10-12T10:00:00Z'), updatedAt: at('2026-10-14T10:00:00Z') });
function client(active, archived = [], extra = {}) {
  const calls = []; let closed = false;
  return { calls, get closed() { return closed; }, close() { closed = true; }, async request(method, params) {
    calls.push({ method, params });
    if (extra.request) { const result = await extra.request(method, params); if (result !== undefined) return result; }
    if (method === 'initialize') return {};
    if (method === 'thread/list') {
      const rows = params.archived ? archived : active; const index = Number(params.cursor ?? 0);
      return { data: rows.slice(index, index + 1).map(({ turns, ...meta }) => meta), nextCursor: index + 1 < rows.length ? String(index + 1) : null };
    }
    if (method === 'thread/read') {
      const row = [...active, ...archived].find(t => t.id === params.threadId);
      if (!row) throw new Error('not found');
      return { thread: params.includeTurns ? row : { ...row, turns: [] } };
    }
    throw new Error('Unexpected method: ' + method);
  } };
}

test('imports paginated active and archived project history, excludes other projects and is idempotent', async t => {
  const dir = project(t), foreign = project(t);
  const nested = path.join(dir, 'src'); fs.mkdirSync(nested);
  const nestedRepo = path.join(dir, 'nested'); fs.mkdirSync(nestedRepo); execFileSync('git', ['init', '-q', nestedRepo]);
  const active = [thread(foreign, 'foreign'), thread(dir), thread(nested, 's2'), thread(nestedRepo, 'nested-repo')];
  const archived = [thread(dir, 's3')];
  const c = client(active, archived); const first = await syncHistory(dir, '2026-10-13', undefined, c);
  assert.equal(first.status, 'complete'); assert.equal(first.imported, 6); assert.equal(first.threadsRead, 3); assert.ok(c.closed);
  assert.ok(!c.calls.some(call => call.method === 'thread/read' && ['foreign', 'nested-repo'].includes(call.params.threadId)));
  assert.ok(c.calls.every(call => ['initialize', 'thread/list', 'thread/read'].includes(call.method)));
  const second = await syncHistory(dir, '2026-10-13', undefined, client(active, archived));
  assert.equal(second.imported, 0); assert.equal(second.duplicates, 6); assert.equal(readActivities(dir).activities.length, 6);
  assert.equal(readHistoryReport(dir).status, 'complete');
  const saved = saveManual(dir, { format: 'recap', period: '2026-10-13', content: 'Reported retry fix; release pending.', sourceIds: select(dir, '2026-10-13').activities.map(a => a.id) });
  assert.match(saved.markdown, /Imported requests use turn start time/);
});

test('dates resumed sessions and midnight-spanning turns by original turn timestamps', async t => {
  const dir = project(t);
  const data = thread(dir, 's1', [turn('old', 'Earlier work', '2026-10-12T10:00:00Z', '2026-10-12T10:01:00Z'),
    turn('midnight', 'Later correction: retry remains broken', '2026-10-12T20:59:00Z', '2026-10-12T21:01:00Z')]);
  await syncHistory(dir, '2026-10-13', undefined, client([data]));
  let events = readActivities(dir).activities;
  assert.equal(events.length, 1); assert.equal(events[0].activityAt, '2026-10-12T21:01:00.000Z');
  assert.equal(events[0].timeBasis, 'turn'); assert.equal(events[0].outcome, 'reported');
  await syncHistory(dir, '2026-10-12', undefined, client([data]));
  assert.equal(select(dir, '2026-10-12').activities.length, 3);
  assert.equal(select(dir, '2026-10-13').activities.length, 1);
});

test('excludes generated summaries, hidden reasoning, active turns and forks; preserves failed outcomes and redacts', async t => {
  const dir = project(t);
  const failed = turn('failed', 'Reverted the change. password=secret-value'); failed.status = 'failed';
  failed.items.push({ type: 'reasoning', id: 'reasoning', content: ['PRIVATE REASONING'] },
    { type: 'agentMessage', id: 'comment', phase: 'commentary', text: 'I plan to deploy' },
    { type: 'commandExecution', id: 'cmd', cwd: dir, command: 'npm test', status: 'failed', exitCode: 1, aggregatedOutput: 'PASS EVERYTHING' },
    { type: 'commandExecution', id: 'unfinished', cwd: dir, command: 'npm run build', status: 'inProgress', exitCode: null });
  const summary = turn('summary', 'Recap complete'); summary.items[0].content[0].text = '$did-stuff:did-stuff recap today';
  const marked = turn('marked', MARKER + '\nSome generated text');
  const active = turn('active'); active.status = 'inProgress';
  const unknown = turn('unknown'); unknown.startedAt = null; unknown.completedAt = null;
  const fork = { ...thread(dir, 'fork'), forkedFromId: 's1' };
  const result = await syncHistory(dir, 'all', undefined, client([thread(dir, 's1', [failed, summary, marked, active, unknown]), fork]));
  const events = readActivities(dir).activities;
  assert.equal(events.length, 3); assert.equal(result.skippedUndated, 2); assert.equal(result.skippedForks, 1);
  assert.equal(events.find(a => a.kind === 'tool').outcome, 'failed');
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /PRIVATE REASONING|secret-value|PASS EVERYTHING|I plan to deploy|Some generated text/);
  assert.match(serialized, /REDACTED/); assert.match(serialized, /codex-history:s1\/turn:failed\/item:/);
});

test('development requests quoting skill usage are retained', async t => {
  const dir = project(t); const data = turn('development', 'Implemented Did Stuff recap storage in .did-stuff/drafts.');
  data.items[0].content[0].text = 'Implement history for Did Stuff. Examples should show `$did-stuff recap today`.';
  assert.equal((await syncHistory(dir, 'all', undefined, client([thread(dir, 's1', [data])]))).imported, 2);
});

test('history and hooks deduplicate in either order and import later appended turns', async t => {
  const dir = project(t); const data = thread(dir); const completion = data.turns[0].items[1].text;
  const payload = { hook_event_name: 'Stop', session_id: 's1', turn_id: 't1', last_assistant_message: completion };
  captureHook(dir, payload, new Date('2026-10-13T10:01:00Z'));
  const first = await syncHistory(dir, 'all', undefined, client([data]));
  assert.equal(first.duplicates, 1); assert.equal(first.imported, 1);
  data.turns.push(turn('t2', 'Correction: tests failed; fix is incomplete.'));
  assert.equal((await syncHistory(dir, 'all', undefined, client([data]))).imported, 2);
  assert.equal(captureHook(dir, { ...payload, turn_id: 't2', last_assistant_message: data.turns[1].items[1].text }), false);
  assert.equal(readActivities(dir).activities.length, 4);
});

test('session scope verifies project before reading turns, failures retain existing records', async t => {
  const dir = project(t), foreign = project(t);
  await syncHistory(dir, 'session', 's1', client([thread(dir)]));
  assert.equal(readActivities(dir).activities.length, 2);
  const c = client([thread(foreign, 'foreign')]);
  assert.equal((await syncHistory(dir, 'session', 'foreign', c)).status, 'unavailable');
  assert.ok(!c.calls.some(c => c.params.includeTurns === true));
  const broken = client([], [], { request() { throw new Error('Host unavailable'); } });
  assert.equal((await syncHistory(dir, 'all', undefined, broken)).status, 'unavailable');
  assert.ok(broken.closed); assert.equal(readActivities(dir).activities.length, 2);
  assert.match(select(dir, '2026-10-13').limitations.join('\n'), /Host unavailable/);
  await assert.rejects(syncHistory(dir, 'session'), /session identity/);
  await assert.rejects(syncHistory(dir, '2026-02-30'), /Use today/);
});

test('malformed pagination and unreadable threads produce partial coverage', async t => {
  const dir = project(t);
  const c = client([thread(dir)], [], { request(method, params) {
    if (method === 'thread/list') return { data: [thread(dir)], nextCursor: 'repeat' };
  } });
  assert.equal((await syncHistory(dir, 'all', undefined, c)).status, 'partial');
  const unreadable = client([thread(dir)], [], { request(method) { if (method === 'thread/read') throw new Error('missing'); } });
  const result = await syncHistory(dir, 'all', undefined, unreadable);
  assert.equal(result.status, 'partial'); assert.equal(result.skippedThreads, 1);
});

test('legacy config defaults history on, opt-out evidence never starts Codex', t => {
  const dir = project(t); const file = path.join(dir, '.did-stuff/config.json');
  const old = config(dir); delete old.historyImport; fs.writeFileSync(file, JSON.stringify(old));
  assert.equal(config(dir).historyImport, true);
  initialize(dir, { historyImport: false });
  const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
  fs.symlinkSync(execFileSync('which', ['git'], { encoding: 'utf8' }).trim(), path.join(bin, 'git'));
  const run = args => JSON.parse(execFileSync(process.execPath, ['dist/cli.js', 'evidence', '--project', dir, ...args], { encoding: 'utf8', env: { ...process.env, PATH: bin } }));
  assert.equal(run([]).history.status, 'disabled');
  initialize(dir, { historyImport: true });
  assert.equal(run(['--no-history']).history.status, 'disabled');
  const failed = run([]); assert.equal(failed.history.status, 'unavailable'); assert.equal(failed.activities.length, 0);
  assert.match(failed.limitations.join('\n'), /Cannot start codex/);
});

test('bundled evidence helper syncs through stdio, handles notifications and saves source-bound drafts', t => {
  const dir = project(t); const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
  const data = thread(dir); const calls = path.join(dir, 'calls.jsonl');
  fs.writeFileSync(path.join(bin, 'codex'), `#!${process.execPath}
const fs = require('node:fs');
const readline = require('node:readline');
const thread = ${JSON.stringify(data)};
readline.createInterface({input: process.stdin}).on('line', line => {
  const message = JSON.parse(line);
  fs.appendFileSync(${JSON.stringify(calls)}, line + '\\n');
  if (message.method === 'initialized') return;
  const result = message.method === 'initialize' ? {} : message.method === 'thread/list'
    ? {data: message.params.archived ? [] : [{...thread, turns: []}], nextCursor: null}
    : {thread};
  process.stdout.write(JSON.stringify({method:'unrelated/notification', params:{}}) + '\\n');
  const reply = JSON.stringify({id:message.id,result}) + '\\n';
  process.stdout.write(reply.slice(0, 5)); process.stdout.write(reply.slice(5));
});
`, { mode: 0o700 });
  const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH };
  const run = () => JSON.parse(execFileSync(process.execPath, ['skills/did-stuff/scripts/did-stuff.mjs', 'evidence', '--project', dir, '--period', '2026-10-13'], { encoding: 'utf8', env }));
  const first = run(); assert.equal(first.history.imported, 2); assert.equal(first.activities.length, 2);
  const again = run(); assert.equal(again.history.imported, 0); assert.equal(again.history.duplicates, 2);
  const methods = fs.readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line).method);
  assert.ok(methods.includes('initialized'));
  assert.ok(methods.every(method => ['initialize', 'initialized', 'thread/list', 'thread/read'].includes(method)));
  const input = path.join(dir, '.did-stuff/draft-input.json');
  fs.writeFileSync(input, JSON.stringify({ format: 'recap', period: first.period, sourceIds: first.activities.map(a => a.id), content: 'Reported fixing retry loop; release pending.' }));
  const saved = JSON.parse(execFileSync(process.execPath, ['skills/did-stuff/scripts/did-stuff.mjs', 'save', '--project', dir, '--from', input], { encoding: 'utf8' }));
  assert.ok(fs.existsSync(saved.path)); assert.match(saved.markdown, /codex-history:s1/);
});
