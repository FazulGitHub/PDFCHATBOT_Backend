const { QdrantClient } = require("@qdrant/js-client-rest");
require('dotenv').config();

// Initialize Qdrant client with error handling
let qdrantClient;
try {
  if (!process.env.QDRANT_URL) {
    console.error('QDRANT_URL environment variable is not set');
    // Create a dummy client for development
    qdrantClient = createDummyClient();
  } else {
    // Create client with URL directly from environment variable
    // The URL in .env already has https:// prefix
    qdrantClient = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
    });
    
    console.log('Qdrant client initialized with URL:', process.env.QDRANT_URL);
  }
} catch (error) {
  console.error('Failed to initialize Qdrant client:', error);
  // Create a dummy client that logs errors instead of crashing
  qdrantClient = createDummyClient();
}

function createDummyClient() {
  return {
    getCollections: async () => {
      console.error('Qdrant client not properly initialized');
      return { collections: [] };
    },
    createCollection: async () => {
      console.error('Qdrant client not properly initialized');
      throw new Error('Qdrant client not properly initialized');
    },
    createPayloadIndex: async () => {
      console.error('Qdrant client not properly initialized');
      throw new Error('Qdrant client not properly initialized');
    },
    scroll: async () => {
      console.error('Qdrant client not properly initialized');
      return { points: [] };
    },
    search: async () => {
      console.error('Qdrant client not properly initialized');
      return [];
    },
    upsert: async () => {
      console.error('Qdrant client not properly initialized');
      throw new Error('Qdrant client not properly initialized');
    },
    delete: async () => {
      console.error('Qdrant client not properly initialized');
      throw new Error('Qdrant client not properly initialized');
    }
  };
}

/**
 * Create a collection if it doesn't exist
 * @param {string} collectionName - Name of the collection
 * @returns {Promise<void>}
 */
async function ensureCollection(collectionName) {
  try {
    // Check if collection exists
    const collections = await qdrantClient.getCollections();
    const exists = collections.collections && collections.collections.some(c => c.name === collectionName);
    
    if (!exists) {
      // Create collection with 768 dimensions (Gemini embedding size)
      await qdrantClient.createCollection(collectionName, {
        vectors: {
          size: 768,
          distance: "Cosine"
        }
      });
      
      // Create indexes based on collection type
      if (collectionName === 'document_metadata') {
        try {
          await qdrantClient.createPayloadIndex(collectionName, {
            field_name: "apiKeyHash",
            field_schema: "keyword"
          });
          console.log('Created index for apiKeyHash field in metadata collection');
        } catch (indexError) {
          console.error('Error creating apiKeyHash index:', indexError);
        }
      } else if (collectionName === 'document_vectors') {
        try {
          await qdrantClient.createPayloadIndex(collectionName, {
            field_name: "documentId",
            field_schema: "keyword"
          });
          console.log('Created index for documentId field in vectors collection');
        } catch (indexError) {
          console.error('Error creating documentId index:', indexError);
        }
      }
    }
  } catch (error) {
    console.error('Error ensuring collection exists:', error);
    // Don't throw error in production to prevent crashes
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      throw error;
    }
  }
}

module.exports = {
  qdrantClient,
  ensureCollection
};