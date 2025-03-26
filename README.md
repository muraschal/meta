# Meta Glasses Bridge

Eine Brücke zwischen Meta Glasses und OpenAI für nahtlose Sprach- und Bildinteraktionen.

## Features

- WhatsApp-Integration für Meta Glasses
- OpenAI GPT-4 Vision Integration
- Echtzeit-Kommunikation via WebSocket
- GraphQL API für erweiterte Funktionalität

## Installation

1. Repository klonen:
```bash
git clone [repository-url]
cd meta-glasses-bridge
```

2. Abhängigkeiten installieren:
```bash
npm install
```

3. Umgebungsvariablen konfigurieren:
- Kopieren Sie `.env.example` zu `.env`
- Füllen Sie die erforderlichen API-Schlüssel und Zugangsdaten aus

## Konfiguration

Sie benötigen folgende Zugangsdaten:

- OpenAI API Key
- Meta App ID
- Meta App Secret
- Meta Access Token
- WhatsApp Phone Number ID

## Verwendung

1. Server starten:
```bash
npm run dev
```

2. GraphQL Playground öffnen:
- Navigieren Sie zu `http://localhost:3000/graphql`

3. Meta Glasses einrichten:
- Verbinden Sie Ihre Meta Glasses mit dem WhatsApp Business Account
- Konfigurieren Sie die Sprachbefehle in den Glasses-Einstellungen

## API-Endpunkte

- GraphQL: `http://localhost:3000/graphql`
- WebSocket: `ws://localhost:3000`
- WhatsApp Webhook: `http://localhost:3000/webhook`

## Entwicklung

- `npm run dev`: Startet den Entwicklungsserver
- `npm test`: Führt Tests aus
- `npm start`: Startet den Produktionsserver