// src/googleDrive.js
// Google Drive integration using the new Google Identity Services (GIS)

const CLIENT_ID = '275003294216-pkbjvhu8fbam86n9bqjsrv3k7l3kvo4l.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

// The API Key is needed for the Google Picker API.
// Get it from the Google Cloud Console: https://console.cloud.google.com/apis/credentials
const API_KEY = 'AIzaSyC1FGc_1gVjcn0REZklWyQmcC8q8v_Iz8k';

let tokenClient;
let accessToken = null;
let gapiReady = false;
let gisReady = false;

// Token storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'google_access_token',
  TOKEN_EXPIRY: 'google_token_expiry',
  USER_HAS_SIGNED_IN: 'user_has_signed_in_google'
};

// Utility functions for token management
function saveTokenToStorage(token, expiresIn = 3600) {
  const expiryTime = Date.now() + (expiresIn * 1000);
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
  localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, expiryTime.toString());
  localStorage.setItem(STORAGE_KEYS.USER_HAS_SIGNED_IN, 'true');
}

function getTokenFromStorage() {
  const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const expiry = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);
  
  if (!token || !expiry) return null;
  
  if (Date.now() > parseInt(expiry)) {
    // Token expired, clear storage
    clearTokenFromStorage();
    return null;
  }
  
  return token;
}

function clearTokenFromStorage() {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
}

function hasUserPreviouslySignedIn() {
  return localStorage.getItem(STORAGE_KEYS.USER_HAS_SIGNED_IN) === 'true';
}

function clearUserSignInHistory() {
  localStorage.removeItem(STORAGE_KEYS.USER_HAS_SIGNED_IN);
}

// Promise that resolves when both GAPI and GIS are loaded and ready.
const readyPromise = new Promise((resolve, reject) => {
  // Load GAPI script for Drive API and Picker
  const gapiScript = document.createElement('script');
  gapiScript.src = 'https://apis.google.com/js/api.js';
  gapiScript.async = true;
  gapiScript.defer = true;
  gapiScript.onload = () => gapi.load('client:picker', async () => {
    await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
    gapiReady = true;
    if (gisReady) resolve();
  });
  gapiScript.onerror = reject;
  document.body.appendChild(gapiScript);

  // Load GIS script for authentication
  const gisScript = document.createElement('script');
  gisScript.src = 'https://accounts.google.com/gsi/client';
  gisScript.async = true;
  gisScript.defer = true;
  gisScript.onload = () => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: '', // Callback is set dynamically during signIn
    });
    gisReady = true;
    if (gapiReady) resolve();
  };
  gisScript.onerror = reject;
  document.body.appendChild(gisScript);
});

/**
 *  Initiates the sign-in flow.
 */
export async function signInGoogle() {
  await readyPromise;
  
  // First check if we have a valid stored token
  const storedToken = getTokenFromStorage();
  if (storedToken) {
    accessToken = storedToken;
    gapi.client.setToken({ access_token: accessToken });
    console.log('Using valid stored access token.');
    return Promise.resolve();
  }
  
  return new Promise((resolve, reject) => {
    const callback = (resp) => {
        if (resp.error) {
            console.error('Google Sign-In error:', resp.error);
            return reject(new Error(`Google Sign-In failed: ${resp.error.message || JSON.stringify(resp.error)}`));
        }
        accessToken = resp.access_token;
        gapi.client.setToken({ access_token: accessToken });
        
        // Save token to storage
        const expiresIn = resp.expires_in || 3600; // Default to 1 hour if not provided
        saveTokenToStorage(accessToken, expiresIn);
        
        console.log('Sign-in successful, access token obtained and stored.');
        resolve();
    };

    if (!tokenClient) {
        return reject(new Error("Token client not initialized"));
    }

    // This will prompt the user to select an account and grant access only when necessary.
    tokenClient.callback = callback;
    tokenClient.requestAccessToken();
  });
}

/**
 *  Signs the user out with confirmation.
 */
export async function signOutGoogle() {
  await readyPromise;
  
  // Show confirmation dialog
  const confirmed = window.confirm('Are you sure you want to sign out of Google Drive? This will remove access to cloud sync features.');
  if (!confirmed) {
    return Promise.resolve(false); // User cancelled
  }
  
  return new Promise((resolve) => {
    if (accessToken) {
      google.accounts.oauth2.revoke(accessToken, () => {
        accessToken = null;
        gapi.client.setToken(null);
        clearTokenFromStorage();
        clearUserSignInHistory();
        console.log('Successfully signed out of Google Drive.');
        resolve(true);
      });
    } else {
      // Even if no current token, clear storage
      clearTokenFromStorage();
      clearUserSignInHistory();
      console.log('Signed out (no active token found).');
      resolve(true);
    }
  });
}

/**
 *  Attempts to sign in silently on page load - only if user has previously signed in.
 */
export async function trySilentSignIn() {
  await readyPromise;
  
  // Only attempt silent sign-in if user has previously signed in
  if (!hasUserPreviouslySignedIn()) {
    console.log('User has never signed in, skipping silent sign-in attempt.');
    return Promise.resolve(null);
  }
  
  // Check if we have a valid stored token first
  const storedToken = getTokenFromStorage();
  if (storedToken) {
    accessToken = storedToken;
    gapi.client.setToken({ access_token: accessToken });
    console.log('Using valid stored access token for silent sign-in.');
    return Promise.resolve(accessToken);
  }
  
  // If no valid stored token, attempt silent sign-in
  return new Promise((resolve) => {
    if (!tokenClient) {
        console.log('Token client not initialized');
        return resolve(null);
    }
    const callback = (resp) => {
      if (resp.error) {
        // This is expected if user is not signed in or hasn't consented.
        // Don't reject, just resolve with null.
        console.log('Silent sign-in failed or user session expired.');
        resolve(null);
        return;
      }
      accessToken = resp.access_token;
      gapi.client.setToken({ access_token: accessToken });
      
      // Save the new token to storage
      const expiresIn = resp.expires_in || 3600;
      saveTokenToStorage(accessToken, expiresIn);
      
      console.log('Silent sign-in successful.');
      resolve(accessToken);
    };

    tokenClient.callback = callback;
    tokenClient.requestAccessToken({ prompt: 'none' });
  });
}

