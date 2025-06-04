const express = require('express');
const { generateResponse } = require('../services/chatService');

const router = express.Router();

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

// Generate chat response
router.post('/query', checkApiKey, async (req, res) => {
  try {
    const { query, documentId } = req.body;
    const apiKey = req.headers['x-api-key'];
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    if (!documentId) {
      return res.status(400).json({ error: 'Document ID is required' });
    }
    
    const response = await generateResponse(query, documentId, apiKey);
    
    res.status(200).json({ 
      success: true, 
      response: response
    });
  } catch (error) {
    if (error.code === 'DOCUMENT_NOT_FOUND') {
      return res.status(404).json({ 
        error: 'Document not found',
        details: error.message
      });
    }
    
    if (error.code === 'API_KEY_MISSING') {
      return res.status(401).json({ 
        error: 'API key is required',
        code: 'API_KEY_MISSING'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to generate response',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;