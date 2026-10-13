import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite, config, Config, ensureIgnored, hash, jsonRead, storage, validateConfig, withLock } from './core.js';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quote = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";
type Handler = { type: string; command: string; timeout: number; statusMessage: string };
type HookFile = { hooks?: Record<string, { matcher?: string; hooks: unknown[] }[]>; [key: string]: unknown };
export function initialize(root: string, changes: Partial<Config> = {}): Config {
  const result = withLock(root, 'config', () => {
    ensureIgnored(root); const c = validateConfig({ ...config(root), ...changes });
    atomicWrite(path.join(storage(root), 'config.json'), JSON.stringify(c, null, 2) + '\n'); return c;
  });
  if (!result) throw new Error('Configuration busy; retry');
  return result;
}
function treeHashes(dir: string, prefix = ''): Record<string,string> {
  const result: Record<string,string> = {};
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name); const rel = prefix + name;
    const stat = fs.lstatSync(full); if (stat.isSymbolicLink()) throw new Error('Refusing symlinked integration files');
    if (stat.isDirectory()) Object.assign(result, treeHashes(full, rel + '/'));
    else result[rel] = hash(fs.readFileSync(full, 'utf8'));
  }
  return result;
}
export function install(root: string, hooks: boolean, changes: Partial<Config> = {}) {
  initialize(root, changes);
  const result = withLock(root, 'installation', () => {
    const skill = path.join(root, '.agents/skills/did-stuff');
    const manifestFile = path.join(storage(root), 'integration.json');
    const previous = fs.existsSync(manifestFile) ? jsonRead(manifestFile) as { skill?: string; hashes?: Record<string,string>; handlers?: Handler[] } : undefined;
    if (fs.existsSync(skill)) {
      if (previous?.skill !== skill || JSON.stringify(treeHashes(skill)) !== JSON.stringify(previous.hashes)) throw new Error('Existing or edited skill preserved; remove or rename it explicitly before reinstalling');
    }
    const handlers: Handler[] = [];
    const hookFile = path.join(root, '.codex/hooks.json');
    let hookData: HookFile | undefined;
    if (hooks) {
      const data = fs.existsSync(hookFile) ? jsonRead(hookFile) as HookFile : { hooks: {} };
      if (!data || typeof data !== 'object' || Array.isArray(data) || (data.hooks && (typeof data.hooks !== 'object' || Array.isArray(data.hooks)))) throw new Error('Unsupported hooks.json; preserved without edits');
      data.hooks ??= {};
      for (const event of ['UserPromptSubmit', 'PostToolUse', 'Stop', 'SessionEnd']) {
        const handler: Handler = { type: 'command',
          command: `DID_STUFF_PROJECT_ROOT=${quote(root)} ${quote(process.execPath)} ${quote(path.join(skill, 'scripts/runtime/hook.js'))}`,
          timeout: event === 'SessionEnd' ? 1 : 3, statusMessage: 'Did Stuff' };
        const groups = data.hooks[event] ?? [];
        if (!Array.isArray(groups) || groups.some(g => !g || !Array.isArray(g.hooks))) throw new Error('Unsupported hook groups; preserved without edits');
        if (!groups.some(g => g.hooks.some(h => JSON.stringify(h) === JSON.stringify(handler))))
          groups.push({ ...(event === 'PostToolUse' ? { matcher: '^Bash$' } : {}), hooks: [handler] });
        data.hooks[event] = groups; handlers.push(handler);
      }
      hookData = data;
    }
    // Validate all foreign configuration before replacing any owned integration files.
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    const staged = skill + '.installing';
    if (fs.existsSync(staged)) throw new Error('Interrupted install staging directory preserved; inspect and remove it before retrying');
    fs.cpSync(path.join(packageRoot, 'skills/did-stuff'), staged, { recursive: true });
    if (fs.existsSync(skill)) fs.rmSync(skill, { recursive: true });
    fs.renameSync(staged, skill);
    if (hookData) atomicWrite(hookFile, JSON.stringify(hookData, null, 2) + '\n');
    // Retain earlier owned entries if reinstalling in manual mode.
    atomicWrite(manifestFile, JSON.stringify({ schemaVersion: 1, skill, hashes: treeHashes(skill), handlers: handlers.length ? handlers : previous?.handlers ?? [] }, null, 2) + '\n');
    return { skill, hookFile: hooks ? hookFile : undefined,
      trust: hooks ? 'Restart Codex, trust this project if prompted, then use /hooks to review and trust each Did Stuff hook. Installation never grants hook trust.' : 'Manual mode; no hooks installed.' };
  });
  if (!result) throw new Error('Installation busy; retry');
  if (hooks) initialize(root, { automaticCapture: true, automaticRecap: true });
  return result;
}
export function uninstall(root: string) {
  initialize(root, { automaticCapture: false, automaticRecap: false });
  const manifestFile = path.join(storage(root), 'integration.json');
  if (!fs.existsSync(manifestFile)) return { removed: false, retained: 'Saved activity and drafts retained; no owned integration found.' };
  const result = withLock(root, 'installation', () => {
    const manifest = jsonRead(manifestFile) as { skill: string; hashes: Record<string,string>; handlers: Handler[] };
    const hookFile = path.join(root, '.codex/hooks.json');
    if (fs.existsSync(hookFile)) {
      const data = jsonRead(hookFile) as HookFile;
      for (const event of Object.keys(data.hooks ?? {})) {
        data.hooks![event] = data.hooks![event]!.map(group => ({ ...group,
          hooks: group.hooks.filter(h => !manifest.handlers.some(owned => JSON.stringify(h) === JSON.stringify(owned))) })).filter(g => g.hooks.length);
        if (!data.hooks![event]!.length) delete data.hooks![event];
      }
      atomicWrite(hookFile, JSON.stringify(data, null, 2) + '\n');
    }
    let skillRemoved = false;
    if (manifest.skill === path.join(root, '.agents/skills/did-stuff') && fs.existsSync(manifest.skill)
      && JSON.stringify(treeHashes(manifest.skill)) === JSON.stringify(manifest.hashes)) {
      fs.rmSync(manifest.skill, { recursive: true }); skillRemoved = true;
    }
    return { removed: true, skillRemoved, retained: 'Saved activity, drafts, Git ignore rule, unrelated configuration and edited skill files retained.' };
  });
  if (!result) throw new Error('Installation busy; retry');
  return result;
}
