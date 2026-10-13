import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { atomicWrite, config, excerpt, hash, localDate, periodDate, projectRoot, readActivities, requireIgnored, saveActivity, storage } from './core.js';
import { generatedSummary, normalizeHook, summaryRequest } from './codex.js';
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const timestamp = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return undefined;
    const date = new Date(value * 1000);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
};
export class CodexHistoryClient {
    child;
    pending = new Map();
    nextId = 0;
    buffer = '';
    failure;
    constructor(cwd) {
        this.child = spawn('codex', ['app-server', '--listen', 'stdio://'], { cwd, stdio: 'pipe' });
        this.child.stdout.setEncoding('utf8');
        this.child.stdout.on('data', (chunk) => {
            this.buffer += chunk;
            if (Buffer.byteLength(this.buffer) > 32 * 1024 * 1024) {
                this.fail(new Error('Codex history response exceeds 32 MiB'));
                return;
            }
            let end;
            while ((end = this.buffer.indexOf('\n')) >= 0) {
                const line = this.buffer.slice(0, end);
                this.buffer = this.buffer.slice(end + 1);
                if (!line.trim())
                    continue;
                try {
                    const message = object(JSON.parse(line));
                    if (typeof message.method === 'string' && message.id !== undefined) {
                        // A history reader cannot authorize server-initiated actions.
                        this.child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Read-only history client' } }) + '\n');
                        continue;
                    }
                    if (typeof message.id !== 'number')
                        continue;
                    const pending = this.pending.get(message.id);
                    if (!pending)
                        continue;
                    clearTimeout(pending.timer);
                    this.pending.delete(message.id);
                    if (message.error)
                        pending.reject(new Error('Codex rejected the history request; check host compatibility and permissions'));
                    else
                        pending.resolve(message.result);
                }
                catch {
                    this.fail(new Error('Unsupported Codex history response'));
                }
            }
        });
        // Drain diagnostics without persisting arbitrary host configuration or private text.
        this.child.stderr.resume();
        this.child.on('error', () => this.fail(new Error('Cannot start codex app-server; install Codex CLI and check PATH')));
        this.child.on('exit', () => this.fail(new Error('Codex history reader exited before completing the request')));
        this.child.stdin.on('error', () => this.fail(new Error('Codex history connection closed')));
    }
    fail(error) {
        this.failure ??= error;
        for (const p of this.pending.values()) {
            clearTimeout(p.timer);
            p.reject(error);
        }
        this.pending.clear();
        this.child.kill();
    }
    request(method, params) {
        if (this.failure)
            return Promise.reject(this.failure);
        if (!['initialize', 'thread/list', 'thread/read'].includes(method))
            return Promise.reject(new Error('Only history reads are allowed'));
        return new Promise((resolve, reject) => {
            const id = ++this.nextId;
            const timer = setTimeout(() => this.fail(new Error('Codex history request timed out; check app-server permissions')), 15000);
            this.pending.set(id, { resolve, reject, timer });
            this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
        });
    }
    initialized() { this.child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n'); }
    close() { this.child.stdin.end(); this.fail(new Error('Codex history reader closed')); }
}
function sameProject(root, cwd) {
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd))
        return false;
    try {
        return projectRoot(cwd) === root;
    }
    catch {
        return false;
    }
}
function userText(item) {
    return Array.isArray(item.content) ? item.content.map(object)
        .filter(part => part.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n') : '';
}
// Hook-compatible IDs let historical messages deduplicate against existing captures.
// Within a turn, the host supplies start/end timestamps, not per-item timestamps.
export function historyActivities(root, value, report, now = new Date()) {
    const thread = object(value);
    if (typeof thread.id !== 'string' || !thread.id || !sameProject(root, thread.cwd))
        return [];
    // Forks contain copied parent history. Importing it as fresh work would double-count it.
    if (thread.forkedFromId) {
        report.skippedForks++;
        return [];
    }
    if (!Array.isArray(thread.turns))
        throw new Error('Codex did not return stored turns');
    const events = [];
    const timezone = config(root).timezone;
    for (const raw of thread.turns) {
        const turn = object(raw);
        if (typeof turn.id !== 'string' || !turn.id || !Array.isArray(turn.items))
            continue;
        // In-progress turns can still change (including summary markers). Pick them up next sync.
        if (!['completed', 'failed', 'interrupted'].includes(String(turn.status)))
            continue;
        const items = turn.items.map(object);
        if (items.some(i => i.type === 'userMessage' && summaryRequest(userText(i)))
            || items.some(i => i.type === 'agentMessage' && typeof i.text === 'string' && generatedSummary(i.text)))
            continue;
        const started = timestamp(turn.startedAt);
        const completed = timestamp(turn.completedAt);
        for (const item of items) {
            if (typeof item.id !== 'string' || !item.id)
                continue;
            let payload;
            let at;
            if (item.type === 'userMessage') {
                const text = userText(item);
                if (!text.trim())
                    continue;
                payload = { hook_event_name: 'UserPromptSubmit', prompt: text };
                at = started;
            }
            else if (item.type === 'agentMessage' && typeof item.text === 'string'
                && (item.phase === 'final_answer' || item.phase == null)) {
                if (!item.text.trim())
                    continue;
                payload = { hook_event_name: 'Stop', last_assistant_message: item.text };
                at = completed;
            }
            else if (item.type === 'commandExecution' && typeof item.command === 'string'
                && ['completed', 'failed'].includes(String(item.status)) && Number.isInteger(item.exitCode)
                && sameProject(root, item.cwd)) {
                payload = { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: item.id,
                    tool_input: { command: item.command }, tool_response: { exit_code: item.exitCode } };
                at = completed;
            }
            else
                continue; // In particular: no reasoning, system instructions, raw tool output or attachments.
            if (!at) {
                report.skippedUndated++;
                continue;
            }
            if (report.period !== 'all' && report.period !== 'session' && localDate(at, timezone) !== report.period)
                continue;
            const event = normalizeHook(root, { ...payload, session_id: thread.id, turn_id: turn.id, activity_timestamp: at }, now);
            if (!event)
                continue;
            event.origin = 'history';
            event.timeBasis = 'turn';
            event.evidence.push(`codex-history:${thread.id}/turn:${turn.id}/item:${item.id}`);
            events.push(event);
        }
    }
    return events;
}
export function readHistoryReport(root) {
    try {
        const r = JSON.parse(fs.readFileSync(path.join(root, '.did-stuff/history/latest.json'), 'utf8'));
        return r.schemaVersion === 1 && typeof r.period === 'string' && Array.isArray(r.limitations)
            && r.limitations.every((l) => typeof l === 'string') ? r : undefined;
    }
    catch {
        return undefined;
    }
}
export async function syncHistory(root, period, session, client) {
    root = fs.realpathSync(root);
    const c = config(root);
    const resolved = period === 'all' || period === 'session' ? period : periodDate(period, c.timezone);
    if (resolved === 'session' && !session)
        throw new Error('Current session identity unavailable. Pass --session or use a date period.');
    requireIgnored(root);
    const report = { schemaVersion: 1, period: resolved, ...(resolved === 'session' ? { sessionId: session } : {}),
        syncedAt: new Date().toISOString(), status: 'complete', threadsRead: 0, imported: 0, duplicates: 0,
        skippedUndated: 0, skippedForks: 0, skippedThreads: 0, limitations: [] };
    const existing = readActivities(root).activities;
    const ids = new Set(existing.map(a => a.id));
    // Older hook hosts omit turn IDs. Match only within the same dated session in that case.
    const withoutTurn = new Set(existing.filter(a => !a.turnId).map(a => hash([a.sessionId, a.kind, a.description, localDate(a.activityAt, c.timezone)].join('\0'))));
    let connection = client;
    const seen = new Set();
    const deadline = performance.now() + 45000;
    try {
        connection ??= new CodexHistoryClient(root);
        await connection.request('initialize', { clientInfo: { name: 'did_stuff_history', title: 'Did Stuff history', version: '0.1.0' } });
        if (connection instanceof CodexHistoryClient)
            connection.initialized();
        const read = async (id) => {
            if (seen.has(id))
                return;
            seen.add(id);
            if (performance.now() > deadline)
                throw new Error('History sync time budget reached; narrow the period or use session scope');
            let thread;
            try {
                thread = object(await connection.request('thread/read', { threadId: id, includeTurns: true })).thread;
            }
            catch {
                report.skippedThreads++;
                report.status = 'partial';
                return;
            }
            const data = object(thread);
            if (data.id !== id || !sameProject(root, data.cwd)) {
                report.skippedThreads++;
                report.status = 'partial';
                return;
            }
            report.threadsRead++;
            let events;
            try {
                events = historyActivities(root, data, report);
            }
            catch {
                report.skippedThreads++;
                report.status = 'partial';
                return;
            }
            for (const event of events) {
                const legacy = hash([event.sessionId, event.kind, event.description, localDate(event.activityAt, c.timezone)].join('\0'));
                if (ids.has(event.id) || withoutTurn.has(legacy)) {
                    report.duplicates++;
                    continue;
                }
                if (saveActivity(root, event))
                    report.imported++;
                else
                    report.duplicates++;
                ids.add(event.id);
            }
        };
        if (resolved === 'session') {
            // Check project membership before requesting any turn contents.
            const metadata = object(object(await connection.request('thread/read', { threadId: session, includeTurns: false })).thread);
            if (metadata.id !== session || !sameProject(root, metadata.cwd))
                throw new Error('Session does not belong to this project');
            await read(session);
        }
        else {
            for (const archived of [false, true]) {
                let cursor;
                const cursors = new Set();
                do {
                    if (performance.now() > deadline)
                        throw new Error('History sync time budget reached; narrow the period or use session scope');
                    const page = object(await connection.request('thread/list', { limit: 100, sortKey: 'updated_at', sortDirection: 'desc',
                        sourceKinds: ['cli', 'vscode', 'exec', 'appServer', 'unknown'], archived, ...(cursor ? { cursor } : {}) }));
                    if (!Array.isArray(page.data))
                        throw new Error('Codex returned an unsupported thread list');
                    for (const row of page.data) {
                        const meta = object(row);
                        if (typeof meta.id !== 'string' || !sameProject(root, meta.cwd))
                            continue;
                        // These are only conservative prefilters. Turn dates select the actual evidence.
                        if (resolved !== 'all') {
                            const created = timestamp(meta.createdAt);
                            const updated = timestamp(meta.updatedAt);
                            if ((created && localDate(created, c.timezone) > resolved) || (updated && localDate(updated, c.timezone) < resolved))
                                continue;
                        }
                        await read(meta.id);
                    }
                    if (page.nextCursor != null && typeof page.nextCursor !== 'string')
                        throw new Error('Unsupported history pagination');
                    cursor = typeof page.nextCursor === 'string' && page.nextCursor ? page.nextCursor : undefined;
                    if (cursor && cursors.has(cursor))
                        throw new Error('Codex history pagination repeated a cursor');
                    if (cursor)
                        cursors.add(cursor);
                } while (cursor);
            }
        }
    }
    catch (error) {
        report.status = report.threadsRead ? 'partial' : 'unavailable';
        report.limitations.push(excerpt(error.message, 300));
    }
    finally {
        connection?.close();
    }
    if (report.skippedThreads)
        report.limitations.push(`${report.skippedThreads} stored threads could not be read or matched to this project.`);
    if (report.skippedUndated)
        report.limitations.push(`${report.skippedUndated} historical items lacked original turn timestamps and were skipped.`);
    if (report.skippedForks)
        report.limitations.push(`${report.skippedForks} forked threads were skipped to avoid counting copied history twice.`);
    report.limitations.push('History includes available local completed, failed and interrupted turns; active turns, spawned subagents and deleted or remote-only history are excluded.');
    atomicWrite(path.join(storage(root), 'history/latest.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
}
