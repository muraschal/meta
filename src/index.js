require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('apollo-server-express');
const { typeDefs, resolvers } = require('./graphql/schema');
const whatsappWebhook = require('./webhooks/whatsapp');

const app = express();

app.use(cors());
app.use(express.json());

// Basic routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Webhook-Route
app.use('/webhook', whatsappWebhook);

let apolloServer = null;
async function initApollo() {
  apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => ({
      // Kontext für GraphQL-Operationen
    })
  });
  await apolloServer.start();
  apolloServer.applyMiddleware({ app });
  return apolloServer;
}

// Vercel-spezifische Anpassungen
const port = process.env.PORT || 3000;

// Nur im Development-Modus den Server starten
if (process.env.NODE_ENV !== 'production') {
  initApollo().then(() => {
    app.listen(port, () => {
      console.log(`Server läuft auf Port ${port}`);
      console.log(`GraphQL Endpoint: http://localhost:${port}${apolloServer.graphqlPath}`);
    });
  }).catch(console.error);
} else {
  // Im Produktionsmodus Apollo Server nur initialisieren
  initApollo().catch(console.error);
}

// Für Vercel Serverless Functions
module.exports = app; 