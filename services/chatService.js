const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { qdrantClient, ensureCollection } = require('../utils/qdrantClient');
const { recordDocumentAccess } = require('./documentService');
require('dotenv').config();

// Function to generate a response using Gemini AI and RAG
async function generateResponse(query, documentId, apiKey) {
  try {
    // Check if API key is available
    if (!apiKey) {
      const error = new Error('Google API key is not provided');
      error.code = 'API_KEY_MISSING';
      throw error;
    }
    
    // Record document access for cleanup tracking
    await recordDocumentAccess(documentId);
    
    // Initialize embeddings
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: apiKey,
      modelName: "embedding-001"
    });
    
    // Generate embedding for the query
    const queryEmbedding = await embeddings.embedQuery(query);
    
    // Search for similar documents in Qdrant
    const vectorCollection = 'document_vectors';
    await ensureCollection(vectorCollection);
    
    let searchResults;
    try {
      // Try searching with filter first
      searchResults = await qdrantClient.search(vectorCollection, {
        vector: queryEmbedding,
        filter: {
          must: [
            { key: 'documentId', match: { value: documentId } }
          ]
        },
        limit: 3
      });
    } catch (searchError) {
      // Fallback: search without filter and filter results client-side
      const allResults = await qdrantClient.search(vectorCollection, {
        vector: queryEmbedding,
        limit: 20 // Get more results since we'll filter them
      });
      
      // Filter results client-side
      searchResults = allResults.filter(result => 
        result.payload && result.payload.documentId === documentId
      ).slice(0, 3); // Take top 3
    }
    
    if (!searchResults || searchResults.length === 0) {
      throw new Error('No matching documents found for this query');
    }
    
    // Extract content from similar documents
    const contextTexts = searchResults.map(result => result.payload.text);
    const context = contextTexts.join('\n\n');
    
    // Initialize Gemini model
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 2048,
      }
    });
    
    // Create prompt with context
    const prompt = `
    Based on the following information, please answer the question.
    
    Context information:
    ${context}
    
    Question: ${query}
    
    Answer:`;
    
    // Generate response
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error generating response:', error);
    if (!error.code) {
      error.code = 'RESPONSE_GENERATION_FAILED';
    }
    throw error;
  }
}

module.exports = {
  generateResponse
};