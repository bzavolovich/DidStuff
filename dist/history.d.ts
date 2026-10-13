import { Activity } from './core.js';
export interface HistoryClient {
    request(method: string, params: Record<string, unknown>): Promise<unknown>;
    close(): void;
}
export declare class CodexHistoryClient implements HistoryClient {
    private child;
    private pending;
    private nextId;
    private buffer;
    private failure?;
    constructor(cwd: string);
    private fail;
    request(method: string, params: Record<string, unknown>): Promise<unknown>;
    initialized(): void;
    close(): void;
}
export interface HistoryReport {
    schemaVersion: 1;
    period: string;
    sessionId?: string;
    syncedAt: string;
    status: 'complete' | 'partial' | 'unavailable' | 'disabled';
    threadsRead: number;
    imported: number;
    duplicates: number;
    skippedUndated: number;
    skippedForks: number;
    skippedThreads: number;
    limitations: string[];
}
export declare function historyActivities(root: string, value: unknown, report: HistoryReport, now?: Date): Activity[];
export declare function readHistoryReport(root: string): HistoryReport | undefined;
export declare function syncHistory(root: string, period: string, session?: string, client?: HistoryClient): Promise<HistoryReport>;
