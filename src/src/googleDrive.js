// src/googleDrive.js
// Google Drive integration using the new Google Identity Services (GIS)

const CLIENT_ID = '275003294216-pkbjvhu8fbam86n9bqjsrv3k7l3kvo4l.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

let tokenClient;
let accessToken = null;
let gapiReady = false;
let gisReady = false;

// Promise that resolves when both GAPI and GIS are loaded and ready.
const readyPromise = new Promise((resolve, reject) => {
  // Load GAPI script for Drive API
  const gapiScript = document.createElement('script');
  gapiScript.src = 'https://apis.google.com/js/api.js';
  gapiScript.async = true;
  gapiScript.defer = true;
  gapiScript.onload = () => gapi.load('client', async () => {
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
  return new Promise((resolve, reject) => {
    const callback = (resp) => {
        if (resp.error) {
            return reject(resp);
        }
        accessToken = resp.access_token;
        gapi.client.setToken({ access_token: accessToken });
        resolve();
    };
    
    // For a better user experience, we check if the user is already signed in
    // and has granted the necessary permissions. If so, we can get a token silently.
    // Otherwise, we prompt for consent.
    if (google.accounts.oauth2.hasGrantedAllScopes(tokenClient, SCOPES)) {
        // Request the token silently
        tokenClient.callback = callback;
        tokenClient.requestAccessToken({prompt: ''});
    } else {
        // Prompt the user to select an account and grant access
        tokenClient.callback = callback;
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }
  });
}

/**
 *  Signs the user out.
 */
export async function signOutGoogle() {
  await readyPromise;
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {
      accessToken = null;
      gapi.client.setToken(null);
    });
  }
}

/**
 *  Checks if the user is currently signed in.
 */
export async function isSignedIn() {
  await readyPromise;
  return accessToken !== null;
}

/**
 *  Uploads a file to Google Drive.
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

  try {
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
  } catch (err) {
    console.error('Drive API error:', err);
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
  
  // The new library doesn't provide a simple getBasicProfile() method.
  // To get profile info, you would need to add 'openid profile email' to SCOPES,
  // and then make a call to the People API (https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses,photos)
  // For now, we return a placeholder as the main goal is fixing the sync.
  return {
    name: 'Signed In',
    email: '(profile info not available in this version)',
    imageUrl: ''
  };
}

export async function pickAndDownloadFromDrive() {
  // TODO: Implement file picker and download logic
}
