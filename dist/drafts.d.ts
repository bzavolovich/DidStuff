import { Activity } from './core.js';
export type Format = 'recap' | 'standup' | 'tweet';
export declare function formatName(value: string): Format;
export declare function select(root: string, period: string, session?: string, deadline?: number): {
    activities: Activity[];
    period: string;
    timezone: string;
    language: string;
    coverage: string;
    limitations: string[];
    limited: boolean;
    invalid: number;
};
export declare function gitContext(root: string, date: string): Record<string, string>;
export declare function evidenceBundle(root: string, format: Format, period: string, session?: string): {
    git: Record<string, string>;
    sourcePolicy: string;
    activities: Activity[];
    period: string;
    timezone: string;
    language: string;
    coverage: string;
    limitations: string[];
    limited: boolean;
    invalid: number;
    schemaVersion: number;
    format: Format;
    projectId: string;
    project: string;
    generatedAt: string;
};
export declare function saveManual(root: string, value: unknown): {
    path: string;
    draftId: `${string}-${string}-${string}-${string}-${string}`;
    markdown: string;
    coverage: string;
    limitations: string[];
};
export declare function renderAutomatic(root: string, period: string, session?: string, deadline?: number): {
    selection: {
        activities: Activity[];
        period: string;
        timezone: string;
        language: string;
        coverage: string;
        limitations: string[];
        limited: boolean;
        invalid: number;
    };
    markdown: string;
    fingerprint: string;
};
export declare function saveExit(root: string, session: string): string[];
