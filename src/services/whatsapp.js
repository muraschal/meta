import axios from 'axios';
import tokenManager from './token-manager.js';
import { log, LOG_LEVELS } from '../utils/logger.js';

class WhatsAppService {
  constructor() {
    this.baseUrl = 'https://graph.facebook.com/v17.0';
    this.phoneNumberId = '637450429443686';
    this.businessAccountId = '1233067364910106';
    this.apiVersion = 'v17.0';
  }

  async sendMessage(to, message, phoneNumberId = this.phoneNumberId, type = 'text') {
    try {
      const token = await tokenManager.getCurrentToken();
      
      const endpoints = [
        `${this.baseUrl}/${this.businessAccountId}/messages`,
        `${this.baseUrl}/${phoneNumberId}/messages`,
        `https://graph.facebook.com/${this.apiVersion}/${this.businessAccountId}/messages`
      ];
      
      let lastError = null;
      
      for (const endpoint of endpoints) {
        try {
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
          
          return response.data;
        } catch (err) {
          lastError = err;
          continue;
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
      
      const endpoints = [
        `${this.baseUrl}/${this.businessAccountId}/messages`,
        `${this.baseUrl}/${phoneNumberId}/messages`,
        `https://graph.facebook.com/${this.apiVersion}/${this.businessAccountId}/messages`
      ];
      
      let lastError = null;
      
      for (const endpoint of endpoints) {
        try {
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
          
          return response.data;
        } catch (err) {
          lastError = err;
          continue;
        }
      }
      
      throw lastError || new Error('Alle Bild-Endpunkte fehlgeschlagen');
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'WhatsApp API Bild-Fehler:', error);
      throw error;
    }
  }

  async handleWebhook(payload) {
    if (!payload?.entry?.[0]?.changes?.[0]?.value) {
      throw new Error('Ungültige Webhook-Payload-Struktur');
    }

    const value = payload.entry[0].changes[0].value;
    
    if (value.statuses) {
      return {
        type: 'status',
        status: value.statuses[0]
      };
    }

    if (value.messages) {
      const message = value.messages[0];
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

    if (value.metadata) {
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