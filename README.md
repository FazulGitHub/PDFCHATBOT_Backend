# RAG Chat Backend - Vercel Deployment Guide

## Environment Variables for Vercel

Make sure to set the following environment variables in your Vercel project settings:

```
QDRANT_URL=https://your-qdrant-instance.cloud.qdrant.io:6333
QDRANT_API_KEY=your_qdrant_api_key
NODE_ENV=production
VERCEL=true
CORS_ORIGIN=https://your-frontend-domain.com,http://localhost:4200
```

## Deployment Considerations

1. **File System Limitations**: Vercel uses a serverless architecture where file system operations are limited. The application has been modified to handle this by:
   - Using memory storage for file uploads
   - Creating temporary files only when needed
   - Skipping directory creation in production

2. **Scheduled Tasks**: Serverless functions don't support long-running processes. Cleanup operations are skipped in the Vercel environment.

3. **CORS Configuration**: Make sure to update the `CORS_ORIGIN` environment variable with your frontend domain.

4. **Qdrant Configuration**: Ensure your Qdrant instance is properly configured and accessible from Vercel's servers.

## Troubleshooting

If you encounter issues with the deployment:

1. Check Vercel logs for any error messages
2. Verify all environment variables are correctly set
3. Ensure your Qdrant instance is accessible and properly configured
4. Test API endpoints using tools like Postman to isolate frontend vs. backend issues