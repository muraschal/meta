import OpenAI from 'openai';

// Globales Error Handling
process.on('unhandledRejection', (error) => {
  console.error('=== UNHANDLED REJECTION ===');
  console.error('Fehlertyp:', error.name);
  console.error('Fehlermeldung:', error.message);
  console.error('Stack:', error.stack);
});

process.on('uncaughtException', (error) => {
  console.error('=== UNCAUGHT EXCEPTION ===');
  console.error('Fehlertyp:', error.name);
  console.error('Fehlermeldung:', error.message);
  console.error('Stack:', error.stack);
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function fetchWithTimeout(url, options, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function sendWhatsAppMessage(to, message) {
  try {
    console.log('=== SENDE WHATSAPP NACHRICHT ===');
    console.log('An:', to);
    console.log('Nachricht:', message);
    console.log('Token (erste 10 Zeichen):', process.env.META_ACCESS_TOKEN?.substring(0, 10) + '...');
    console.log('Phone ID:', process.env.WHATSAPP_PHONE_NUMBER_ID);
    console.log('Business Account ID:', process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);

    const url = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    console.log('URL:', url);

    const requestBody = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message }
    };
    console.log('Request Body:', JSON.stringify(requestBody, null, 2));

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Response Status:', response.status);
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
    
    const responseData = await response.text();
    console.log('Response Body:', responseData);

    if (!response.ok) {
      const errorData = JSON.parse(responseData);
      console.error('WhatsApp API Fehler Details:', {
        code: errorData.error?.code,
        subcode: errorData.error?.error_subcode,
        message: errorData.error?.message,
        type: errorData.error?.type,
        fbtrace_id: errorData.error?.fbtrace_id
      });
      throw new Error(`WhatsApp API Fehler: ${response.status} - ${responseData}`);
    }

    return true;
  } catch (error) {
    console.error('=== WHATSAPP FEHLER ===');
    console.error('Fehlertyp:', error.name);
    console.error('Fehlermeldung:', error.message);
    console.error('Stack:', error.stack);
    if (error.cause) {
      console.error('Ursache:', error.cause);
    }
    if (error.name === 'AbortError') {
      console.error('Timeout beim Senden der WhatsApp Nachricht');
    }
    return false;
  }
}

async function getOpenAIResponse(content) {
  try {
    console.log('=== OPENAI ANFRAGE ===');
    console.log('Inhalt:', content);
    console.log('API Key vorhanden:', !!process.env.OPENAI_API_KEY);
    
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
    console.error('=== OPENAI FEHLER ===');
    console.error('Fehlertyp:', error.name);
    console.error('Fehlermeldung:', error.message);
    console.error('Stack:', error.stack);
    if (error.cause) {
      console.error('Ursache:', error.cause);
    }
    throw error;
  }
}

export default async function handler(req, res) {
  console.log('=== WEBHOOK HANDLER START ===');
  console.log('Methode:', req.method);
  console.log('Headers:', req.headers);
  
  // Webhook Verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('Webhook Verifizierung:', { mode, token: token?.substring(0, 5) + '...', challenge });

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
      console.log('=== WEBHOOK PAYLOAD ===');
      console.log(JSON.stringify(body, null, 2));
      
      if (body?.object === 'whatsapp_business_account') {
        const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        
        if (message?.type === 'text') {
          const text = message.text.body.toLowerCase();
          const from = message.from;
          
          if (text.startsWith('hey meta') && text.includes('message to')) {
            console.log('=== META BEFEHL EMPFANGEN ===');
            console.log('Text:', text);
            console.log('Von:', from);
            
            const content = text.split('message to')[1].trim();
            
            try {
              // Sende Bestätigung
              console.log('Sende Bestätigung...');
              const confirmSent = await sendWhatsAppMessage(from, 'Ich verarbeite Ihre Anfrage...');
              console.log('Bestätigung gesendet:', confirmSent);
              
              if (!confirmSent) {
                throw new Error('Konnte Bestätigung nicht senden');
              }
              
              // Hole OpenAI Antwort
              console.log('Hole OpenAI Antwort...');
              const response = await getOpenAIResponse(content);
              console.log('OpenAI Antwort erhalten:', response);
              
              // Sende Antwort
              console.log('Sende finale Antwort...');
              const finalSent = await sendWhatsAppMessage(from, response);
              console.log('Finale Antwort gesendet:', finalSent);
              
              if (!finalSent) {
                throw new Error('Konnte finale Antwort nicht senden');
              }
              
              console.log('=== VERARBEITUNG ABGESCHLOSSEN ===');
            } catch (error) {
              console.error('=== VERARBEITUNGSFEHLER ===');
              console.error('Fehlertyp:', error.name);
              console.error('Fehlermeldung:', error.message);
              console.error('Stack:', error.stack);
              if (error.cause) {
                console.error('Ursache:', error.cause);
              }
              
              await sendWhatsAppMessage(from, 
                'Entschuldigung, es gab ein Problem bei der Verarbeitung Ihrer Anfrage. ' +
                'Bitte versuchen Sie es später erneut.'
              ).catch(err => {
                console.error('Fehler beim Senden der Fehlermeldung:', err);
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('=== WEBHOOK FEHLER ===');
      console.error('Fehlertyp:', error.name);
      console.error('Fehlermeldung:', error.message);
      console.error('Stack:', error.stack);
      if (error.cause) {
        console.error('Ursache:', error.cause);
      }
    }
  }

  return res.status(405).end();
} 