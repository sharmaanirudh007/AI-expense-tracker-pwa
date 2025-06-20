// src/googleDrive.js
// Google Drive integration for backup/restore using Google Identity Services (GIS)

const CLIENT_ID = '275003294216-pkbjvhu8fbam86n9bqjsrv3k7l3kvo4l.apps.googleusercontent.com';
const API_KEY = 'AIzaSyC1FGc_1gVjcn0REZklWyQmcC8q8v_Iz8k';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

let tokenClient = null;
let accessToken = null;

// Load the Google API libraries using a more CSP-friendly approach
export function loadGoogleApi() {
  return new Promise(async (resolve, reject) => {
    try {
      // Create a global initialization tracker to avoid duplicate loading
      if (!window._googleApiInitializing) {
        window._googleApiInitializing = true;
        window._googleApiInitialized = false;
        console.log('Starting Google API initialization sequence');
      } else if (window._googleApiInitialized) {
        console.log('Google API already initialized, returning');
        return resolve(window.gapi);
      }

      // If gapi isn't loaded yet, load it with CSP-compatible approach
      if (!window.gapi) {
        console.log('Loading gapi script...');
        await loadScriptWithCSPCompliance('https://apis.google.com/js/api.js');
        console.log('GAPI script loaded successfully');
      }

      // Load gapi.client with simplified approach to avoid timeout issues
      if (!window.gapi.client) {
        console.log('Loading gapi.client...');
        try {
          await new Promise((resolve, reject) => {
            window.gapi.load('client', {
              callback: resolve,
              onerror: reject
            });
          });
          console.log('GAPI client loaded successfully');
        } catch (err) {
          console.error('Failed to load GAPI client, retrying once:', err);
          // If first attempt fails, wait and try one more time
          await new Promise(resolve => setTimeout(resolve, 1500));
          await new Promise((resolve, reject) => {
            window.gapi.load('client', {
              callback: resolve,
              onerror: reject
            });
          });
        }
      }

      // Initialize gapi.client with error handling - split into smaller chunks
      try {
        console.log('Initializing GAPI client...');
        await window.gapi.client.init({
          apiKey: API_KEY
          // Leave out discoveryDocs for now to minimize issues
        });
        console.log('GAPI client initialized with API key');
        
        // Now load the discovery doc separately to avoid frame errors
        try {
          console.log('Loading Drive API directly...');
          await window.gapi.client.load('drive', 'v3');
          console.log('Drive API loaded successfully');
        } catch (loadError) {
          console.warn('Could not load Drive API discovery doc immediately:', loadError);
          // We'll try again when needed, not fatal
        }
      } catch (initError) {
        console.error('Error initializing GAPI client:', initError);
        // Continue anyway as we can still use Google Identity Services
      }

      // Now load the Google Identity Services script if needed
      if (!window.google || !window.google.accounts) {
        console.log('Loading Google Identity Services...');
        await loadScriptWithCSPCompliance('https://accounts.google.com/gsi/client');
        console.log('Google Identity Services loaded successfully');
      }

      // Initialize the GIS tokenClient if not already done
      if (!tokenClient && window.google && window.google.accounts) {
        try {
          console.log('Initializing token client...');
          tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
              if (tokenResponse && tokenResponse.access_token) {
                accessToken = tokenResponse.access_token;
                console.log('Access token acquired successfully');
              }
            },
            error_callback: (err) => {
              console.error('Token client error:', err);
              accessToken = null;
            }
          });
          console.log('Token client initialized successfully');
        } catch (tokenError) {
          console.error('Failed to initialize token client:', tokenError);
          // Don't reject here, as we might still be able to use other parts of the API
        }
      }

      window._googleApiInitialized = true;
      window._googleApiInitializing = false;
      console.log('Google API client initialization complete');
      resolve(window.gapi);
    } catch (error) {
      window._googleApiInitializing = false;
      console.error('Error in loadGoogleApi:', error);
      reject(error);
    }
  });
}

// Helper function to load scripts with CSP compliance
function loadScriptWithCSPCompliance(src) {
  return new Promise((resolve, reject) => {
    try {
      // Check if script is already loaded
      const existingScript = document.querySelector(`script[src="${src}"]`);
      if (existingScript) {
        console.log(`Script ${src} already exists, skipping load`);
        return resolve();
      }
      
      // Create script with nonce for CSP if provided
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      
      // Set CSP attributes if available
      const metaCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      if (metaCSP) {
        const content = metaCSP.getAttribute('content');
        const nonceMatch = content && content.match(/script-src[^;]+'nonce-([^']+)'/);
        if (nonceMatch && nonceMatch[1]) {
          script.nonce = nonceMatch[1];
        }
      }
      
      // Handle loading events
      script.onload = () => {
        console.log(`Script loaded successfully: ${src}`);
        resolve();
      };
      
      script.onerror = (err) => {
        console.error(`Script load error for ${src}:`, err);
        reject(new Error(`Failed to load script: ${src}`));
      };
      
      // Add to document
      document.head.appendChild(script);
    } catch (error) {
      console.error(`Error in loadScriptWithCSPCompliance for ${src}:`, error);
      reject(error);
    }
  });
}

