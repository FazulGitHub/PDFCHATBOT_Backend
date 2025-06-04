const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { processDocument, deleteDocument, getUploadedFiles, checkDuplicateFile, recordDocumentAccess } = require('../services/documentService');
const { validateFileType, validateUrl } = require('../middleware/security');

const router = express.Router();

// Configure multer for temporary file uploads
// Use memory storage for Vercel environment
const storage = process.env.NODE_ENV === 'production' 
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = path.join(os.tmpdir(), 'uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        // Sanitize filename
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${Date.now()}-${sanitizedName}`);
      }
    });

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF files are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  preservePath: false
});

// Error handler middleware
const handleErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  }
  next(err);
};

// Check for API key middleware
const checkApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ 
      error: 'API key is required',
      code: 'API_KEY_MISSING'
    });
  }
  
  next();
};

// Upload PDF document
router.post('/upload-pdf', 
  upload.single('pdf'),
  handleErrors,
  validateFileType,
  checkApiKey,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const apiKey = req.headers['x-api-key'];
      const originalFilename = req.file.originalname;
      const existingDocId = await checkDuplicateFile(originalFilename, apiKey);
      
      let documentId;
      let isDuplicate = false;
      
      if (existingDocId) {
        // File already exists
        documentId = existingDocId;
        isDuplicate = true;
        
        // Record access for the existing document
        await recordDocumentAccess(existingDocId);
        
        // Clean up if using disk storage
        if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } else {
        // Process the new file - handle both memory and disk storage
        if (req.file.buffer) {
          // Memory storage (Vercel production)
          // Create a temporary file from the buffer
          const tempDir = os.tmpdir();
          const tempFilePath = path.join(tempDir, `${Date.now()}-${originalFilename}`);
          
          try {
            // Write buffer to temp file
            fs.writeFileSync(tempFilePath, req.file.buffer);
            // Process the temp file
            documentId = await processDocument(tempFilePath, 'pdf', apiKey);
          } catch (err) {
            console.error('Error processing buffer:', err);
            throw err;
          }
        } else {
          // Disk storage (development)
          documentId = await processDocument(req.file.path, 'pdf', apiKey);
        }
      }
      
      res.status(200).json({ 
        success: true, 
        documentId,
        isDuplicate: isDuplicate,
        message: isDuplicate ? 'File already exists' : 'PDF processed successfully'
      });
    } catch (error) {
      console.error('Error processing PDF:', error);
      // Clean up uploaded file in case of processing error
      if (req.file) {
        if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlink(req.file.path, (err) => {
            if (err) console.error('Error deleting failed upload:', err);
          });
        }
      }
      res.status(500).json({ 
        error: 'Failed to process PDF',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
});

// Process URL content
router.post('/process-url',
  validateUrl,
  checkApiKey,
  async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      const apiKey = req.headers['x-api-key'];
      
      // Check if this URL already exists before processing
      const existingDocId = await checkDuplicateFile(url, apiKey);
      
      let documentId;
      let isDuplicate = false;
      
      if (existingDocId) {
        // URL already exists
        documentId = existingDocId;
        isDuplicate = true;
        
        // Record access for the existing document
        await recordDocumentAccess(existingDocId);
      } else {
        // Process the new URL
        documentId = await processDocument(url, 'url', apiKey);
      }
      
      res.status(200).json({ 
        success: true, 
        documentId: documentId,
        isDuplicate: isDuplicate,
        message: isDuplicate ? 'URL already exists' : 'URL processed successfully' 
      });
    } catch (error) {
      console.error('Error processing URL:', error);
      res.status(500).json({ 
        error: 'Failed to process URL',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
});

// Delete document endpoint
router.delete('/:documentId',
  checkApiKey,
  async (req, res) => {
    try {
      const { documentId } = req.params;
      
      if (!documentId) {
        return res.status(400).json({ error: 'Document ID is required' });
      }

      const result = await deleteDocument(documentId);
      
      res.status(200).json({ 
        success: true, 
        message: 'Document deleted successfully' 
      });
    } catch (error) {
      console.error('Error deleting document:', error);
      
      if (error.code === 'DOCUMENT_NOT_FOUND') {
        return res.status(404).json({ 
          error: 'Document not found',
          details: error.message
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to delete document',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
});

// Get list of uploaded files
router.get('/list',
  checkApiKey,
  async (req, res) => {
    try {
      const apiKey = req.headers['x-api-key'];
      const result = await getUploadedFiles(apiKey);
      
      res.status(200).json({ 
        success: true, 
        files: result.files
      });
    } catch (error) {
      console.error('Error listing files:', error);
      
      res.status(500).json({ 
        error: 'Failed to list files',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
});

module.exports = router;