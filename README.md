# RAG Chat Backend - Vercel Deployment Guide

## Deployment Steps

1. **Set up environment variables in Vercel**:
   - QDRANT_URL (required)
   - QDRANT_API_KEY (required)
   - NODE_ENV=production
   - CORS_ORIGIN (comma-separated list of allowed origins)

2. **Deploy to Vercel**:
   ```
   vercel
   ```

## Troubleshooting Vercel Deployment

If deployment fails, check the following:

1. **Multer Version**: Make sure you're using a stable version of multer (1.4.5-lts.1)

2. **Serverless Function Structure**: 
   - The `api/index.js` file should export the Express app
   - The main `index.js` should not start the server in Vercel environment

3. **Environment Variables**:
   - Verify all required environment variables are set in Vercel dashboard
   - Check for typos in environment variable names

4. **File System Operations**:
   - Ensure all file system operations check for Vercel environment
   - Use memory storage for file uploads in Vercel
   - Use temporary directories for any file operations

5. **Vercel Logs**:
   - Check deployment logs in Vercel dashboard for specific errors
   - Use `console.log` statements to debug issues

## Local Development

For local development:

```
npm install
npm run dev
```

Make sure to set up your `.env` file with the required environment variables.