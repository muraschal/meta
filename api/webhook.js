import OpenAI from 'openai';
import axios from 'axios';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Erstelle einen axios-Client mit Standardkonfiguration
const whatsappClient = axios.create({
  baseURL: 'https://graph.facebook.com/v17.0',
  timeout: 10000,
  headers: {
    'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function sendWhatsAppMessage(to, message) {
  try {
    console.log(`Sende Nachricht an ${to}`);
    
    const response = await whatsappClient.post(
      `/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message }
      }
    );
    
    console.log('WhatsApp Antwort:', response.status);
    return true;
  } catch (error) {
    console.error('WhatsApp Fehler:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
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

    return completion?.choices?.[0]?.message?.content || 'Keine Antwort von OpenAI erhalten';
  } catch (error) {
    console.error('OpenAI Fehler:', error.message);
    throw new Error('Fehler bei der OpenAI-Anfrage');
  }
}

async function handleMessage(from, content) {
  try {
    // Sende Bestätigung
    const confirmSent = await sendWhatsAppMessage(from, 'Ich verarbeite Ihre Anfrage...');
    if (!confirmSent) {
      throw new Error('Konnte Bestätigung nicht senden');
    }
    
    // Hole OpenAI Antwort mit Timeout
    console.log('Starte OpenAI Anfrage');
    const response = await Promise.race([
      getOpenAIResponse(content),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 15000)
      )
    ]);
    
    console.log('OpenAI Antwort erhalten');
    
    // Sende Antwort
    const sent = await sendWhatsAppMessage(from, response);
    if (!sent) {
      throw new Error('Konnte Antwort nicht senden');
    }
    
    console.log('Antwort erfolgreich gesendet');
  } catch (error) {
    console.error('Verarbeitungsfehler:', error.message);
    await sendWhatsAppMessage(from, 
      'Entschuldigung, es gab ein Problem bei der Verarbeitung Ihrer Anfrage. ' +
      (error.message === 'Timeout' ? 'Die Anfrage hat zu lange gedauert.' : 'Bitte versuchen Sie es später erneut.')
    ).catch(console.error);
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
    
    return;
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end();
} 