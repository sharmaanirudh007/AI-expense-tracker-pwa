/**
 * CSP-Polyfill for Google APIs
 * This script helps with Content Security Policy issues when using Google APIs
 */

// Function to report CSP violations for debugging
function setupCSPReporting() {
  // Create a CSP report endpoint
  if (!window.CSP_ENDPOINT_SET) {
    window.CSP_ENDPOINT_SET = true;
    
    // Log CSP violations to console
    document.addEventListener('securitypolicyviolation', (e) => {
      console.warn('CSP Violation:', {
        'blockedURI': e.blockedURI,
        'violatedDirective': e.violatedDirective,
        'originalPolicy': e.originalPolicy,
        'disposition': e.disposition
      });
    });
  }
}

// Patch fetch to retry with proper headers when needed
function patchFetch() {
  const originalFetch = window.fetch;
  
  window.fetch = async function(...args) {
    try {
      const result = await originalFetch.apply(this, args);
      return result;
    } catch (error) {
      // Check if the error might be CSP related
      if (error.message && (
          error.message.includes('Failed to fetch') || 
          error.message.includes('NetworkError') ||
          error.message.includes('Content Security Policy'))) {
        
        // Log the potential CSP issue
        console.warn('Potential CSP issue with fetch call:', args[0]);
        
        // If this is a Google API call, try to add CORS headers
        if (typeof args[0] === 'string' && 
            (args[0].includes('googleapis.com') || args[0].includes('google.com'))) {
          
          // Try to modify the request to work with CSP
          const url = args[0];
          const options = args[1] || {};
          
          // Add mode: 'cors' and credentials: 'same-origin' to help with CSP
          const newOptions = {
            ...options,
            mode: 'cors',
            credentials: 'same-origin',
          };
          
          console.log('Retrying fetch with CORS settings:', url);
          return originalFetch(url, newOptions);
        }
      }
      
      // Re-throw the error if we can't handle it
      throw error;
    }
  };
}

// /**
//  * Tests the environment to determine the best approach for Google authentication
//  * based on Content Security Policy and browser capabilities.
//  */
function detectOptimalGoogleAuthMethod() {
  // Create promise to test if iframes are allowed
  const iframeTest = new Promise(resolve => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = 'https://accounts.google.com/o/oauth2/iframe';
      
      // Set timeout to detect if iframe is blocked by CSP
      const timeout = setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
        resolve(false); // Iframe loading failed or timed out
      }, 1000);
      
      // On load, iframe is allowed
      iframe.onload = () => {
        clearTimeout(timeout);
        document.body.removeChild(iframe);
        resolve(true); // Iframe loaded successfully
      };
      
      // On error, iframe is blocked
      iframe.onerror = () => {
        clearTimeout(timeout);
        document.body.removeChild(iframe);
        resolve(false); // Iframe loading failed
      };
      
      document.body.appendChild(iframe);
    } catch (error) {
      console.error('Error testing iframe:', error);
      resolve(false);
    }
  });
  
  // Return a promise with the detected authentication approach
  return iframeTest.then(iframeAllowed => {
    console.log('Iframe authentication allowed:', iframeAllowed);
    
    if (iframeAllowed) {
      return 'standard'; // Use Google's standard popup approach
    } else {
      return 'redirect'; // Use redirect-based authentication
    }
  });
}

// Function to apply CSP-friendly patches
export function applyCspPolyfills() {
  console.log('Applying CSP polyfills');
  setupCSPReporting();
  patchFetch();
  
  // Add global helper for testing CSP
  window.testCspCompliance = async () => {
    try {
      const response = await fetch('https://www.googleapis.com/drive/v3/about');
      console.log('CSP compliance test result:', response.status);
      return response.status;
    } catch (error) {
      console.error('CSP compliance test failed:', error);
      return false;
    }
  };
  
  // Execute the detection on page load
  detectOptimalGoogleAuthMethod().then(method => {
    console.log('Using Google auth method:', method);
    window.GOOGLE_AUTH_METHOD = method;
  });
}
