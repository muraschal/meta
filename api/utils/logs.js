// Log-Typen
export const LogType = {
    INFO: 'INFO',
    SUCCESS: 'SUCCESS',
    ERROR: 'ERROR',
};

// In-Memory Log Cache
let logCache = [];
const MAX_LOGS = 1000;

const getLogPrefix = (type) => {
    switch (type) {
        case LogType.SUCCESS:
            return '✅';
        case LogType.ERROR:
            return '❌';
        case LogType.INFO:
        default:
            return 'ℹ️';
    }
};

/**
 * Fügt einen neuen Log hinzu
 * @param {string} message - Die Log-Nachricht
 * @param {string} type - Der Log-Typ (info, error, success, warning)
 */
export function addLog(message, type = LogType.INFO) {
    const prefix = getLogPrefix(type);
    console.log(`${prefix} ${message}`);
}

/**
 * Gibt alle Logs zurück
 * @returns {Array} Array von Log-Einträgen
 */
export function getLogs() {
    return logCache;
}

/**
 * Löscht alle Logs
 */
export function clearLogs() {
    logCache = [];
    addLog('Logs gelöscht', LogType.INFO);
} 