// Log-Typen
export const LogType = {
    INFO: 'info',
    ERROR: 'error',
    WARNING: 'warning',
    SUCCESS: 'success'
};

// Globaler Cache für Logs
let globalLogs = [];
const MAX_LOGS = 100;

/**
 * Fügt einen neuen Log-Eintrag hinzu
 * @param {string} message - Die Log-Nachricht
 * @param {string} type - Der Log-Typ (info, error, warning, success)
 */
export function addLog(message, type = LogType.INFO) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    
    // Füge den Log am Anfang der Liste hinzu
    globalLogs.unshift(logEntry);
    
    // Begrenze die Anzahl der Logs
    if (globalLogs.length > MAX_LOGS) {
        globalLogs = globalLogs.slice(0, MAX_LOGS);
    }

    // Log auch in der Konsole ausgeben
    console.log(logEntry);
}

/**
 * Gibt alle gespeicherten Logs zurück
 */
export function getLogs() {
    return globalLogs;
}

/**
 * Löscht alle Logs
 */
export function clearLogs() {
    globalLogs = [];
    addLog('Log-System zurückgesetzt', LogType.INFO);
} 