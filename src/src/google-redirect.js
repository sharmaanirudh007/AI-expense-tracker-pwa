// Google Drive API Redirect Handler - CSP-Compatible Version
// This file handles Google OAuth redirects without relying on iframes

/**
 * Function to extract parameters from URL.
 * Handles both hash fragment and query parameters.
 */
function extractParams() {
  const hash = window.location.hash.substring(1);
  const query = window.location.search.substring(1);
  const paramsString = hash || query;
  
  const params = {};
  paramsString.split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key && value) {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  });
  
  return params;
}

/**
 * Main handler for Google OAuth redirects.
 * Processes tokens and communicates with the parent application.
 */
function handleGoogleRedirect() {
  try {
    const params = extractParams();
    console.log('Checking OAuth redirect parameters');
    
    // Check if this is an OAuth response
    if (params.access_token || params.code || params.error) {
      console.log('OAuth redirect detected');
      
      // Store token and related data if available
      if (params.access_token) {
        const tokenData = {
          access_token: params.access_token,
          token_type: params.token_type || 'Bearer',
          expires_in: parseInt(params.expires_in) || 3600,
          scope: params.scope || '',
          timestamp: Date.now()
        };
        
        // Store complete token info
        localStorage.setItem('google_token', JSON.stringify(tokenData));
        console.log('Access token stored in local storage');
        
        // Display success message to user
        showAuthResult('Authentication successful! You can close this window and return to the app.');
      }
      
      // Handle errors
      if (params.error) {
        console.error('OAuth error:', params.error);
        localStorage.setItem('google_auth_error', JSON.stringify({
          error: params.error,
          error_description: params.error_description || '',
          timestamp: Date.now()
        }));
        
        // Display error message to user
        showAuthResult(`Authentication failed: ${params.error_description || params.error}`, true);
      }
      
      // Clean up URL to remove sensitive parameters
      const redirectUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, redirectUrl);
      
      // Notify parent window if this is in a popup
      if (window.opener && !window.opener.closed) {
        try {
          if (params.access_token) {
            window.opener.postMessage({
              type: 'GOOGLE_AUTH_SUCCESS',
              token: params.access_token,
              expires_in: params.expires_in,
              token_type: params.token_type,
              scope: params.scope
            }, window.location.origin);
          } else if (params.error) {
            window.opener.postMessage({
              type: 'GOOGLE_AUTH_ERROR',
              error: params.error,
              error_description: params.error_description
            }, window.location.origin);
          }
          // Close window automatically after a short delay
          setTimeout(() => window.close(), 2000);
        } catch (err) {
          console.error('Error posting message to opener:', err);
        }
      }
    } else {
      console.log('No OAuth parameters detected.');
    }
  } catch (error) {
    console.error('Error handling redirect:', error);
    showAuthResult(`An error occurred: ${error.message}`, true);
  }
}

/**
 * Displays authentication result to the user.
 * @param {string} message - The message to display
 * @param {boolean} isError - Whether this is an error message
 */
function showAuthResult(message, isError = false) {
  // Create or update the result display
  let resultElement = document.getElementById('auth-result');
  
  if (!resultElement) {
    resultElement = document.createElement('div');
    resultElement.id = 'auth-result';
    resultElement.style.position = 'fixed';
    resultElement.style.top = '0';
    resultElement.style.left = '0';
    resultElement.style.right = '0';
    resultElement.style.bottom = '0';
    resultElement.style.display = 'flex';
    resultElement.style.flexDirection = 'column';
    resultElement.style.alignItems = 'center';
    resultElement.style.justifyContent = 'center';
    resultElement.style.padding = '2rem';
    resultElement.style.backgroundColor = '#232526';
    resultElement.style.color = '#ffffff';
    resultElement.style.fontSize = '1.2rem';
    resultElement.style.textAlign = 'center';
    resultElement.style.zIndex = '9999';
    
    document.body.appendChild(resultElement);
  }
  
  // Set content
  resultElement.innerHTML = `
    <div style="max-width: 500px; background: ${isError ? '#d32f2f' : '#4caf50'}; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
      <h2 style="margin-top: 0">${isError ? 'Authentication Error' : 'Authentication Success'}</h2>
      <p>${message}</p>
      <div style="margin-top: 1rem">
        <button id="close-auth-window" style="padding: 0.5rem 1.5rem; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Close Window
        </button>
      </div>
    </div>
  `;
  
  // Add close button handler
  document.getElementById('close-auth-window').onclick = () => {
    window.close();
  };
}

/**
 * Initializes the Google Auth redirect page.
 * This creates a nice UI for users who land on this page.
 */
function initRedirectPage() {
  // Only initialize if the page is empty (e.g., this is loaded as a standalone page)
  if (!document.body.children.length) {
    document.body.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #232526; color: white;">
        <h1>Google Authentication Redirect</h1>
        <p>Processing your sign in. Please wait...</p>
        <div style="width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 1s linear infinite;"></div>
      </div>
      <style>
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      </style>
    `;
  }
  
  // Process the redirect parameters
  handleGoogleRedirect();
}

// Run on load
window.addEventListener('DOMContentLoaded', initRedirectPage);

// Export functions for direct import
export { handleGoogleRedirect, extractParams };
