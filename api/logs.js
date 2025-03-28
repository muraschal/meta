import { getLogs, addLog, LogType } from './utils/logs';

export default async function handler(req, res) {
    try {
        // CORS-Header hinzufügen
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // OPTIONS-Anfragen direkt beantworten
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        // Nur GET-Anfragen erlauben
        if (req.method !== 'GET') {
            addLog(`Ungültige Methode: ${req.method}`, LogType.ERROR);
            return res.status(405).json({ 
                status: 'error',
                error: 'Methode nicht erlaubt',
                message: 'Nur GET-Anfragen sind erlaubt'
            });
        }

        // Hole die Logs
        const logs = getLogs();
        
        // Füge einen Test-Log hinzu, wenn keine Logs vorhanden sind
        if (logs.length === 0) {
            addLog('Log-System initialisiert', LogType.INFO);
        }

        addLog(`Sende ${logs.length} Logs zurück`, LogType.INFO);

        // Sende die Logs zurück
        return res.status(200).json({
            status: 'success',
            data: logs
        });
    } catch (error) {
        addLog(`Fehler beim Abrufen der Logs: ${error.message}`, LogType.ERROR);
        addLog(`Stack: ${error.stack}`, LogType.ERROR);
        console.error('Fehler beim Abrufen der Logs:', error);
        
        return res.status(500).json({ 
            status: 'error',
            error: 'Interner Serverfehler',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Ein unerwarteter Fehler ist aufgetreten',
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        });
    }
} 