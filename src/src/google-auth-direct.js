/**
 * Direct Google OAuth2 Implementation
 * This module provides direct OAuth2 implementation for Google APIs without relying on gapi libraries
 * It avoids Content Security Policy (CSP) issues by using redirect-based authentication.
 */

// OAuth configuration
const OAUTH_CONFIG = {
  client_id: '275003294216-pkbjvhu8fbam86n9bqjsrv3k7l3kvo4l.apps.googleusercontent.com',
  redirect_uri: window.location.origin + '/google-redirect.html',
  scope: 'https://www.googleapis.com/auth/drive.file',
  response_type: 'token',
  auth_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token'
};

// State management for token
let currentAccessToken = null;
let tokenExpiryTime = null;

// Event listeners for auth messages
window.addEventListener('message', (event) => {
  if (event.origin === window.location.origin) {
    if (event.data && event.data.type === 'GOOGLE_AUTH_SUCCESS') {
      console.log('Received Google auth success message');
      currentAccessToken = event.data.token;
      tokenExpiryTime = Date.now() + ((event.data.expires_in || 3600) * 1000);
      
      // Store the token in localStorage
      storeToken(currentAccessToken, event.data.expires_in || 3600);
      
      // Dispatch success event
      window.dispatchEvent(new CustomEvent('google-auth-success', {
        detail: { token: currentAccessToken }
      }));
    } else if (event.data && event.data.type === 'GOOGLE_AUTH_ERROR') {
      console.error('Received Google auth error message:', event.data.error);
      
      // Dispatch error event
      window.dispatchEvent(new CustomEvent('google-auth-error', {
        detail: { error: event.data.error, description: event.data.error_description }
      }));
    }
  }
});

/**
 * Store token in localStorage
 * @param {string} token - The access token
 * @param {number} expiresIn - Expiration time in seconds
 */
function storeToken(token, expiresIn = 3600) {
  if (!token) return;
  
  const tokenData = {
    access_token: token,
    expires_at: Date.now() + (expiresIn * 1000),
    created_at: Date.now()
  };
  
  localStorage.setItem('google_token_data', JSON.stringify(tokenData));
}

/**
 * Get stored token from localStorage
 * @returns {Object|null} The token data or null if not found/expired
 */
function getStoredToken() {
  try {
    const tokenJson = localStorage.getItem('google_token_data');
    if (!tokenJson) return null;
    
    const tokenData = JSON.parse(tokenJson);
    
    // Check if token is expired (with 5-minute buffer)
    if (tokenData.expires_at - 300000 < Date.now()) {
      localStorage.removeItem('google_token_data');
      return null;
    }
    
    return tokenData;
  } catch (error) {
    console.error('Error reading stored token:', error);
    return null;
  }
}

/**
 * Initialize authentication - load token from storage if available
 */
function initAuth() {
  const storedToken = getStoredToken();
  if (storedToken) {
    currentAccessToken = storedToken.access_token;
    tokenExpiryTime = storedToken.expires_at;
    console.log('Restored access token from storage');
    return true;
  }
  return false;
}

/**
 * Start Google OAuth flow
 * @returns {Promise<Object>} A promise that resolves when authentication completes
 */
