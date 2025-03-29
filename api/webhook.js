import OpenAI from 'openai';
import https from 'https';
import { addLog, LogType } from './utils/logs.js';
import dotenv from 'dotenv';
import whatsappService from '../src/services/whatsapp.js';

// Lade Umgebungsvariablen
dotenv.config();

// Prüfe erforderliche Umgebungsvariablen
const requiredEnvVars = [
    'META_ACCESS_TOKEN',
    'WEBHOOK_VERIFY_TOKEN',
    'OPENAI_API_KEY',
    'OPENAI_ORG_ID'
];

console.log('Verfügbare Umgebungsvariablen:', Object.keys(process.env));
console.log('OPENAI_ORG_ID Wert:', process.env.OPENAI_ORG_ID);

const missingEnvVars = requiredEnvVars.filter(varName => {
    const exists = !!process.env[varName];
    console.log(`Prüfe ${varName}: ${exists ? 'vorhanden' : 'fehlt'}`);
    return !exists;
});

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
  apiKey: process.env.OPENAI_API_KEY,
  ...(process.env.OPENAI_ORG_ID && { organization: process.env.OPENAI_ORG_ID })
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

async function sendWhatsAppMessageWithRetry(to, message, phoneNumberId, maxRetries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await whatsappService.sendMessage(to, message, phoneNumberId);
            addLog(`WhatsApp Antwort: ${JSON.stringify(response)}`, LogType.SUCCESS);
            return true;
        } catch (error) {
            lastError = error;
            addLog(`=== WHATSAPP FEHLER (Versuch ${attempt}/${maxRetries}) ===`, LogType.ERROR);
            addLog(`Fehlertyp: ${error.name}`, LogType.ERROR);
            addLog(`Fehlermeldung: ${error.message}`, LogType.ERROR);
            addLog(`Stack: ${error.stack}`, LogType.ERROR);

            if (attempt < maxRetries) {
                const waitTime = 2000 * attempt;
                addLog(`Warte ${waitTime}ms vor dem nächsten Versuch...`, LogType.INFO);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
    throw lastError || new Error('Maximale Anzahl von Wiederholungsversuchen erreicht');
}

async function getOpenAIResponse(content) {
  try {
    addLog('=== OPENAI ANFRAGE ===', LogType.INFO);
    addLog(`Inhalt: ${content}`, LogType.INFO);
    addLog(`OpenAI API Key (erste 5 Zeichen): ${process.env.OPENAI_API_KEY?.substring(0, 5)}...`, LogType.INFO);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ 
        role: "system", 
        content: "You are a helpful assistant providing precise and informative answers. Always respond in English." 
      },
      { 
        role: "user", 
        content 
      }],
      max_tokens: 500,
      temperature: 0.7
    });

    if (!completion?.choices?.[0]?.message?.content) {
      addLog('Keine gültige Antwort von OpenAI erhalten', LogType.ERROR);
      addLog(`OpenAI Response: ${JSON.stringify(completion)}`, LogType.ERROR);
      throw new Error('Keine gültige Antwort von OpenAI erhalten');
    }

    const response = completion.choices[0].message.content;
    addLog(`OpenAI Antwort: ${response}`, LogType.SUCCESS);
    return response;
  } catch (error) {
    addLog('=== OPENAI FEHLER ===', LogType.ERROR);
    addLog(`Fehlertyp: ${error.name}`, LogType.ERROR);
    addLog(`Fehlermeldung: ${error.message}`, LogType.ERROR);
    addLog(`Stack: ${error.stack}`, LogType.ERROR);
    if (error.response) {
      addLog(`OpenAI API Fehler: ${JSON.stringify(error.response.data)}`, LogType.ERROR);
    }
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
        addLog(`Token (erste 10 Zeichen): ${process.env.META_ACCESS_TOKEN?.substring(0, 10)}...`, LogType.INFO);

        // Webhook Verification
        if (req.method === 'GET') {
            addLog('Webhook-Verifizierung gestartet', LogType.INFO);
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];

            addLog(`Verifizierungsdetails: Mode=${mode}, Token=${token ? '***' : 'fehlt'}, Challenge=${challenge || 'fehlt'}`, LogType.INFO);

            // Wenn es eine normale GET-Anfrage ist (z.B. Health Check)
            if (!mode && !token) {
                addLog('Health Check GET-Anfrage', LogType.INFO);
                return res.status(200).json({ status: 'ok' });
            }

            // Wenn es eine Webhook-Verifizierung ist
            if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
                addLog('Webhook erfolgreich verifiziert', LogType.SUCCESS);
                if (challenge) {
                    return res.status(200).send(challenge);
                }
                return res.status(200).json({ status: 'verified' });
            }

            addLog('Webhook-Verifizierung fehlgeschlagen - Ungültiger Token', LogType.ERROR);
            return res.status(403).json({ error: 'Ungültiger Token' });
        }

        // Webhook Handler für POST-Requests
        if (req.method === 'POST') {
            // Bestätige Empfang sofort
            res.status(200).json({ status: 'ok' });

            addLog('=== WEBHOOK HANDLER START ===', LogType.INFO);
            addLog(`Methode: ${req.method}`, LogType.INFO);
            addLog(`Headers: ${JSON.stringify(req.headers, null, 2)}`, LogType.INFO);
            addLog(`Token (erste 10 Zeichen): ${process.env.META_ACCESS_TOKEN?.substring(0, 10)}...`, LogType.INFO);

            addLog('=== WEBHOOK PAYLOAD ===', LogType.INFO);
            addLog(JSON.stringify(req.body, null, 2), LogType.INFO);

            const { body } = req;
            
            if (!body?.object || body.object !== 'whatsapp_business_account') {
                addLog('Ungültiges Webhook-Objekt', LogType.ERROR);
                addLog(`Erhaltenes Objekt: ${body?.object}`, LogType.ERROR);
                return;
            }

            try {
                const webhookData = await whatsappService.handleWebhook(body);
                addLog(`Verarbeitete Webhook-Daten: ${JSON.stringify(webhookData)}`, LogType.INFO);

                if (webhookData.type === 'metadata') {
                    addLog('Metadaten-Update empfangen', LogType.INFO);
                    return;
                }

                if (webhookData.type === 'status') {
                    addLog('Status-Update empfangen', LogType.INFO);
                    return;
                }

                // Verarbeite die Nachricht
                const { from, content, phoneNumberId } = webhookData;
                
                if (!content) {
                    addLog('Keine Nachricht im Webhook gefunden', LogType.INFO);
                    return;
                }

                addLog('=== NACHRICHT EMPFANGEN ===', LogType.INFO);
                addLog(`Text: ${content}`, LogType.INFO);
                addLog(`Von: ${from}`, LogType.INFO);
                addLog(`Phone Number ID: ${phoneNumberId}`, LogType.INFO);
                
                try {
                    // Sende Bestätigung
                    addLog('Sende Bestätigung...', LogType.INFO);
                    await sendWhatsAppMessageWithRetry(from, 'I am processing your request...', phoneNumberId);
                    
                    // Hole OpenAI Antwort
                    addLog('Hole OpenAI Antwort...', LogType.INFO);
                    const response = await getOpenAIResponse(content);
                    addLog('OpenAI Antwort erhalten:', response, LogType.SUCCESS);

                    // Sende Antwort
                    addLog('Sende finale Antwort...', LogType.INFO);
                    await sendWhatsAppMessageWithRetry(from, response, phoneNumberId);
                    
                    addLog('=== VERARBEITUNG ABGESCHLOSSEN ===', LogType.SUCCESS);
                } catch (error) {
                    addLog('=== VERARBEITUNGSFEHLER ===', LogType.ERROR);
                    addLog(`Fehlertyp: ${error.name}`, LogType.ERROR);
                    addLog(`Fehlermeldung: ${error.message}`, LogType.ERROR);
                    addLog(`Stack: ${error.stack}`, LogType.ERROR);
                    
                    await sendWhatsAppMessageWithRetry(
                        from, 
                        'I apologize, but I encountered an error processing your request. Please try again later.',
                        phoneNumberId
                    ).catch(err => {
                        addLog('Fehler beim Senden der Fehlermeldung:', err, LogType.ERROR);
                    });
                }
            } catch (error) {
                addLog('Fehler bei der Webhook-Verarbeitung:', error, LogType.ERROR);
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