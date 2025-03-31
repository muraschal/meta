import OpenAI from 'openai';
import https from 'https';
import { addLog, LogType } from './utils/logs.js';
import whatsappService from '../src/services/whatsapp.js';
import tokenManager from '../src/services/token-manager.js';
import openaiService from '../src/services/openai.js';

// Prüfe erforderliche Umgebungsvariablen
const requiredEnvVars = [
    'META_APP_ID',
    'META_APP_SECRET',
    'WEBHOOK_VERIFY_TOKEN',
    'OPENAI_API_KEY',
    'OPENAI_ORG_ID'
];

console.log('Verfügbare Umgebungsvariablen:', Object.keys(process.env));
console.log('OPENAI_ORG_ID Wert:', process.env.OPENAI_ORG_ID);

const missingEnvVars = requiredEnvVars.filter(varName => {
    const exists = !!process.env[varName];
    console.log(`Prüfe ${varName}: ${exists ? 'vorhanden' : 'fehlt'}`);
    return !exists;
});

if (missingEnvVars.length > 0) {
    console.error('Fehlende Umgebungsvariablen:', missingEnvVars);
    throw new Error(`Fehlende Umgebungsvariablen: ${missingEnvVars.join(', ')}`);
}

// Initialisiere Token-Manager
await tokenManager.initialize().catch(error => {
    console.error('Fehler bei Token-Manager-Initialisierung:', error);
    throw error;
});

// Globales Error Handling
process.on('unhandledRejection', (error) => {
    addLog(`Unbehandelter Promise-Fehler: ${error.message}`, LogType.ERROR);
    console.error('Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', (error) => {
    addLog(`Unbehandelter Fehler: ${error.message}`, LogType.ERROR);
    console.error('Uncaught Exception:', error);
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...(process.env.OPENAI_ORG_ID && { organization: process.env.OPENAI_ORG_ID })
});

// HTTPS Agent für besseres SSL-Handling
const httpsAgent = new https.Agent({
  rejectUnauthorized: false // Nur für Debugging, in Produktion auf true setzen
});

async function fetchWithTimeout(url, options, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      agent: httpsAgent
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Logging-Konfiguration
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO;

function shouldLog(level) {
  return level >= CURRENT_LOG_LEVEL;
}

function log(level, ...args) {
  if (shouldLog(level)) {
    const prefix = {
      [LOG_LEVELS.DEBUG]: '🔍',
      [LOG_LEVELS.INFO]: 'ℹ️',
      [LOG_LEVELS.WARN]: '⚠️',
      [LOG_LEVELS.ERROR]: '❌'
    }[level];
    console.log(prefix, ...args);
  }
}

// Hilfsfunktion für Webhook-Verifizierung
async function verifyWebhook(req) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  log(LOG_LEVELS.DEBUG, 'Webhook-Verifizierung gestartet', { mode, token: token?.substring(0, 10) + '...', challenge: '***' });

  if (mode === 'subscribe' && token) {
    log(LOG_LEVELS.DEBUG, 'Token-Verifizierung erfolgreich');
    return { status: 200, response: parseInt(challenge) || 'OK' };
  }

  log(LOG_LEVELS.WARN, 'Webhook-Verifizierung fehlgeschlagen');
  return { status: 403, response: 'Forbidden' };
}

// Hilfsfunktion für das Senden von WhatsApp-Nachrichten mit Retry
async function sendWhatsAppMessageWithRetry(to, message, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await whatsappService.sendMessage(to, message);
    } catch (error) {
      log(LOG_LEVELS.ERROR, `=== WHATSAPP FEHLER (Versuch ${attempt}/${retries}) ===`);
      log(LOG_LEVELS.ERROR, 'Fehlertyp:', error.constructor.name);
      log(LOG_LEVELS.ERROR, 'Fehlermeldung:', error.message);
      log(LOG_LEVELS.ERROR, 'Stack:', error.stack);

      if (attempt < retries) {
        const delay = 2000 * attempt; // Exponentielles Backoff
        log(LOG_LEVELS.INFO, `Warte ${delay}ms vor dem nächsten Versuch...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

export default async function handler(req, res) {
  try {
    // Initialisiere Token Manager
    try {
      await tokenManager.initialize();
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'Fehler bei der Token-Initialisierung:', error);
    }

    // Log nur wichtige Request-Details
    log(LOG_LEVELS.DEBUG, '=== WEBHOOK HANDLER START ===');
    log(LOG_LEVELS.DEBUG, 'Methode:', req.method);

    // Webhook-Verifizierung
    if (req.method === 'GET') {
      const { status, response } = await verifyWebhook(req);
      return res.status(status).send(response);
    }

    // Verarbeite POST-Anfragen
    if (req.method === 'POST') {
      const payload = req.body;

      try {
        const result = await whatsappService.handleWebhook(payload);

        // Logge nur wichtige Nachrichtentypen
        if (result.type === 'message') {
          log(LOG_LEVELS.INFO, '=== NEUE NACHRICHT EMPFANGEN ===');
          log(LOG_LEVELS.INFO, 'Von:', result.from);
          log(LOG_LEVELS.INFO, 'Text:', result.content);

          // Sende Bestätigung
          await sendWhatsAppMessageWithRetry(result.from, 'I am processing your request...');
          log(LOG_LEVELS.INFO, 'Bestätigung gesendet');

          // Generiere OpenAI Antwort
          log(LOG_LEVELS.INFO, 'Generiere OpenAI Antwort...');
          const aiResponse = await openaiService.generateResponse(result.content);
          log(LOG_LEVELS.INFO, 'OpenAI Antwort generiert');

          // Sende finale Antwort
          await sendWhatsAppMessageWithRetry(result.from, aiResponse);
          log(LOG_LEVELS.INFO, 'Finale Antwort gesendet');
        } else if (result.type === 'status') {
          log(LOG_LEVELS.DEBUG, 'Status-Update empfangen');
        } else if (result.type === 'metadata') {
          log(LOG_LEVELS.DEBUG, 'Metadaten-Update empfangen');
        }

        return res.status(200).json({ status: 'success' });
      } catch (error) {
        log(LOG_LEVELS.ERROR, 'Fehler bei der Webhook-Verarbeitung:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    log(LOG_LEVELS.ERROR, 'Unbehandelter Fehler:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 