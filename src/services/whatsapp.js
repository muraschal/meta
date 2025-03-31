import axios from 'axios';
import tokenManager from './token-manager.js';
import { log, LOG_LEVELS } from '../utils/logger.js';

class WhatsAppService {
  constructor() {
    this.baseUrl = 'https://graph.facebook.com/v17.0';
    this.phoneNumberId = process.env.META_PHONE_NUMBER_ID;
    if (!this.phoneNumberId) {
      log(LOG_LEVELS.ERROR, 'META_PHONE_NUMBER_ID ist nicht konfiguriert');
      throw new Error('META_PHONE_NUMBER_ID muss in den Umgebungsvariablen gesetzt sein');
    }
    log(LOG_LEVELS.INFO, `WhatsApp Service initialisiert mit Phone Number ID: ${this.phoneNumberId}`);
    this.businessAccountId = process.env.META_BUSINESS_ACCOUNT_ID || '1233067364910106';
    this.apiVersion = 'v17.0';
  }

  formatErrorDetails(error) {
    const errorDetails = {
      message: error.message,
      code: error.response?.data?.error?.code,
      subcode: error.response?.data?.error?.error_subcode,
      type: error.response?.data?.error?.type,
      fbTraceId: error.response?.data?.error?.fbtrace_id,
      status: error.response?.status
    };

    // Füge hilfreiche Kontextinformationen hinzu
    switch (errorDetails.code) {
      case 100:
        errorDetails.hint = 'Möglicherweise falsche ID oder fehlende Berechtigungen';
        break;
      case 190:
        errorDetails.hint = 'Token ist ungültig oder abgelaufen';
        break;
      case 200:
        errorDetails.hint = 'Fehlende Berechtigungen für diese Operation';
        break;
      default:
        errorDetails.hint = 'Unbekannter Fehler, bitte prüfen Sie die Meta Developer Console';
    }

    return errorDetails;
  }

  formatPhoneNumber(number) {
    // Entferne alle nicht-numerischen Zeichen
    const cleaned = number.replace(/\D/g, '');
    // Stelle sicher, dass die Nummer mit "+" beginnt
    return cleaned.startsWith('') ? `+${cleaned}` : cleaned;
  }

  async sendMessage(to, message, phoneNumberId = this.phoneNumberId, type = 'text') {
    try {
      const token = await tokenManager.getCurrentToken();
      const formattedTo = this.formatPhoneNumber(to);
      
      // Debug-Logs für Request-Details
      log(LOG_LEVELS.DEBUG, 'Sende WhatsApp Nachricht:', {
        phoneNumberId,
        to: formattedTo,
        messageType: type,
        messageLength: message.length
      });
      
      const endpoint = `${this.baseUrl}/${phoneNumberId}/messages`;
      
      try {
        const requestData = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedTo,
          type,
          ...(type === 'text' ? { 
            text: { 
              preview_url: false,
              body: message 
            } 
          } : {})
        };

        // Debug-Log für Request-Payload
        log(LOG_LEVELS.DEBUG, 'Request Payload:', requestData);
        
        const response = await axios({
          method: 'post',
          url: endpoint,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          data: requestData,
          timeout: 10000
        });
        
        // Debug-Log für erfolgreiche Antwort
        log(LOG_LEVELS.DEBUG, 'API Antwort:', response.data);
        log(LOG_LEVELS.INFO, `✓ Nachricht erfolgreich gesendet an ${formattedTo}`);
        return response.data;
      } catch (err) {
        const errorDetails = this.formatErrorDetails(err);
        
        // Erweiterte Fehlerprotokollierung
        log(LOG_LEVELS.ERROR, 'WhatsApp API Fehler:', {
          ...errorDetails,
          endpoint,
          requestData: {
            to: formattedTo,
            type,
            phoneNumberId
          },
          responseData: err.response?.data
        });
        
        if (errorDetails.code === 100 && errorDetails.subcode === 33) {
          log(LOG_LEVELS.ERROR, 'Detaillierte API-Fehlermeldung:', {
            error: err.response?.data?.error,
            headers: err.response?.headers
          });
        }
        
        throw new Error(`WhatsApp API Fehler: ${errorDetails.hint}`);
      }
    } catch (error) {
      throw error;
    }
  }

  async sendImage(to, imageUrl, phoneNumberId = this.phoneNumberId, caption = '') {
    try {
      const token = await tokenManager.getCurrentToken();
      
      const endpoint = `${this.baseUrl}/${phoneNumberId}/messages`;
      
      try {
        log(LOG_LEVELS.DEBUG, `Sende Bild an: ${endpoint}`);
        
        const response = await axios({
          method: 'post',
          url: endpoint,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
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
        
        log(LOG_LEVELS.DEBUG, 'API Antwort:', response.data);
        return response.data;
      } catch (err) {
        const errorDetails = this.formatErrorDetails(err);
        log(LOG_LEVELS.ERROR, 'WhatsApp API Bild-Fehler:', {
          ...errorDetails,
          endpoint,
          to,
          imageUrl
        });
        throw new Error(`WhatsApp API Bild-Fehler: ${errorDetails.hint}`);
      }
    } catch (error) {
      if (error.response?.data?.error) {
        const errorDetails = this.formatErrorDetails(error);
        log(LOG_LEVELS.ERROR, 'WhatsApp API Bild-Fehler:', errorDetails);
        throw new Error(`WhatsApp API Bild-Fehler: ${errorDetails.hint}`);
      } else {
        log(LOG_LEVELS.ERROR, 'Netzwerk- oder Systemfehler beim Bild-Upload:', {
          message: error.message,
          code: error.code
        });
        throw error;
      }
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