/**
 * Direct Google Drive API Implementation
 * This module provides direct API calls to Google Drive without relying on gapi libraries
 * It avoids Content Security Policy (CSP) issues by using fetch API directly.
 */

import * as GoogleAuth from './google-auth-direct.js';

// Base URLs for Google APIs
const API_BASE_URL = 'https://www.googleapis.com';
const DRIVE_API_URL = `${API_BASE_URL}/drive/v3`;
const UPLOAD_API_URL = `${API_BASE_URL}/upload/drive/v3`;

/**
 * Upload a file to Google Drive
 * @param {string} filename - The name of the file
 * @param {string} content - The content of the file
 * @returns {Promise<Object>} The Drive API response
 */
export async function uploadFile(filename, content) {
  try {
    // Ensure authentication
    if (!GoogleAuth.isAuthenticated()) {
      await GoogleAuth.authenticate();
    }
    
    // Convert content to a Blob
    const contentBlob = new Blob([content], { type: 'application/json' });
    
    // Create FormData for multipart upload
    const formData = new FormData();
    
    // Add metadata
    const metadata = JSON.stringify({
      name: filename,
      mimeType: 'application/json'
    });
    
    const metadataBlob = new Blob([metadata], { type: 'application/json' });
    formData.append('metadata', metadataBlob, 'metadata.json');
    
    // Add file
    formData.append('file', contentBlob, filename);
    
    // Make the request
    const response = await fetch(`${UPLOAD_API_URL}/files?uploadType=multipart`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GoogleAuth.getAccessToken()}`
      },
      body: formData
    });
    
    // Check for errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} ${errorText}`);
    }
    
    // Return the result
    return await response.json();
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

/**
 * List files from Google Drive
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of files
 */
export async function listFiles(options = {}) {
  try {
    // Ensure authentication
    if (!GoogleAuth.isAuthenticated()) {
      await GoogleAuth.authenticate();
    }
    
    // Set up default query
    const defaultQuery = {
      q: "mimeType='application/json' and name contains 'expenses_backup_'",
      spaces: 'drive',
      fields: 'files(id, name, createdTime, size)',
      orderBy: 'createdTime desc'
    };
    
    // Merge with user options
    const queryParams = new URLSearchParams({
      ...defaultQuery,
      ...options
    });
    
    // Make the request
    const response = await fetch(`${DRIVE_API_URL}/files?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GoogleAuth.getAccessToken()}`
      }
    });
    
    // Check for errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Listing files failed: ${response.status} ${errorText}`);
    }
    
    // Return the files
    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
}

/**
 * Download a file from Google Drive
 * @param {string} fileId - The ID of the file to download
 * @returns {Promise<Object>} The file content as JSON
 */
export async function downloadFile(fileId) {
  try {
    // Ensure authentication
    if (!GoogleAuth.isAuthenticated()) {
      await GoogleAuth.authenticate();
    }
    
    // Make the request
    const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GoogleAuth.getAccessToken()}`
      }
    });
    
    // Check for errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Download failed: ${response.status} ${errorText}`);
    }
    
    // Parse the content
    const contentText = await response.text();
    return JSON.parse(contentText);
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
}

/**
 * Create a file picker UI to let the user select a file
 * @returns {Promise<Object>} The selected file data
 */
