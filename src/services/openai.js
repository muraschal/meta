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
      
      // System Message for English responses
      if (conversation.length === 0) {
        conversation.push({
          role: 'system',
          content: 'You are an advanced AI assistant based on GPT-4. Always respond in English. For images, provide a detailed description and analysis of what you see. Be precise and informative.'
        });
      }
      
      // If only image is provided without text, add a default prompt
      if (imageUrl && (!message || message.trim() === '')) {
        message = "Please describe what you see in this image in detail.";
      }

      // Handle message with or without image
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
      
      // Keep max 10 messages for context
      if (conversation.length > 10) {
        conversation = [
          conversation[0], // System Message
          ...conversation.slice(-9) // Last 9 messages
        ];
      }
      
      this.conversations.set(userId, conversation);

      return response.content;
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'Error processing OpenAI request:', error);
      throw error;
    }
  }

  async clearConversation(userId) {
    this.conversations.delete(userId);
  }

  async generateResponse(content) {
    try {
      log(LOG_LEVELS.DEBUG, 'OpenAI Request:', content);
      
      const completion = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { 
            role: "system", 
            content: "You are an advanced AI assistant based on GPT-4. Always respond in English. Be precise and informative." 
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
        throw new Error('No valid response received from OpenAI');
      }

      const response = completion.choices[0].message.content;
      log(LOG_LEVELS.DEBUG, 'OpenAI Response:', response);
      return response;
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'OpenAI API Error:', {
        message: error.message,
        code: error.response?.status,
        data: error.response?.data
      });
      throw new Error(`OpenAI Error: ${error.message}`);
    }
  }
}

export { OpenAIService }; 