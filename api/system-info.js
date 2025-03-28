import os from 'os';

export default async function handler(req, res) {
    try {
        const systemInfo = {
            memory: {
                total: os.totalmem(),
                free: os.freemem(),
                usage: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(2)
            },
            uptime: os.uptime(),
            cpu: os.cpus(),
            loadavg: os.loadavg(),
            platform: os.platform(),
            env: {
                NODE_ENV: process.env.NODE_ENV,
                VERCEL_ENV: process.env.VERCEL_ENV,
                VERCEL_REGION: process.env.VERCEL_REGION
            },
            timestamp: new Date().toISOString()
        };

        res.status(200).json(systemInfo);
    } catch (error) {
        console.error('Fehler beim Abrufen der Systeminfos:', error);
        res.status(500).json({ error: 'Interner Serverfehler' });
    }
} 