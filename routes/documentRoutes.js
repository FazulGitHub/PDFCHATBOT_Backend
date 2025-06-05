const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { processDocument, deleteDocument, getUploadedFiles, checkDuplicateFile, recordDocumentAccess } = require('../services/documentService');
const { validateFileType, validateUrl } = require('../middleware/security');

const router = express.Router();

// Create upload directory if it doesn't exist
const createUploadDir = () => {
  const uploadDir = path.join(os.tmpdir(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
};

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Use memory storage for all environments for simplicity

const fileFilter = (req, file, cb) => {
  console.log('Multer fileFilter - File:', file.originalname, 'Mimetype:', file.mimetype);
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF files are allowed.'), false);
  }
};

// Configure multer with memory storage
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Error handler middleware
const handleErrors = (err, req, res, next) => {
  console.error('Multer error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  } else if (err) {
    // Handle other errors that might not be instanceof MulterError
    return res.status(400).json({ error: 'Upload error: ' + err.message });
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
  (req, res, next) => {
    console.log('Request received:', req.headers['content-type']);
    console.log('Request body type:', typeof req.body);
    next();
  },
  (req, res, next) => {
    // Check if the content type is correct for file uploads
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ 
        error: 'Invalid content type. Expected multipart/form-data',
        receivedContentType: contentType
      });
    }
    next();
  },
  upload.single('pdf'),
  (req, res, next) => {
    console.log('After multer:', req.file ? `File received: ${req.file.originalname}, size: ${req.file.size}` : 'No file');
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file received',
        headers: req.headers['content-type']
      });
    }
    next();
  },
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
            
            // Clean up temp file after processing
            if (fs.existsSync(tempFilePath)) {
              try {
                fs.unlinkSync(tempFilePath);
              } catch (cleanupErr) {
                console.error('Error cleaning up temp file:', cleanupErr);
              }
            }
          } catch (err) {
            console.error('Error processing buffer:', err);
            // Clean up temp file in case of error
            if (fs.existsSync(tempFilePath)) {
              try {
                fs.unlinkSync(tempFilePath);
              } catch (cleanupErr) {
                console.error('Error cleaning up temp file after error:', cleanupErr);
              }
            }
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
  express.json(),
  (req, res, next) => {
    console.log('URL processing request body:', req.body);
    next();
  },
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