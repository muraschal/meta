let logs = [];
const MAX_LOGS = 100;

export function addLog(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    logs.unshift(logEntry);
    
    // Begrenze die Anzahl der Logs
    if (logs.length > MAX_LOGS) {
        logs = logs.slice(0, MAX_LOGS);
    }
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