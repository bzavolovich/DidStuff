import * as fs from 'node:fs';
import * as path from 'node:path';
import { excerpt, hash, MARKER, projectId, saveActivity, storage, atomicWrite, redact } from './core.js';
export function summaryRequest(text) {
    return /\$did-stuff\b|did[- ]stuff.*(?:recap|standup|tweet|summar|update)|(?:recap|standup|tweet|summar).*did[- ]stuff/i.test(text);
}
function suppressionFile(root, session, turn) {
    return path.join(storage(root), 'suppressed', hash(session + '\0' + turn) + '.json');
}
export function normalizeHook(root, input, now = new Date()) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('Malformed hook input');
    const p = input;
    if (typeof p.session_id !== 'string' || !p.session_id.trim() || p.session_id.length > 300)
        throw new Error('Missing session identity');
    const session = p.session_id;
    const turn = typeof p.turn_id === 'string' && p.turn_id.length <= 300 ? p.turn_id : undefined;
    let kind;
    let description;
    let outcome;
    let discriminator = '';
    if (p.hook_event_name === 'UserPromptSubmit') {
        if (typeof p.prompt !== 'string' || !p.prompt.trim())
            return null;
        if (summaryRequest(p.prompt)) {
            if (turn)
                atomicWrite(suppressionFile(root, session, turn), JSON.stringify({ excluded: true }), true);
            return null;
        }
        kind = 'request';
        description = excerpt(p.prompt, 2500);
        outcome = 'request';
    }
    else if (p.hook_event_name === 'Stop') {
        if (typeof p.last_assistant_message !== 'string' || !p.last_assistant_message.trim())
            return null;
        if (p.last_assistant_message.includes(MARKER) || /(?:\.did-stuff\/drafts|did-stuff draft|Did Stuff (?:recap|standup|tweet))/i.test(p.last_assistant_message))
            return null;
        if (turn && fs.existsSync(suppressionFile(root, session, turn)))
            return null;
        kind = 'assistant';
        description = excerpt(p.last_assistant_message);
        outcome = 'reported';
    }
    else if (p.hook_event_name === 'PostToolUse') {
        if (turn && fs.existsSync(suppressionFile(root, session, turn)))
            return null;
        if (p.tool_name !== 'Bash')
            return null;
        const args = p.tool_input;
        const command = args && typeof args.command === 'string' ? args.command : '';
        if (!command || /did-stuff|\.did-stuff|\/drafts\//i.test(command))
            return null;
        // The host does not promise a common tool-response schema. Only recognize explicit final exit codes.
        let code;
        const result = p.tool_response;
        if (result && typeof result === 'object') {
            const r = result;
            if (typeof r.exit_code === 'number' && Number.isInteger(r.exit_code))
                code = r.exit_code;
        }
        kind = 'tool';
        if (code === undefined) {
            // CLI 0.162.1 supplies raw stdout for Bash, without an exit status. Printed text is not an exit receipt.
            if (typeof result !== 'string' || !result.trim()
                || !/(?:^|[\s;&|])(?:node\s+--test|(?:npm|pnpm|yarn)\s+(?:run\s+)?test\b|(?:pytest|vitest|jest)\b|(?:cargo|swift)\s+test\b)/i.test(command))
                return null;
            outcome = 'reported';
            const safe = redact(result);
            const output = safe.length > 2200 ? safe.slice(0, 1300) + '\n[Middle omitted]\n' + safe.slice(-900) : safe;
            description = `Verification output (exit status unavailable) from ${excerpt(command, 500)}:\n${output}`;
        }
        else {
            outcome = code === 0 ? 'observed' : 'failed';
            description = `Command exited with code ${code}: ${excerpt(command, 1200)}`;
        }
        discriminator = typeof p.tool_use_id === 'string' ? p.tool_use_id : hash(command);
    }
    else
        return null;
    let activityAt = now.toISOString();
    let timeBasis = 'capture';
    // Optional adapter extension for supplied, timestamped visible context. Documented Stop payloads lack it.
    if (typeof p.activity_timestamp === 'string' && Number.isFinite(Date.parse(p.activity_timestamp))) {
        activityAt = new Date(p.activity_timestamp).toISOString();
        timeBasis = 'activity';
    }
    const id = hash([projectId(root), session, turn ?? 'no-turn', kind, discriminator, description].join('\0'));
    return { schemaVersion: 1, id, sourceAgent: 'codex', projectId: projectId(root), sessionId: session, turnId: turn,
        activityAt, capturedAt: now.toISOString(), timeBasis, kind, description, outcome,
        evidence: [`codex:${session}${turn ? '/turn:' + turn : ''}${discriminator ? '/tool:' + discriminator : ''}`] };
}
export function captureHook(root, input, now) {
    const event = normalizeHook(root, input, now);
    return event ? saveActivity(root, event) : false;
}
export function captureVisible(root, value, session) {
    const p = value;
    if (!p || typeof p.description !== 'string' || !p.description.trim())
        throw new Error('Provide a description of visible work');
    const event = normalizeHook(root, { hook_event_name: 'Stop', session_id: session, turn_id: p.turnId,
        last_assistant_message: p.description, activity_timestamp: p.activityAt });
    if (!event)
        return false;
    if (Array.isArray(p.references))
        event.evidence.push(...p.references.filter(r => typeof r === 'string').map(r => excerpt(r, 400)).slice(0, 12));
    // A manually entered assertion is reported, never upgraded to independent verification.
    return saveActivity(root, event);
}
