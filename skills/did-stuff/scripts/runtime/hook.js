#!/usr/bin/env node
import * as fs from 'node:fs';
import { config, diagnostic, projectRoot } from './core.js';
import { captureHook } from './codex.js';
import { saveExit } from './drafts.js';
let root;
try {
    // One bounded input. No transcript reads, subprocesses, network or model calls.
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
        bytes += chunk.length;
        if (bytes > 256_000)
            throw new Error('Input too large');
        chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!input || typeof input.cwd !== 'string' || typeof input.session_id !== 'string' || !input.session_id.trim())
        throw new Error('Missing hook fields');
    root = projectRoot(input.cwd);
    if (process.env.DID_STUFF_PROJECT_ROOT && root !== fs.realpathSync(process.env.DID_STUFF_PROJECT_ROOT))
        throw new Error('Project scope mismatch');
    if (fs.existsSync(root + '/.did-stuff/config.json')) {
        const c = config(root);
        if (input.hook_event_name === 'SessionEnd')
            saveExit(root, input.session_id);
        else if (c.automaticCapture)
            captureHook(root, input);
    }
}
catch {
    if (root)
        diagnostic(root, 'hook-input-or-storage-failure');
    // Failure is advisory and never requests continuation or changes conversation control.
    process.stderr.write('Did Stuff: capture/recap skipped; saved activity retained. Run did-stuff doctor.\n');
}
process.stdout.write('{}\n');
