import { META_CONFIG } from '../src/config/meta.js';
import { OPENAI_CONFIG } from '../src/config/openai.js';
import { log, LOG_LEVELS } from '../src/utils/logger.js';
import { WhatsAppService } from '../src/services/whatsapp.js';
import { OpenAIService } from '../src/services/openai.js';
import tokenManager from '../src/services/token-manager.js';

// Validiere erforderliche Umgebungsvariablen
META_CONFIG.validate();
OPENAI_CONFIG.validate();

// Globales Error Handling
process.on('unhandledRejection', (error) => {
    log(LOG_LEVELS.ERROR, 'Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', (error) => {
    log(LOG_LEVELS.ERROR, 'Uncaught Exception:', error);
});

const openai = new OpenAIService();
const whatsapp = new WhatsAppService();

// Hilfsfunktion für Webhook-Verifizierung
async function verifyWebhook(req) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === META_CONFIG.WEBHOOK.VERIFY_TOKEN) {
    return { status: 200, response: parseInt(challenge) || 'OK' };
  }

  log(LOG_LEVELS.WARN, 'Webhook-Verifizierung fehlgeschlagen');
  return { status: 403, response: 'Forbidden' };
}

// Hilfsfunktion für das Senden von WhatsApp-Nachrichten mit Retry
async function sendWhatsAppMessageWithRetry(to, message, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await whatsapp.sendMessage(to, message);
    } catch (error) {
      log(LOG_LEVELS.ERROR, `=== WHATSAPP FEHLER (Versuch ${attempt}/${retries}) ===`);
      log(LOG_LEVELS.ERROR, 'Fehlertyp:', error.constructor.name);
      log(LOG_LEVELS.ERROR, 'Fehlermeldung:', error.message);

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

// Token Manager Initialisierung (nur einmal)
let isTokenManagerInitialized = false;
async function ensureTokenManagerInitialized() {
  if (!isTokenManagerInitialized) {
    try {
      await tokenManager.initialize();
      isTokenManagerInitialized = true;
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'Fehler bei der Token-Initialisierung:', error);
      throw error;
    }
  }
}

export default async function handler(req, res) {
  try {
    // Initialisiere Token Manager (nur wenn nötig)
    await ensureTokenManagerInitialized();

    // Webhook-Verifizierung
    if (req.method === 'GET') {
      const { status, response } = await verifyWebhook(req);
      return res.status(status).send(response);
    }

    // Verarbeite POST-Anfragen
    if (req.method === 'POST') {
      const payload = req.body;

      try {
        const result = await whatsapp.handleWebhook(payload);

        // Logge nur wichtige Nachrichtentypen
        if (result.type === 'message') {
          log(LOG_LEVELS.INFO, '=== NEUE NACHRICHT ===');
          log(LOG_LEVELS.INFO, 'Von:', result.from);
          log(LOG_LEVELS.INFO, 'Text:', result.content);

          // Sende Bestätigung
          await sendWhatsAppMessageWithRetry(result.from, 'I am processing your request...');
          log(LOG_LEVELS.INFO, '✓ Bestätigung gesendet');

          // Generiere OpenAI Antwort
          log(LOG_LEVELS.INFO, 'Generiere OpenAI Antwort...');
          const aiResponse = await openai.generateResponse(result.content);
          log(LOG_LEVELS.INFO, '✓ OpenAI Antwort generiert');

          // Sende finale Antwort
          await sendWhatsAppMessageWithRetry(result.from, aiResponse);
          log(LOG_LEVELS.INFO, '✓ Finale Antwort gesendet');

          return res.status(200).json({ status: 'success' });
        }
        
        // Andere Nachrichtentypen werden still verarbeitet
        return res.status(200).json({ status: 'success' });
      } catch (error) {
        log(LOG_LEVELS.ERROR, 'Fehler bei der Webhook-Verarbeitung:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    log(LOG_LEVELS.ERROR, 'Unbehandelter Fehler:', error);
    return res.status(500).json({
      error: 'Fehler bei der Webhook-Verarbeitung',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
} 