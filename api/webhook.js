import OpenAI from 'openai';
import got from 'got';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function sendWhatsAppMessage(to, message) {
  const url = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  
  try {
    console.log(`Sende Nachricht an ${to}: ${message}`);
    
    const response = await got.post(url, {
      json: {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message }
      },
      headers: {
        'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: {
        request: 10000
      },
      retry: {
        limit: 2,
        methods: ['POST']
      }
    }).json();
    
    console.log('WhatsApp Antwort:', response);
    return true;
  } catch (error) {
    console.error('WhatsApp Fehler:', {
      code: error.code,
      message: error.message,
      response: error.response?.body
    });
    return false;
  }
}

async function getOpenAIResponse(content) {
  try {
    console.log('OpenAI Anfrage:', content);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content }],
      max_tokens: 150,
      temperature: 0.7
    });

    const response = completion?.choices?.[0]?.message?.content;
    console.log('OpenAI Antwort:', response);
    return response || 'Keine Antwort von OpenAI erhalten';
  } catch (error) {
    console.error('OpenAI Fehler:', error.message);
    throw new Error('Fehler bei der OpenAI-Anfrage');
  }
}

async function handleMessage(from, content) {
  try {
    // Sende Bestätigung
    console.log('Sende Bestätigung...');
    const confirmSent = await sendWhatsAppMessage(from, 'Ich verarbeite Ihre Anfrage...');
    if (!confirmSent) {
      throw new Error('Konnte Bestätigung nicht senden');
    }
    
    // Hole OpenAI Antwort mit Timeout
    console.log('Starte OpenAI Verarbeitung...');
    const response = await Promise.race([
      getOpenAIResponse(content),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 15000)
      )
    ]);
    
    console.log('Sende OpenAI Antwort...');
    const sent = await sendWhatsAppMessage(from, response);
    if (!sent) {
      throw new Error('Konnte Antwort nicht senden');
    }
    
    console.log('Verarbeitung abgeschlossen');
  } catch (error) {
    console.error('Verarbeitungsfehler:', error.message);
    const errorMessage = 'Entschuldigung, es gab ein Problem bei der Verarbeitung Ihrer Anfrage. ' +
      (error.message === 'Timeout' ? 'Die Anfrage hat zu lange gedauert.' : 'Bitte versuchen Sie es später erneut.');
    
    await sendWhatsAppMessage(from, errorMessage).catch(err => {
      console.error('Fehler beim Senden der Fehlermeldung:', err.message);
    });
  }
}

export default async function handler(req, res) {
  // Webhook Verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  // Webhook Handler
  if (req.method === 'POST') {
    // Bestätige Empfang sofort
    res.status(200).send('OK');

    try {
      const { body } = req;
      console.log('Webhook empfangen:', JSON.stringify(body, null, 2));
      
      if (body?.object === 'whatsapp_business_account') {
        const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        
        if (message?.type === 'text') {
          const text = message.text.body.toLowerCase();
          const from = message.from;
          
          if (text.startsWith('hey meta') && text.includes('message to')) {
            console.log('Meta Befehl empfangen:', text);
            const content = text.split('message to')[1].trim();
            
            // Starte asynchrone Verarbeitung
            handleMessage(from, content).catch(error => {
              console.error('Unbehandelter Fehler:', error);
            });
          }
        }
      }
    } catch (error) {
      console.error('Webhook Fehler:', error);
    }
  }

  return res.status(405).end();
} 