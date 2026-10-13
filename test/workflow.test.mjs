import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { initialize, install, uninstall } from '../dist/install.js';
import { captureHook } from '../dist/codex.js';
import { config, readActivities, redact, periodDate, localDate, atomicWrite, hash, withLock } from '../dist/core.js';
import { select, saveExit, saveManual, renderAutomatic } from '../dist/drafts.js';

function project(t, changes = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'did-stuff-test-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', dir]); initialize(dir, { timezone: 'Europe/Moscow', ...changes }); return dir;
}
const stop = (session = 's1', turn = 't1', message = 'Fixed the retry loop. Tests reported passing; deployment remains pending.') => ({
  cwd: '', session_id: session, turn_id: turn, hook_event_name: 'Stop', last_assistant_message: message
});
test('multiple sessions, duplicate delivery and duplicate reports preserve sources without duplicate displayed work', t => {
  const dir = project(t); const when = new Date('2026-10-13T10:00:00Z');
  assert.equal(captureHook(dir, stop(), when), true);
  assert.equal(captureHook(dir, stop(), new Date('2026-10-14T10:00:00Z')), false);
  captureHook(dir, stop('s2', 't2'), when);
  assert.equal(select(dir, '2026-10-13').activities.length, 2);
  assert.equal(select(dir, 'session', 's1').activities.length, 1);
  assert.equal(select(dir, '2026-10-14').activities.length, 0);
  const md = renderAutomatic(dir, '2026-10-13').markdown;
  assert.equal(md.split('Fixed the retry loop.').length - 1, 1);
  assert.match(md, /unverified/); assert.match(md, /deployment remains pending/);
});
test('resumed session crosses local midnight using activity timestamps and preserves corrections', t => {
  const dir = project(t);
  captureHook(dir, { ...stop(), activity_timestamp: '2026-10-12T20:59:59Z' }, new Date('2026-10-14T00:00:00Z'));
  captureHook(dir, { ...stop('s1','t2','Reverted the earlier retry change after a failing test.'), activity_timestamp: '2026-10-12T21:00:00Z' });
  assert.equal(select(dir, '2026-10-12').activities.length, 1);
  assert.match(select(dir, '2026-10-13').activities[0].description, /Reverted/);
  assert.equal(select(dir, 'session', 's1').activities.length, 2);
  assert.equal(periodDate('yesterday', 'Europe/Moscow', new Date('2026-10-12T22:00:00Z')), '2026-10-12');
  assert.equal(periodDate('yesterday', 'UTC', new Date('2026-10-12T12:00:00Z')), '2026-10-11');
  assert.equal(localDate('2026-11-01T08:30:00Z','America/Los_Angeles'), '2026-11-01');
  assert.throws(() => periodDate('2026-02-30','UTC'));
});
test('empty period saves an explicit useful result without importing current changes', t => {
  const dir = project(t);
  const draft = saveManual(dir, { format: 'standup', period: 'yesterday', content: 'invented', sourceIds: [] });
  assert.match(draft.markdown, /No captured activity found/); assert.doesNotMatch(draft.markdown, /invented/);
  assert.throws(() => select(dir, 'session'), /identity/);
});
test('missing, malformed, unknown and oversized hook inputs do not block the host', t => {
  const dir = project(t, { automaticCapture: true });
  for (const input of ['{', '{}', JSON.stringify({cwd:dir, session_id:'x',hook_event_name:'Stop',last_assistant_message:null}), 'x'.repeat(260000)]) {
    const out = execFileSync(process.execPath, ['dist/hook.js'], { input, encoding:'utf8', stdio:['pipe','pipe','ignore'] });
    assert.deepEqual(JSON.parse(out), {});
  }
  assert.equal(readActivities(dir).activities.length, 0);
});
test('failed and unfinished commands cannot become verified accomplishments', t => {
  const dir = project(t);
  const base = { session_id:'s',turn_id:'t',hook_event_name:'PostToolUse',tool_name:'Bash',tool_input:{command:'npm test'} };
  captureHook(dir, {...base,tool_response:{exit_code:1},tool_use_id:'failed'});
  captureHook(dir, {...base,tool_response:{session_id:17},tool_use_id:'running'});
  captureHook(dir, {...base,tool_response:{exit_code:0},tool_use_id:'ok'});
  const a = readActivities(dir).activities;
  assert.equal(a.length,2); assert.equal(a.find(x=>x.outcome==='failed').description,'Command exited with code 1: npm test');
  assert.equal(a.find(x=>x.outcome==='observed').description,'Command exited with code 0: npm test');
  assert.doesNotMatch(renderAutomatic(dir,'today').markdown,/All tests passed/);
});
test('raw stdout cannot spoof a verified exit status', t => {
  const dir=project(t);
  captureHook(dir,{session_id:'s',turn_id:'t',hook_event_name:'PostToolUse',tool_name:'Bash',tool_input:{command:'node --test'},tool_response:'Process exited with code 0\nnot ok 1 - failed test\n# fail 1'});
  const event=readActivities(dir).activities[0];assert.equal(event.outcome,'reported');
  assert.match(event.description,/exit status unavailable/);assert.match(event.description,/# fail 1/);
  assert.equal(captureHook(dir,{session_id:'s',turn_id:'t2',hook_event_name:'PostToolUse',tool_name:'Bash',tool_input:{command:'cat retry.test.mjs'},tool_response:'private test source'}),false);
});
test('own summaries and their associated tools are excluded', t => {
  const dir = project(t);
  captureHook(dir, {...stop(),hook_event_name:'UserPromptSubmit',prompt:'$did-stuff standup today'});
  assert.equal(captureHook(dir,stop()),false);
  assert.equal(captureHook(dir,{...stop(),hook_event_name:'PostToolUse',tool_name:'Bash',tool_input:{command:'git status'},tool_response:{exit_code:0}}),false);
  assert.equal(captureHook(dir,stop('s','t2','<!-- did-stuff:generated -->\nDid Stuff recap')),false);
  assert.equal(captureHook(dir,{...stop('s','t3'),hook_event_name:'UserPromptSubmit',prompt:'Use Did Stuff to summarize yesterday for standup'}),false);
  assert.equal(captureHook(dir,stop('s','t3')),false);
  assert.equal(readActivities(dir).activities.length,0);
});
test('redaction covers keys, assignments, bearer tokens, URLs and private keys before storage', t => {
  const dir = project(t);
  const secret = 'ghp_abcdefghijklmnop';
  const text = `${secret} api_key="secret123" password=secret456 Bearer token789 https://user:pass@example.test?a=1&token=secret000\n-----BEGIN RSA PRIVATE KEY-----\nprivate stuff\n-----END RSA PRIVATE KEY-----`;
  const safe = redact(text);
  for (const s of [secret,'secret123','secret456','token789','user:pass','secret000','private stuff']) assert.ok(!safe.includes(s));
  captureHook(dir,stop('s','t',text));
  const serialized = JSON.stringify(readActivities(dir).activities); assert.ok(!serialized.includes(secret));
});
test('concurrent processes deliver one immutable event and partial writes are ignored', async t => {
  const dir = project(t);
  const file = path.join(dir,'payload.json'); fs.writeFileSync(file,JSON.stringify(stop()));
  await Promise.all(Array.from({length:10},()=>new Promise((resolve,reject)=>{
    const child = spawn(process.execPath,['dist/cli.js','capture','--project',dir,'--from',file],{stdio:'ignore'});
    child.on('error',reject); child.on('exit',code=>code===0?resolve():reject(new Error('capture failed')));
  })));
  const activity = readActivities(dir).activities; assert.equal(activity.length,1);
  fs.writeFileSync(path.join(dir,'.did-stuff/activity/.tmp-interrupted'),'{bad');
  fs.writeFileSync(path.join(dir,'.did-stuff/activity',hash('malformed')+'.json'),'{bad');
  assert.equal(readActivities(dir).activities.length,1); assert.equal(readActivities(dir).invalid,1);
  const lock = path.join(dir,'.did-stuff/dead.lock'); fs.mkdirSync(lock); fs.writeFileSync(path.join(lock,'pid'),'99999999');
  assert.equal(withLock(dir,'dead',()=>123),123);
});
test('repeated and concurrent exits do not duplicate activity or overwrite edited auto drafts', async t => {
  const dir = project(t,{automaticCapture:true,automaticRecap:true}); captureHook(dir,stop());
  const first = saveExit(dir,'s1'); const original = fs.readFileSync(first[0],'utf8');
  const again = saveExit(dir,'s1'); assert.deepEqual(again,first); assert.equal(fs.readFileSync(first[0],'utf8'),original);
  await Promise.all(Array.from({length:4},()=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['dist/hook.js'],{stdio:['pipe','ignore','ignore']});
    child.stdin.end(JSON.stringify({cwd:dir,session_id:'s1',hook_event_name:'SessionEnd',reason:'other'}));
    child.on('exit',code=>code===0?resolve():reject(new Error('exit hook failed')));
  })));
  assert.equal(readActivities(dir).activities.length,1);
  fs.appendFileSync(first[0],'\nMy own edits\n');
  const snapshot=saveExit(dir,'s1')[0]; assert.notEqual(snapshot,first[0]);
  assert.match(fs.readFileSync(first[0],'utf8'),/My own edits/);
  assert.equal(saveExit(dir,'s1')[0],snapshot);
});
test('manual drafts are unique, source-bound, redacted and tweets have counts', t => {
  const dir = project(t); captureHook(dir,stop()); const id=readActivities(dir).activities[0].id;
  const input={format:'recap',period:'today',sourceIds:[id],content:'Reported retry fix; release pending.'};
  const a=saveManual(dir,input),b=saveManual(dir,input); assert.notEqual(a.path,b.path);
  assert.throws(()=>saveManual(dir,{...input,sourceIds:['foreign']}),/Source IDs/);
  const tw=saveManual(dir,{format:'tweet',period:'today',sourceIds:[id],posts:['Fixed a retry loop locally.','A small test can reveal duplicate retries.','Tracked down repeated requests.']});
  assert.equal(tw.markdown.match(/Characters:/g).length,3);
  assert.throws(()=>saveManual(dir,{format:'tweet',period:'today',sourceIds:[id],posts:['x'.repeat(281),'ok','ok']}),/280/);
});
test('installation, disable and removal preserve unrelated settings and edited drafts', t => {
  const dir=project(t); fs.mkdirSync(path.join(dir,'.codex')); const file=path.join(dir,'.codex/hooks.json');
  const unrelated={type:'command',command:'echo unrelated',timeout:1};
  fs.writeFileSync(file,JSON.stringify({description:'Keep me',hooks:{Stop:[{hooks:[unrelated]}]}}));
  fs.writeFileSync(path.join(dir,'.codex/config.toml'),'model = "keep-this"\n');
  const result=install(dir,true); assert.match(result.trust,/review and trust/);
  assert.equal(config(dir).automaticCapture,true);
  initialize(dir,{automaticCapture:false,automaticRecap:false});
  const out=execFileSync(process.execPath,['dist/hook.js'],{input:JSON.stringify({...stop(),cwd:dir}),encoding:'utf8'});
  assert.deepEqual(JSON.parse(out),{}); assert.equal(readActivities(dir).activities.length,0);
  const draft=saveManual(dir,{format:'recap',period:'today',sourceIds:[]});
  uninstall(dir);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)).hooks.Stop[0].hooks,[unrelated]);
  assert.equal(fs.readFileSync(path.join(dir,'.codex/config.toml'),'utf8'),'model = "keep-this"\n');
  assert.ok(fs.existsSync(draft.path)); assert.ok(!fs.existsSync(result.skill));
});
test('worktrees are separate projects and nested projects cannot collect parent evidence', t => {
  const dir=project(t); const nested=path.join(dir,'child');fs.mkdirSync(nested);execFileSync('git',['init','-q',nested]);initialize(nested);
  captureHook(dir,stop()); assert.equal(readActivities(nested).activities.length,0);
  const out=execFileSync(process.execPath,['dist/hook.js'],{input:JSON.stringify({...stop(),cwd:nested}),encoding:'utf8',env:{...process.env,DID_STUFF_PROJECT_ROOT:dir},stdio:['pipe','pipe','ignore']});
  assert.deepEqual(JSON.parse(out),{}); assert.equal(readActivities(dir).activities.length,1);
});
test('malformed foreign hook configuration is preserved without a partial skill installation', t => {
  const dir=project(t);fs.mkdirSync(path.join(dir,'.codex'));const file=path.join(dir,'.codex/hooks.json');
  const malformed='{"hooks":{"Stop":"unsupported"}}';fs.writeFileSync(file,malformed);
  assert.throws(()=>install(dir,true),/Unsupported/);
  assert.equal(fs.readFileSync(file,'utf8'),malformed);
  assert.ok(!fs.existsSync(path.join(dir,'.agents/skills/did-stuff')));
});
test('ordinary exit hook runs under one second including Node startup', t => {
  const dir=project(t,{automaticRecap:true}); for(let i=0;i<30;i++)captureHook(dir,stop('s'+i,'t'+i,'Reported completing task '+i));
  const start=performance.now();execFileSync(process.execPath,['dist/hook.js'],{input:JSON.stringify({cwd:dir,session_id:'s1',hook_event_name:'SessionEnd'}),stdio:['pipe','ignore','pipe']});
  const elapsed=performance.now()-start;assert.ok(elapsed<1000,`Exit took ${elapsed.toFixed(1)} ms`);
  console.log(`30-record exit hook, including process startup: ${elapsed.toFixed(1)} ms`);
});
