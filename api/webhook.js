import OpenAI from 'openai';
import https from 'https';
import { addLog, LogType } from './utils/logs';

// Globales Error Handling
process.on('unhandledRejection', (error) => {
    addLog(`Unbehandelter Promise-Fehler: ${error.message}`, LogType.ERROR);
    console.error('Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', (error) => {
    addLog(`Unbehandelter Fehler: ${error.message}`, LogType.ERROR);
    console.error('Uncaught Exception:', error);
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
        addLog('=== WEBHOOK HANDLER START ===', LogType.INFO);
        addLog(`Methode: ${req.method}`, LogType.INFO);
        addLog(`Headers: ${JSON.stringify(req.headers, null, 2)}`, LogType.INFO);

        // Prüfe Umgebungsvariablen nur wenn sie benötigt werden
        if (req.method === 'POST') {
            const requiredEnvVars = [
                'META_ACCESS_TOKEN',
                'WHATSAPP_PHONE_NUMBER_ID',
                'WHATSAPP_BUSINESS_ACCOUNT_ID',
                'OPENAI_API_KEY'
            ];

            const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
            if (missingEnvVars.length > 0) {
                addLog(`Fehlende Umgebungsvariablen: ${missingEnvVars.join(', ')}`, LogType.ERROR);
                throw new Error(`Fehlende Umgebungsvariablen: ${missingEnvVars.join(', ')}`);
            }
        }

        // Webhook Verification
        if (req.method === 'GET') {
            addLog('Webhook-Verifizierung gestartet', LogType.INFO);
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];

            addLog(`Verifizierungsdetails: Mode=${mode}, Token=${token ? '***' : 'fehlt'}, Challenge=${challenge || 'fehlt'}`, LogType.INFO);

            // Prüfe nur den Token, wenn es ein Subscribe-Request ist
            if (mode === 'subscribe') {
                if (!token) {
                    addLog('Fehlender Verifizierungs-Token', LogType.ERROR);
                    return res.status(400).json({ error: 'Fehlender Token' });
                }

                // Prüfe den Token nur wenn er in der Umgebung definiert ist
                if (process.env.WEBHOOK_VERIFY_TOKEN && token === process.env.WEBHOOK_VERIFY_TOKEN) {
                    addLog('Webhook erfolgreich verifiziert', LogType.SUCCESS);
                    return res.status(200).send(challenge);
                }

                addLog('Webhook-Verifizierung fehlgeschlagen: Ungültiger Token', LogType.ERROR);
                return res.status(403).json({ error: 'Ungültiger Token' });
            }

            // Wenn es kein Subscribe-Request ist, sende 400
            return res.status(400).json({ error: 'Ungültiger Mode' });
        }

        // Webhook Handler für POST-Requests
        if (req.method === 'POST') {
            addLog('=== WEBHOOK PAYLOAD ===', LogType.INFO);
            addLog(JSON.stringify(req.body, null, 2), LogType.INFO);

            // Bestätige Empfang sofort
            return res.status(200).json({ status: 'ok' });
        }

        // Andere HTTP-Methoden
        return res.status(405).json({ error: 'Methode nicht erlaubt' });

    } catch (error) {
        addLog(`Webhook-Fehler: ${error.message}`, LogType.ERROR);
        addLog(`Stack: ${error.stack}`, LogType.ERROR);
        console.error('Webhook-Fehler:', error);
        
        return res.status(500).json({ 
            error: 'Interner Serverfehler',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Ein unerwarteter Fehler ist aufgetreten',
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        });
    }
} 