# AI Expense Tracker PWA

A privacy-first, offline-capable, AI-powered expense tracker Progressive Web App (PWA).

- **Works 100% offline** (PWA, IndexedDB)
- **AI-powered**: Natural language expense entry & analysis (Gemini API)
- **Google Drive sync**: Backup/restore your data (no central backend)
- **Modern UI**: Clean, responsive, and installable on desktop/mobile

---

## 🚀 Quick Start (Local/Offline Usage)

1. **Download & Unzip**
   - Download the latest release ZIP from [GitHub Releases](https://github.com/YOUR_GITHUB_USERNAME/ai-expense-tracker-pwa/releases).
   - Unzip it anywhere on your computer.

2. **Run a Local Static Server**
   - For full PWA/offline features, you must serve the files with a local server (not open `index.html` directly).
   - **Recommended:**
     - If you have Node.js: `npx serve` in the unzipped folder
     - Or use Python: `python3 -m http.server 8080`
   - Open `http://localhost:8080` in your browser.

3. **Install as PWA**
   - Click the install button in your browser (or use the browser menu) to add the app to your desktop or mobile home screen.

---

## 🔑 Google Drive & Gemini API Setup

- **Google Drive Sync**: Sign in with your Google account in the app to enable backup/restore. No data is sent to any server except your own Google Drive.
- **Gemini AI**: Enter your Gemini API key in the app to enable natural language expense entry and analysis. Your key is stored locally.

---

## 🛠️ For Developers

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Run locally (dev mode)**
   ```bash
   npm run dev
   ```
3. **Build for production**
   ```bash
   npm run build
   ```
   The output will be in the `dist/` folder.

---

## 📦 Creating a Downloadable Build (for Release)

1. **Build the app**
   ```bash
   npm run build
   ```
2. **Zip the `dist/` folder**
   ```bash
   cd dist
   zip -r ../ai-expense-tracker-pwa.zip .
   ```
3. **Upload the ZIP to GitHub Releases**

---

## 📝 Notes

- This app is fully client-side. No central server is used.
- All data is stored locally (IndexedDB) and optionally synced to your Google Drive.
- For troubleshooting Google Drive sign-in, ensure third-party cookies are enabled and popups are not blocked.

---

## 📄 License

MIT
