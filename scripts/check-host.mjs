// Read-only compatibility probe; no thread creation, model request or hook trust changes.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
const child = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'ignore'] });
const send = value => child.stdin.write(JSON.stringify(value) + '\n');
const timer = setTimeout(() => { child.kill(); console.error('Host discovery timed out'); process.exitCode = 1; }, 15000);
const lines = createInterface({ input: child.stdout });
lines.on('line', line => {
  const msg = JSON.parse(line);
  if (msg.id === 0) {
    send({ method: 'initialized', params: {} });
    send({ method: 'skills/list', id: 1, params: { cwds: [process.cwd()], forceReload: true } });
    send({ method: 'hooks/list', id: 2, params: { cwds: [process.cwd()] } });
  }
  if (msg.id === 1 || msg.id === 2) {
    // Only this plugin's metadata; never print other skills or session content.
    const data = JSON.stringify(msg);
    if (msg.id === 1) {
      const rows = msg.result?.data ?? [];
      console.log(JSON.stringify({ method: 'skills/list', skills: rows.flatMap(r => r.skills ?? []).filter(s => s.name.includes('did-stuff')), error: msg.error }, null, 2));
    } else console.log(JSON.stringify({ method: 'hooks/list', discoveredDidStuff: data.includes('did-stuff'), error: msg.error }, null, 2));
    received++;
    if (received === 2) { clearTimeout(timer); child.stdin.end(); lines.close(); }
  }
});
let received = 0;
send({ method: 'initialize', id: 0, params: { clientInfo: { name: 'did_stuff_check', title: 'Did Stuff compatibility check', version: '0.1.0' } } });
