const express = require('express');
const { cleanupVectorDb, listVectorDbFiles, deleteVectorDbFile } = require('../services/cleanupService');

const router = express.Router();

// Admin middleware - only allow from localhost or with admin key
const adminOnly = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('::ffff:127.0.0.1');
  
  if (isLocalhost || process.env.NODE_ENV === 'development') {
    return next();
  }
  
  const adminKey = req.headers['x-admin-key'];
  if (adminKey && adminKey === process.env.ADMIN_KEY) {
    return next();
  }
  
  return res.status(403).json({ error: 'Unauthorized access' });
};

// Run cleanup
router.post('/run', adminOnly, async (req, res) => {
  try {
    const result = await cleanupVectorDb();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to run cleanup',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// List all vector DB files
router.get('/list', adminOnly, async (req, res) => {
  try {
    const files = await listVectorDbFiles();
    res.status(200).json({ 
      success: true, 
      files: files
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to list files',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete specific vector DB file
router.delete('/:documentId', adminOnly, async (req, res) => {
  try {
    const { documentId } = req.params;
    
    if (!documentId) {
      return res.status(400).json({ error: 'Document ID is required' });
    }
    
    const result = await deleteVectorDbFile(documentId);
    
    if (!result.success) {
      return res.status(404).json({ error: result.message });
    }
    
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to delete file',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;