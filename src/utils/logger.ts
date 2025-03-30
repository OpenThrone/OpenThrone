// Define log levels (higher number means more verbose)
const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
} as const;

type LogLevelKey = keyof typeof LogLevel;
type LogLevelValue = typeof LogLevel[LogLevelKey];

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
  // console.log(`[Logger Setup - Server] Log level set to: ${Object.keys(LogLevel).find(key => LogLevel[key as LogLevelKey] === currentLogLevel)} (${currentLogLevel})`);
} else {
  // Client-side
  currentLogLevel = getLevelFromString(process.env.NEXT_PUBLIC_LOG_LEVEL);
  // console.log(`[Logger Setup - Client] Log level set to: ${Object.keys(LogLevel).find(key => LogLevel[key as LogLevelKey] === currentLogLevel)} (${currentLogLevel})`);
}


// Helper to format messages (optional, but nice)
const formatMessage = (level: LogLevelKey, message: any, ...optionalParams: any[]): string => {
  const timestamp = new Date().toISOString();
  let formattedMessage = `[${timestamp}] [${level}] ${message}`;

  // Basic handling for additional parameters (stringify objects/arrays)
  if (optionalParams.length > 0) {
    formattedMessage += ' - ' + optionalParams.map(param => {
      if (typeof param === 'object' && param !== null) {
        try {
          return JSON.stringify(param);
        } catch (e) {
          return '[Unserializable Object]';
        }
      }
      return String(param);
    }).join(' ');
  }
  return formattedMessage;
};

// Logger functions
export const logError = (message: any, ...optionalParams: any[]) => {
  if (currentLogLevel >= LogLevel.ERROR) {
    console.log(formatMessage('ERROR', message, ...optionalParams));
  }
};

export const logWarn = (message: any, ...optionalParams: any[]) => {
  if (currentLogLevel >= LogLevel.WARN) {
    console.warn(formatMessage('WARN', message, ...optionalParams));
  }
};

export const logInfo = (message: any, ...optionalParams: any[]) => {
  if (currentLogLevel >= LogLevel.INFO) {
    console.info(formatMessage('INFO', message, ...optionalParams));
  }
};

export const logDebug = (message: any, ...optionalParams: any[]) => {
  if (currentLogLevel >= LogLevel.DEBUG) {
    // console.debug uses verbose output in some browsers, use console.log for consistency
    console.log(formatMessage('DEBUG', message, ...optionalParams));
  }
};

export const logTrace = (message: any, ...optionalParams: any[]) => {
  if (currentLogLevel >= LogLevel.TRACE) {
    console.log(formatMessage('TRACE', message, ...optionalParams)); // Use console.log for TRACE as well
  }
};

const logger = {
  error: logError,
  warn: logWarn,
  info: logInfo,
  debug: logDebug,
  trace: logTrace,
};

export default logger;