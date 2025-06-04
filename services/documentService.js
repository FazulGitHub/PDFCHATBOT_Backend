const fs = require('fs');
const path = require('path');
const os = require('os');
const pdfParse = require("pdf-parse");
const cheerio = require("cheerio");
const axios = require("axios");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const crypto = require('crypto');
const { Document } = require("@langchain/core/documents");
const { v4: uuidv4 } = require('uuid');
const { qdrantClient, ensureCollection } = require('../utils/qdrantClient');
require('dotenv').config();

// Initialize Google Gemini embeddings
const getEmbeddings = (apiKey) => {
  if (!apiKey) {
    const error = new Error('Google API key is not provided');
    error.code = 'API_KEY_MISSING';
    throw error;
  }
  
  try {
    return new GoogleGenerativeAIEmbeddings({
      apiKey: apiKey,
      modelName: "embedding-001"
    });
  } catch (error) {
    console.error('Error initializing embeddings:', error);
    const wrappedError = new Error('Failed to initialize embeddings model');
    wrappedError.code = 'EMBEDDINGS_INIT_FAILED';
    wrappedError.originalError = error;
    throw wrappedError;
  }
};

// Check if a file with the same name already exists
async function checkDuplicateFile(originalFilename, apiKey) {
  try {
    const apiKeyHash = crypto.createHash('sha256').update(apiKey || '').digest('hex');
    
    // Get metadata points from Qdrant
    const metadataCollection = 'document_metadata';
    await ensureCollection(metadataCollection);
    
    // Get all metadata points and filter client-side
    const response = await qdrantClient.scroll(metadataCollection, {
      limit: 100
    });
    
    // Find matching document by apiKeyHash and originalFilename
    const matchingPoint = response.points.find(point => 
      point.payload && 
      point.payload.apiKeyHash === apiKeyHash && 
      point.payload.originalFilename === originalFilename
    );
    
    if (matchingPoint) {
      return matchingPoint.payload.originalId || matchingPoint.id;
    }
    
    return null;
  } catch (err) {
    console.error('Error checking for duplicate file:', err);
    return null;
  }
}

