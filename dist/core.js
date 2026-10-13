import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
export const SCHEMA = 1;
export const MARKER = '<!-- did-stuff:generated -->';
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function redact(value) {
    return value
        .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, '[REDACTED PRIVATE KEY]')
        .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]{10,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED]')
        .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
        .replace(/((?:["']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|secret|client[_-]?secret)["']?)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, '$1[REDACTED]')
        .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
        .replace(/([?&](?:token|key|secret|password)=)[^&\s)]+/gi, '$1[REDACTED]');
}
export const excerpt = (value, max = 5000) => {
    const safe = redact(value).replace(/\u0000/g, '');
    return safe.length > max ? safe.slice(0, max) + '\n[Excerpt truncated]' : safe;
};
export function projectRoot(cwd) {
    let current = fs.realpathSync(cwd);
    for (;;) {
        if (fs.existsSync(path.join(current, '.git')))
            return current;
        if (fs.existsSync(path.join(current, '.did-stuff', 'config.json')))
            return current;
        const parent = path.dirname(current);
        if (parent === current)
            return fs.realpathSync(cwd);
        current = parent;
    }
}
export const projectId = (root) => hash(fs.realpathSync(root)).slice(0, 20);
export function privateDir(dir) {
    let check = path.resolve(dir);
    for (;;) {
        if (fs.existsSync(check) && fs.lstatSync(check).isSymbolicLink())
            throw new Error('Refusing symlinked storage');
        const parent = path.dirname(check);
        if (parent === check)
            break;
        check = parent;
    }
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}
export function storage(root) {
    const dir = path.join(root, '.did-stuff');
    privateDir(dir);
    return dir;
}
export function atomicWrite(file, content, exclusive = false) {
    privateDir(path.dirname(file));
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink())
        throw new Error('Refusing symlinked file');
    const temp = path.join(path.dirname(file), `.tmp-${randomUUID()}`);
    let fd;
    try {
        fd = fs.openSync(temp, 'wx', 0o600);
        fs.writeFileSync(fd, content);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = undefined;
        if (exclusive) {
            try {
                fs.linkSync(temp, file);
            }
            catch (error) {
                if (error.code === 'EEXIST')
                    return false;
                throw error;
            }
        }
        else
            fs.renameSync(temp, file);
        return true;
    }
    finally {
        if (fd !== undefined)
            fs.closeSync(fd);
        try {
            fs.unlinkSync(temp);
        }
        catch { }
    }
}
export function jsonRead(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function defaultConfig() {
    return { schemaVersion: 1, automaticCapture: false, automaticRecap: false, historyImport: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, language: 'English', outputDirectory: '.did-stuff/drafts' };
}
export function validateConfig(value) {
    const c = { ...value };
    if (!Object.hasOwn(c, 'historyImport'))
        c.historyImport = true;
    if (!c || c.schemaVersion !== 1 || typeof c.automaticCapture !== 'boolean' || typeof c.automaticRecap !== 'boolean'
        || typeof c.historyImport !== 'boolean' || typeof c.timezone !== 'string' || typeof c.language !== 'string' || !c.language.trim()
        || typeof c.outputDirectory !== 'string')
        throw new Error('Invalid configuration');
    new Intl.DateTimeFormat('en', { timeZone: c.timezone });
    const output = path.normalize(c.outputDirectory);
    if (path.isAbsolute(output) || !output.startsWith(`.did-stuff${path.sep}`) || output.split(path.sep).includes('..'))
        throw new Error('Output directory must be inside .did-stuff/');
    return c;
}
export function config(root) {
    const file = path.join(root, '.did-stuff/config.json');
    return fs.existsSync(file) ? validateConfig(jsonRead(file)) : defaultConfig();
}
export function ensureIgnored(root) {
    const file = path.join(root, '.gitignore');
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink())
        throw new Error('Refusing symlinked .gitignore');
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    // Put the rule last so earlier negations cannot re-include personal evidence.
    if (current.trimEnd().split('\n').at(-1) !== '/.did-stuff/')
        atomicWrite(file, current + (current && !current.endsWith('\n') ? '\n' : '') + '/.did-stuff/\n');
    if (fs.existsSync(path.join(root, '.git'))) {
        try {
            execFileSync('git', ['check-ignore', '-q', '.did-stuff/activity/check.json'], { cwd: root, timeout: 500, stdio: 'ignore' });
        }
        catch {
            throw new Error('Personal storage is not ignored by Git');
        }
    }
}
export function requireIgnored(root) {
    const rules = fs.existsSync(path.join(root, '.gitignore')) ? fs.readFileSync(path.join(root, '.gitignore'), 'utf8') : '';
    if (rules.trimEnd().split('\n').at(-1) !== '/.did-stuff/')
        throw new Error('Run did-stuff init to restore the final Git ignore rule');
}
export function withLock(root, name, fn) {
    const lock = path.join(storage(root), `${name}.lock`);
    try {
        fs.mkdirSync(lock, { mode: 0o700 });
    }
    catch (error) {
        if (error.code !== 'EEXIST')
            throw error;
        // Never wait inside a hook. A dead process's lease can be reclaimed.
        try {
            const pid = Number(fs.readFileSync(path.join(lock, 'pid'), 'utf8'));
            if (!Number.isInteger(pid) || pid <= 0)
                return undefined;
            try {
                process.kill(pid, 0);
                return undefined;
            }
            catch (e) {
                if (e.code !== 'ESRCH')
                    return undefined;
            }
            fs.unlinkSync(path.join(lock, 'pid'));
            fs.rmdirSync(lock);
        }
        catch {
            try {
                if (Date.now() - fs.statSync(lock).mtimeMs > 10_000 && fs.readdirSync(lock).length === 0)
                    fs.rmdirSync(lock);
                else
                    return undefined;
            }
            catch {
                return undefined;
            }
        }
        try {
            fs.mkdirSync(lock, { mode: 0o700 });
        }
        catch {
            return undefined;
        }
    }
    fs.writeFileSync(path.join(lock, 'pid'), String(process.pid), { mode: 0o600 });
    try {
        return fn();
    }
    finally {
        fs.unlinkSync(path.join(lock, 'pid'));
        fs.rmdirSync(lock);
    }
}
export function saveActivity(root, event) {
    requireIgnored(root);
    return atomicWrite(path.join(storage(root), 'activity', `${event.id}.json`), JSON.stringify(event, null, 2) + '\n', true);
}
export function validActivity(a, root) {
    const e = a;
    return !!e && e.schemaVersion === 1 && e.sourceAgent === 'codex' && e.projectId === projectId(root)
        && typeof e.id === 'string' && /^[a-f0-9]{64}$/.test(e.id) && typeof e.sessionId === 'string'
        && ['assistant', 'tool', 'request'].includes(e.kind) && ['reported', 'observed', 'failed', 'request'].includes(e.outcome)
        && typeof e.description === 'string' && e.description.length <= 6000 && Array.isArray(e.evidence)
        && e.evidence.every(x => typeof x === 'string') && ['activity', 'capture', 'turn'].includes(e.timeBasis)
        && Number.isFinite(Date.parse(e.activityAt)) && Number.isFinite(Date.parse(e.capturedAt));
}
export function readActivities(root, deadline = Infinity) {
    const dir = path.join(root, '.did-stuff/activity');
    if (!fs.existsSync(dir))
        return { activities: [], limited: false, invalid: 0 };
    const files = fs.readdirSync(dir).filter(f => /^[a-f0-9]{64}\.json$/.test(f)).sort();
    const activities = [];
    let invalid = 0;
    let read = 0;
    for (const file of files) {
        if ((deadline !== Infinity && read >= 5000) || performance.now() > deadline)
            break;
        read++;
        try {
            const full = path.join(dir, file);
            const stat = fs.lstatSync(full);
            if (!stat.isFile() || stat.size > 32_000) {
                invalid++;
                continue;
            }
            const a = jsonRead(full);
            if (validActivity(a, root))
                activities.push(a);
            else
                invalid++;
        }
        catch {
            invalid++;
        }
    }
    activities.sort((a, b) => a.activityAt.localeCompare(b.activityAt) || a.id.localeCompare(b.id));
    return { activities, limited: read < files.length, invalid };
}
const dateFormats = new Map();
export function localDate(instant, timezone) {
    if (!dateFormats.has(timezone))
        dateFormats.set(timezone, new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }));
    const parts = dateFormats.get(timezone).formatToParts(new Date(instant));
    const get = (type) => parts.find(p => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}
export function periodDate(period, timezone, now = new Date()) {
    const today = localDate(now, timezone);
    if (period === 'today')
        return today;
    if (period === 'yesterday') {
        const d = new Date(today + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period) || !Number.isFinite(Date.parse(period + 'T12:00:00Z'))
        || new Date(period + 'T12:00:00Z').toISOString().slice(0, 10) !== period)
        throw new Error('Use today, yesterday, session, or YYYY-MM-DD');
    return period;
}
export function diagnostic(root, code) {
    try {
        requireIgnored(root);
        atomicWrite(path.join(storage(root), 'diagnostics', `${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify({ at: new Date().toISOString(), code: code.slice(0, 80) }) + '\n');
    }
    catch { }
}
