import express from 'express';
import { META_CONFIG } from '../config/meta.js';
import { log, LOG_LEVELS } from '../utils/logger.js';
import { WhatsAppService } from '../services/whatsapp.js';
import { OpenAIService } from '../services/openai.js';

const router = express.Router();

// Webhook-Verifizierung für Meta
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === META_CONFIG.WEBHOOK.VERIFY_TOKEN) {
    log(LOG_LEVELS.INFO, 'Webhook wurde verifiziert');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook für eingehende Nachrichten
router.post('/', async (req, res) => {
  try {
    const { body } = req;
    
    // Bestätigen Sie den Webhook-Empfang sofort
    res.status(200).send('OK');

    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry[0];
      const changes = entry.changes[0];
      const value = changes.value;
      const messages = value.messages;

      if (!messages) return;

      const message = messages[0];
      const from = message.from;
      const messageType = message.type;

      // Verarbeite "Hey Meta" Befehle
      if (messageType === 'text' && message.text.body.toLowerCase().startsWith('hey meta')) {
        const command = message.text.body.toLowerCase();
        log(LOG_LEVELS.INFO, 'Meta Glasses Befehl empfangen:', command);

        // Beispiel: "hey meta, message to xy"
        if (command.includes('message to')) {
          const content = command.split('message to')[1].trim();
          // Verarbeite die Nachricht mit OpenAI
          const response = await OpenAIService.processMessage(from, content);
          // Sende die Antwort zurück
          await WhatsAppService.sendMessage(from, response);
        }
      }

      // Verarbeite Bilder
      if (messageType === 'image') {
        const imageUrl = message.image.url;
        // Verarbeite das Bild mit OpenAI Vision
        const response = await OpenAIService.processMessage(from, "Beschreibe dieses Bild", imageUrl);
        // Sende die Antwort zurück
        await WhatsAppService.sendMessage(from, response);
      }
    }
  } catch (error) {
    log(LOG_LEVELS.ERROR, 'Fehler bei der Webhook-Verarbeitung:', error);
    // Wir haben bereits 200 gesendet, also loggen wir nur den Fehler
  }
});

export default router; 