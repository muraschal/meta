const express = require('express');
const router = express.Router();
const openaiService = require('../services/openai');
const whatsappService = require('../services/whatsapp');

// Webhook-Verifizierung für Meta
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Verify Token sollte in Ihrer .env-Datei definiert sein
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook wurde verifiziert');
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
      const messages = value.messages;

      if (!messages) return;

      const message = messages[0];
      const from = message.from; // Telefonnummer des Absenders
      const messageType = message.type; // text, image, etc.

      // Verarbeite "Hey Meta" Befehle
      if (messageType === 'text' && message.text.body.toLowerCase().startsWith('hey meta')) {
        const command = message.text.body.toLowerCase();
        console.log('Meta Glasses Befehl empfangen:', command);

        // Beispiel: "hey meta, message to xy"
        if (command.includes('message to')) {
          const content = command.split('message to')[1].trim();
          // Verarbeite die Nachricht mit OpenAI
          const response = await openaiService.processMessage(from, content);
          // Sende die Antwort zurück
          await whatsappService.sendMessage(from, response);
        }
      }

      // Verarbeite Bilder
      if (messageType === 'image') {
        const imageUrl = message.image.url;
        // Verarbeite das Bild mit OpenAI Vision
        const response = await openaiService.processMessage(from, "Beschreibe dieses Bild", imageUrl);
        // Sende die Antwort zurück
        await whatsappService.sendMessage(from, response);
      }
    }
  } catch (error) {
    console.error('Fehler bei der Webhook-Verarbeitung:', error);
    // Wir haben bereits 200 gesendet, also loggen wir nur den Fehler
  }
});

module.exports = router; 