export async function signInGoogle() {
  try {
    console.log('Starting Google sign-in process');
    
    // Load API and GIS libraries first
    await loadGoogleApi();

    if (!tokenClient) {
      console.error('Token client not initialized');
      throw new Error('Google authentication failed to initialize');
    }

    // Request access token (this will trigger the popup)
    return new Promise((resolve, reject) => {
      try {
        // Create visible indicator that login is in progress
        const messageElem = document.createElement('div');
        messageElem.id = 'google-signin-indicator';
        messageElem.style.position = 'fixed';
        messageElem.style.top = '10px';
        messageElem.style.right = '10px';
        messageElem.style.background = '#4285F4';
        messageElem.style.color = 'white';
        messageElem.style.padding = '8px 12px';
        messageElem.style.borderRadius = '4px';
        messageElem.style.zIndex = '9999';
        messageElem.style.fontSize = '14px';
        messageElem.innerHTML = 'Google sign-in in progress...';
        document.body.appendChild(messageElem);

        // Define a timeout in case something goes wrong
        const timeoutId = setTimeout(() => {
          if (document.getElementById('google-signin-indicator')) {
            document.body.removeChild(messageElem);
          }
          reject(new Error('Sign in timed out'));
        }, 60000); // 60 seconds timeout

        // Store the original callback
        const originalCallback = tokenClient.callback;

        // Override the callback temporarily
        tokenClient.callback = (response) => {
          // Call the original callback
          if (originalCallback) originalCallback(response);

          // Clear timeout and remove indicator
          clearTimeout(timeoutId);
          if (document.getElementById('google-signin-indicator')) {
            document.body.removeChild(messageElem);
          }
          
          if (response && response.access_token) {
            console.log('Access token acquired successfully');
            accessToken = response.access_token;
            resolve(response);
          } else {
            console.error('No access token in response:', response);
            reject(new Error('Failed to get access token'));
          }
        };

        // Handle errors
        const originalErrCallback = tokenClient.error_callback;
        tokenClient.error_callback = (error) => {
          // Call original error callback
          if (originalErrCallback) originalErrCallback(error);
          
          // Clear timeout and remove indicator
          clearTimeout(timeoutId);
          if (document.getElementById('google-signin-indicator')) {
            document.body.removeChild(messageElem);
          }
          
          if (error && error.type === 'popup_closed_by_user') {
            reject({error: 'popup_closed_by_user', message: 'Sign-in popup was closed'});
          } else {
            reject(error || new Error('Unknown authentication error'));
          }
        };

        // Request token with CSP-friendly approach
        console.log('Requesting access token...');
        tokenClient.requestAccessToken({ 
          prompt: 'consent',
          hint: '',  // Empty hint to avoid issues with older browsers
          login_uri: window.location.origin // Ensure redirect happens to the same origin
        });
      } catch (error) {
        console.error('Sign in request error:', error);
        reject(error);
      }
    });
  } catch (error) {
    console.error('Google sign in error:', error);
    throw error;
  }
}

export async function signOutGoogle() {
  try {
    if (accessToken) {
      // Revoke the token
      google.accounts.oauth2.revoke(accessToken, () => {
        console.log('Token revoked');
      });
      accessToken = null;
    }
    console.log('User signed out of Google successfully');
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}

export async function isSignedIn() {
  try {
    // Skip API loading if we clearly have no token
    if (!accessToken) {
      console.log('No access token, user not signed in');
      return false;
    }
    
    // Load API safely
    try {
      await loadGoogleApi();
    } catch (apiError) {
      console.error('Error loading Google API during status check:', apiError);
      // We can still proceed to validate token directly
    }
    
    // Validate token directly with Google's tokeninfo endpoint
    // This is more robust than using the Drive API and works with CSP
    try {
      const response = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Check if the token has the scope we need
        if (data && data.scope && data.scope.includes('https://www.googleapis.com/auth/drive.file')) {
          console.log('Token valid, user is signed in');
          return true;
        } else {
          console.log('Token does not have required scope');
          accessToken = null;
          return false;
        }
      } else {
        console.log('Token validation failed with status:', response.status);
        accessToken = null;
        return false;
      }
    } catch (validationError) {
      console.error('Error validating token:', validationError);
      accessToken = null;
      return false;
    }
  } catch (error) {
    console.error('Error checking sign-in status:', error);
    accessToken = null;
    return false;
  }
}

