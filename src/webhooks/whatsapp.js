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

      log(LOG_LEVELS.INFO, 'Full webhook structure:', {
        entry: body.entry,
        changes: entry?.changes,
        value: changes?.value
      });

      // Überprüfe die Struktur der Nachricht
      if (!value || !value.messages || !Array.isArray(value.messages)) {
        log(LOG_LEVELS.ERROR, 'Invalid webhook structure:', {
          hasValue: !!value,
          hasMessages: value?.messages,
          messagesType: typeof value?.messages
        });
        return;
      }

      const messages = value.messages;
      log(LOG_LEVELS.INFO, 'Messages array:', messages);

      if (!messages.length) {
        log(LOG_LEVELS.INFO, 'No messages in webhook');
        return;
      }

      const message = messages[0];
      log(LOG_LEVELS.INFO, 'Processing message:', {
        fullMessage: JSON.stringify(message, null, 2),
        type: message.type,
        hasImage: !!message.image,
        hasText: !!message.text,
        imageData: message.image,
        textData: message.text
      });

      const from = message.from;
      const messageType = message.type;
      const timestamp = message.timestamp || Date.now() / 1000;

      // Ignoriere Nachrichten, die älter als 5 Minuten sind
      const fiveMinutesAgo = (Date.now() / 1000) - 300;
      if (timestamp < fiveMinutesAgo) {
        log(LOG_LEVELS.INFO, 'Ignoring old message:', { timestamp, type: messageType, from });
        return;
      }

      // Verarbeite Bilder
      if (messageType === 'image') {
        log(LOG_LEVELS.INFO, 'Image message detected:', {
          messageType,
          imageData: JSON.stringify(message.image, null, 2),
          timestamp: new Date(timestamp * 1000).toISOString()
        });
        
        try {
          if (!message.image || !message.image.id) {
            log(LOG_LEVELS.ERROR, 'Invalid image data:', JSON.stringify(message.image, null, 2));
            throw new Error('No valid image data received');
          }

          // Get image ID and download URL
          const imageId = message.image.id;
          const mediaUrl = `${META_CONFIG.API.BASE_URL}/${META_CONFIG.API.VERSION}/media/${imageId}`;
          
          log(LOG_LEVELS.INFO, 'API Configuration:', {
            baseUrl: META_CONFIG.API.BASE_URL,
            version: META_CONFIG.API.VERSION,
            phoneNumberId: META_CONFIG.API.PHONE_NUMBER_ID
          });

          log(LOG_LEVELS.INFO, 'Fetching image URL:', { 
            mediaUrl,
            imageId
          });
          
          // Get media URL
          const token = await tokenManager.getCurrentToken();
          log(LOG_LEVELS.INFO, 'Token received, length:', token?.length);
          
          const mediaResponse = await axios({
            method: 'get',
            url: mediaUrl,
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            }
          });
          
          log(LOG_LEVELS.INFO, 'Media API Response:', {
            status: mediaResponse.status,
            headers: mediaResponse.headers,
            data: mediaResponse.data
          });

          if (!mediaResponse.data || !mediaResponse.data.url) {
            log(LOG_LEVELS.ERROR, 'Invalid media response:', {
              data: mediaResponse.data,
              status: mediaResponse.status
            });
            throw new Error('No valid image URL received from Meta API');
          }

          const imageUrl = mediaResponse.data.url;
          log(LOG_LEVELS.INFO, 'Final image URL:', imageUrl);
          
          // Clear any existing conversation before processing image
          await openAIService.clearConversation(from);
          const response = await openAIService.processMessage(from, "", imageUrl);
          await whatsAppService.sendMessage(from, response);
        } catch (error) {
          log(LOG_LEVELS.ERROR, 'Error processing image:', {
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            stack: error.stack,
            config: error.config
          });
          await whatsAppService.sendMessage(from, "I apologize, but I had trouble processing your image. Could you try sending it again?");
        }
        return;
      }

      // Verarbeite Textnachrichten
      if (messageType === 'text') {
        const text = message.text.body;
        log(LOG_LEVELS.INFO, 'Processing text message:', { 
          text,
          timestamp: new Date(timestamp * 1000).toISOString()
        });
        // Clear conversation for new text message
        await openAIService.clearConversation(from);
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