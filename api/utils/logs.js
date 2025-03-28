// Log-Typen
export const LogType = {
    INFO: 'info',
    ERROR: 'error',
    SUCCESS: 'success',
    WARNING: 'warning'
};

// In-Memory Log Cache
let logCache = [];
const MAX_LOGS = 1000;

/**
 * Fügt einen neuen Log hinzu
 * @param {string} message - Die Log-Nachricht
 * @param {string} type - Der Log-Typ (info, error, success, warning)
 */
export function addLog(message, type = LogType.INFO) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        message,
        type
    };

    // Füge den Log zum Cache hinzu
    logCache.unshift(logEntry);

    // Begrenze die Cache-Größe
    if (logCache.length > MAX_LOGS) {
        logCache = logCache.slice(0, MAX_LOGS);
    }

    // Gib den Log auch in der Konsole aus
    console.log(`[${type.toUpperCase()}] ${message}`);
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