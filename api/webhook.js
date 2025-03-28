import OpenAI from 'openai';
import https from 'https';
import { addLog } from './webhook/logs';

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

// HTTPS Agent für besseres SSL-Handling
const httpsAgent = new https.Agent({
  rejectUnauthorized: false // Nur für Debugging, in Produktion auf true setzen
});

async function fetchWithTimeout(url, options, timeout = 30000) { // Timeout auf 30 Sekunden erhöht
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      agent: httpsAgent
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendWhatsAppMessageWithRetry(to, message, maxRetries = 3) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`=== SENDE WHATSAPP NACHRICHT (Versuch ${attempt}/${maxRetries}) ===`);
      console.log('An:', to);
      console.log('Nachricht:', message);
      console.log('Token (erste 10 Zeichen):', process.env.META_ACCESS_TOKEN?.substring(0, 10) + '...');
      console.log('Phone ID:', process.env.WHATSAPP_PHONE_NUMBER_ID);
      console.log('Business Account ID:', process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);

      const url = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      console.log('URL:', url);

      const requestBody = {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message }
      };
      console.log('Request Body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'WhatsApp/2.24.1.84',
          'X-WhatsApp-Client': '2.24.1.84',
          'X-WhatsApp-Platform': 'iOS'
        },
        body: JSON.stringify(requestBody),
        agent: httpsAgent
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
        
        // Spezifische Fehlerbehandlung
        if (errorData.error?.code === 190) {
          throw new Error('Access Token ungültig oder abgelaufen');
        }
        if (errorData.error?.code === 100) {
          throw new Error('Ungültige Parameter in der Anfrage');
        }
        
        throw new Error(`WhatsApp API Fehler: ${response.status} - ${responseData}`);
      }

      console.log(`Versuch ${attempt} erfolgreich!`);
      return true;
    } catch (error) {
      lastError = error;
      console.error(`=== WHATSAPP FEHLER (Versuch ${attempt}/${maxRetries}) ===`);
      console.error('Fehlertyp:', error.name);
      console.error('Fehlermeldung:', error.message);
      console.error('Stack:', error.stack);
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Exponentielles Backoff, max 10 Sekunden
        console.log(`Warte ${delay}ms vor dem nächsten Versuch...`);
        await sleep(delay);
      }
    }
  }
  
  console.error('Alle Versuche fehlgeschlagen. Letzter Fehler:', lastError);
  return false;
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
  try {
    addLog('=== WEBHOOK HANDLER START ===', 'info');
    addLog(`Methode: ${req.method}`, 'info');
    addLog(`Headers: ${JSON.stringify(req.headers, null, 2)}`, 'info');

    // Webhook Verification
    if (req.method === 'GET') {
      addLog('Webhook-Verifizierung gestartet', 'info');
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      console.log('Webhook Verifizierung:', { mode, token: token?.substring(0, 5) + '...', challenge });

      if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
        addLog('Webhook erfolgreich verifiziert', 'success');
        return res.status(200).send(challenge);
      }
      return res.status(403).end();
    }

    // Webhook Handler
    if (req.method === 'POST') {
      addLog('=== WEBHOOK PAYLOAD ===', 'info');
      addLog(JSON.stringify(req.body, null, 2), 'info');

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
              addLog('=== META BEFEHL EMPFANGEN ===', 'info');
              addLog(`Text: ${text}`, 'info');
              addLog(`Von: ${from}`, 'info');
              
              const content = text.split('message to')[1].trim();
              
              try {
                // Sende Bestätigung
                addLog('Sende Bestätigung...', 'info');
                const confirmSent = await sendWhatsAppMessageWithRetry(from, 'Ich verarbeite Ihre Anfrage...');
                addLog('Bestätigung gesendet:', confirmSent, 'success');
                
                if (!confirmSent) {
                  throw new Error('Konnte Bestätigung nicht senden');
                }
                
                // Hole OpenAI Antwort
                addLog('Hole OpenAI Antwort...', 'info');
                const response = await getOpenAIResponse(content);
                addLog('OpenAI Antwort erhalten:', response, 'success');
                
                // Sende Antwort
                addLog('Sende finale Antwort...', 'info');
                const finalSent = await sendWhatsAppMessageWithRetry(from, response);
                addLog('Finale Antwort gesendet:', finalSent, 'success');
                
                if (!finalSent) {
                  throw new Error('Konnte finale Antwort nicht senden');
                }
                
                addLog('=== VERARBEITUNG ABGESCHLOSSEN ===', 'success');
              } catch (error) {
                addLog('=== VERARBEITUNGSFEHLER ===', 'error');
                addLog(`Fehlertyp: ${error.name}`, 'error');
                addLog(`Fehlermeldung: ${error.message}`, 'error');
                addLog(`Stack: ${error.stack}`, 'error');
                if (error.cause) {
                  addLog('Ursache:', error.cause, 'info');
                }
                
                await sendWhatsAppMessageWithRetry(from, 
                  'Entschuldigung, es gab ein Problem bei der Verarbeitung Ihrer Anfrage. ' +
                  'Bitte versuchen Sie es später erneut.'
                ).catch(err => {
                  addLog('Fehler beim Senden der Fehlermeldung:', err, 'error');
                });
              }
            }
          }
        }
      } catch (error) {
        addLog('=== WEBHOOK FEHLER ===', 'error');
        addLog(`Fehlertyp: ${error.name}`, 'error');
        addLog(`Fehlermeldung: ${error.message}`, 'error');
        addLog(`Stack: ${error.stack}`, 'error');
        if (error.cause) {
          addLog('Ursache:', error.cause, 'info');
        }
      }
    }

    return res.status(405).end();
  } catch (error) {
    addLog(`Webhook-Fehler: ${error.message}`, 'error');
    console.error('Webhook-Fehler:', error);
    return res.status(500).json({ 
      error: 'Interner Serverfehler',
      message: error.message 
    });
  }
} 