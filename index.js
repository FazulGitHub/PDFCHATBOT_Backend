const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
require('dotenv').config();

const { limiter, helmet } = require('./middleware/security');
const { cleanupVectorDb } = require('./services/cleanupService');
const { ensureCollection } = require('./utils/qdrantClient');

const app = express();
const PORT = process.env.PORT || 3000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Security middleware
app.use(helmet());
// Enable trust proxy to properly handle X-Forwarded-For headers
app.set('trust proxy', true);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: false
}));

// Add OPTIONS handling for preflight requests
app.options('*', cors());

app.use(limiter);
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Import routes
const documentRoutes = require('./routes/documentRoutes');
const chatRoutes = require('./routes/chatRoutes');
const keyRoutes = require('./routes/keyRoutes');
const cleanupRoutes = require('./routes/cleanupRoutes');

// API routes
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'RAG Chat API is running',
    version: '1.0.0'
  });
});
app.use('/api/documents', documentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/key', keyRoutes);
app.use('/api/cleanup', cleanupRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error occurred:', err);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Create necessary directories
const ensureDirectoriesExist = async () => {
  try {
    
    // Skip directory creation in production/Vercel environment
    if (process.env.NODE_ENV !== 'production') {
      if (!fsSync.existsSync(UPLOAD_DIR)) {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
      }
    } else {
      console.log('Running in production/Vercel environment, skipping directory creation');
    }
  } catch (err) {
    console.error('Error creating directories:', err);
  }
};

// Cleanup uploaded files
const cleanupUploads = async () => {
  try {
    // Skip file system operations in production/Vercel environment
    if (process.env.NODE_ENV === 'production') {
      console.log('Skipping file cleanup in production/Vercel environment');
      return;
    }
    
    if (!fsSync.existsSync(UPLOAD_DIR)) return;
    
    const files = await fs.readdir(UPLOAD_DIR);
    if (!files.length) return;
    
    const now = Date.now();
    const deletePromises = files.map(async (file) => {
      try {
        const filePath = path.join(UPLOAD_DIR, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > ONE_DAY_MS) {
          await fs.unlink(filePath);
        }
      } catch (err) {
        console.error(`Error processing file ${file}:`, err);
      }
    });
    
    await Promise.all(deletePromises);
  } catch (err) {
    console.error('Error in cleanup process:', err);
  }
};

// Initialize Qdrant collections
const initQdrant = async () => {
  try {
    await ensureCollection('document_vectors');
    await ensureCollection('document_metadata');
  } catch (err) {
    console.error('Error initializing Qdrant collections:', err);
  }
};

// Initialize server
const initServer = async () => {
  await ensureDirectoriesExist();
  await initQdrant();
  
  // Only start the server if not in Vercel environment
  if (process.env.NODE_ENV !== 'production') {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    }).on('error', (err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
    
    // Graceful shutdown
    const gracefulShutdown = () => {
      console.log('Received shutdown signal. Closing server...');
      server.close(() => {
        process.exit(0);
      });
    };
    
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
    // Only schedule cleanup tasks in non-serverless environments
    if (process.env.NODE_ENV !== 'production') {
      setInterval(cleanupUploads, ONE_DAY_MS);
      setInterval(cleanupVectorDb, ONE_DAY_MS);
      cleanupUploads(); // Run initial cleanup
      cleanupVectorDb(); // Run initial vector DB cleanup
    }
  } else {
    console.log('Running in Vercel environment, skipping server start');
  }
};

// Start the server
if (require.main === module) {
  initServer().catch(err => {
    console.error('Server initialization failed:', err);
    process.exit(1);
  });
}

module.exports = app;