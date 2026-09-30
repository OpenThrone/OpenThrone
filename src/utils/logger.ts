/* eslint-disable no-console */
// Define log levels (higher number means more verbose)
const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
} as const;

type LogLevelKey = keyof typeof LogLevel;
type LogLevelValue = (typeof LogLevel)[LogLevelKey];

// Function to get the numeric level from a string name
const getLevelFromString = (levelStr: string | undefined): LogLevelValue => {
  const upperLevelStr = (levelStr || 'INFO').toUpperCase() as LogLevelKey;
  return LogLevel[upperLevelStr] ?? LogLevel.INFO;
};

// Determine the current log level based on environment
let currentLogLevel: LogLevelValue;
if (typeof window === 'undefined') {
  // Server-side
  currentLogLevel = getLevelFromString(process.env.LOG_LEVEL);
} else {
  // Client-side
  currentLogLevel = getLevelFromString(process.env.NEXT_PUBLIC_LOG_LEVEL);
}

/** One structured log event, emitted to the active sink or the console. */
export interface LogEntry {
  level: LogLevelKey;
  message: string;
  params: unknown[];
  timestamp: string;
}

/** Receives structured log entries; while active, console output is suppressed. */
export type LogSink = (entry: LogEntry) => void;

// Sink stack so nested captures route to the innermost sink and restore cleanly.
const sinkStack: LogSink[] = [];

/** Installs (or clears, with null) a log sink for structured log consumption. */
export const setLogSink = (sink: LogSink | null): void => {
  if (sink) {
    sinkStack.push(sink);
  } else {
    sinkStack.pop();
  }
};

/** Returns the innermost active sink, if any. */
export const getLogSink = (): LogSink | null =>
  sinkStack.length ? sinkStack[sinkStack.length - 1] : null;

/** Overrides the process env log level at runtime (e.g. DEBUG for diagnostics). */
export const setLogLevel = (level: string): void => {
  currentLogLevel = getLevelFromString(level);
};

/** Returns the currently active numeric log level. */
export const getLogLevel = (): number => currentLogLevel;

const consoleFor: Record<LogLevelKey, (...args: unknown[]) => void> = {
  ERROR: (...args: unknown[]) => console.error(...args),
  WARN: (...args: unknown[]) => console.warn(...args),
  INFO: (...args: unknown[]) => console.info(...args),
  DEBUG: (...args: unknown[]) => console.log(...args),
  TRACE: (...args: unknown[]) => console.trace(...args),
};

const formatMessage = (
  level: LogLevelKey,
  message: any,
  ...optionalParams: any[]
): string => {
  const timestamp = new Date().toISOString();
  let formattedMessage = `[${timestamp}] [${level}] ${message}`;

  // Basic handling for additional parameters (stringify objects/arrays)
  if (optionalParams.length > 0) {
    formattedMessage += ` - ${optionalParams
      .map((param) => {
        if (param instanceof Error) {
          // Handle Error objects explicitly for better logging
          return `{ name: '${param.name}', message: '${param.message}', stack: '${param.stack?.replace(/\n/g, '\\n')}' }`;
        }
        if (typeof param === 'object' && param !== null) {
          try {
            return JSON.stringify(param);
          } catch {
            return '[Unserializable Object]';
          }
        }
        return String(param);
      })
      .join(' ')}`;
  }
  return formattedMessage;
};

const emit = (level: LogLevelKey, message: any, optionalParams: any[]): void => {
  if (currentLogLevel < LogLevel[level]) return;

  const sink = getLogSink();
  if (sink) {
    sink({
      level,
      message: String(message),
      params: optionalParams,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  consoleFor[level](formatMessage(level, message, ...optionalParams));
};

// Logger functions
/** Logs error details with optional structured context. */
export const logError = (message: any, ...optionalParams: any[]) => {
  emit('ERROR', message, optionalParams);
};

/** Logs warning details with optional structured context. */
export const logWarn = (message: any, ...optionalParams: any[]) => {
  emit('WARN', message, optionalParams);
};

/** Logs informational details with optional structured context. */
export const logInfo = (message: any, ...optionalParams: any[]) => {
  emit('INFO', message, optionalParams);
};

/** Logs debug details with optional structured context. */
export const logDebug = (message: any, ...optionalParams: any[]) => {
  emit('DEBUG', message, optionalParams);
};

const logTrace = (message: any, ...optionalParams: any[]) => {
  emit('TRACE', message, optionalParams);
};

const logger = {
  error: logError,
  warn: logWarn,
  info: logInfo,
  debug: logDebug,
  trace: logTrace,
};

export default logger;

/** Result of a capture run: whatever fn returned plus every emitted entry. */
export interface CapturedLogs<T> {
  result: T;
  logs: LogEntry[];
}

/**
 * Runs fn with all log output captured instead of printed.
 *
 * Intended for CLI scripts, tests, and other single-owner diagnostics. While a
 * capture is active, entries that pass the current log level are collected and
 * the console stays quiet; the previous sink (or console) is restored when fn
 * settles, including on throw. Nested captures route to the innermost sink.
 *
 * Note: capture state is module-global — do not use across concurrently
 * interleaved async operations where log attribution must stay separated.
 */
export const captureLogs = <T>(fn: () => T): CapturedLogs<T> => {
  const logs: LogEntry[] = [];
  setLogSink((entry) => logs.push(entry));

  const restore = () => setLogSink(null);

  let result: T;
  try {
    result = fn();
  } catch (error) {
    restore();
    throw error;
  }

  const asPromise = result as unknown as
    | Promise<Awaited<T>>
    | { then?: unknown; finally?: unknown };

  if (
    asPromise &&
    typeof asPromise === 'object' &&
    typeof (asPromise as Promise<Awaited<T>>).finally === 'function'
  ) {
    return (asPromise as Promise<Awaited<T>>)
      .finally(restore)
      .then(
        (value) => ({ result: value, logs }) as unknown as CapturedLogs<T>,
      ) as unknown as CapturedLogs<T>;
  }

  restore();
  return { result, logs };
};