// Process document (PDF or URL) and store in Qdrant
async function processDocument(source, type, apiKey) {
  try {
    if (!apiKey) {
      const error = new Error('Google API key is not provided');
      error.code = 'API_KEY_MISSING';
      throw error;
    }

    // Extract original filename for processing
    let originalFilename = '';
    if (type === 'pdf') {
      const pathParts = source.split('/');
      const filename = pathParts[pathParts.length - 1];
      originalFilename = filename.replace(/^\d+-/, '');
    } else if (type === 'url') {
      originalFilename = source;
    }

    console.log(`Processing document of type: ${type}`);
    let docs;
    
    // Load document based on type
    if (type === 'pdf') {
      if (!fs.existsSync(source)) {
        const error = new Error(`PDF file not found at path: ${source}`);
        error.code = 'FILE_NOT_FOUND';
        throw error;
      }
      
      // Extract original filename from the path
      const pathParts = source.split('/');
      const filename = pathParts[pathParts.length - 1];
      originalFilename = filename.replace(/^\d+-/, '');
      
      console.log(`Loading PDF from: ${source}, original filename: ${originalFilename}`);
      const pdfData = await fs.promises.readFile(source);
      const pdfContent = await pdfParse(pdfData);
      docs = [
        new Document({
          pageContent: pdfContent.text,
          metadata: { source, originalFilename }
        })
      ];
      console.log(`PDF loaded successfully with ${docs.length} document`);
      
    } else if (type === 'url') {
      if (!source.match(/^https?:\/\/.+/)) {
        const error = new Error('Invalid URL format');
        error.code = 'INVALID_URL';
        throw error;
      }
      
      console.log(`Loading content from URL: ${source}`);
      try {
        const response = await axios.get(source);
        const $ = cheerio.load(response.data);
        
        // Extract text content from the page
        const text = $('body').text().trim();
        
        docs = [
          new Document({
            pageContent: text,
            metadata: { source }
          })
        ];
        console.log(`URL content loaded successfully with ${docs.length} document`);
      } catch (error) {
        console.error('Error loading URL:', error);
        throw new Error(`Failed to load URL: ${error.message}`);
      }
    } else {
      const error = new Error('Unsupported document type');
      error.code = 'UNSUPPORTED_TYPE';
      throw error;
    }

    // Check if we have any content
    if (!docs || docs.length === 0) {
      const error = new Error('No content extracted from document');
      error.code = 'EMPTY_CONTENT';
      throw error;
    }

    // Split text into chunks
    console.log('Splitting document into chunks');
    const splitDocs = [];
    for (const doc of docs) {
      const text = doc.pageContent;
      const chunkSize = 2000;
      const overlap = 200;
      
      for (let i = 0; i < text.length; i += chunkSize - overlap) {
        const chunk = text.substring(i, i + chunkSize);
        if (chunk.length > 0) {
          splitDocs.push(
            new Document({
              pageContent: chunk,
              metadata: { ...doc.metadata, chunk: splitDocs.length }
            })
          );
        }
      }
    }
    console.log(`Document split into ${splitDocs.length} chunks`);
    
    // Generate a unique ID for this document
    const documentId = uuidv4();
    console.log(`Generated document ID: ${documentId}`);
    
    // Ensure collections exist
    const vectorCollection = 'document_vectors';
    const metadataCollection = 'document_metadata';
    await ensureCollection(vectorCollection);
    await ensureCollection(metadataCollection);
    
    // Create embeddings and store in Qdrant
    console.log('Creating vector embeddings');
    try {
      const embeddings = getEmbeddings(apiKey);
      
      // Process documents in batches of 5 to avoid API limits
      const batchSize = 5;
      
      for (let i = 0; i < splitDocs.length; i += batchSize) {
        console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(splitDocs.length/batchSize)}`);
        const batch = splitDocs.slice(i, i + batchSize);
        
        // Generate embeddings for this batch
        const texts = batch.map(doc => doc.pageContent);
        
        // Add try-catch for each batch
        try {
          const embeddingResults = await embeddings.embedDocuments(texts);
          
          // Prepare points for Qdrant - using numeric IDs
          const points = batch.map((doc, idx) => {
            // Create a numeric ID by hashing the document ID and chunk index
            const pointIdStr = `${documentId}_${i + idx}`;
            const pointIdHash = crypto.createHash('md5').update(pointIdStr).digest('hex');
            const pointId = parseInt(pointIdHash.substring(0, 8), 16); // Convert first 8 chars to number
            
            return {
              id: pointId,
              vector: embeddingResults[idx],
              payload: {
                text: doc.pageContent,
                documentId: documentId,
                metadata: doc.metadata,
                chunk: i + idx,
                originalId: pointIdStr // Store the original ID in payload
              }
            };
          });
          
          // Upload to Qdrant
          await qdrantClient.upsert(vectorCollection, {
            points: points
          });
          
          console.log(`Successfully processed batch ${Math.floor(i/batchSize) + 1}`);
        } catch (batchError) {
          console.error(`Error processing batch ${Math.floor(i/batchSize) + 1}:`, batchError);
          throw batchError;
        }
      }
      
      // Store document metadata with numeric ID
      const metadataId = parseInt(crypto.createHash('md5').update(documentId).digest('hex').substring(0, 8), 16);
      
      const metadata = {
        originalId: documentId, // Store the original UUID in payload
        uploadedAt: new Date().toISOString(),
        apiKeyHash: crypto.createHash('sha256').update(apiKey).digest('hex'),
        originalFilename: originalFilename,
        type: type,
        lastAccessed: new Date().toISOString()
      };
      
      await qdrantClient.upsert(metadataCollection, {
        points: [{
          id: metadataId,
          vector: new Array(768).fill(0), // Dummy vector
          payload: metadata
        }]
      });
      
      console.log('Vector embeddings saved successfully to Qdrant');
      
      // Clean up uploaded file if it was a PDF
      if (type === 'pdf' && fs.existsSync(source)) {
        try {
          fs.unlinkSync(source);
          console.log(`Deleted temporary file: ${source}`);
        } catch (err) {
          console.error('Error deleting file:', err);
        }
      }
      
      return documentId;
    } catch (error) {
      console.error('Error creating or saving vector embeddings:', error);
      const wrappedError = new Error('Failed to create vector embeddings');
      wrappedError.code = 'VECTOR_CREATION_FAILED';
      wrappedError.originalError = error;
      throw wrappedError;
    }
  } catch (error) {
    console.error('Error processing document:', error);
    if (!error.code) {
      error.code = 'DOCUMENT_PROCESSING_FAILED';
    }
    
    // Clean up uploaded file if it was a PDF and still exists
    if (type === 'pdf' && source && fs.existsSync(source)) {
      try {
        fs.unlinkSync(source);
        console.log(`Deleted temporary file after error: ${source}`);
      } catch (err) {
        console.error('Error deleting file after processing error:', err);
      }
    }
    
    throw error;
  }
}

// Delete document from Qdrant
async function deleteDocument(documentId) {
  try {
    if (!documentId) {
      throw new Error('Document ID is required');
    }

    console.log(`Deleting document with ID: ${documentId}`);
    
    const vectorCollection = 'document_vectors';
    const metadataCollection = 'document_metadata';
    
    // Ensure collections exist with proper indexes
    await ensureCollection(vectorCollection);
    await ensureCollection(metadataCollection);
    
    // Use the direct approach - get all points and delete by ID
    // First, get all vector points
    const allPoints = await qdrantClient.scroll(vectorCollection, {
      limit: 1000
    });
    
    // Find points matching our document ID
    const pointsToDelete = allPoints.points
      .filter(point => point.payload && point.payload.documentId === documentId)
      .map(point => point.id);
    
    if (pointsToDelete.length > 0) {
      console.log(`Found ${pointsToDelete.length} vector points to delete`);
      
      // Delete points by ID
      await qdrantClient.delete(vectorCollection, {
        points: pointsToDelete
      });
    } else {
      console.log('No matching vector points found to delete');
    }
    
    // For metadata, we need to find the numeric ID first
    const metadataId = parseInt(crypto.createHash('md5').update(documentId).digest('hex').substring(0, 8), 16);
    
    try {
      // Delete document metadata by ID
      await qdrantClient.delete(metadataCollection, {
        points: [metadataId]
      });
    } catch (metadataError) {
      console.error('Error deleting metadata by ID:', metadataError);
      
      // Fallback: Get all metadata and find the one matching our document ID
      const allMetadata = await qdrantClient.scroll(metadataCollection, {
        limit: 100
      });
      
      // Find metadata matching our document ID
      const metadataToDelete = allMetadata.points
        .filter(point => point.payload && point.payload.originalId === documentId)
        .map(point => point.id);
      
      if (metadataToDelete.length > 0) {
        console.log(`Found ${metadataToDelete.length} metadata points to delete`);
        
        // Delete metadata by ID
        await qdrantClient.delete(metadataCollection, {
          points: metadataToDelete
        });
      }
    }
    
    console.log(`Successfully deleted document: ${documentId}`);
    
    return { success: true, message: 'Document deleted successfully' };
  } catch (error) {
    console.error('Error deleting document:', error);
    if (!error.code) {
      error.code = 'DOCUMENT_DELETION_FAILED';
    }
    throw error;
  }
}

// Get list of uploaded files
async function getUploadedFiles(apiKey) {
  try {
    if (!apiKey) {
      const error = new Error('Google API key is not provided');
      error.code = 'API_KEY_MISSING';
      throw error;
    }

    // Create a hash of the API key to compare with stored values
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    const metadataCollection = 'document_metadata';
    await ensureCollection(metadataCollection);
    
    try {
      // First try to get all documents without filtering
      const allResponse = await qdrantClient.scroll(metadataCollection, {
        limit: 100
      });
      
      // Filter client-side by API key hash
      const files = allResponse.points
        .filter(point => point.payload && point.payload.apiKeyHash === apiKeyHash)
        .map(point => ({
          documentId: point.payload.originalId || point.id.toString(),
          originalFilename: point.payload.originalFilename || `Document ${point.id.toString().substring(0, 8)}`,
          uploadedAt: point.payload.uploadedAt,
          lastAccessed: point.payload.lastAccessed
        }));
      
      return { files };
    } catch (error) {
      console.error('Error getting uploaded files:', error);
      return { files: [] }; // Return empty array if we can't get the files
    }
  } catch (error) {
    console.error('Error getting uploaded files:', error);
    if (!error.code) {
      error.code = 'FILE_LISTING_FAILED';
    }
    throw error;
  }
}

// Record document access
async function recordDocumentAccess(documentId) {
  try {
    // Since we can't easily update just the timestamp, we'll skip this functionality
    // This is a non-critical feature that can be implemented later
    return true;
  } catch (error) {
    console.error('Error recording document access:', error);
    return false;
  }
}

module.exports = {
  processDocument,
  deleteDocument,
  getUploadedFiles,
  checkDuplicateFile,
  recordDocumentAccess
};