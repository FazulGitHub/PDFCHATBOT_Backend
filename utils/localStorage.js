const fs = require('fs');
const path = require('path');

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Delete a file from local storage
 * @param {string} storagePath - Path in local storage
 * @returns {Promise<void>}
 */
const deleteFile = async (storagePath) => {
  try {
    const filePath = path.join(UPLOADS_DIR, storagePath);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error deleting file from local storage:', error);
    throw error;
  }
};

module.exports = {
  deleteFile
};