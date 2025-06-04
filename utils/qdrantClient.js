const { QdrantClient } = require("@qdrant/js-client-rest");
require('dotenv').config();

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

/**
 * Create a collection if it doesn't exist
 * @param {string} collectionName - Name of the collection
 * @returns {Promise<void>}
 */
async function ensureCollection(collectionName) {
  try {
    // Check if collection exists
    const collections = await qdrantClient.getCollections();
    const exists = collections.collections.some(c => c.name === collectionName);
    
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
    throw error;
  }
}

module.exports = {
  qdrantClient,
  ensureCollection
};