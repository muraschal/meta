const axios = require('axios');

class WhatsAppService {
  constructor() {
    this.baseUrl = 'https://graph.facebook.com/v17.0';
    this.accessToken = process.env.META_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  }

  async sendMessage(to, message, type = 'text') {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type,
          ...(type === 'text' ? { text: { body: message } } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error('Fehler beim Senden der WhatsApp-Nachricht:', error);
      throw error;
    }
  }

  async sendImage(to, imageUrl, caption = '') {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'image',
          image: {
            link: imageUrl,
            caption,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
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
    const entry = payload.entry[0];
    const changes = entry.changes[0];
    const value = changes.value;
    const message = value.messages[0];

    return {
      from: message.from,
      type: message.type,
      content: message.text?.body || '',
      mediaUrl: message.image?.link || '',
      timestamp: message.timestamp,
    };
  }
}

module.exports = new WhatsAppService(); 