export async function uploadToDrive(filename, content) {
  try {
    // Ensure Google API is initialized and we're authenticated
    await loadGoogleApi();
    console.log('Uploading to Drive');
    
    // If not signed in (no access token), prompt for sign in
    if (!accessToken) {
      await signInGoogle();
      if (!accessToken) {
        throw new Error('Failed to authenticate with Google');
      }
    }
    
    // Convert content to a Blob for upload
    const blob = new Blob([content], {type: 'application/json'});
    
    // Create a FormData object for simple multipart upload
    // This approach avoids CSP issues with iframe uploads
    const formData = new FormData();
    
    // Add metadata part - must be first
    const metadata = {
      name: filename,
      mimeType: 'application/json',
    };
    
    const metadataBlob = new Blob([JSON.stringify(metadata)], {type: 'application/json'});
    formData.append('metadata', metadataBlob, 'metadata.json');
    
    // Add the file content
    formData.append('file', blob, filename);
    
    // Direct fetch API call to upload the file
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        // No Content-Type header - browser will set it with the boundary
      },
      body: formData
    });
    
    // Check response status
    if (!response.ok) {
      // Handle authentication errors
      if (response.status === 401) {
        accessToken = null;
        throw new Error('Your Google session has expired. Please try again to re-authenticate.');
      }
      
      // Handle other errors
      const errorData = await response.json().catch(() => ({}));
      console.error('Drive API error response:', errorData);
      throw new Error(errorData?.error?.message || `Upload error: ${response.status} ${response.statusText}`);
    }
    
    // Parse and return the response data
    const result = await response.json();
    console.log('Drive API upload response:', result);
    return result;
  } catch (err) {
    console.error('Drive API upload error:', err);
    
    // Check if the error is related to authentication
    if (err.status === 401 || (err.response?.status === 401)) {
      // Token expired, clear it and suggest re-authentication
      accessToken = null;
      throw new Error('Your Google session has expired. Please try again to re-authenticate.');
    }
    
    throw err;
  }
}

