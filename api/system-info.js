import os from 'os';

export default async function handler(req, res) {
    try {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        const systemInfo = {
            memory: {
                total: totalMem,
                free: freeMem,
                used: usedMem,
                usage: ((usedMem / totalMem) * 100).toFixed(2)
            },
            uptime: os.uptime(),
            cpu: os.cpus().map(cpu => ({
                model: cpu.model,
                speed: cpu.speed,
                times: cpu.times
            })),
            loadavg: os.loadavg(),
            platform: os.platform(),
            env: {
                NODE_ENV: process.env.NODE_ENV || 'production',
                VERCEL_ENV: process.env.VERCEL_ENV || 'production',
                VERCEL_REGION: process.env.VERCEL_REGION || 'unknown'
            },
            timestamp: new Date().toISOString()
        };

        res.status(200).json(systemInfo);
    } catch (error) {
        console.error('Fehler beim Abrufen der Systeminfos:', error);
        res.status(500).json({ 
            error: 'Interner Serverfehler',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
} 