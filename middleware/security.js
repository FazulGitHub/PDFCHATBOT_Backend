const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// File type validation
const allowedFileTypes = ['application/pdf'];
const validateFileType = (req, res, next) => {
  if (!req.file) return next();
  
  if (!allowedFileTypes.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Invalid file type. Only PDF files are allowed.' });
  }
  next();
};

// URL validation
const validateUrl = (req, res, next) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Add protocol if missing
  let processedUrl = url;
  if (!url.match(/^https?:\/\//)) {
    processedUrl = 'http://' + url;
  }
  
  try {
    // Validate URL format
    const urlObj = new URL(processedUrl);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol. Only HTTP and HTTPS are allowed.' });
    }
    
    // Update the request body with the processed URL
    req.body.url = processedUrl;
    next();
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }
};

module.exports = {
  limiter,
  helmet,
  validateFileType,
  validateUrl
};