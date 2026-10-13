#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config, projectId, projectRoot, readActivities } from './core.js';
import { captureHook, captureVisible } from './codex.js';
import { evidenceBundle, formatName, renderAutomatic, saveExit, saveManual } from './drafts.js';
import { initialize, install, uninstall } from './install.js';

const args = process.argv.slice(2);
function option(name: string): string | undefined { const index = args.indexOf(name); if (index < 0) return undefined; if (!args[index+1]) throw new Error(`Missing ${name} value`); return args[index+1]; }
function booleanOption(name: string): boolean | undefined {
  const value = option(name); if (value === undefined) return undefined;
  if (!['true', 'false'].includes(value)) throw new Error(`${name} must be true or false`);
  return value === 'true';
}
function input(): unknown { return JSON.parse(fs.readFileSync(option('--from') ?? 0, 'utf8')); }
function output(value: unknown): void { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }
try {
  const root = projectRoot(option('--project') ?? process.cwd());
  const command = args[0] ?? 'help';
  const changes = { ...(option('--timezone') ? { timezone: option('--timezone')! } : {}),
    ...(option('--language') ? { language: option('--language')! } : {}),
    ...(option('--output') ? { outputDirectory: option('--output')! } : {}) };
  switch (command) {
    case 'init': output(initialize(root, changes)); break;
    case 'install': output(install(root, args.includes('--hooks'), changes)); break;
    case 'enable': output(initialize(root, { ...changes, automaticCapture: true, automaticRecap: true })); break;
    case 'disable': output(initialize(root, { automaticCapture: false, automaticRecap: false })); break;
    case 'configure': output(initialize(root, { ...changes,
      ...(booleanOption('--capture') !== undefined ? { automaticCapture: booleanOption('--capture')! } : {}),
      ...(booleanOption('--exit-recap') !== undefined ? { automaticRecap: booleanOption('--exit-recap')! } : {}) })); break;
    case 'config': output({ project: root, projectId: projectId(root), storage: path.join(root, '.did-stuff'), config: config(root) }); break;
    case 'doctor': {
      let codex = 'Unavailable'; try { codex = execFileSync('codex', ['--version'], { encoding: 'utf8', timeout: 1500, stdio: ['ignore','pipe','ignore'] }).trim(); } catch {}
      const read = readActivities(root);
      output({ codex, testedHost: 'codex-cli 0.162.1 (macOS)', node: process.version, project: root, config: config(root),
        activityRecords: read.activities.length, invalidRecords: read.invalid, readLimited: read.limited,
        skillInstalled: fs.existsSync(path.join(root, '.agents/skills/did-stuff/SKILL.md')),
        hooksFile: fs.existsSync(path.join(root, '.codex/hooks.json')), hookTrust: 'Inspect /hooks inside Codex; this helper cannot grant or confirm trust.',
        diagnostics: path.join(root, '.did-stuff/diagnostics'), historyImport: 'Not implemented; no transcript parsing.' }); break;
    }
    case 'capture': output({ captured: captureHook(root, input()) }); break;
    case 'record': {
      initialize(root);
      const session = option('--session') ?? process.env.CODEX_THREAD_ID;
      if (!session) throw new Error('Pass --session with the actual current session identity');
      output({ captured: captureVisible(root, input(), session) }); break;
    }
    case 'evidence': output(evidenceBundle(root, formatName(option('--format') ?? 'recap'), option('--period') ?? 'today', option('--session') ?? process.env.CODEX_THREAD_ID)); break;
    case 'save': output(saveManual(root, input())); break;
    case 'render': process.stdout.write(renderAutomatic(root, option('--period') ?? 'today', option('--session') ?? process.env.CODEX_THREAD_ID).markdown); break;
    case 'exit': {
      const session = option('--session') ?? process.env.CODEX_THREAD_ID; if (!session) throw new Error('Pass --session');
      const start = performance.now(); output({ paths: saveExit(root, session), elapsedMs: performance.now() - start }); break;
    }
    case 'uninstall': output(uninstall(root)); break;
    case 'help': process.stdout.write(`Did Stuff v0.1.0 — You did stuff. Here’s what.\n\nLocal helpers (no model API):\n  install [--hooks] [--timezone Area/City] [--project PATH]\n  init | config | doctor | enable | disable | uninstall\n  configure [--capture true|false] [--exit-recap true|false]\n            [--timezone Area/City] [--language English] [--output .did-stuff/drafts]\n  evidence --format recap|standup|tweet --period today|yesterday|YYYY-MM-DD|session [--session ID]\n  record --session ID --from visible-note.json\n  save --from draft.json\n  render --period today (deterministic captured notes only)\n  capture --from hook.json | exit --session ID\n\nAgent-powered writing: invoke $did-stuff in Codex, not a terminal recap command.\n`); break;
    default: throw new Error('Unknown helper command; use did-stuff help');
  }
} catch (error) { process.stderr.write(`Did Stuff: ${(error as Error).message}\n`); process.exitCode = 1; }
