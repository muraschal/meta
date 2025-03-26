import OpenAI from 'openai';
import fetch from 'node-fetch';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function sendWhatsAppMessage(to, message) {
  const url = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    console.log('Sende WhatsApp Nachricht:', { to, message });
    console.log('Verwende URL:', url);
    console.log('Mit Token:', process.env.META_ACCESS_TOKEN?.substring(0, 10) + '...');
    
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
      throw new Error(`WhatsApp API Fehler: ${response.status} - ${JSON.stringify(errorData)}`);
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
  console.log('Handler aufgerufen mit Methode:', req.method);
  
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('Webhook Verifizierung:', { mode, token: token?.substring(0, 5) + '...', challenge });

    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
      console.log('Webhook wurde verifiziert');
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  if (req.method === 'POST') {
    console.log('POST Request Headers:', req.headers);
    
    try {
      const { body } = req;
      console.log('Webhook POST empfangen:', JSON.stringify(body, null, 2));
      
      // Bestätigen Sie den Webhook-Empfang sofort
      res.status(200).send('OK');

      if (body.object === 'whatsapp_business_account') {
        console.log('WhatsApp Business Account Nachricht erkannt');
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
        console.log('Nachricht Details:', { from, messageType, body: message.text?.body });

        if (messageType === 'text' && message.text.body.toLowerCase().startsWith('hey meta')) {
          const command = message.text.body.toLowerCase();
          console.log('Meta Glasses Befehl empfangen:', command);

          if (command.includes('message to')) {
            try {
              const content = command.split('message to')[1].trim();
              console.log('Sende an OpenAI:', content);
              console.log('OpenAI API Key vorhanden:', !!process.env.OPENAI_API_KEY);
              console.log('OpenAI API Key Länge:', process.env.OPENAI_API_KEY?.length);
              
              console.log('Starte OpenAI Anfrage...');
              try {
                const completion = await openai.chat.completions.create({
                  model: "gpt-4",
                  messages: [{ role: "user", content }],
                  max_tokens: 1000
                });
                console.log('OpenAI Completion erhalten');
                const response = completion.choices[0].message.content;
                console.log('OpenAI Antwort:', response);
              } catch (openaiError) {
                console.error('OpenAI API Fehler:', openaiError);
                console.error('OpenAI Error Details:', {
                  message: openaiError.message,
                  name: openaiError.name,
                  stack: openaiError.stack
                });
                throw openaiError;
              }
              
              console.log('Meta Access Token vorhanden:', !!process.env.META_ACCESS_TOKEN);
              console.log('Meta Access Token Länge:', process.env.META_ACCESS_TOKEN?.length);
              console.log('WhatsApp Phone Number ID:', process.env.WHATSAPP_PHONE_NUMBER_ID);
              
              await sendWhatsAppMessage(from, response);
            } catch (error) {
              console.error('Fehler bei der Verarbeitung des message to Befehls:', error);
              throw error;
            }
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
      console.error('Stack Trace:', error.stack);
    }
    return;
  }

  // Wenn weder GET noch POST, sende 405 Method Not Allowed
  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
} 