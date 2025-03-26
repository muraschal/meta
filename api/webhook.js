import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function sendWhatsAppMessage(to, message) {
  try {
    console.log('=== SENDE WHATSAPP NACHRICHT ===');
    console.log('An:', to);
    console.log('Nachricht:', message);
    console.log('Token:', process.env.META_ACCESS_TOKEN?.substring(0, 10) + '...');
    console.log('Phone ID:', process.env.WHATSAPP_PHONE_NUMBER_ID);

    const response = await fetch(
      `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
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
        })
      }
    );

    console.log('Status:', response.status);
    const responseData = await response.text();
    console.log('Antwort:', responseData);

    if (!response.ok) {
      throw new Error(`WhatsApp API Fehler: ${response.status} - ${responseData}`);
    }

    return true;
  } catch (error) {
    console.error('=== WHATSAPP FEHLER ===');
    console.error('Fehlertyp:', error.name);
    console.error('Fehlermeldung:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

async function getOpenAIResponse(content) {
  try {
    console.log('=== OPENAI ANFRAGE ===');
    console.log('Inhalt:', content);
    
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
    throw error;
  }
}

export default async function handler(req, res) {
  console.log('=== WEBHOOK HANDLER START ===');
  console.log('Methode:', req.method);
  
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
              await sendWhatsAppMessage(from, 'Ich verarbeite Ihre Anfrage...');
              
              // Hole OpenAI Antwort
              console.log('Hole OpenAI Antwort...');
              const response = await getOpenAIResponse(content);
              
              // Sende Antwort
              console.log('Sende finale Antwort...');
              await sendWhatsAppMessage(from, response);
              
              console.log('=== VERARBEITUNG ABGESCHLOSSEN ===');
            } catch (error) {
              console.error('=== VERARBEITUNGSFEHLER ===');
              console.error('Fehlertyp:', error.name);
              console.error('Fehlermeldung:', error.message);
              console.error('Stack:', error.stack);
              
              await sendWhatsAppMessage(from, 
                'Entschuldigung, es gab ein Problem bei der Verarbeitung Ihrer Anfrage. ' +
                'Bitte versuchen Sie es später erneut.'
              );
            }
          }
        }
      }
    } catch (error) {
      console.error('=== WEBHOOK FEHLER ===');
      console.error('Fehlertyp:', error.name);
      console.error('Fehlermeldung:', error.message);
      console.error('Stack:', error.stack);
    }
  }

  return res.status(405).end();
} 