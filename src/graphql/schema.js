const { gql } = require('apollo-server-express');

const typeDefs = gql`
  type Message {
    id: ID!
    content: String!
    timestamp: String!
    type: MessageType!
    mediaUrl: String
  }

  enum MessageType {
    TEXT
    IMAGE
    AUDIO
    VIDEO
  }

  type Query {
    messages: [Message!]!
    message(id: ID!): Message
  }

  type Mutation {
    sendMessage(content: String!, type: MessageType!, mediaUrl: String): Message!
    processMetaCommand(command: String!): Message!
  }

  type Subscription {
    newMessage: Message!
  }
`;

const resolvers = {
  Query: {
    messages: async (_, __, { dataSources }) => {
      // Implementierung folgt
      return [];
    },
    message: async (_, { id }, { dataSources }) => {
      // Implementierung folgt
      return null;
    }
  },
  Mutation: {
    sendMessage: async (_, { content, type, mediaUrl }, { dataSources }) => {
      // Implementierung folgt
      return {
        id: '1',
        content,
        timestamp: new Date().toISOString(),
        type,
        mediaUrl
      };
    },
    processMetaCommand: async (_, { command }, { dataSources }) => {
      // Hier verarbeiten wir die Sprachbefehle von den Meta Glasses
      // Implementierung folgt
      return {
        id: '1',
        content: `Verarbeite Befehl: ${command}`,
        timestamp: new Date().toISOString(),
        type: 'TEXT'
      };
    }
  },
  Subscription: {
    newMessage: {
      subscribe: (_, __, { pubsub }) => {
        return pubsub.asyncIterator(['NEW_MESSAGE']);
      }
    }
  }
};

module.exports = { typeDefs, resolvers }; 