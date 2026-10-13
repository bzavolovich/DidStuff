import { Config } from './core.js';
export declare const packageRoot: string;
export declare function initialize(root: string, changes?: Partial<Config>): Config;
export declare function install(root: string, hooks: boolean, changes?: Partial<Config>): {
    skill: string;
    hookFile: string | undefined;
    trust: string;
};
export declare function uninstall(root: string): {
    removed: boolean;
    skillRemoved: boolean;
    retained: string;
} | {
    removed: boolean;
    retained: string;
};