function startAuthFlow() {
  return new Promise((resolve, reject) => {
    try {
      // Check if we already have a valid token
      if (isAuthenticated()) {
        return resolve({ token: currentAccessToken });
      }
      
      // Generate state parameter for security
      const state = Math.random().toString(36).substring(2);
      localStorage.setItem('google_auth_state', state);
      
      // Build authorization URL
      const authUrl = new URL(OAUTH_CONFIG.auth_endpoint);
      authUrl.searchParams.append('client_id', OAUTH_CONFIG.client_id);
      authUrl.searchParams.append('redirect_uri', OAUTH_CONFIG.redirect_uri);
      authUrl.searchParams.append('response_type', OAUTH_CONFIG.response_type);
      authUrl.searchParams.append('scope', OAUTH_CONFIG.scope);
      authUrl.searchParams.append('state', state);
      authUrl.searchParams.append('include_granted_scopes', 'true');
      authUrl.searchParams.append('prompt', 'consent');
      
      // Set up event listeners for auth completion
      const authSuccessHandler = (event) => {
        window.removeEventListener('google-auth-success', authSuccessHandler);
        window.removeEventListener('google-auth-error', authErrorHandler);
        resolve({ token: event.detail.token });
      };
      
      const authErrorHandler = (event) => {
        window.removeEventListener('google-auth-success', authSuccessHandler);
        window.removeEventListener('google-auth-error', authErrorHandler);
        reject(new Error(event.detail.description || event.detail.error || 'Authentication failed'));
      };
      
      // Listen for auth completion events
      window.addEventListener('google-auth-success', authSuccessHandler);
      window.addEventListener('google-auth-error', authErrorHandler);
      
      // Open popup or redirect based on CSP environment
      if (window.opener) {
        // We're already in a popup, use direct redirect
        window.location.href = authUrl.toString();
      } else {
        // Open in a popup
        const popup = window.open(
          authUrl.toString(),
          'GoogleAuth',
          'width=500,height=600,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
        );
        
        if (!popup || popup.closed) {
          window.removeEventListener('google-auth-success', authSuccessHandler);
          window.removeEventListener('google-auth-error', authErrorHandler);
          reject(new Error('Popup blocked. Please allow popups for this site.'));
        }
        
        // Backup timeout in case message events fail
        const popupTimer = setInterval(() => {
          if (popup.closed) {
            clearInterval(popupTimer);
            window.removeEventListener('google-auth-success', authSuccessHandler);
            window.removeEventListener('google-auth-error', authErrorHandler);
            
            // Check if we got a token while the popup was open
            const storedToken = getStoredToken();
            if (storedToken && storedToken.access_token) {
              currentAccessToken = storedToken.access_token;
              resolve({ token: currentAccessToken });
            } else {
              reject(new Error('Authentication canceled or failed'));
            }
          }
        }, 1000);
      }
    } catch (error) {
      console.error('Error starting auth flow:', error);
      reject(error);
    }
  });
}

/**
 * Check if the user is authenticated
 * @returns {boolean} True if authenticated with a valid token
 */
function isAuthenticated() {
  // First check in-memory token
  if (currentAccessToken && tokenExpiryTime && tokenExpiryTime > Date.now()) {
    return true;
  }
  
  // Then check stored token
  const storedToken = getStoredToken();
  if (storedToken) {
    currentAccessToken = storedToken.access_token;
    tokenExpiryTime = storedToken.expires_at;
    return true;
  }
  
  return false;
}

/**
 * Sign out the user
 */
function signOut() {
  currentAccessToken = null;
  tokenExpiryTime = null;
  localStorage.removeItem('google_token_data');
  
  // Optional: revoke token at Google
  if (currentAccessToken) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${currentAccessToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }).catch(error => {
      console.error('Error revoking token:', error);
    });
  }
}

/**
 * Get the current access token
 * @returns {string|null} The access token or null if not authenticated
 */
function getAccessToken() {
  if (isAuthenticated()) {
    return currentAccessToken;
  }
  return null;
}

/**
 * Make an authorized request to a Google API
 * @param {string} endpoint - API endpoint (full URL)
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} The API response
 */
async function makeAuthorizedRequest(endpoint, options = {}) {
  if (!isAuthenticated()) {
    throw new Error('User not authenticated');
  }
  
  // Set up request with authorization
  const requestOptions = {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${currentAccessToken}`
    }
  };
  
  try {
    const response = await fetch(endpoint, requestOptions);
    
    // Handle authentication errors
    if (response.status === 401) {
      currentAccessToken = null;
      tokenExpiryTime = null;
      localStorage.removeItem('google_token_data');
      throw new Error('Authentication expired. Please sign in again.');
    }
    
    // Parse response based on content type
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const jsonResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(jsonResponse.error?.message || `API error: ${response.status}`);
      }
      
      return jsonResponse;
    } else {
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      return await response.text();
    }
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}

// Initialize on load
initAuth();

// Export the API
export {
  startAuthFlow as authenticate,
  isAuthenticated,
  signOut,
  getAccessToken,
  makeAuthorizedRequest,
  initAuth
};
