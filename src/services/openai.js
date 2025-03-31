import OpenAI from 'openai';
import { log, LOG_LEVELS } from '../utils/logger.js';
import axios from 'axios';

class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(process.env.OPENAI_ORG_ID && { organization: process.env.OPENAI_ORG_ID })
    });
    this.conversations = new Map();
    this.defaultModel = 'gpt-4-turbo-preview';
    this.visionModel = 'gpt-4-vision-preview';
  }

  async getWeatherData(city) {
    try {
      const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`);
      return `Aktuelle Wetterdaten für ${city}: ${response.data.main.temp}°C, ${response.data.weather[0].description}`;
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'Fehler beim Abrufen der Wetterdaten:', error);
      return null;
    }
  }

  async processMessage(userId, message, imageUrl = null) {
    try {
      let conversation = this.conversations.get(userId) || [];
      
      // System Message für mehrsprachige Unterstützung
      if (conversation.length === 0) {
        conversation.push({
          role: 'system',
          content: 'Du bist ein fortschrittlicher KI-Assistent, basierend auf GPT-4. Du antwortest in der gleichen Sprache, in der die Frage gestellt wurde. Sei präzise und informativ. Wenn nach Wetterdaten gefragt wird, warte auf die Echtzeitdaten, die ich dir zur Verfügung stelle.'
        });
      }

      // Prüfe auf Wetteranfragen
      if (message.toLowerCase().includes('wetter')) {
        const cityMatch = message.match(/wetter in (\w+)/i);
        if (cityMatch) {
          const weatherData = await this.getWeatherData(cityMatch[1]);
          if (weatherData) {
            message = `${message}\n\nEchtzeitdaten: ${weatherData}`;
          }
        }
      }
      
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
        model: imageUrl ? this.visionModel : this.defaultModel,
        messages: conversation,
        max_tokens: 1000,
        temperature: 0.7,
        presence_penalty: 0.3,
        frequency_penalty: 0.3
      });

      const response = completion.choices[0].message;
      conversation.push(response);
      
      // Behalte maximal die letzten 10 Nachrichten für Kontext
      if (conversation.length > 10) {
        conversation = [
          conversation[0], // System Message
          ...conversation.slice(-9) // Letzte 9 Nachrichten
        ];
      }
      
      this.conversations.set(userId, conversation);

      return response.content;
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'Fehler bei der OpenAI-Verarbeitung:', error);
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
        model: this.defaultModel,
        messages: [
          { 
            role: "system", 
            content: "Du bist ein fortschrittlicher KI-Assistent, basierend auf GPT-4. Du antwortest in der gleichen Sprache, in der die Frage gestellt wurde. Sei präzise und informativ. Du hast Zugriff auf aktuelle Informationen bis Januar 2024. Für Echtzeit-Daten wie Wetter, Aktienkurse oder Live-Events verweise die Nutzer freundlich an entsprechende Dienste." 
          },
          { 
            role: "user", 
            content 
          }
        ],
        max_tokens: 1000,
        temperature: 0.7,
        presence_penalty: 0.3,
        frequency_penalty: 0.3
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