require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { ApolloServer } = require('apollo-server-express');
const { typeDefs, resolvers } = require('./graphql/schema');
const whatsappWebhook = require('./webhooks/whatsapp');

const app = express();
const httpServer = createServer(app);
const wsServer = new WebSocketServer({ server: httpServer });

app.use(cors());
app.use(express.json());

// Webhook-Route
app.use('/webhook', whatsappWebhook);

// WebSocket-Verbindung für Echtzeit-Updates
wsServer.on('connection', (ws) => {
  console.log('Neue WebSocket-Verbindung');
  
  ws.on('message', (message) => {
    // Hier verarbeiten wir die Nachrichten von den Meta Glasses
    console.log('Nachricht empfangen:', message);
  });
});

// Apollo Server Setup
const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => ({
    // Hier können wir den Kontext für GraphQL-Operationen definieren
  })
});

// Vercel-spezifische Anpassungen
const port = process.env.PORT || 3000;

async function startServer() {
  await apolloServer.start();
  apolloServer.applyMiddleware({ app });

  if (process.env.NODE_ENV !== 'production') {
    // Nur im Entwicklungsmodus auf Port hören
    httpServer.listen(port, () => {
      console.log(`Server läuft auf Port ${port}`);
      console.log(`GraphQL Endpoint: http://localhost:${port}${apolloServer.graphqlPath}`);
    });
  }
}

startServer();

// Für Vercel Serverless Functions
module.exports = app; 