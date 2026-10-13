import { Activity } from './core.js';
export declare function summaryRequest(text: string): boolean;
export declare function generatedSummary(text: string): boolean;
export declare function normalizeHook(root: string, input: unknown, now?: Date): Activity | null;
export declare function captureHook(root: string, input: unknown, now?: Date): boolean;
export declare function captureVisible(root: string, value: unknown, session: string): boolean;
