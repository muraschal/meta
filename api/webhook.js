import OpenAI from 'openai';
import https from 'https';
import { addLog, LogType } from './utils/logs.js';
import whatsappService from '../src/services/whatsapp.js';
import tokenManager from '../src/services/token-manager.js';

// Prüfe erforderliche Umgebungsvariablen
const requiredEnvVars = [
    'META_APP_ID',
    'META_APP_SECRET',
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

// Initialisiere Token-Manager
await tokenManager.initialize().catch(error => {
    console.error('Fehler bei Token-Manager-Initialisierung:', error);
    throw error;
});

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
        const currentToken = await tokenManager.getCurrentToken();
        addLog(`Token (erste 10 Zeichen): ${currentToken?.substring(0, 10)}...`, LogType.INFO);

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

            addLog('=== NEUE NACHRICHT EMPFANGEN ===', LogType.INFO);
            
            const webhookData = await whatsappService.handleWebhook(req.body);
            addLog(`Typ: ${webhookData.type}`, LogType.INFO);

            if (webhookData.type === 'message') {
                addLog(`Von: ${webhookData.from}`, LogType.INFO);
                addLog(`Text: ${webhookData.content}`, LogType.INFO);
                
                try {
                    // Sende Bestätigung
                    await sendWhatsAppMessageWithRetry(
                        webhookData.from,
                        'I am processing your request...',
                        webhookData.phoneNumberId
                    );
                    addLog('✓ Bestätigung gesendet', LogType.SUCCESS);

                    // Hole OpenAI Antwort
                    addLog('Generiere OpenAI Antwort...', LogType.INFO);
                    const aiResponse = await getOpenAIResponse(webhookData.content);
                    addLog('✓ OpenAI Antwort generiert', LogType.SUCCESS);

                    // Sende finale Antwort
                    await sendWhatsAppMessageWithRetry(
                        webhookData.from,
                        aiResponse,
                        webhookData.phoneNumberId
                    );
                    addLog('✓ Finale Antwort gesendet', LogType.SUCCESS);
                } catch (error) {
                    addLog(`Fehler bei der Nachrichtenverarbeitung: ${error.message}`, LogType.ERROR);
                    throw error;
                }
            } else if (webhookData.type === 'metadata') {
                addLog('Metadaten-Update empfangen', LogType.INFO);
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