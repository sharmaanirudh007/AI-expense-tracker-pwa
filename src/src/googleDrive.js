// src/googleDrive.js
// Google Drive integration for backup/restore

const CLIENT_ID = '275003294216-pkbjvhu8fbam86n9bqjsrv3k7l3kvo4l.apps.googleusercontent.com';
const API_KEY = 'AIzaSyC1FGc_1gVjcn0REZklWyQmcC8q8v_Iz8k';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

export function loadGoogleApi() {
  return new Promise((resolve, reject) => {
    if (window.gapi) return resolve(window.gapi)
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.onload = () => {
      window.gapi.load('client:auth2', async () => {
        await window.gapi.client.init({
          apiKey: API_KEY,
          clientId: CLIENT_ID,
          discoveryDocs: [DISCOVERY_DOC],
          scope: SCOPES
        })
        resolve(window.gapi)
      })
    }
    script.onerror = reject
    document.body.appendChild(script)
  })
}

export async function signInGoogle() {
  const gapi = await loadGoogleApi()
  await gapi.auth2.getAuthInstance().signIn()
}

export async function signOutGoogle() {
  const gapi = await loadGoogleApi()
  await gapi.auth2.getAuthInstance().signOut()
}

export async function isSignedIn() {
  const gapi = await loadGoogleApi()
  return gapi.auth2.getAuthInstance().isSignedIn.get()
}

export async function uploadToDrive(filename, content) {
  const gapi = await loadGoogleApi();
  console.log('gapi object:', gapi)
  if (!gapi.client.drive) {
    console.log('Drive API not loaded, loading now...')
    await gapi.client.load('drive', 'v3')
    console.log('Drive API loaded:', !!gapi.client.drive)
  }
  const fileMetadata = {
    name: filename,
    mimeType: 'application/json'
  };
  const media = {
    mimeType: 'application/json',
    body: content
  };
  try {
    const response = await gapi.client.drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id'
    });
    console.log('Drive API response:', response)
    return response.result;
  } catch (err) {
    console.error('Drive API error:', err)
    throw err;
  }
}

export async function pickAndDownloadFromDrive() {
  // TODO: Implement file picker and download logic
}

export async function getGoogleUserProfile() {
  const gapi = await loadGoogleApi()
  const auth = gapi.auth2.getAuthInstance()
  if (auth && auth.isSignedIn.get()) {
    const user = auth.currentUser.get()
    const profile = user.getBasicProfile()
    return {
      name: profile.getName(),
      email: profile.getEmail(),
      imageUrl: profile.getImageUrl()
    }
  }
  return null
}
