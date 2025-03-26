const whatsappService = require('../src/services/whatsapp');
const openaiService = require('../src/services/openai');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    // Webhook-Verifizierung
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
      console.log('Webhook wurde verifiziert');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else if (req.method === 'POST') {
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
        const from = message.from;
        const messageType = message.type;

        // Verarbeite "Hey Meta" Befehle
        if (messageType === 'text' && message.text.body.toLowerCase().startsWith('hey meta')) {
          const command = message.text.body.toLowerCase();
          console.log('Meta Glasses Befehl empfangen:', command);

          if (command.includes('message to')) {
            const content = command.split('message to')[1].trim();
            const response = await openaiService.processMessage(from, content);
            await whatsappService.sendMessage(from, response);
          }
        }

        // Verarbeite Bilder
        if (messageType === 'image') {
          const imageUrl = message.image.url;
          const response = await openaiService.processMessage(from, "Beschreibe dieses Bild", imageUrl);
          await whatsappService.sendMessage(from, response);
        }
      }
    } catch (error) {
      console.error('Fehler bei der Webhook-Verarbeitung:', error);
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}; 