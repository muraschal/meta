import OpenAI from 'openai';
import fetch from 'node-fetch';
import https from 'https';

// Erstelle einen benutzerdefinierten HTTPS-Agent
const agent = new https.Agent({
  rejectUnauthorized: false, // In Produktion sollte dies auf true gesetzt sein
  keepAlive: true,
  timeout: 30000,
  secureProtocol: 'TLSv1_2_method'
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000 // 30 Sekunden Timeout
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
      }),
      agent: agent,
      timeout: 30000,
      compress: false
    });
    
    const responseText = await response.text();
    console.log('WhatsApp API Rohantwort:', responseText);
    
    if (!response.ok) {
      console.error('WhatsApp API Fehler:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseText
      });
      throw new Error(`WhatsApp API Fehler: ${response.status}`);
    }
    
    try {
      const data = JSON.parse(responseText);
      console.log('WhatsApp Antwort (parsed):', data);
      return data;
    } catch (parseError) {
      console.error('Fehler beim Parsen der WhatsApp-Antwort:', parseError);
      return { raw: responseText };
    }
  } catch (error) {
    console.error('Fehler beim Senden der WhatsApp Nachricht:', {
      error: error.message,
      stack: error.stack,
      cause: error.cause,
      code: error.code,
      errno: error.errno
    });
    throw error;
  }
}

async function processOpenAIRequest(content) {
  console.log('Verarbeite OpenAI Anfrage:', content);
  console.log('OpenAI API Key (erste 10 Zeichen):', process.env.OPENAI_API_KEY?.substring(0, 10));
  
  try {
    console.log('Starte OpenAI API Aufruf...');
    const requestBody = {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content }],
      max_tokens: 500,
      temperature: 0.7
    };
    console.log('OpenAI Request Body:', JSON.stringify(requestBody, null, 2));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 Sekunden Timeout

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log('OpenAI API Status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API Fehler:', errorData);
      throw new Error(`OpenAI API Fehler: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log('OpenAI Rohantwort:', JSON.stringify(data, null, 2));
    
    if (!data.choices?.[0]?.message?.content) {
      console.error('Ungültige OpenAI Antwort:', data);
      throw new Error('Ungültige OpenAI Antwort');
    }

    const result = data.choices[0].message.content;
    console.log('Extrahierte OpenAI Antwort:', result);
    return result;
  } catch (error) {
    console.error('OpenAI Fehler:', {
      error: error.message,
      stack: error.stack,
      cause: error.cause,
      name: error.name
    });
    if (error.name === 'AbortError') {
      throw new Error('OpenAI Timeout nach 30 Sekunden');
    }
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
              
              // Sende sofort eine Bestätigung
              await sendWhatsAppMessage(from, 'Ich verarbeite Ihre Anfrage...');
              
              // Verarbeite die OpenAI-Anfrage
              const response = await processOpenAIRequest(content);
              console.log('OpenAI Antwort erhalten:', response);
              
              // Sende die Antwort
              await sendWhatsAppMessage(from, response);
            } catch (error) {
              console.error('Fehler bei der Verarbeitung:', error);
              let errorMessage = 'Entschuldigung, es gab ein Problem bei der Verarbeitung Ihrer Anfrage.';
              if (error.message.includes('Timeout')) {
                errorMessage += ' Der Server antwortet nicht rechtzeitig.';
              }
              await sendWhatsAppMessage(from, errorMessage).catch(console.error);
            }
          }
        }

        if (messageType === 'image') {
          try {
            const imageUrl = message.image.url;
            console.log('Bild empfangen:', imageUrl);
            
            // Sende sofort eine Bestätigung
            await sendWhatsAppMessage(from, 'Ich analysiere das Bild...');
            
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

            console.log('OpenAI Vision Rohantwort:', JSON.stringify(completion, null, 2));
            
            if (!completion?.choices?.[0]?.message?.content) {
              throw new Error('Ungültige OpenAI Vision Antwort');
            }

            const visionResponse = completion.choices[0].message.content;
            console.log('OpenAI Vision Antwort:', visionResponse);
            await sendWhatsAppMessage(from, visionResponse);
          } catch (error) {
            console.error('Fehler bei der Bildverarbeitung:', error);
            let errorMessage = 'Entschuldigung, es gab ein Problem bei der Verarbeitung des Bildes.';
            if (error.message.includes('Timeout')) {
              errorMessage += ' Der Server antwortet nicht rechtzeitig.';
            }
            await sendWhatsAppMessage(from, errorMessage).catch(console.error);
          }
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