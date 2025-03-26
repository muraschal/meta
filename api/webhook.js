import OpenAI from 'openai';
import fetch from 'node-fetch';
import https from 'https';

// Erstelle einen benutzerdefinierten HTTPS-Agent
const agent = new https.Agent({
  keepAlive: true,
  timeout: 25000
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 25000
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
      }),
      agent: agent,
      timeout: 25000
    });
    
    if (!response.ok) {
      throw new Error(`WhatsApp API Fehler: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Fehler beim Senden der WhatsApp Nachricht:', error);
    throw error;
  }
}

async function processOpenAIRequest(content) {
  try {
    console.log('Starte OpenAI Anfrage:', content);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content }],
      max_tokens: 200,
      temperature: 0.7
    });

    if (!completion?.choices?.[0]?.message?.content) {
      throw new Error('Ungültige OpenAI Antwort');
    }

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI Fehler:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  if (req.method === 'POST') {
    try {
      const { body } = req;
      
      // Bestätigen Sie den Webhook-Empfang sofort
      res.status(200).send('OK');

      if (body.object === 'whatsapp_business_account') {
        const entry = body.entry[0];
        const changes = entry.changes[0];
        const value = changes.value;
        const messages = value.messages;

        if (!messages) {
          console.log('Keine Nachrichten im Payload gefunden');
          return;
        }

        const message = messages[0];
        const from = message.from;
        const messageType = message.type;

        if (messageType === 'text' && message.text.body.toLowerCase().startsWith('hey meta')) {
          const command = message.text.body.toLowerCase();
          console.log('Meta Befehl empfangen:', command);

          if (command.includes('message to')) {
            try {
              const content = command.split('message to')[1].trim();
              
              // Sende Bestätigung
              await sendWhatsAppMessage(from, 'Ich verarbeite Ihre Anfrage...');
              
              // Verarbeite OpenAI Anfrage
              const response = await processOpenAIRequest(content);
              
              // Sende Antwort
              await sendWhatsAppMessage(from, response);
            } catch (error) {
              console.error('Verarbeitungsfehler:', error);
              let errorMessage = 'Entschuldigung, es gab ein Problem bei der Verarbeitung Ihrer Anfrage.';
              if (error.message.includes('Timeout')) {
                errorMessage += ' Der Server antwortet nicht rechtzeitig.';
              }
              await sendWhatsAppMessage(from, errorMessage).catch(console.error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Webhook-Fehler:', error);
    }
  }

  return res.status(405).end();
} 