import axios from 'axios';
import tokenManager from './token-manager.js';

class WhatsAppService {
  constructor() {
    this.baseUrl = 'https://graph.facebook.com/v17.0';
  }

  async sendMessage(to, message, phoneNumberId, type = 'text') {
    try {
      const token = await tokenManager.getCurrentToken();
      
      const response = await axios.post(
        `${this.baseUrl}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type,
          ...(type === 'text' ? { text: { body: message } } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error('Fehler beim Senden der WhatsApp-Nachricht:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      throw error;
    }
  }

  async sendImage(to, imageUrl, phoneNumberId, caption = '') {
    try {
      const token = await tokenManager.getCurrentToken();
      
      const response = await axios.post(
        `${this.baseUrl}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'image',
          image: {
            link: imageUrl,
            caption,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error('Fehler beim Senden des WhatsApp-Bildes:', error);
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
      return {
        type: 'status',
        status: value.statuses[0]
      };
    }

    // Wenn es eine eingehende Nachricht ist
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

    // Wenn es eine Metadaten-Update-Nachricht ist
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