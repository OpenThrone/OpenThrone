// Temporary global declarations to reduce noise during migration
// Prefer importing from '@/utils/logger' in the long term.

declare function logError(message?: any, ...optionalParams: any[]): void;
declare function logWarn(message?: any, ...optionalParams: any[]): void;
declare function logInfo(message?: any, ...optionalParams: any[]): void;
declare function logDebug(message?: any, ...optionalParams: any[]): void;
declare function logTrace(message?: any, ...optionalParams: any[]): void;

declare const alertService: any; // Tests and components import alertService but it's sometimes globally referenced
