import OpenAI from 'openai';
import https from 'https';
import { addLog, LogType } from './utils/logs.js';
import dotenv from 'dotenv';

// Lade Umgebungsvariablen
dotenv.config();

// Prüfe erforderliche Umgebungsvariablen
const requiredEnvVars = [
    'META_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_BUSINESS_ACCOUNT_ID',
    'OPENAI_API_KEY',
    'WEBHOOK_VERIFY_TOKEN'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error('Fehlende Umgebungsvariablen:', missingEnvVars);
    throw new Error(`Fehlende Umgebungsvariablen: ${missingEnvVars.join(', ')}`);
}

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

async function fetchWithTimeout(url, options, timeout = 30000) {
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
      addLog(`=== SENDE WHATSAPP NACHRICHT (Versuch ${attempt}/${maxRetries}) ===`, LogType.INFO);
      addLog(`An: ${to}`, LogType.INFO);
      addLog(`Nachricht: ${message}`, LogType.INFO);

      const url = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      
      const requestBody = {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody),
        agent: httpsAgent
      });

      const responseData = await response.text();
      addLog(`Response Status: ${response.status}`, LogType.INFO);
      addLog(`Response Body: ${responseData}`, LogType.INFO);

      if (!response.ok) {
        const errorData = JSON.parse(responseData);
        throw new Error(`WhatsApp API Fehler: ${response.status} - ${responseData}`);
      }

      addLog(`Versuch ${attempt} erfolgreich!`, LogType.SUCCESS);
      return true;
    } catch (error) {
      lastError = error;
      addLog(`=== WHATSAPP FEHLER (Versuch ${attempt}/${maxRetries}) ===`, LogType.ERROR);
      addLog(`Fehlertyp: ${error.name}`, LogType.ERROR);
      addLog(`Fehlermeldung: ${error.message}`, LogType.ERROR);
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        addLog(`Warte ${delay}ms vor dem nächsten Versuch...`, LogType.INFO);
        await sleep(delay);
      }
    }
  }
  
  addLog('Alle Versuche fehlgeschlagen. Letzter Fehler: ' + lastError, LogType.ERROR);
  return false;
}

async function getOpenAIResponse(content) {
  try {
    addLog('=== OPENAI ANFRAGE ===', LogType.INFO);
    addLog(`Inhalt: ${content}`, LogType.INFO);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content }],
      max_tokens: 150,
      temperature: 0.7
    });

    const response = completion?.choices?.[0]?.message?.content;
    addLog(`OpenAI Antwort: ${response}`, LogType.SUCCESS);
    return response || 'Keine Antwort von OpenAI erhalten';
  } catch (error) {
    addLog('=== OPENAI FEHLER ===', LogType.ERROR);
    addLog(`Fehlertyp: ${error.name}`, LogType.ERROR);
    addLog(`Fehlermeldung: ${error.message}`, LogType.ERROR);
    throw error;
  }
}

export default async function handler(req, res) {
    try {
        // CORS-Header hinzufügen
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        // OPTIONS-Anfragen direkt beantworten
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        addLog('=== WEBHOOK HANDLER START ===', LogType.INFO);
        addLog(`Methode: ${req.method}`, LogType.INFO);
        addLog(`Headers: ${JSON.stringify(req.headers, null, 2)}`, LogType.INFO);

        // Webhook Verification
        if (req.method === 'GET') {
            addLog('Webhook-Verifizierung gestartet', LogType.INFO);
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];

            addLog(`Verifizierungsdetails: Mode=${mode}, Token=${token ? '***' : 'fehlt'}, Challenge=${challenge || 'fehlt'}`, LogType.INFO);

            if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
                addLog('Webhook erfolgreich verifiziert', LogType.SUCCESS);
                return res.status(200).send(challenge);
            }

            addLog('Webhook-Verifizierung fehlgeschlagen', LogType.ERROR);
            return res.status(403).json({ error: 'Ungültiger Token' });
        }

        // Webhook Handler für POST-Requests
        if (req.method === 'POST') {
            addLog('=== WEBHOOK PAYLOAD ===', LogType.INFO);
            addLog(JSON.stringify(req.body, null, 2), LogType.INFO);

            const { body } = req;
            
            if (body?.object === 'whatsapp_business_account') {
                const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
                
                if (message?.type === 'text') {
                    const text = message.text.body.toLowerCase();
                    const from = message.from;
                    
                    addLog(`Empfangene Nachricht von ${from}: ${text}`, LogType.INFO);
                    
                    if (text.startsWith('hey meta') && text.includes('message to')) {
                        addLog('=== META BEFEHL EMPFANGEN ===', LogType.INFO);
                        addLog(`Text: ${text}`, LogType.INFO);
                        addLog(`Von: ${from}`, LogType.INFO);
                        
                        const content = text.split('message to')[1].trim();
                        addLog(`Verarbeiteter Inhalt: ${content}`, LogType.INFO);
                        
                        try {
                            // Sende Bestätigung
                            addLog('Sende Bestätigung...', LogType.INFO);
                            const confirmSent = await sendWhatsAppMessageWithRetry(from, 'Ich verarbeite Ihre Anfrage...');
                            addLog('Bestätigung gesendet:', confirmSent, LogType.SUCCESS);
                            
                            if (!confirmSent) {
                                throw new Error('Konnte Bestätigung nicht senden');
                            }
                            
                            // Hole OpenAI Antwort
                            addLog('Hole OpenAI Antwort...', LogType.INFO);
                            const response = await getOpenAIResponse(content);
                            addLog('OpenAI Antwort erhalten:', response, LogType.SUCCESS);
                            
                            // Sende Antwort
                            addLog('Sende finale Antwort...', LogType.INFO);
                            const finalSent = await sendWhatsAppMessageWithRetry(from, response);
                            addLog('Finale Antwort gesendet:', finalSent, LogType.SUCCESS);
                            
                            if (!finalSent) {
                                throw new Error('Konnte finale Antwort nicht senden');
                            }
                            
                            addLog('=== VERARBEITUNG ABGESCHLOSSEN ===', LogType.SUCCESS);
                        } catch (error) {
                            addLog('=== VERARBEITUNGSFEHLER ===', LogType.ERROR);
                            addLog(`Fehlertyp: ${error.name}`, LogType.ERROR);
                            addLog(`Fehlermeldung: ${error.message}`, LogType.ERROR);
                            addLog(`Stack: ${error.stack}`, LogType.ERROR);
                            
                            await sendWhatsAppMessageWithRetry(from, 
                                'Entschuldigung, es gab ein Problem bei der Verarbeitung Ihrer Anfrage. ' +
                                'Bitte versuchen Sie es später erneut.'
                            ).catch(err => {
                                addLog('Fehler beim Senden der Fehlermeldung:', err, LogType.ERROR);
                            });
                        }
                    } else {
                        addLog('Kein gültiger Meta-Befehl erkannt', LogType.INFO);
                    }
                }
            }

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