export declare const SCHEMA = 1;
export declare const MARKER = "<!-- did-stuff:generated -->";
export type Outcome = 'reported' | 'observed' | 'failed' | 'request';
export interface Activity {
    schemaVersion: 1;
    id: string;
    sourceAgent: 'codex';
    projectId: string;
    sessionId: string;
    turnId?: string;
    activityAt: string;
    capturedAt: string;
    timeBasis: 'activity' | 'capture' | 'turn';
    kind: 'assistant' | 'request' | 'tool';
    origin?: 'history';
    description: string;
    evidence: string[];
    outcome: Outcome;
}
export interface Config {
    schemaVersion: 1;
    automaticCapture: boolean;
    automaticRecap: boolean;
    historyImport: boolean;
    timezone: string;
    language: string;
    outputDirectory: string;
}
export declare const hash: (value: string) => string;
export declare function redact(value: string): string;
export declare const excerpt: (value: string, max?: number) => string;
export declare function projectRoot(cwd: string): string;
export declare const projectId: (root: string) => string;
export declare function privateDir(dir: string): void;
export declare function storage(root: string): string;
export declare function atomicWrite(file: string, content: string, exclusive?: boolean): boolean;
export declare function jsonRead(file: string): unknown;
export declare function defaultConfig(): Config;
export declare function validateConfig(value: unknown): Config;
export declare function config(root: string): Config;
export declare function ensureIgnored(root: string): void;
export declare function requireIgnored(root: string): void;
export declare function withLock<T>(root: string, name: string, fn: () => T): T | undefined;
export declare function saveActivity(root: string, event: Activity): boolean;
export declare function validActivity(a: unknown, root: string): a is Activity;
export declare function readActivities(root: string, deadline?: number): {
    activities: Activity[];
    limited: boolean;
    invalid: number;
};
export declare function localDate(instant: string | Date, timezone: string): string;
export declare function periodDate(period: string, timezone: string, now?: Date): string;
export declare function diagnostic(root: string, code: string): void;
