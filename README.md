# AI-Powered Document Chat Assistant with RAG Technology

A modern web application that enables intelligent document-based conversations using Retrieval Augmented Generation (RAG) technology. The system processes PDF documents and URLs, generates vector embeddings using Google's Generative AI, and provides contextually relevant responses to user queries.

This application combines the power of Angular for the frontend and Node.js for the backend, with Qdrant vector database for efficient document storage and retrieval. It leverages Google's Generative AI models for both embeddings and chat responses, providing a seamless experience for document-based conversations.

The system features automatic document processing, intelligent chunking, vector embeddings generation, and efficient retrieval of relevant context for generating accurate responses. It includes automatic cleanup of unused documents, secure API key management, and a responsive user interface.

## Repository Structure
```
.
├── backend/                      # Node.js backend application
│   ├── api/                     # Vercel serverless function entry point
│   ├── middleware/              # Security and request validation middleware
│   ├── routes/                  # API route handlers for documents, chat, and cleanup
│   ├── services/                # Core business logic for document processing and chat
│   └── utils/                   # Utility functions and database client
├── frontend/                    # Angular frontend application
│   ├── src/
│   │   ├── app/                # Application components and modules
│   │   │   ├── components/     # Reusable UI components
│   │   │   ├── features/       # Feature modules (chat, files, home)
│   │   │   ├── services/       # Angular services for API communication
│   │   │   └── shared/         # Shared modules and utilities
│   │   └── environments/       # Environment configuration files
│   └── angular.json            # Angular CLI configuration
```

## Usage Instructions
### Prerequisites
- Node.js v18 or higher
- Angular CLI
- Google Generative AI API key
- Qdrant vector database instance
- Firebase account (for frontend deployment)
- Vercel account (for backend deployment)

### Installation

#### Backend Setup
```bash
# Clone the repository
git clone <repository-url>

# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Add required environment variables
# QDRANT_URL=your-qdrant-url
# QDRANT_API_KEY=your-qdrant-api-key
# ADMIN_KEY=your-admin-key
```

#### Frontend Setup
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Configure environment
cp src/environments/environment.example.ts src/environments/environment.ts

# Update environment variables with your backend API URL
```

### Quick Start
1. Start the backend server:
```bash
cd backend
npm run dev
```

2. Start the frontend application:
```bash
cd frontend
npm start
```

3. Open your browser and navigate to `http://localhost:4200`

### More Detailed Examples

#### Processing a Document
```typescript
// Upload a PDF document
const formData = new FormData();
formData.append('pdf', file);
await http.post('/api/documents/upload-pdf', formData);

// Process a URL
await http.post('/api/documents/process-url', { url: 'https://example.com' });
```

#### Chatting with Documents
```typescript
// Query a processed document
const response = await http.post('/api/chat/query', {
  query: 'What is the main topic?',
  documentId: 'your-document-id'
});
```

### Troubleshooting

#### Common Issues

1. **API Key Invalid**
   - Error: "Failed to initialize embeddings model"
   - Solution: Verify your Google Generative AI API key is valid and has proper permissions

2. **Document Processing Fails**
   - Error: "Failed to process PDF"
   - Check:
     - File size (max 10MB)
     - PDF format validity
     - Temporary storage permissions

3. **Vector Database Connection**
   - Error: "Qdrant client not properly initialized"
   - Verify:
     - QDRANT_URL is correct
     - QDRANT_API_KEY has proper permissions
     - Network connectivity to Qdrant instance

## Data Flow
The application processes documents and handles chat queries through a multi-step pipeline.

```ascii
[Frontend] -> [Backend API] -> [Document Processing]
                                    |
                                    v
[Chat Response] <- [RAG Engine] <- [Vector DB]
```

Component Interactions:
1. Frontend submits documents or URLs for processing
2. Backend validates and chunks the content
3. Google AI generates embeddings for document chunks
4. Qdrant stores vectors and metadata
5. Chat queries trigger similarity search in Qdrant
6. Retrieved context is used for RAG-enhanced responses
7. Responses are streamed back to the frontend
8. Automatic cleanup removes unused documents after 24 hours



### Vercel (Backend)
- Node.js serverless functions
- API routes for document processing and chat
- Environment variables for configuration

### Firebase (Frontend)
- Static file hosting
- Single-page application routing
- Environment-specific configurations

### Qdrant Vector Database
- Collections:
  - document_vectors: Stores document chunk embeddings
  - document_metadata: Stores document information
- Indexes for efficient querying
- Automatic cleanup of unused documents