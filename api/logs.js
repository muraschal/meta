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

        // Sende die Logs zurück
        return res.status(200).json({
            status: 'success',
            data: logs
        });
    } catch (error) {
        console.error('Fehler beim Abrufen der Logs:', error);
        
        // Füge den Fehler zu den Logs hinzu
        addLog(`Fehler beim Abrufen der Logs: ${error.message}`, LogType.ERROR);
        
        return res.status(500).json({ 
            status: 'error',
            error: 'Interner Serverfehler',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Ein unerwarteter Fehler ist aufgetreten',
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        });
    }
} 