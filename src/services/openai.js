import OpenAI from 'openai';
import { log, LOG_LEVELS } from '../utils/logger.js';

class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(process.env.OPENAI_ORG_ID && { organization: process.env.OPENAI_ORG_ID })
    });
    this.conversations = new Map();
  }

  async processMessage(userId, message, imageUrl = null) {
    try {
      let conversation = this.conversations.get(userId) || [];
      
      // Wenn ein Bild vorhanden ist, fügen wir es zur Konversation hinzu
      if (imageUrl) {
        conversation.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: message
            },
            {
              type: 'image_url',
              image_url: imageUrl
            }
          ]
        });
      } else {
        conversation.push({
          role: 'user',
          content: message
        });
      }

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4-vision-preview',
        messages: conversation,
        max_tokens: 1000,
      });

      const response = completion.choices[0].message;
      conversation.push(response);
      this.conversations.set(userId, conversation);

      return response.content;
    } catch (error) {
      console.error('Fehler bei der OpenAI-Verarbeitung:', error);
      throw error;
    }
  }

  async clearConversation(userId) {
    this.conversations.delete(userId);
  }

  async generateResponse(content) {
    try {
      log(LOG_LEVELS.DEBUG, 'OpenAI Anfrage:', content);
      
      const completion = await this.client.chat.completions.create({
        model: "gpt-4",
        messages: [
          { 
            role: "system", 
            content: "You are a helpful assistant providing precise and informative answers. Always respond in English." 
          },
          { 
            role: "user", 
            content 
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      if (!completion?.choices?.[0]?.message?.content) {
        throw new Error('Keine gültige Antwort von OpenAI erhalten');
      }

      const response = completion.choices[0].message.content;
      log(LOG_LEVELS.DEBUG, 'OpenAI Antwort:', response);
      return response;
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'OpenAI API Fehler:', {
        message: error.message,
        code: error.response?.status,
        data: error.response?.data
      });
      throw new Error(`OpenAI Fehler: ${error.message}`);
    }
  }
}

export { OpenAIService }; 