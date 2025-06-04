const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Verify API key
router.post('/verify', async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'API key is required' 
      });
    }
    
    // Verify the API key with Google's API
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      
      // Make a simple request to verify the key
      await model.generateContent("Hello");
      
      res.status(200).json({ 
        success: true, 
        valid: true,
        message: 'API key is valid'
      });
    } catch (error) {
      res.status(200).json({ 
        success: true, 
        valid: false,
        message: error
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to verify API key'
    });
  }
});

module.exports = router;