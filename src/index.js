require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('apollo-server-express');
const { typeDefs, resolvers } = require('./graphql/schema');
const whatsappWebhook = require('./webhooks/whatsapp');

const app = express();

app.use(cors());
app.use(express.json());

// Webhook-Route
app.use('/webhook', whatsappWebhook);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Apollo Server Setup
const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => ({
    // Kontext für GraphQL-Operationen
  })
});

// Vercel-spezifische Anpassungen
const port = process.env.PORT || 3000;

async function startServer() {
  await apolloServer.start();
  apolloServer.applyMiddleware({ app });

  if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
      console.log(`Server läuft auf Port ${port}`);
      console.log(`GraphQL Endpoint: http://localhost:${port}${apolloServer.graphqlPath}`);
    });
  }
}

startServer().catch(console.error);

// Für Vercel Serverless Functions
module.exports = app; 