import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(process.argv[2] ?? '.');
mkdirSync(root + '/.agents/plugins', { recursive: true });
writeFileSync(root + '/.agents/plugins/marketplace.json', JSON.stringify({
  name: 'did-stuff-local', interface: { displayName: 'Did Stuff' },
  plugins: [{ name: 'did-stuff', source: { source: 'local', path: './' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }]
}, null, 2) + '\n');