/**
 *  Checks if the user is currently signed in (checks both in-memory and stored tokens).
 */
export async function isSignedIn() {
  await readyPromise;
  
  // First check if we have an in-memory token
  if (accessToken !== null) {
    return true;
  }
  
  // If no in-memory token, check for a valid stored token
  const storedToken = getTokenFromStorage();
  if (storedToken) {
    // Set the token if we found a valid one in storage
    accessToken = storedToken;
    gapi.client.setToken({ access_token: accessToken });
    return true;
  }
  
  return false;
}

/**
 * Finds a file by name in the user's root Drive folder.
 * @param {string} filename The name of the file to find.
 * @returns {Promise<string|null>} The file ID if found, otherwise null.
 */
async function findFileByName(filename) {
  await readyPromise;
  if (!accessToken) throw new Error("Not signed in");

  try {
    const response = await gapi.client.drive.files.list({
      q: `name='${filename}' and 'root' in parents and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (response.result.files && response.result.files.length > 0) {
      console.log(`Found existing file with name "${filename}" and ID: ${response.result.files[0].id}`);
      return response.result.files[0].id;
    } else {
      console.log(`No file named "${filename}" found.`);
      return null;
    }
  } catch (err) {
    console.error("Error searching for file:", err);
    throw new Error("Failed to search for file on Google Drive.");
  }
}

/**
 *  Uploads a file to Google Drive, creating it if it doesn't exist or
 *  updating it if it does.
 */
export async function uploadToDrive(filename, content) {
  await readyPromise;
  if (!accessToken) {
    // If not signed in, try to sign in first.
    await signInGoogle();
    if (!accessToken) {
        throw new Error("Cannot upload file: Google Sign-In failed.");
    }
  }

  try {
    const fileId = await findFileByName(filename);

    if (fileId) {
      // File exists, update it by sending a PATCH request.
      console.log(`Updating existing file (ID: ${fileId})`);
      const response = await gapi.client.request({
        path: `/upload/drive/v3/files/${fileId}`,
        method: 'PATCH',
        params: { uploadType: 'media' },
        headers: { 'Content-Type': 'application/json' },
        body: content
      });
      return response.result;
    } else {
      // File does not exist, create it with a multipart POST request.
      console.log(`Creating new file: ${filename}`);
      const metadata = {
        name: filename,
        mimeType: 'application/json',
        parents: ['root']
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const close_delim = `\r\n--${boundary}--`;

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        content +
        close_delim;

      const response = await gapi.client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'multipart' },
        headers: {
          'Content-Type': `multipart/related; boundary="${boundary}"`
        },
        body: multipartRequestBody
      });
      return response.result;
    }
  } catch (err) {
    console.error('Drive API error during upload/update:', err);
    if (err.status === 401) {
        accessToken = null; // Clear the expired token
        // You might want to re-authenticate here automatically or prompt the user.
        await signInGoogle(); // Try to get a new token
        return uploadToDrive(filename, content); // And retry the upload
    }
    throw err;
  }
}

/**
 *  Gets the user's profile information.
 *  NOTE: The new GIS library requires the 'openid' and 'profile' scopes
 *  to get user information. This is a more involved process.
 */
export async function getGoogleUserProfile() {
  await readyPromise;
  if (!accessToken) return null;
  
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch user profile: ${response.statusText}`);
    }
    const profile = await response.json();
    return {
      name: profile.name,
      email: profile.email,
      imageUrl: profile.picture
    };
  } catch (error) {
    console.error('Error fetching user profile:', error);
    // Return placeholder on failure
    return {
      name: 'Signed In',
      email: '(profile info not available)',
      imageUrl: ''
    };
  }
}

export async function pickAndDownloadFromDrive() {
  await readyPromise;
  if (!accessToken) {
    throw new Error("You must be signed in to load data from Google Drive.");
  }
  if (!API_KEY) {
    throw new Error("API_KEY is missing. Please configure it in googleDrive.js");
  }

  return new Promise((resolve, reject) => {
    const pickerCallback = (data) => {
      if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
        const fileId = data[google.picker.Response.DOCUMENTS][0][google.picker.Document.ID];
        console.log(`User picked file with ID: ${fileId}`);

        // Now use Drive API to download the file content
        gapi.client.drive.files.get({
          fileId: fileId,
          alt: 'media'
        }).then(resp => {
          console.log("Successfully downloaded file content.");
          resolve(resp.body); // resp.body is a JSON string
        }).catch(err => {
          console.error("Error downloading file content:", err);
          reject(new Error("Failed to download file from Google Drive."));
        });
      } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
        console.log("User cancelled the picker.");
        resolve(null); // Resolve with null if user cancels
      }
    };

    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes("application/json");

    const picker = new google.picker.PickerBuilder()
      .setAppId(CLIENT_ID.split('-')[0]) // App ID is the first numeric part of the Client ID
      .setOAuthToken(accessToken)
      .setDeveloperKey(API_KEY)
      .addView(view)
      .setCallback(pickerCallback)
      .build();
    picker.setVisible(true);
  });
}
