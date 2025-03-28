import { logs } from './utils/logs';

export default async function handler(req, res) {
    try {
        // Sende die letzten 100 Logs zurück
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