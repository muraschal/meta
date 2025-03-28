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
      addLog(`Token (erste 10 Zeichen): ${process.env.META_ACCESS_TOKEN?.substring(0, 10)}...`, LogType.INFO);
      addLog(`Phone ID: ${process.env.WHATSAPP_PHONE_NUMBER_ID}`, LogType.INFO);

      const url = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      addLog(`URL: ${url}`, LogType.INFO);
      
      const requestBody = {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message }
      };
      addLog(`Request Body: ${JSON.stringify(requestBody, null, 2)}`, LogType.INFO);

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }, 30000); // 30 Sekunden Timeout

      addLog(`Response Status: ${response.status}`, LogType.INFO);
      addLog(`Response Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`, LogType.INFO);

      const responseData = await response.text();
      addLog(`Response Body: ${responseData}`, LogType.INFO);

      if (!response.ok) {
        const errorData = JSON.parse(responseData);
        addLog(`WhatsApp API Fehler Details: ${JSON.stringify(errorData, null, 2)}`, LogType.ERROR);
        
        // Spezifische Fehlerbehandlung
        if (errorData.error?.code === 190) {
          addLog('Access Token ist ungültig oder abgelaufen', LogType.ERROR);
          throw new Error('Access Token ungültig oder abgelaufen');
        }
        if (errorData.error?.code === 100) {
          addLog('Ungültige Parameter in der Anfrage', LogType.ERROR);
          throw new Error('Ungültige Parameter in der Anfrage');
        }
        if (errorData.error?.code === 131047) {
          addLog('Message template not found', LogType.ERROR);
          throw new Error('Nachrichtenvorlage nicht gefunden');
        }
        if (errorData.error?.code === 131051) {
          addLog('Message type is currently not supported', LogType.ERROR);
          throw new Error('Nachrichtentyp wird derzeit nicht unterstützt');
        }
        
        throw new Error(`WhatsApp API Fehler: ${response.status} - ${responseData}`);
      }

      addLog(`Versuch ${attempt} erfolgreich!`, LogType.SUCCESS);
      return true;
    } catch (error) {
      lastError = error;
      addLog(`=== WHATSAPP FEHLER (Versuch ${attempt}/${maxRetries}) ===`, LogType.ERROR);
      addLog(`Fehlertyp: ${error.name}`, LogType.ERROR);
      addLog(`Fehlermeldung: ${error.message}`, LogType.ERROR);
      addLog(`Stack: ${error.stack}`, LogType.ERROR);
      
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
      model: "gpt-4",
      messages: [{ 
        role: "system", 
        content: "Du bist ein hilfreicher Assistent, der präzise und informative Antworten gibt." 
      },
      { 
        role: "user", 
        content 
      }],
      max_tokens: 500,
      temperature: 0.7
    });

    const response = completion?.choices?.[0]?.message?.content;
    addLog(`OpenAI Antwort: ${response}`, LogType.SUCCESS);
    return response || 'Keine Antwort von OpenAI erhalten';
  } catch (error) {
    addLog('=== OPENAI FEHLER ===', LogType.ERROR);
    addLog(`Fehlertyp: ${error.name}`, LogType.ERROR);
    addLog(`Fehlermeldung: ${error.message}`, LogType.ERROR);
    addLog(`Stack: ${error.stack}`, LogType.ERROR);
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

            if (!mode || !token) {
                addLog('Fehlende Parameter für Webhook-Verifizierung', LogType.ERROR);
                return res.status(400).json({ error: 'Fehlende Parameter' });
            }

            if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
                addLog('Webhook erfolgreich verifiziert', LogType.SUCCESS);
                return res.status(200).send(challenge);
            }

            addLog('Webhook-Verifizierung fehlgeschlagen - Ungültiger Token', LogType.ERROR);
            return res.status(403).json({ error: 'Ungültiger Token' });
        }

        // Webhook Handler für POST-Requests
        if (req.method === 'POST') {
            // Bestätige Empfang sofort
            res.status(200).json({ status: 'ok' });

            addLog('=== WEBHOOK PAYLOAD ===', LogType.INFO);
            addLog(JSON.stringify(req.body, null, 2), LogType.INFO);

            const { body } = req;
            
            if (!body?.object || body.object !== 'whatsapp_business_account') {
                addLog('Ungültiges Webhook-Objekt', LogType.ERROR);
                addLog(`Erhaltenes Objekt: ${body?.object}`, LogType.ERROR);
                return;
            }

            const entry = body.entry?.[0];
            if (!entry?.changes?.[0]?.value) {
                addLog('Ungültiges Webhook-Format', LogType.ERROR);
                addLog(`Entry: ${JSON.stringify(entry)}`, LogType.ERROR);
                return;
            }

            const value = entry.changes[0].value;
            const messages = value.messages;
            
            addLog(`Empfangene Messages: ${JSON.stringify(messages)}`, LogType.INFO);

            if (!messages || !messages[0]) {
                addLog('Keine Nachricht im Webhook gefunden', LogType.INFO);
                addLog(`Value: ${JSON.stringify(value)}`, LogType.INFO);
                return;
            }

            const message = messages[0];
            const from = message.from;
            const type = message.type;
            
            addLog(`Empfangene Nachricht - Typ: ${type}, Von: ${from}`, LogType.INFO);
            addLog(`Vollständige Nachricht: ${JSON.stringify(message)}`, LogType.INFO);

            if (type === 'text') {
                const text = message.text.body.toLowerCase();
                addLog(`Nachrichtentext: ${text}`, LogType.INFO);
                
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
            return;
        }

        // Andere HTTP-Methoden
        return res.status(405).json({ error: 'Methode nicht erlaubt' });

    } catch (error) {
        addLog('=== WEBHOOK HANDLER FEHLER ===', LogType.ERROR);
        addLog(`Fehlertyp: ${error.name}`, LogType.ERROR);
        addLog(`Fehlermeldung: ${error.message}`, LogType.ERROR);
        addLog(`Stack: ${error.stack}`, LogType.ERROR);
        
        // Wenn die Antwort noch nicht gesendet wurde
        if (!res.headersSent) {
            return res.status(500).json({ 
                error: 'Interner Serverfehler',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Ein unerwarteter Fehler ist aufgetreten',
                ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
            });
        }
    }
} 