import express from 'express';
import { META_CONFIG } from '../config/meta.js';
import { log, LOG_LEVELS } from '../utils/logger.js';
import { WhatsAppService } from '../services/whatsapp.js';
import { OpenAIService } from '../services/openai.js';
import axios from 'axios';
import tokenManager from '../services/token-manager.js';

const router = express.Router();
const openAIService = new OpenAIService();
const whatsAppService = new WhatsAppService();

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

      log(LOG_LEVELS.INFO, 'Received message:', { type: messageType, from });

      // Verarbeite Bilder
      if (messageType === 'image') {
        log(LOG_LEVELS.INFO, 'Full image message:', message);
        
        try {
          if (!message.image || !message.image.id) {
            throw new Error('No valid image data received');
          }

          // Get image ID and download URL
          const imageId = message.image.id;
          const mediaUrl = `${META_CONFIG.API.BASE_URL}/${META_CONFIG.API.VERSION}/${imageId}`;
          
          log(LOG_LEVELS.INFO, 'Fetching image URL:', { mediaUrl });
          
          // Get media URL
          const token = await tokenManager.getCurrentToken();
          const mediaResponse = await axios({
            method: 'get',
            url: mediaUrl,
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (!mediaResponse.data || !mediaResponse.data.url) {
            throw new Error('No valid image URL received from Meta API');
          }

          const imageUrl = mediaResponse.data.url;
          log(LOG_LEVELS.INFO, 'Processing image:', { imageUrl });
          
          const response = await openAIService.processMessage(from, "", imageUrl);
          await whatsAppService.sendMessage(from, response);
        } catch (error) {
          log(LOG_LEVELS.ERROR, 'Error processing image:', error);
          await whatsAppService.sendMessage(from, "I apologize, but I had trouble processing your image. Could you try sending it again?");
        }
        return;
      }

      // Verarbeite Textnachrichten
      if (messageType === 'text') {
        const text = message.text.body;
        log(LOG_LEVELS.INFO, 'Processing text message:', { text });
        const response = await openAIService.processMessage(from, text);
        await whatsAppService.sendMessage(from, response);
      }
    }
  } catch (error) {
    log(LOG_LEVELS.ERROR, 'Fehler bei der Webhook-Verarbeitung:', error);
    // Wir haben bereits 200 gesendet, also loggen wir nur den Fehler
  }
});

export default router; 