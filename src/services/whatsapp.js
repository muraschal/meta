import axios from 'axios';
import tokenManager from './token-manager.js';
import { log, LOG_LEVELS } from '../utils/logger.js';

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

class WhatsAppService {
  constructor() {
    this.baseUrl = 'https://graph.facebook.com/v17.0';
    this.phoneNumberId = '637450429443686';
    this.businessAccountId = '1233067364910106';
    this.apiVersion = 'v17.0'; // Aktuelle Graph API-Version
  }

  async sendMessage(to, message, phoneNumberId = this.phoneNumberId, type = 'text') {
    try {
      const token = await tokenManager.getCurrentToken();
      
      // Varianten für URL ausprobieren
      const endpoints = [
        // Variante 1: Direkt an die Business ID
        `${this.baseUrl}/${this.businessAccountId}/messages`,
        // Variante 2: Mit Phone Number ID
        `${this.baseUrl}/${phoneNumberId}/messages`,
        // Variante 3: Expliziter API-Pfad
        `https://graph.facebook.com/${this.apiVersion}/${this.businessAccountId}/messages`
      ];
      
      let lastError = null;
      
      // Versuche verschiedene Endpunkte
      for (const endpoint of endpoints) {
        try {
          log(LOG_LEVELS.DEBUG, `Versuche Endpunkt: ${endpoint}`);
          
          const response = await axios({
            method: 'post',
            url: endpoint,
            params: { access_token: token },
            headers: { 'Content-Type': 'application/json' },
            data: {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to,
              type,
              ...(type === 'text' ? { text: { body: message } } : {})
            },
            timeout: 10000
          });
          
          log(LOG_LEVELS.DEBUG, `Erfolgreiche Antwort von: ${endpoint}`);
          return response.data;
        } catch (err) {
          log(LOG_LEVELS.DEBUG, `Fehler bei Endpunkt ${endpoint}:`, err.message);
          lastError = err;
        }
      }
      
      throw lastError || new Error('Alle Endpunkte fehlgeschlagen');
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'WhatsApp API Fehler:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      throw error;
    }
  }

  async sendImage(to, imageUrl, phoneNumberId = this.phoneNumberId, caption = '') {
    try {
      const token = await tokenManager.getCurrentToken();
      
      // Varianten für URL ausprobieren
      const endpoints = [
        // Variante 1: Direkt an die Business ID
        `${this.baseUrl}/${this.businessAccountId}/messages`,
        // Variante 2: Mit Phone Number ID
        `${this.baseUrl}/${phoneNumberId}/messages`,
        // Variante 3: Expliziter API-Pfad
        `https://graph.facebook.com/${this.apiVersion}/${this.businessAccountId}/messages`
      ];
      
      let lastError = null;
      
      // Versuche verschiedene Endpunkte
      for (const endpoint of endpoints) {
        try {
          log(LOG_LEVELS.DEBUG, `Versuche Endpunkt für Bild: ${endpoint}`);
          
          const response = await axios({
            method: 'post',
            url: endpoint,
            params: { access_token: token },
            headers: { 'Content-Type': 'application/json' },
            data: {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to,
              type: 'image',
              image: {
                link: imageUrl,
                caption,
              }
            },
            timeout: 10000
          });
          
          log(LOG_LEVELS.DEBUG, `Erfolgreiche Bild-Antwort von: ${endpoint}`);
          return response.data;
        } catch (err) {
          log(LOG_LEVELS.DEBUG, `Fehler bei Bild-Endpunkt ${endpoint}:`, err.message);
          lastError = err;
        }
      }
      
      throw lastError || new Error('Alle Bild-Endpunkte fehlgeschlagen');
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'WhatsApp API Bild-Fehler:', error);
      throw error;
    }
  }

  async handleWebhook(payload) {
    // Verarbeitung der eingehenden Webhook-Nachrichten
    if (!payload?.entry?.[0]?.changes?.[0]?.value) {
      throw new Error('Ungültige Webhook-Payload-Struktur');
    }

    const value = payload.entry[0].changes[0].value;
    
    // Wenn es eine Status-Update-Nachricht ist
    if (value.statuses) {
      log(LOG_LEVELS.DEBUG, 'Status-Update empfangen');
      return {
        type: 'status',
        status: value.statuses[0]
      };
    }

    // Wenn es eine eingehende Nachricht ist
    if (value.messages) {
      const message = value.messages[0];
      log(LOG_LEVELS.INFO, 'Neue Nachricht empfangen');
      return {
        type: 'message',
        from: message.from,
        messageType: message.type,
        content: message.text?.body || '',
        mediaUrl: message.image?.link || '',
        timestamp: message.timestamp,
        phoneNumberId: value.metadata?.phone_number_id
      };
    }

    // Wenn es eine Metadaten-Update-Nachricht ist
    if (value.metadata) {
      log(LOG_LEVELS.DEBUG, 'Metadaten-Update empfangen');
      return {
        type: 'metadata',
        phoneNumberId: value.metadata.phone_number_id,
        displayPhoneNumber: value.metadata.display_phone_number
      };
    }

    throw new Error('Unbekannter Webhook-Payload-Typ');
  }
}

const whatsappService = new WhatsAppService();
export default whatsappService; 