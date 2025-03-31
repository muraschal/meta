// Logging-Konfiguration
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO;

function shouldLog(level) {
  return level >= CURRENT_LOG_LEVEL;
}

export function log(level, ...args) {
  if (shouldLog(level)) {
    const prefix = {
      [LOG_LEVELS.DEBUG]: '🔍',
      [LOG_LEVELS.INFO]: 'ℹ️',
      [LOG_LEVELS.WARN]: '⚠️',
      [LOG_LEVELS.ERROR]: '❌'
    }[level];
    console.log(prefix, ...args);
  }
} 