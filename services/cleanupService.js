const { qdrantClient, ensureCollection } = require('../utils/qdrantClient');
require('dotenv').config();

// Constants
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Clean up vector database documents that are older than 24 hours and not recently accessed
 * @returns {Promise<Object>} Result of the cleanup operation
 */
async function cleanupVectorDb() {
  try {
    const now = Date.now();
    const metadataCollection = 'document_metadata';
    
    await ensureCollection(metadataCollection);
    
    // Get all documents
    const response = await qdrantClient.scroll(metadataCollection, {
      limit: 100
    });
    
    if (!response.points || response.points.length === 0) {
      return { success: true, message: 'No documents found in vector DB', deletedCount: 0 };
    }
    
    const deletedDocs = [];
    const failedDocs = [];
    
    for (const point of response.points) {
      try {
        const documentId = point.id;
        const lastAccessed = new Date(point.payload.lastAccessed).getTime();
        
        // Check if document is older than 24 hours and not recently accessed
        if (now - lastAccessed > ONE_DAY_MS) {
          // Delete document vectors
          await qdrantClient.delete('document_vectors', {
            filter: {
              must: [
                { key: 'documentId', match: { value: documentId } }
              ]
            }
          });
          
          // Delete document metadata
          await qdrantClient.delete(metadataCollection, {
            points: [documentId]
          });
          
          deletedDocs.push(documentId);
        }
      } catch (err) {
        failedDocs.push(point.id);
      }
    }
    
    return {
      success: true,
      message: `Cleanup completed. Deleted ${deletedDocs.length} documents.`,
      deletedCount: deletedDocs.length,
      deletedDocs,
      failedDocs
    };
  } catch (err) {
    throw new Error(`Vector DB cleanup failed: ${err.message}`);
  }
}

/**
 * List all vector database files with their last accessed time
 * @returns {Promise<Array>} Array of vector DB files with metadata
 */
async function listVectorDbFiles() {
  try {
    const metadataCollection = 'document_metadata';
    await ensureCollection(metadataCollection);
    
    const response = await qdrantClient.scroll(metadataCollection, {
      limit: 100
    });
    
    if (!response.points || response.points.length === 0) {
      return [];
    }
    
    return response.points.map(point => ({
      documentId: point.id,
      lastAccessed: point.payload.lastAccessed,
      uploadedAt: point.payload.uploadedAt,
      originalFilename: point.payload.originalFilename || `Document ${point.id.substring(0, 8)}`
    }));
  } catch (err) {
    throw new Error(`Failed to list vector DB files: ${err.message}`);
  }
}

/**
 * Delete a specific vector database file
 * @param {string} documentId - The ID of the document to delete
 * @returns {Promise<Object>} Result of the delete operation
 */
async function deleteVectorDbFile(documentId) {
  try {
    const metadataCollection = 'document_metadata';
    
    // Check if document exists
    const response = await qdrantClient.retrieve(metadataCollection, {
      ids: [documentId]
    });
    
    if (!response.points || response.points.length === 0) {
      return { success: false, message: 'Document not found' };
    }
    
    // Delete document vectors
    await qdrantClient.delete('document_vectors', {
      filter: {
        must: [
          { key: 'documentId', match: { value: documentId } }
        ]
      }
    });
    
    // Delete document metadata
    await qdrantClient.delete(metadataCollection, {
      points: [documentId]
    });
    
    return { success: true, message: `Document ${documentId} deleted successfully` };
  } catch (err) {
    throw new Error(`Failed to delete document: ${err.message}`);
  }
}

module.exports = {
  cleanupVectorDb,
  listVectorDbFiles,
  deleteVectorDbFile
};