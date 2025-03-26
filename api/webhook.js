import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function sendWhatsAppMessage(to, message) {
  const url = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    console.log('Sende WhatsApp Nachricht:', { to, message });
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message }
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('WhatsApp API Fehler:', errorData);
      throw new Error(`WhatsApp API Fehler: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('WhatsApp Antwort:', data);
    return data;
  } catch (error) {
    console.error('Fehler beim Senden der WhatsApp Nachricht:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
      console.log('Webhook wurde verifiziert');
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  if (req.method === 'POST') {
    try {
      const { body } = req;
      console.log('Webhook POST empfangen:', JSON.stringify(body, null, 2));
      
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

        if (messageType === 'text' && message.text.body.toLowerCase().startsWith('hey meta')) {
          const command = message.text.body.toLowerCase();
          console.log('Meta Glasses Befehl empfangen:', command);

          if (command.includes('message to')) {
            const content = command.split('message to')[1].trim();
            console.log('Sende an OpenAI:', content);
            const completion = await openai.chat.completions.create({
              model: "gpt-4",
              messages: [{ role: "user", content }],
            });
            const response = completion.choices[0].message.content;
            console.log('OpenAI Antwort:', response);
            await sendWhatsAppMessage(from, response);
          }
        }

        if (messageType === 'image') {
          const imageUrl = message.image.url;
          console.log('Bild empfangen:', imageUrl);
          const completion = await openai.chat.completions.create({
            model: "gpt-4-vision-preview",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Beschreibe dieses Bild" },
                  { type: "image_url", image_url: imageUrl }
                ],
              },
            ],
          });
          const response = completion.choices[0].message.content;
          console.log('OpenAI Vision Antwort:', response);
          await sendWhatsAppMessage(from, response);
        }
      }
    } catch (error) {
      console.error('Fehler bei der Webhook-Verarbeitung:', error);
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
} 