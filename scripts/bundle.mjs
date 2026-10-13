import { cpSync, mkdirSync, readdirSync, chmodSync, writeFileSync } from 'node:fs';
const target = 'skills/did-stuff/scripts/runtime';
mkdirSync(target, { recursive: true });
writeFileSync(target + '/package.json', '{"type":"module","private":true}\n');
for (const file of readdirSync('dist').filter(f => f.endsWith('.js'))) cpSync('dist/' + file, target + '/' + file);
chmodSync('dist/cli.js', 0o755);
chmodSync('dist/hook.js', 0o755);
