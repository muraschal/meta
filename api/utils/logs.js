// In-Memory Log-Speicher
export let logs = [];
const MAX_LOGS = 100;

// Log-Typen
export const LogType = {
    INFO: 'info',
    ERROR: 'error',
    WARNING: 'warning',
    SUCCESS: 'success'
};

/**
 * Fügt einen neuen Log-Eintrag hinzu
 * @param {string} message - Die Log-Nachricht
 * @param {string} type - Der Log-Typ (info, error, warning, success)
 */
export function addLog(message, type = LogType.INFO) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    
    // Füge den Log am Anfang der Liste hinzu
    logs.unshift(logEntry);
    
    // Begrenze die Anzahl der Logs
    if (logs.length > MAX_LOGS) {
        logs = logs.slice(0, MAX_LOGS);
    }

    // Log auch in der Konsole ausgeben
    console.log(logEntry);
}

export default async function handler(req, res) {
    try {
        // Füge einen Test-Log hinzu, wenn keine Logs vorhanden sind
        if (logs.length === 0) {
            addLog('Log-System initialisiert', 'info');
        }

        res.status(200).json(logs);
    } catch (error) {
        console.error('Fehler beim Abrufen der Logs:', error);
        res.status(500).json({ 
            error: 'Interner Serverfehler',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
} 