export async function pickAndDownloadFromDrive() {
  try {
    // Ensure Google API is initialized
    const gapi = await loadGoogleApi();
    
    // If not signed in (no access token), prompt for sign in
    if (!accessToken) {
      await signInGoogle();
      if (!accessToken) {
        throw new Error('Failed to authenticate with Google');
      }
    }
    
    // Make sure Drive API is loaded
    if (!gapi.client.drive) {
      console.log('Drive API not loaded, loading now...');
      try {
        await gapi.client.load('drive', 'v3');
      } catch (loadError) {
        console.error('Error loading Drive API:', loadError);
        throw new Error('Could not load Google Drive API. Please try again.');
      }
    }
    
    // First, list all JSON files from the app using direct fetch API approach
    let listResponse;
    try {
      // Build query parameters
      const params = new URLSearchParams({
        q: "mimeType='application/json' and name contains 'expenses_backup_'",
        spaces: 'drive',
        fields: 'files(id, name, createdTime)',
        orderBy: 'createdTime desc'
      });
      
      // Make direct API call
      const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      // Check for errors
      if (!response.ok) {
        // Handle authentication errors
        if (response.status === 401) {
          accessToken = null;
          throw new Error('Your Google session has expired. Please try again to re-authenticate.');
        }
        
        // Handle other errors
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `List files error: ${response.status} ${response.statusText}`);
      }
      
      // Parse response
      listResponse = await response.json();
    } catch (listError) {
      console.error('Error listing files:', listError);
      
      // Check if error is due to expired token
      if (listError.status === 401 || listError.message?.includes('expired')) {
        accessToken = null;
        throw new Error('Your Google session has expired. Please try again to re-authenticate.');
      }
      
      throw new Error('Could not list files from Google Drive.');
    }
    
    const files = listResponse.files;
    
    if (!files || files.length === 0) {
      throw new Error('No expense backup files found in your Google Drive');
    }
    
    // Create a simple file picker UI
    return new Promise((resolve, reject) => {
      const modalId = 'drive-file-picker-modal';
      const modal = document.createElement('div');
      modal.id = modalId;
      modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;">
          <div style="background:#232526;padding:2rem;border-radius:8px;min-width:300px;max-width:90vw;box-shadow:0 4px 24px rgba(0,0,0,0.18);color:#fff;">
            <h3 style="margin-top:0;">Select Backup File</h3>
            <div style="max-height:60vh;overflow-y:auto;margin:1rem 0;">
              <ul id="file-list" style="list-style:none;padding:0;margin:0;">
                ${files.map((file, index) => `
                  <li data-file-id="${file.id}" style="padding:0.75rem;margin-bottom:0.5rem;border-radius:4px;background:#333;cursor:pointer;display:flex;justify-content:space-between;">
                    <span>${file.name}</span>
                    <span>${new Date(file.createdTime).toLocaleString()}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
            <div style="display:flex;gap:1em;justify-content:flex-end;margin-top:1rem;">
              <button id="cancel-picker-btn" style="background:#666;color:#fff;padding:0.5em 1.5em;border:none;border-radius:4px;">Cancel</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // Function to safely remove the modal
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
          
          // Show loading state on the clicked item
          item.style.backgroundColor = '#4caf50';
          item.style.color = 'white';
          item.innerHTML = '<span>Loading file...</span>';
          
          try {
            // Get the file content with direct fetch API
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            // Check for errors
            if (!response.ok) {
              // Handle authentication errors
              if (response.status === 401) {
                accessToken = null;
                removeModal();
                reject(new Error('Your Google session has expired. Please try again to re-authenticate.'));
                return;
              }
              
              // Handle other errors
              const errorText = await response.text().catch(() => 'Unknown error');
              removeModal();
              reject(new Error(`Could not download file: ${response.status} ${response.statusText}`));
              return;
            }
            
            // Parse the JSON content
            let expensesData;
            try {
              const contentText = await response.text();
              expensesData = JSON.parse(contentText);
            } catch (parseError) {
              console.error('Error parsing file content:', parseError);
              removeModal();
              reject(new Error('The selected file contains invalid data'));
              return;
            }
            
            // Validate that we have an array of expenses
            if (!Array.isArray(expensesData)) {
              removeModal();
              reject(new Error('The selected file is not a valid expense backup'));
              return;
            }
            
            // Close the modal
            removeModal();
            
            // Return the expenses data
            resolve(expensesData);
          } catch (err) {
            console.error('Error loading file:', err);
            
            // Handle authentication errors
            if (err.status === 401 || (err.result && err.result.error && err.result.error.code === 401)) {
              accessToken = null;
              removeModal();
              reject(new Error('Your Google session has expired. Please try again to re-authenticate.'));
              return;
            }
            
            removeModal();
            reject(new Error('Could not load the selected file: ' + (err.message || 'Unknown error')));
          }
        });
      });
      
      // Handle cancel
      document.getElementById('cancel-picker-btn').onclick = () => {
        removeModal();
        resolve([]);
      };
      
      // Also handle ESC key to close
      const keyHandler = (e) => {
        if (e.key === 'Escape') {
          removeModal();
          resolve([]);
          document.removeEventListener('keydown', keyHandler);
        }
      };
      document.addEventListener('keydown', keyHandler);
    });
  } catch (err) {
    console.error('Error in pickAndDownloadFromDrive:', err);
    throw err;
  }
}

export async function getGoogleUserProfile() {
  try {
    await loadGoogleApi();
    
    // If we don't have an access token, we're not signed in
    if (!accessToken) {
      return null;
    }
    
    // Use the people API to get basic profile info
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        name: data.name,
        email: data.email,
        imageUrl: data.picture
      };
    } else {
      console.error('Failed to fetch user profile:', await response.text());
      return null;
    }
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * Direct access to Drive API using fetch to avoid CSP issues with iframe or discovery docs
 * This is a more reliable approach than using gapi.client.drive
 */
async function fetchDriveAPI(method, path, params = {}, body = null) {
  if (!accessToken) {
    throw new Error('No access token available. User must sign in first.');
  }

  // Build the URL with query parameters
  const url = new URL(`https://www.googleapis.com/drive/v3${path}`);
  
  // Add all query parameters
  Object.keys(params).forEach(key => {
    url.searchParams.append(key, params[key]);
  });

  // Configure the request
  const config = {
    method: method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': body ? 'application/json' : 'application/x-www-form-urlencoded',
    }
  };

  // Add body if provided
  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url.toString(), config);
    
    // Check for authentication errors
    if (response.status === 401) {
      accessToken = null;
      throw new Error('Your Google session has expired. Please sign in again.');
    }
    
    // Check for other errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        errorData?.error?.message || 
        `Drive API error: ${response.status} ${response.statusText}`
      );
    }
    
    // For empty responses like DELETE operations
    if (response.status === 204) {
      return null;
    }
    
    // Parse JSON response
    return await response.json();
  } catch (error) {
    console.error('Drive API fetch error:', error);
    throw error;
  }
}
