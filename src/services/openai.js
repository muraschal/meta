const OpenAI = require('openai');

class OpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
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

      const completion = await this.openai.chat.completions.create({
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
}

module.exports = new OpenAIService(); 