export async function pickAndDownloadFile() {
  try {
    // Ensure authentication
    if (!GoogleAuth.isAuthenticated()) {
      await GoogleAuth.authenticate();
    }
    
    // Get the list of files
    const files = await listFiles();
    
    if (!files || files.length === 0) {
      throw new Error('No backup files found in Google Drive');
    }
    
    // Return a promise that resolves when a file is selected
    return new Promise((resolve, reject) => {
      // Create the file picker UI
      const modalId = 'drive-file-picker';
      let modal = document.createElement('div');
      modal.id = modalId;
      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-content" style="max-width: 600px;">
            <h3>Select a Backup File</h3>
            <div style="max-height: 60vh; overflow-y: auto; margin: 1rem 0;">
              <ul id="file-list" style="list-style: none; padding: 0; margin: 0;">
                ${files.map(file => `
                  <li data-file-id="${file.id}" style="padding: 0.75rem; margin-bottom: 0.5rem; border-radius: 4px; background: #333; cursor: pointer; display: flex; justify-content: space-between;">
                    <span>${file.name}</span>
                    <span>${new Date(file.createdTime).toLocaleString()}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
            <div class="modal-actions">
              <button id="cancel-picker">Cancel</button>
            </div>
          </div>
        </div>
      `;
      
      // Add to document
      document.body.appendChild(modal);
      
      // Function to remove modal
      const removeModal = () => {
        const existingModal = document.getElementById(modalId);
        if (existingModal) {
          document.body.removeChild(existingModal);
        }
      };
      
      // Handle file selection
      const fileItems = modal.querySelectorAll('#file-list li');
      fileItems.forEach(item => {
        item.addEventListener('click', async () => {
          const fileId = item.getAttribute('data-file-id');
          
          // Show loading state
          item.style.backgroundColor = '#4caf50';
          item.style.color = 'white';
          item.innerHTML = '<span>Loading file...</span>';
          
          try {
            // Download the file
            const fileData = await downloadFile(fileId);
            
            // Close modal and return data
            removeModal();
            resolve(fileData);
          } catch (error) {
            console.error('Error downloading selected file:', error);
            removeModal();
            reject(error);
          }
        });
      });
      
      // Handle cancel
      document.getElementById('cancel-picker').onclick = () => {
        removeModal();
        resolve(null);
      };
      
      // Handle ESC key
      const keyHandler = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', keyHandler);
          removeModal();
          resolve(null);
        }
      };
      document.addEventListener('keydown', keyHandler);
    });
  } catch (error) {
    console.error('Error picking file:', error);
    throw error;
  }
}

/**
 * Initialize the Google Drive API
 * This checks authentication and sets up the redirect handler
 */
export function initDriveApi() {
  // Initialize authentication
  GoogleAuth.initAuth();
  
  // Set up the redirect page if needed
  const createRedirectPage = () => {
    // Get the base path
    const basePath = window.location.pathname.replace(/\/[^/]*$/, '/');
    
    // Create the redirect HTML file
    const redirectHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Authentication</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #232526;
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 1s linear infinite;
      margin-top: 2rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .container {
      text-align: center;
      max-width: 500px;
      padding: 2rem;
    }
    .result {
      margin-top: 2rem;
      padding: 1rem;
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      display: none;
    }
    button {
      margin-top: 1rem;
      padding: 0.5rem 1.5rem;
      background: #4caf50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .error {
      background: #d32f2f;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Google Authentication</h1>
    <p>Processing your sign in. Please wait...</p>
    <div class="spinner"></div>
    <div id="result" class="result"></div>
  </div>
  
  <script type="module">
    import { handleGoogleRedirect } from './google-redirect.js';
    
    window.addEventListener('DOMContentLoaded', () => {
      try {
        handleGoogleRedirect();
      } catch(err) {
        const resultDiv = document.getElementById('result');
        resultDiv.textContent = 'Error: ' + err.message;
        resultDiv.className = 'result error';
        resultDiv.style.display = 'block';
      }
    });
  </script>
</body>
</html>
`;
    
    // Try to use the download attribute (works in modern browsers)
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([redirectHtml], { type: 'text/html' }));
    a.download = 'google-redirect.html';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    console.log('Please place the downloaded google-redirect.html file in your app root directory.');
  };
  
  // Check if we need to create the redirect page
  fetch('google-redirect.html', { method: 'HEAD' })
    .catch(() => {
      console.log('Redirect page not found. Creating one for you to download.');
      createRedirectPage();
    });
}

// Initialize on load
initDriveApi();
