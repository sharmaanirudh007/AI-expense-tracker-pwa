import './style.css'
import { addExpense, getAllExpenses, clearExpenses, updateExpense, deleteExpense, getExpenseById } from './db.js'
import { parseExpenseWithGemini, getAIInsight } from './gemini.js'
import { analyzeExpensesWithGemini, runSQLOnExpenses } from './analyze.js'
import alasql from 'alasql'
import { signInGoogle, isSignedIn, uploadToDrive, pickAndDownloadFromDrive, trySilentSignIn } from './googleDrive.js'
import { checkVersion } from './version.js'

// Helper to get YYYY-MM-DD from a Date object, respecting local timezone
function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const ICONS = {
  home: '<svg class="nav-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
  expenses: '<svg class="nav-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>',
  analyze: '<svg class="nav-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  summary: '<svg class="nav-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>',
  settings: '<svg class="nav-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
  eyeOpen: '<svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  eyeClosed: '<svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
};

const app = document.querySelector('#app')

function setActiveNav(selector) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(selector);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

function setupOnScreenLogger() {
  const logContainer = document.createElement('div');
  logContainer.id = 'on-screen-logger';
  logContainer.style = `
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    max-height: 150px;
    overflow-y: scroll;
    background: rgba(0,0,0,0.8);
    color: #0f0;
    font-family: monospace;
    font-size: 10px;
    padding: 5px;
    z-index: 9999;
    border-top: 1px solid #333;
  `;
  document.body.appendChild(logContainer);

  function log(type, args) {
    const message = Array.from(args).map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return '[Unserializable Object]';
        }
      }
      return String(arg);
    }).join(' ');

    const logEntry = document.createElement('pre');
    logEntry.style.color = type === 'error' ? '#ff8c8c' : '#0f0';
    logEntry.style.margin = '0';
    logEntry.style.whiteSpace = 'pre-wrap';
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] [${type.toUpperCase()}] ${message}`;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  console.log = function(...args) {
    originalConsoleLog.apply(console, args);
    log('log', args);
  };

  console.error = function(...args) {
    originalConsoleError.apply(console, args);
    log('error', args);
  };
}

function showNotification(message, type = 'success') { // type: 'success', 'error', or 'info'
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.className = `notification ${type}`;

  document.body.appendChild(notification);

  // Animate in
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(-50%) translateY(-10px)';
  }, 10);

  // Animate out and remove
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 4000); // 4 seconds
}

function getGeminiKey() {
  return localStorage.getItem('gemini_api_key') || ''
}

function setGeminiKey(key) {
  localStorage.setItem('gemini_api_key', key)
}

function showGeminiKeyPopup(force = false) {
  if (document.getElementById('gemini-popup')) return
  
  const isFirstTime = !localStorage.getItem('gemini_setup_seen');
  if (isFirstTime && !force) {
    localStorage.setItem('gemini_setup_seen', 'true');
  }
  
  const popup = document.createElement('div')
  popup.id = 'gemini-popup'
  popup.className = 'popup-overlay'
  
  const title = isFirstTime && !force ? '🚀 Welcome to AI Expense Tracker!' : '🔑 Gemini API Key Required';
  const subtitle = isFirstTime && !force 
    ? 'To get started with AI-powered expense tracking, you\'ll need a free Gemini API key.' 
    : 'To use AI features, please set up your Gemini API key.';
  
  popup.innerHTML = `
    <div class="popup-content">
      <div class="popup-header">
        <h2>${title}</h2>
        ${!force ? '<button id="close-popup-x" class="popup-close-btn">×</button>' : ''}
      </div>
      <p>${subtitle}</p>
      
      <div class="instruction-steps">
        <div class="step">
          <strong>Step 1:</strong> Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: var(--accent-color);">Google AI Studio</a>
        </div>
        <div class="step">
          <strong>Step 2:</strong> Sign in with your Google account
        </div>
        <div class="step">
          <strong>Step 3:</strong> Click "Create API Key" button
        </div>
        <div class="step">
          <strong>Step 4:</strong> Copy the generated API key
        </div>
        <div class="step">
          <strong>Step 5:</strong> Paste it below and click Save
        </div>
      </div>
      
      <input type="password" id="popup-gemini-key" placeholder="Paste your Gemini API Key here" />
      <div id="popup-error" class="popup-error"></div>
      
      <div class="popup-buttons">
        <button id="save-gemini-key">Save & Continue</button>
        <button id="open-instructions" class="btn-secondary">📖 Detailed Guide</button>
        ${!force ? '<button id="close-gemini-popup" class="btn-secondary">Skip for Now</button>' : ''}
      </div>
      
      <div class="popup-note">
        <small>💡 <strong>Note:</strong> Your API key is stored securely in your browser and never shared with anyone.</small>
      </div>
    </div>
  `
  document.body.appendChild(popup)
  
  document.getElementById('save-gemini-key').onclick = () => {
    const key = document.getElementById('popup-gemini-key').value
    if (!key) {
      document.getElementById('popup-error').textContent = '⚠️ Please enter your API key to continue.'
      return
    }
    setGeminiKey(key)
    document.body.removeChild(popup)
    showNotification('🎉 API key saved successfully! You can now use AI features.', 'success')
    renderForm()
  }
  
  document.getElementById('open-instructions').onclick = () => {
    showDetailedInstructions()
  }
  
  if (!force) {
    document.getElementById('close-gemini-popup').onclick = () => {
      document.body.removeChild(popup)
      showNotification('⚠️ AI features will be disabled until you add an API key.', 'info')
    }
    
    // Add event listener for the X button
    if (document.getElementById('close-popup-x')) {
      document.getElementById('close-popup-x').onclick = () => {
        document.body.removeChild(popup)
        showNotification('⚠️ AI features will be disabled until you add an API key.', 'info')
      }
    }
  }
}

function showDetailedInstructions() {
  const instructionsPopup = document.createElement('div')
  instructionsPopup.className = 'popup-overlay'
  instructionsPopup.innerHTML = `
    <div class="popup-content instruction-manual">
      <div class="popup-header">
        <h2>📚 Complete Setup Guide</h2>
        <button id="close-instructions-x" class="popup-close-btn">×</button>
      </div>
      
      <div class="instruction-section">
        <h3>🔑 Getting Your Gemini API Key</h3>
        <ol class="instruction-list">
          <li>Open <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: var(--accent-color);">Google AI Studio</a> in a new tab</li>
          <li>Sign in with your Google account (if not already signed in)</li>
          <li>You'll see the API Keys page</li>
          <li>Click the <strong>"Create API Key"</strong> button</li>
          <li>Choose <strong>"Create API key in new project"</strong> (recommended for beginners)</li>
          <li>Wait a moment for the key to be generated</li>
          <li>Click the <strong>copy icon</strong> next to your new API key</li>
          <li>Come back to this app and paste it in the API key field</li>
        </ol>
      </div>
      
      <div class="instruction-section">
        <h3>🚀 What You Can Do</h3>
        <ul class="feature-list">
          <li><strong>Smart Expense Entry:</strong> Just type naturally like "I spent 50 on groceries yesterday"</li>
          <li><strong>AI Analysis:</strong> Ask questions like "How much did I spend on food this month?"</li>
          <li><strong>Expense Insights:</strong> Get personalized insights about your spending patterns</li>
          <li><strong>Google Drive Sync:</strong> Backup and sync your data across devices</li>
        </ul>
      </div>
      
      <div class="instruction-section">
        <h3>📱 Install as Mobile App (PWA)</h3>
        <p>For the best experience, install this app on your device:</p>
        <div class="pwa-install-instructions">
          <div class="pwa-platform">
            <strong>📱 On Mobile (Android/iOS):</strong>
            <ol class="instruction-list">
              <li>Open this app in <strong>Chrome</strong> or <strong>Safari</strong></li>
              <li>Tap the <strong>menu button</strong> (three dots or share icon)</li>
              <li>Look for <strong>"Add to Home Screen"</strong> or <strong>"Install App"</strong></li>
              <li>Tap it and confirm the installation</li>
              <li>The app will appear on your home screen like a native app!</li>
            </ol>
          </div>
          <div class="pwa-platform">
            <strong>💻 On Desktop (Chrome/Edge):</strong>
            <ol class="instruction-list">
              <li>Look for the <strong>install icon</strong> in the address bar</li>
              <li>Or go to <strong>menu → "Install AI Expense Tracker"</strong></li>
              <li>Click install and the app will open in its own window</li>
              <li>You can also pin it to taskbar/dock for quick access</li>
            </ol>
          </div>
        </div>
        <div class="pwa-benefits">
          <p><strong>Benefits of installing:</strong></p>
          <ul class="tips-list">
            <li>Works offline after installation</li>
            <li>Opens faster (no browser overhead)</li>
            <li>Feels like a native mobile app</li>
            <li>No browser address bar or tabs</li>
            <li>Easy access from home screen/desktop</li>
          </ul>
        </div>
      </div>
      
      <div class="instruction-section">
        <h3>🔒 Privacy & Security</h3>
        <p>Your API key and expense data are stored locally in your browser. Nothing is sent to third-party servers except for Google's Gemini AI (for processing) and Google Drive (if you choose to sync).</p>
      </div>
      
      <div class="instruction-section">
        <h3>💡 Tips for Beginners</h3>
        <ul class="tips-list">
          <li>The Gemini API is free with generous limits for personal use</li>
          <li>You can skip the API key setup and add expenses manually if preferred</li>
          <li>Try asking the AI questions in natural language for best results</li>
          <li>Use Google Drive sync to backup your data safely</li>
        </ul>
      </div>
      
      <div class="popup-buttons">
        <button id="close-instructions" class="btn-secondary">Got it! Close Guide</button>
        <button id="back-to-setup">🔙 Back to Setup</button>
      </div>
    </div>
  `
  
  document.body.appendChild(instructionsPopup)
  
  document.getElementById('close-instructions').onclick = () => {
    document.body.removeChild(instructionsPopup)
  }
  
  document.getElementById('close-instructions-x').onclick = () => {
    document.body.removeChild(instructionsPopup)
  }
  
  document.getElementById('back-to-setup').onclick = () => {
    document.body.removeChild(instructionsPopup)
    // The original popup should still be there
  }
}

function showExpenseConfirmationPopup(expense, onConfirm) {
  if (document.getElementById('expense-confirm-popup')) return;
  const popup = document.createElement('div');
  popup.id = 'expense-confirm-popup';
  popup.className = 'popup-overlay';
  
  const formattedAmount = `₹${expense.amount.toFixed(2)}`;
  const formattedDate = new Date(expense.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

  popup.innerHTML = `
    <div class="popup-content" style="text-align: left;">
      <h2>Confirm Expense</h2>
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
        <div class="expense-category-icon">${getCategoryIcon(expense.category)}</div>
        <div>
            <p style="margin:0; font-size: 1.2rem; font-weight: 600;">${formattedAmount}</p>
            <p style="margin:0; color: var(--text-secondary-color);">${expense.description}</p>
        </div>
      </div>
      <p><strong>Category:</strong> ${expense.category}</p>
      <p><strong>Date:</strong> ${formattedDate}</p>
      <p><strong>Payment Mode:</strong> ${expense.paymentMode}</p>
      <div class="popup-buttons">
        <button id="cancel-add-expense" class="btn-secondary">Cancel</button>
        <button id="confirm-add-expense">Confirm</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(popup);

  document.getElementById('confirm-add-expense').onclick = () => {
    if(document.body.contains(popup)) document.body.removeChild(popup);
    onConfirm();
  };

  document.getElementById('cancel-add-expense').onclick = () => {
    if(document.body.contains(popup)) document.body.removeChild(popup);
  };
}

function renderNav() {
  app.innerHTML = `
    <header class="app-header">
      <h1>AI Expense Tracker</h1>
      <div class="header-actions">
        <div id="google-account-status"></div>
      </div>
    </header>
    <main id="page-content"></main>
    <nav class="main-nav">
      <button id="nav-home" class="nav-btn active">${ICONS.home} <span>Home</span></button>
      <button id="nav-expenses" class="nav-btn">${ICONS.expenses} <span>Expenses</span></button>
      <button id="nav-analyze" class="nav-btn">${ICONS.analyze} <span>Analyze</span></button>
      <button id="nav-summary" class="nav-btn">${ICONS.summary} <span>Summary</span></button>
      <button id="nav-settings" class="nav-btn">${ICONS.settings} <span>Settings</span></button>
    </nav>
  `
  document.getElementById('nav-home').onclick = () => { setActiveNav('#nav-home'); renderForm(); }
  document.getElementById('nav-expenses').onclick = () => { setActiveNav('#nav-expenses'); renderExpensesPage(); }
  document.getElementById('nav-analyze').onclick = () => { setActiveNav('#nav-analyze'); renderAnalyzePage(); }
  document.getElementById('nav-summary').onclick = () => { setActiveNav('#nav-summary'); renderSummaryPage(); }
  document.getElementById('nav-settings').onclick = () => { setActiveNav('#nav-settings'); renderSettingsPage(); }
  renderGoogleAccountStatus();
}

function renderForm() {
  document.getElementById('page-content').innerHTML = `
    <div id="smart-insight-container">
        <h2>Smart Insight</h2>
        <div id="smart-insight-card" class="card">
            <p>Loading your smart insight...</p>
        </div>
    </div>
    <form id="expense-form">
      <textarea id="description" placeholder="Type or paste your expense (e.g. I spent 200 on tea yesterday)" required></textarea>
      <button type="submit">Add Expense (AI)</button>
    </form>
    <div id="error-msg" class="error-message"></div>
    <div id="recent-expenses-container">
        <h2>Recent Activity</h2>
        <div id="recent-expenses-list"></div>
    </div>
  `
  document.getElementById('expense-form').onsubmit = async (e) => {
    e.preventDefault()
    const text = document.getElementById('description').value
    const submitBtn = e.target.querySelector('button[type="submit"]')
    const originalText = submitBtn.innerHTML
    
    const apiKey = getGeminiKey()
    if (!apiKey) {
      document.getElementById('error-msg').textContent = 'Gemini API key is required.'
      showGeminiKeyPopup(true)
      return
    }
    
    // Show loading state
    submitBtn.disabled = true
    submitBtn.innerHTML = '<span class="loader"></span> Processing...'
    document.getElementById('error-msg').textContent = ''
    
    try {
      const aiExpense = await parseExpenseWithGemini(text, apiKey)
      const expense = {
        description: aiExpense.description || text,
        amount: parseFloat(aiExpense.amount) || 0,
        category: aiExpense.category || 'other',
        date: aiExpense.date || getLocalDateString(),
        paymentMode: aiExpense.paymentMode || 'UPI',
        created_at: new Date().toISOString()
      }
      
      // Reset button state before showing confirmation
      submitBtn.disabled = false
      submitBtn.innerHTML = originalText
      
      showExpenseConfirmationPopup(expense, async () => {
        await addExpense(expense)
        e.target.reset()
        document.getElementById('error-msg').textContent = ''
        // Automatically sync after adding an expense
        triggerSync(false);
        showNotification('Expense added successfully!', 'success');
        // If user is on expenses page, refresh it
        if (document.querySelector('#expenses-list')) {
            renderExpenses();
        }
        // Refresh recent expenses on home page
        if (document.querySelector('#recent-expenses-list')) {
            renderRecentExpenses();
        }
        renderSmartInsight();
      });
    } catch (err) {
      // Reset button state on error
      submitBtn.disabled = false
      submitBtn.innerHTML = originalText
      document.getElementById('error-msg').textContent = err.message
    }
  }
  renderRecentExpenses();
  renderSmartInsight();
}

async function renderSmartInsight() {
    const insightCard = document.getElementById('smart-insight-card');
    if (!insightCard) return;

    const apiKey = getGeminiKey();
    if (!apiKey) {
        insightCard.innerHTML = '<p>Enter your Gemini API key in settings to get smart insights.</p>';
        return;
    }

    try {
        const expenses = await getAllExpenses();
        if (expenses.length < 3) { // Don't show for very few expenses
             insightCard.innerHTML = '<p>Add a few more expenses to unlock your first smart insight!</p>';
             return;
        }
        insightCard.innerHTML = '<p>✨ Generating your smart insight...</p>';
        const insight = await getAIInsight(expenses, apiKey);
        insightCard.innerHTML = `<p class="insight-text">${insight}</p>`;
    } catch (err) {
        console.error("Failed to get AI insight:", err);
        insightCard.innerHTML = '<p>Could not generate an insight at this time.</p>';
    }
}

function capitalizeWords(str) {
  if (!str) return '';
  return str.replace(/\b\w/g, char => char.toUpperCase());
}

async function renderRecentExpenses() {
    const list = document.getElementById('recent-expenses-list');
    if (!list) return;

    const expenses = await getAllExpenses();
    if (!expenses.length) {
        list.innerHTML = '<div class="card"><p>No recent activity to show.</p></div>';
        return;
    }

    expenses.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
    const recentExpenses = expenses.slice(0, 4);

    list.innerHTML = recentExpenses.map(e => `
        <div class="expense-item">
          <div class="expense-item-main">
            <div class="expense-category-icon">${getCategoryIcon(e.category)}</div>
            <div class="expense-details">
              <span class="expense-description">${capitalizeWords(e.description)}</span>
              <span class="expense-date">${new Date(e.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', timeZone: 'UTC' })}</span>
              <span class="expense-payment-mode">${e.paymentMode || 'UPI'}</span>
            </div>
          </div>
          <div class="expense-actions">
            <span class="expense-amount">₹${e.amount.toFixed(2)}</span>
            <div class="expense-buttons">
              <button class="btn-edit" onclick="editExpense(${e.id})">✏️</button>
              <button class="btn-delete" onclick="deleteExpenseConfirm(${e.id})">🗑️</button>
            </div>
          </div>
        </div>
      `).join('');
}

async function renderExpensesPage() {
  const allExpenses = await getAllExpenses();
  const categories = [...new Set(allExpenses.map(e => e.category))].sort();

  let categoryDropdownHTML = '';
  if (categories.length > 0) {
      categoryDropdownHTML = `
        <div class="dropdown-container">
            <button id="category-dropdown-btn" class="dropdown-btn">Categories</button>
            <div id="category-dropdown-content" class="dropdown-content">
                <div id="category-filters">
                    ${categories.map(c => `
                        <label class="category-filter-label">
                            <input type="checkbox" class="category-filter-checkbox" value="${c}" checked>
                            ${capitalizeWords(c)}
                        </label>
                    `).join('')}
                </div>
            </div>
        </div>
      `;
  }

  const viewDropdownHTML = `
    <div class="dropdown-container">
        <button id="view-dropdown-btn" class="dropdown-btn" data-view="list">View: List</button>
        <div id="view-dropdown-content" class="dropdown-content">
            <a href="#" class="view-option" data-view="list">List</a>
            <a href="#" class="view-option" data-view="category">Category</a>
        </div>
    </div>
  `;

  document.getElementById('page-content').innerHTML = `
    <h2>My Expenses</h2>
    <div class="expenses-controls">
        <div class="filter-controls">
            <button class="btn-filter active" data-filter="today">Today</button>
            <button class="btn-filter" data-filter="this-month">This Month</button>
            <button class="btn-filter" data-filter="specific-month">Month</button>
            <button class="btn-filter" data-filter="custom">Custom</button>
        </div>
        <div class="dropdown-controls">
            ${viewDropdownHTML}
            ${categoryDropdownHTML}
        </div>
    </div>
    <div id="specific-month-picker" class="specific-month-picker card" style="display: none;">
        <div class="month-year-inputs">
            <div class="input-group">
                <label for="month-select">Month</label>
                <select id="month-select">
                    <option value="0">January</option>
                    <option value="1">February</option>
                    <option value="2">March</option>
                    <option value="3">April</option>
                    <option value="4">May</option>
                    <option value="5">June</option>
                    <option value="6">July</option>
                    <option value="7">August</option>
                    <option value="8">September</option>
                    <option value="9">October</option>
                    <option value="10">November</option>
                    <option value="11">December</option>
                </select>
            </div>
            <div class="input-group">
                <label for="year-input">Year</label>
                <input type="number" id="year-input" placeholder="YYYY" />
            </div>
        </div>
        <button id="apply-month-filter">Apply</button>
        <p id="specific-month-error" class="error-message" style="display: none;"></p>
    </div>
    <div id="custom-date-range-container" class="custom-date-range card" style="display:none;">
        <div class="date-inputs-container">
            <div class="date-input-group">
                <label for="start-date">Start:</label>
                <input type="date" id="start-date">
            </div>
            <div class="date-input-group">
                <label for="end-date">End:</label>
                <input type="date" id="end-date">
            </div>
        </div>
        <button id="apply-custom-date">Apply</button>
        <p id="custom-date-error" class="error-message" style="display: none;"></p>
    </div>
    <div id="expenses-list"></div>
  `;

  // --- Event Listeners ---

  // Dropdown toggle logic
  function setupDropdown(btnId, contentId) {
      const btn = document.getElementById(btnId);
      const content = document.getElementById(contentId);
      if (!btn || !content) return;

      btn.onclick = (e) => {
          e.stopPropagation();
          // Close other dropdowns
          document.querySelectorAll('.dropdown-content.show').forEach(openDropdown => {
              if (openDropdown.id !== contentId) {
                  openDropdown.classList.remove('show');
              }
          });
          content.classList.toggle('show');
      };
  }

  setupDropdown('category-dropdown-btn', 'category-dropdown-content');
  setupDropdown('view-dropdown-btn', 'view-dropdown-content');

  // Close dropdowns when clicking outside
  window.onclick = (e) => {
      if (!e.target.matches('.dropdown-btn')) {
          document.querySelectorAll('.dropdown-content.show').forEach(openDropdown => {
              openDropdown.classList.remove('show');
          });
      }
  };

  // Date filter buttons
  document.querySelectorAll('.btn-filter').forEach(btn => {
    btn.onclick = (e) => {
        document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const filter = e.target.dataset.filter;
        const customPicker = document.getElementById('custom-date-range-container');
        const monthPicker = document.getElementById('specific-month-picker');

        customPicker.style.display = 'none';
        monthPicker.style.display = 'none';

        if (filter === 'custom') {
            customPicker.style.display = 'grid';
        } else if (filter === 'specific-month') {
            monthPicker.style.display = 'flex';
            const now = new Date();
            document.getElementById('month-select').value = now.getMonth();
            document.getElementById('year-input').value = now.getFullYear();
        } else {
            renderExpenses();
        }
    };
  });

  // View selection
  document.querySelectorAll('.view-option').forEach(option => {
    option.onclick = (e) => {
        e.preventDefault();
        const selectedView = e.target.dataset.view;
        const viewBtn = document.getElementById('view-dropdown-btn');
        viewBtn.dataset.view = selectedView;
        viewBtn.textContent = `View: ${capitalizeWords(selectedView)}`;
        document.getElementById('view-dropdown-content').classList.remove('show');
        renderExpenses();
    };
  });

  // Category checkbox changes
  if (categories.length > 0) {
    document.querySelectorAll('.category-filter-checkbox').forEach(checkbox => {
        checkbox.onchange = () => {
            renderExpenses();
        };
    });
  }

  // Specific month apply
  document.getElementById('apply-month-filter').onclick = () => {
    const year = document.getElementById('year-input').value;
    const errorEl = document.getElementById('specific-month-error');
    if (!year || !/^\d{4}$/.test(year)) {
        errorEl.textContent = 'Please enter a valid 4-digit year.';
        errorEl.style.display = 'block';
        return;
    }
    errorEl.style.display = 'none';
    renderExpenses();
  };

  // Custom date apply
  document.getElementById('apply-custom-date').onclick = () => {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const errorEl = document.getElementById('custom-date-error');

    if (!startDate || !endDate) {
        errorEl.textContent = 'Please select both start and end dates.';
        errorEl.style.display = 'block';
        return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
        errorEl.textContent = 'Start date cannot be after end date.';
        errorEl.style.display = 'block';
        return;
    }

    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays > 31) {
        errorEl.textContent = 'The date range cannot be more than 31 days.';
        errorEl.style.display = 'block';
        return;
    }
    
    errorEl.textContent = '';
    errorEl.style.display = 'none';
    renderExpenses();
  };

  // Initial render
  await renderExpenses();
}

async function triggerSync(interactive = false) {
    console.log(`triggerSync called, interactive: ${interactive}`);
    const driveMsg = document.getElementById('drive-msg');
    if(interactive && driveMsg) {
        driveMsg.textContent = 'Syncing to Google Drive...';
    }

    try {
        let signedIn = await isSignedIn();
        if (!signedIn && interactive) {
            await signInGoogle();
            renderGoogleAccountStatus();
            signedIn = await isSignedIn();
        }

        if (!signedIn) {
            if(interactive) {
                showNotification('Google Sign-In is required to sync.', 'error');
            } else {
                console.log("Skipping auto-sync, user not signed in.");
            }
            if(driveMsg) driveMsg.textContent = '';
            return;
        }

        const expenses = await getAllExpenses();
        if (!expenses || expenses.length === 0) {
            if(interactive && driveMsg) showNotification('No expenses to sync.', 'info');
            if(driveMsg) driveMsg.textContent = '';
            return;
        }

        const filename = 'expenses-backup.json';
        const fileContent = JSON.stringify(expenses, null, 2);

        const result = await uploadToDrive(filename, fileContent);
        if (result && result.id) {
            if(interactive) {
              showNotification('Backup uploaded to Google Drive!', 'success');
            } else {
              console.log("Automatic sync to Google Drive successful.");
              showNotification('Auto-synced to Google Drive.', 'info');
            }
        } else {
            const errorDetails = result ? JSON.stringify(result) : 'Unknown error';
            if(interactive) {
              showNotification('Google Drive sync failed: ' + errorDetails, 'error');
            } else {
              console.error("Automatic sync to Google Drive failed:", errorDetails);
            }
        }

    } catch (e) {
        console.error('Google Drive sync failed:', e);
        if(interactive && driveMsg) showNotification(`Google Drive sync failed: ${e.message}`, 'error');
    } finally {
        if(driveMsg) driveMsg.textContent = '';
        if(interactive) renderGoogleAccountStatus();
    }
}

function renderAnalyzePage() {
  document.getElementById('page-content').innerHTML = `
    <h2>🔍 Analyze Your Expenses</h2>
    <form id="analyze-form" class="analyze-form">
      <input type="text" id="analyze-query" placeholder="Ask a question (e.g., How much did I spend on tea yesterday?)" required />
      <button type="submit">Analyze</button>
    </form>
    <div id="analyze-results" class="analyze-results-container"></div>
  `
  document.getElementById('analyze-form').onsubmit = async (e) => {
    e.preventDefault()
    const query = document.getElementById('analyze-query').value
    const apiKey = getGeminiKey()
    if (!apiKey) {
      document.getElementById('analyze-results').innerHTML = '<span style="color:red;">Gemini API key is required.</span>'
      showGeminiKeyPopup(true)
      return
    }
    document.getElementById('analyze-results').textContent = 'Analyzing...'
    try {
      const { sql, expenses } = await analyzeExpensesWithGemini(query, apiKey)
      // Extra debug: log the SQL and the expenses data
      console.log('SQL sent to alasql:', sql)
      console.log('Expenses data for alasql:', expenses)
      const results = runSQLOnExpenses(sql, expenses)
      let displayResult = results
      if (Array.isArray(results)) {
        if (results.length === 0) {
          displayResult = 'No results found.'
        } else if (results.length === 1) {
          const val = results[0]
          if (val === undefined || val === null) {
            displayResult = 0
          } else if (typeof val === 'object' && val !== null) {
            // For aggregate queries like SUM(amount)
            const firstKey = Object.keys(val)[0]
            const aggVal = val[firstKey]
            displayResult = (aggVal === undefined || aggVal === null) ? 0 : aggVal
          } else {
            displayResult = val
          }
        }
      }
      // Dynamic styling based on query response
      let html = ''
      if (Array.isArray(displayResult)) {
        if (displayResult.length === 0) {
          html = '<div class="analyze-no-results">No results found.</div>'
        } else if (typeof displayResult[0] === 'object' && displayResult[0] !== null) {
          // Render as table for array of objects
          const keys = Object.keys(displayResult[0])
          html = `<table class="analyze-table"><thead><tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr></thead><tbody>`
          html += displayResult.map(row => `<tr>${keys.map(k => `<td>${row[k] ?? ''}</td>`).join('')}</tr>`).join('')
          html += '</tbody></table>'
        } else {
          html = `<div class="analyze-value">${displayResult}</div>`
        }
      } else {
        html = `<div class="analyze-value">${displayResult}</div>`
      }
      document.getElementById('analyze-results').innerHTML = `
        <div class="analyze-result-block">
          ${html}
          <div class='sql-query'>SQL: <code>${sql}</code></div>
        </div>
      `
    } catch (err) {
      document.getElementById('analyze-results').innerHTML = `<span style='color:red;'>${err.message}</span>`
    }
  }
}

async function renderSummaryPage() {
  document.getElementById('page-content').innerHTML = `
    <h2>Spending Summary</h2>
    <div class="tabs">
      <button class="tab-btn active" id="tab-daily">Daily</button>
      <button class="tab-btn" id="tab-monthly">This Month</button>
      <button class="tab-btn" id="tab-month">Month</button>
      <button class="tab-btn" id="tab-yearly">Yearly</button>
    </div>
    <div id="tab-content" class="tab-content"></div>
  `
  document.getElementById('tab-daily').onclick = (e) => { 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderSummaryTab('daily');
  }
  document.getElementById('tab-monthly').onclick = (e) => { 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderSummaryTab('monthly');
  }
  document.getElementById('tab-month').onclick = (e) => { 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderSummaryTab('month');
  }
  document.getElementById('tab-yearly').onclick = (e) => { 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderSummaryTab('yearly');
  }
  renderSummaryTab('daily');
}

async function renderSummaryTab(type) {
  const content = document.getElementById('tab-content');
  content.innerHTML = `
    <div class="sub-tabs">
        <button class="sub-tab-btn active" data-view="charts">Charts</button>
        <button class="sub-tab-btn" data-view="details">Details</button>
    </div>

    ${type === 'month' ? `
    <div class="month-picker card">
        <div class="month-year-inputs">
            <div class="input-group">
                <label for="summary-month-select">Month</label>
                <select id="summary-month-select">
                    <option value="0">January</option>
                    <option value="1">February</option>
                    <option value="2">March</option>
                    <option value="3">April</option>
                    <option value="4">May</option>
                    <option value="5">June</option>
                    <option value="6">July</option>
                    <option value="7">August</option>
                    <option value="8">September</option>
                    <option value="9">October</option>
                    <option value="10">November</option>
                    <option value="11">December</option>
                </select>
            </div>
            <div class="input-group">
                <label for="summary-year-input">Year</label>
                <input type="number" id="summary-year-input" placeholder="YYYY" />
            </div>
        </div>
        <button id="apply-summary-month">Apply</button>
    </div>
    ` : ''}

    <div id="charts-view" class="sub-tab-content active">
        <div class="summary-section card">
            <h3 id="bar-chart-title"></h3>
            <div class="summary-chart-container">
                <canvas id="summary-bar-chart"></canvas>
            </div>
        </div>
        <div class="summary-section card">
            <h3 id="pie-chart-title"></h3>
            <div class="summary-chart-container">
                <canvas id="summary-pie-chart"></canvas>
            </div>
        </div>
    </div>

    <div id="details-view" class="sub-tab-content">
        <div class="summary-section card">
            <h3 id="total-spending-title"></h3>
            <p id="total-spending-amount" class="summary-total">₹0.00</p>
        </div>
        <div class="summary-section card">
            <h3 id="category-table-title"></h3>
            <div id="category-summary-table"></div>
        </div>
    </div>
  `;

  // Add event listeners for sub-tabs
  document.querySelectorAll('.sub-tab-btn').forEach(btn => {
      btn.onclick = (e) => {
          document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          const view = e.target.dataset.view;
          document.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
          document.getElementById(`${view}-view`).classList.add('active');
      }
  });

  // Add event listener for month picker apply button
  if (type === 'month') {
    document.getElementById('apply-summary-month').onclick = () => {
      const month = document.getElementById('summary-month-select').value;
      const year = document.getElementById('summary-year-input').value;
      if (year && month !== null) {
        renderSummaryTab('month');
      }
    };
  }

  const allExpenses = await getAllExpenses();
  if (allExpenses.length === 0) {
      content.innerHTML = '<div class="card"><p>No summary to display. Add some expenses first!</p></div>';
      return;
  }

  let barChartLabels = [];
  let barChartData = [];
  let periodExpenses = []; // Expenses for the pie chart, total, and table
  const today = new Date();
  let periodString = '';
  const currentYear = today.getFullYear();

  if (type === 'daily') {
    periodString = `Today`;
    const todayString = getLocalDateString(today);
    periodExpenses = allExpenses.filter(e => e.date === todayString);

    // Bar chart: show all days of the current month
    const currentMonth = today.getMonth(); // 0-indexed
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    const monthShortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    document.getElementById('bar-chart-title').textContent = `Daily Spending for ${monthShortNames[currentMonth]} ${currentYear}`;

    const labels = [];
    for (let i = 1; i <= daysInMonth; i++) {
        labels.push(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
    }
    barChartLabels = labels.map(d => d.split('-')[2]); // Just show day number

    const expensesThisMonth = allExpenses.filter(e => e.date.startsWith(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`));
    const dailyGroups = groupBy(expensesThisMonth, e => e.date);

    barChartData = labels.map(label => {
        const dayExpenses = dailyGroups[label] || [];
        return dayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    });

  } else if (type === 'monthly') {
    periodString = `This Month`;
    const thisMonthString = today.toISOString().slice(0, 7);
    periodExpenses = allExpenses.filter(e => e.date.startsWith(thisMonthString));

    // Bar chart: show all months of the current year
    document.getElementById('bar-chart-title').textContent = `Monthly Spending for ${currentYear}`;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    barChartLabels = monthNames;

    const labels = [];
    for (let i = 1; i <= 12; i++) {
        labels.push(`${currentYear}-${String(i).padStart(2, '0')}`);
    }

    const expensesThisYear = allExpenses.filter(e => e.date.startsWith(currentYear.toString()));
    const monthlyGroups = groupBy(expensesThisYear, e => e.date.slice(0, 7));

    barChartData = labels.map(label => {
        const monthExpenses = monthlyGroups[label] || [];
        return monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    });

  } else if (type === 'month') {
    // Month picker functionality
    const now = new Date();
    let selectedMonth = now.getMonth();
    let selectedYear = now.getFullYear();
    
    // Check if month/year inputs exist and have values
    const monthSelect = document.getElementById('summary-month-select');
    const yearInput = document.getElementById('summary-year-input');
    
    if (monthSelect && yearInput && yearInput.value) {
      selectedMonth = parseInt(monthSelect.value);
      selectedYear = parseInt(yearInput.value);
    } else {
      // Set default values for new render
      setTimeout(() => {
        if (document.getElementById('summary-month-select')) {
          document.getElementById('summary-month-select').value = selectedMonth;
        }
        if (document.getElementById('summary-year-input')) {
          document.getElementById('summary-year-input').value = selectedYear;
        }
      }, 0);
    }
    
    const monthString = String(selectedMonth + 1).padStart(2, '0');
    const yearMonth = `${selectedYear}-${monthString}`;
    periodExpenses = allExpenses.filter(e => e.date.startsWith(yearMonth));
    periodString = `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][selectedMonth]} ${selectedYear}`;

    // Bar chart: show all days of the selected month
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    document.getElementById('bar-chart-title').textContent = `Daily Spending for ${periodString}`;

    const labels = [];
    for (let i = 1; i <= daysInMonth; i++) {
        labels.push(`${selectedYear}-${monthString}-${String(i).padStart(2, '0')}`);
    }
    barChartLabels = labels.map(d => d.split('-')[2]); // Just show day number

    const dailyGroups = groupBy(periodExpenses, e => e.date);
    barChartData = labels.map(label => {
        const dayExpenses = dailyGroups[label] || [];
        return dayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    });

  } else if (type === 'yearly') {
    periodString = `This Year`;
    const thisYearString = today.getFullYear().toString();
    periodExpenses = allExpenses.filter(e => e.date.startsWith(thisYearString));
    
    // Hide bar chart for yearly view
    const barChartSection = document.getElementById('summary-bar-chart')?.parentElement.parentElement;
    if (barChartSection) {
        barChartSection.style.display = 'none';
    }
  }

  // --- Populate Details View ---
  document.getElementById('total-spending-title').textContent = `Total Spending ${periodString}`;
  document.getElementById('category-table-title').textContent = `Category Breakdown for ${periodString}`;
  const totalSpending = periodExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  document.getElementById('total-spending-amount').textContent = `₹${totalSpending.toFixed(2)}`;

  if (periodExpenses.length > 0) {
    const categoryGroups = groupBy(periodExpenses, e => e.category);
    const categoryLabels = Object.keys(categoryGroups).sort();
    const categoryData = categoryLabels.map(label =>
      categoryGroups[label].reduce((sum, e) => sum + (e.amount || 0), 0)
    );

    const tableContainer = document.getElementById('category-summary-table');
    let tableHTML = '<table class="analyze-table"><thead><tr><th>Category</th><th>Total</th></tr></thead><tbody>';
    categoryLabels.forEach((label, i) => {
        tableHTML += `<tr><td>${capitalizeWords(label)}</td><td>₹${categoryData[i].toFixed(2)}</td></tr>`;
    });
    tableHTML += '</tbody></table>';
    tableContainer.innerHTML = tableHTML;
  } else {
      document.getElementById('category-summary-table').innerHTML = `<p>No expenses recorded for this period.</p>`;
  }

  // --- Populate Charts View ---
  if (type !== 'yearly') {
    await renderBarChart('summary-bar-chart', barChartLabels, barChartData, `Total Spending`);
  }
  
  document.getElementById('pie-chart-title').textContent = `Category Breakdown for ${periodString}`;

  if (periodExpenses.length > 0) {
    const categoryGroups = groupBy(periodExpenses, e => e.category);
    const pieChartLabels = Object.keys(categoryGroups).sort();
    const pieChartData = pieChartLabels.map(label =>
      categoryGroups[label].reduce((sum, e) => sum + (e.amount || 0), 0)
    );
    await renderPieChart('summary-pie-chart', pieChartLabels, pieChartData, 'Spending by Category');
  } else {
      document.getElementById('summary-pie-chart').parentElement.innerHTML = `<p>No expenses recorded for this period.</p>`;
  }
}

function groupBy(arr, fn) {
  return arr.reduce((acc, x) => {
    const k = fn(x)
    acc[k] = acc[k] || []
    acc[k].push(x)
    return acc
  }, {})
}

// Keep track of chart instances
if (!window._charts) {
    window._charts = {};
}

function renderBarChart(canvasId, labels, data, chartLabel) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  if (window._charts[canvasId]) {
    window._charts[canvasId].destroy();
  }

  // Create a gradient for the bars using theme colors
  const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  gradient.addColorStop(0, 'rgba(46, 125, 50, 0.8)'); // var(--accent-color) with opacity
  gradient.addColorStop(1, 'rgba(46, 125, 50, 0.4)'); // var(--accent-color) with lower opacity

  // The datalabels plugin is now globally registered via the script tag
  window._charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: chartLabel,
        data,
        backgroundColor: gradient,
        borderColor: 'rgba(46, 125, 50, 1)', // var(--accent-color)
        borderWidth: 1,
        hoverBackgroundColor: 'rgba(46, 125, 50, 1)' // var(--accent-color)
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {
            display: false // Explicitly disable for this chart
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(224, 224, 224, 0.1)' // --text-color with alpha
          },
          ticks: {
            color: '#a0a0a0' // --text-secondary-color
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#a0a0a0' // --text-secondary-color
          }
        }
      }
    }
  });
}

function renderPieChart(canvasId, labels, data, chartLabel) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  if (window._charts[canvasId]) {
    window._charts[canvasId].destroy();
  }

  const total = data.reduce((acc, val) => acc + val, 0);
  
  // A curated color palette that fits the dark theme - updated for better theme alignment
  const themeColors = [
    '#2E7D32', // Primary accent green
    '#388E3C', // Lighter green
    '#43A047', // Even lighter green
    '#66BB6A', // Light green
    '#81C784', // Very light green
    '#1B5E20', // Dark green
    '#4CAF50', // Material green
    '#8BC34A', // Light green variant
    '#689F38'  // Olive green
  ];

  const backgroundColors = labels.map((_, i) => themeColors[i % themeColors.length]);

  // The datalabels plugin is now globally registered via the script tag
  window._charts[canvasId] = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        label: chartLabel,
        data,
        backgroundColor: backgroundColors,
        borderColor: '#1E1E1E', // var(--primary-color)
        borderWidth: 1, // 1 point border as requested
        hoverOffset: 15
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: 30 // Add padding to make space for labels
      },
      plugins: {
        legend: {
          display: false
        },
        datalabels: {
          formatter: (value, ctx) => {
            if (total === 0) return '0%';
            const percentage = ((value / total) * 100).toFixed(0) + '%';
            return percentage;
          },
          color: '#fff',
          font: {
            family: 'Lexend, sans-serif',
            size: 14,
            weight: 'bold'
          },
          anchor: 'end',
          align: 'start',
          offset: 15,
          clamp: true,
          // Connector lines
          connector: {
            display: true,
            color: '#fff',
            width: 2,
            length: 10,
            type: 'line'
          },
          // Label background
          backgroundColor: (ctx) => ctx.dataset.backgroundColor[ctx.dataIndex],
          borderColor: '#fff',
          borderWidth: 2,
          borderRadius: 8, // Edgy curves
          padding: 6
        }
      }
    }
  });
}

function getCategoryIcon(category) {
    const cat = category.toLowerCase();
    const iconClass = 'category-svg-icon';

    if (cat.includes('food') || cat.includes('restaurant')) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${iconClass}"><polyline points="16 2 16 8 22 8"></polyline><path d="M4 2v20"></path><path d="M6 12H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2z"></path></svg>`;
    }
    if (cat.includes('transport') || cat.includes('taxi') || cat.includes('cab') || cat.includes('flight')) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${iconClass}"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`;
    }
    if (cat.includes('shopping') || cat.includes('apparel')) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${iconClass}"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`;
    }
    if (cat.includes('bills') || cat.includes('utilities') || cat.includes('rent')) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${iconClass}"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    }
    if (cat.includes('entertainment') || cat.includes('movie')) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${iconClass}"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`;
    }
    if (cat.includes('groceries')) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${iconClass}"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>`;
    }
    if (cat.includes('health') || cat.includes('pharmacy') || cat.includes('doctor')) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${iconClass}"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
    }
    // Default icon
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${iconClass}"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`;
}

async function renderExpenses() {
  const list = document.getElementById('expenses-list');
  if (!list) return;

  const activeFilter = document.querySelector('.btn-filter.active')?.dataset.filter || 'today';
  const activeView = document.getElementById('view-dropdown-btn')?.dataset.view || 'list';

  const allExpenses = await getAllExpenses();
  let filteredExpenses = [];

  const today = new Date();
  // Set time to 0 to compare dates correctly
  today.setHours(0, 0, 0, 0);

  if (activeFilter === 'today') {
    const todayDateString = getLocalDateString(today);
    filteredExpenses = allExpenses.filter(e => e.date === todayDateString);
  } else if (activeFilter === 'this-month') {
    const currentMonth = today.toISOString().slice(0, 7); // YYYY-MM
    filteredExpenses = allExpenses.filter(e => e.date.startsWith(currentMonth));
  } else if (activeFilter === 'specific-month') {
    const month = document.getElementById('month-select').value;
    const year = document.getElementById('year-input').value;
    if (year && month) {
        const monthString = String(parseInt(month, 10) + 1).padStart(2, '0');
        const yearMonth = `${year}-${monthString}`;
        filteredExpenses = allExpenses.filter(e => e.date.startsWith(yearMonth));
    } else {
        filteredExpenses = [];
    }
  } else if (activeFilter === 'custom') {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    if (startDate && endDate) {
        filteredExpenses = allExpenses.filter(e => e.date >= startDate && e.date <= endDate);
    } else {
        filteredExpenses = [];
    }
  } else {
      // Default to today if filter is unknown
      const todayDateString = today.toISOString().slice(0, 10);
      filteredExpenses = allExpenses.filter(e => e.date === todayDateString);
  }

  // Filter by category
  const categoryFilters = document.getElementById('category-filters');
  if (categoryFilters) {
      const selectedCategories = [...document.querySelectorAll('.category-filter-checkbox:checked')].map(cb => cb.value);
      if (document.querySelectorAll('.category-filter-checkbox').length > 0) {
          filteredExpenses = filteredExpenses.filter(e => selectedCategories.includes(e.category));
      }
  }

  if (!filteredExpenses.length) {
    list.innerHTML = '<div class="card"><p>No expenses found for the selected filters.</p></div>';
    return;
  }

  // Sort by date descending
  filteredExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (activeView === 'list') {
    list.innerHTML = filteredExpenses.map(e => `
      <div class="expense-item">
        <div class="expense-item-main">
          <div class="expense-category-icon">${getCategoryIcon(e.category)}</div>
          <div class="expense-details">
            <span class="expense-description">${capitalizeWords(e.description)}</span>
            <span class="expense-date">${new Date(e.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', timeZone: 'UTC' })}</span>
            <span class="expense-payment-mode">${e.paymentMode || 'UPI'}</span>
          </div>
        </div>
        <div class="expense-actions">
          <span class="expense-amount">₹${e.amount.toFixed(2)}</span>
          <div class="expense-buttons">
            <button class="btn-edit" onclick="editExpense(${e.id})">✏️</button>
            <button class="btn-delete" onclick="deleteExpenseConfirm(${e.id})">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  } else if (activeView === 'category') {
    const expensesByCategory = groupBy(filteredExpenses, e => e.category);
    let html = '';
    // Sort categories alphabetically for consistent order
    const sortedCategories = Object.keys(expensesByCategory).sort();

    for (const category of sortedCategories) {
        html += `
            <div class="category-group card">
                <h3 class="category-title">${capitalizeWords(category)}</h3>
                <div class="category-expense-list">
                ${expensesByCategory[category].map(e => `
                    <div class="expense-item">
                      <div class="expense-item-main">
                         <div class="expense-category-icon">${getCategoryIcon(e.category)}</div>
                         <div class="expense-details">
                           <span class="expense-description">${capitalizeWords(e.description)}</span>
                           <span class="expense-date">${new Date(e.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', timeZone: 'UTC' })}</span>
                           <span class="expense-payment-mode">${e.paymentMode || 'UPI'}</span>
                         </div>
                       </div>
                       <div class="expense-actions">
                         <span class="expense-amount">₹${e.amount.toFixed(2)}</span>
                         <div class="expense-buttons">
                           <button class="btn-edit" onclick="editExpense(${e.id})">✏️</button>
                           <button class="btn-delete" onclick="deleteExpenseConfirm(${e.id})">🗑️</button>
                         </div>
                       </div>
                    </div>
                `).join('')}
                </div>
            </div>
        `;
    }
    list.innerHTML = html || '<div class="card"><p>No expenses found for the selected filter.</p></div>';
  }
}

async function renderGoogleAccountStatus() {
  const statusDiv = document.getElementById('google-account-status')
  if (!statusDiv) return;
  statusDiv.innerHTML = ''
  try {
    const { isSignedIn } = await import('./googleDrive.js')
    const signedIn = await isSignedIn()
    if (signedIn) {
      const { getGoogleUserProfile, signOutGoogle } = await import('./googleDrive.js')
      const profile = await getGoogleUserProfile()
      const profileImageHtml = profile.imageUrl 
        ? `<img src="${profile.imageUrl}" alt="Profile" onerror="this.style.display='none'">`
        : `<div style="width: 36px; height: 36px; border-radius: 50%; background-color: var(--secondary-color); display: flex; align-items: center; justify-content: center; font-weight: bold; color: var(--background-color);">${(profile.name || 'U').charAt(0).toUpperCase()}</div>`;
      
      statusDiv.innerHTML = `
        <div class="profile-info">
            ${profileImageHtml}
        </div>
        <button id="google-signout-btn" class="btn-secondary">Sign out</button>
      `
      document.getElementById('google-signout-btn').onclick = async () => {
        const signedOut = await signOutGoogle()
        if (signedOut) {
          renderGoogleAccountStatus(); // Re-render to show signed-out state
        }
      }
    } else {
      statusDiv.innerHTML = '<button id="google-signin-btn">Sign in with Google</button>'
      document.getElementById('google-signin-btn').onclick = async () => {
        await signInGoogle();
        renderGoogleAccountStatus();
      }
    }
  } catch (e) {
    statusDiv.innerHTML = '<span style="color:red;">Account status error</span>'
    console.error(e);
  }
}

function renderSettingsPage() {
    document.getElementById('page-content').innerHTML = `
        <h2>Settings</h2>
        <div class="settings-container">
            <div class="setting-item card">
                <h3>Gemini API Key</h3>
                <p>Your API key is stored securely in your browser's local storage.</p>
                <div class="key-input-container">
                    <input type="password" id="gemini-key-input" value="${getGeminiKey()}">
                    <button id="toggle-key-visibility" class="toggle-visibility-btn" title="Show API Key">${ICONS.eyeOpen}</button>
                </div>
                <div class="gemini-key-buttons">
                    <button id="save-gemini-key">Save Key</button>
                    <button id="clear-gemini-key" class="btn-secondary">Clear Key</button>
                </div>
            </div>
            <div class="setting-item card">
                <h3>Google Drive Sync</h3>
                <p>Backup and restore your expenses with Google Drive.</p>
                <div class="drive-buttons">
                    <button id="sync-drive">Sync to Drive</button>
                    <button id="load-drive">Load from Drive</button>
                </div>
                <div id="drive-msg" class="drive-message"></div>
            </div>
            <div class="setting-item card">
                <h3>📚 Help & Setup Guide</h3>
                <p>Get help with setup, learn about features, and view detailed instructions.</p>
                <div class="help-buttons">
                    <button id="setup-gemini-help">🔑 Gemini API Setup</button>
                    <button id="detailed-help">📖 Full Guide & Tips</button>
                </div>
            </div>
             <div class="setting-item card">
                <h3>Danger Zone</h3>
                <p>Clear all locally stored expense data.</p>
                <button id="clear-data-btn" class="btn-danger">Clear All Expenses</button>
            </div>
        </div>
    `;

    document.getElementById('save-gemini-key').onclick = () => {
        const key = document.getElementById('gemini-key-input').value;
        setGeminiKey(key);
        showNotification('Gemini API Key saved!', 'success');
    };

    document.getElementById('clear-gemini-key').onclick = () => {
        if (confirm('Are you sure you want to clear your Gemini API key? You will lose access to AI features until you add it again.')) {
            setGeminiKey('');
            document.getElementById('gemini-key-input').value = '';
            showNotification('Gemini API Key cleared!', 'info');
        }
    };

    document.getElementById('toggle-key-visibility').onclick = () => {
        const keyInput = document.getElementById('gemini-key-input');
        const toggleBtn = document.getElementById('toggle-key-visibility');
        
        if (keyInput.type === 'password') {
            keyInput.type = 'text';
            toggleBtn.innerHTML = ICONS.eyeClosed;
            toggleBtn.title = 'Hide API Key';
        } else {
            keyInput.type = 'password';
            toggleBtn.innerHTML = ICONS.eyeOpen;
            toggleBtn.title = 'Show API Key';
        }
    };

    document.getElementById('setup-gemini-help').onclick = () => {
        showGeminiKeyPopup(false);
    };

    document.getElementById('detailed-help').onclick = () => {
        showDetailedInstructions();
    };

    document.getElementById('sync-drive').onclick = () => triggerSync(true);
    document.getElementById('load-drive').onclick = async () => {
        const driveMsg = document.getElementById('drive-msg');
        driveMsg.textContent = ''; // Clear any previous messages

        try {
          let signedIn = await isSignedIn();
          if (!signedIn) {
            showNotification('Please sign in to Google to load from Drive.', 'info');
            await signInGoogle();
            renderGoogleAccountStatus();
          }
          signedIn = await isSignedIn();
          if (!signedIn) {
            showNotification('Google Sign-In is required to load from Drive.', 'error');
            return;
          }

          showNotification('Opening Google Drive file picker...', 'info');
          const fileContent = await pickAndDownloadFromDrive();

          if (fileContent === null) {
            showNotification('File selection cancelled.', 'info');
            return;
          }

          showNotification('Restoring expenses from backup...', 'info');

          const expenses = JSON.parse(fileContent);
          if (!Array.isArray(expenses)) {
            throw new Error("Invalid backup file format.");
          }

          await clearExpenses();
          for (const expense of expenses) {
            const { id, ...expenseToSave } = expense;
            await addExpense(expenseToSave);
          }
          
          showNotification('Expenses successfully restored from Google Drive!', 'success');

        } catch (e) {
          console.error('Google Drive load failed:', e);
          showNotification(`Google Drive load failed: ${e.message}`, 'error');
        }
    };
    
    document.getElementById('clear-data-btn').onclick = async () => {
        if (confirm('Are you sure you want to delete all your local expense data? This cannot be undone.')) {
            await clearExpenses();
            showNotification('All local expenses have been cleared.', 'success');
        }
    };
}


// On load, call renderNav() and renderForm() for Home as default
async function main() {
  // setupOnScreenLogger();
  renderNav();
  await renderForm();

  console.log("Attempting silent sign-in on page load...");
  try {
    await trySilentSignIn();
    console.log("Silent sign-in check complete.");
    // After attempting silent sign-in, update the google account status display
    renderGoogleAccountStatus();
  } catch (error) {
    console.error("Error during silent sign-in:", error);
    // The UI will show the default "Sign In" button, which is the correct fallback.
  }
  
  // Check if this is the user's first time using the app
  const isFirstTime = !localStorage.getItem('app_visited');
  if (isFirstTime) {
    localStorage.setItem('app_visited', 'true');
    // For first time users, show the setup popup even if they might have skipped it
    if (!getGeminiKey()) {
      setTimeout(() => showGeminiKeyPopup(false), 1000); // Small delay for better UX
    }
  } else {
    // For returning users, only show if Gemini key is missing
    if (!getGeminiKey()) showGeminiKeyPopup(false);
  }
  
  // Check version and handle updates
  const versionInfo = checkVersion();
  if (versionInfo.isNewVersion) {
    console.log('App has been updated to version:', versionInfo.currentVersion);
  }
  
  // Enhanced service worker registration with update detection
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered successfully:', registration);
      
      // Check for updates every 30 seconds when app is active
      setInterval(() => {
        registration.update();
      }, 30000);
      
      // Listen for new service worker installing
      registration.addEventListener('updatefound', () => {
        newWorker = registration.installing;
        console.log('New service worker found!');
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // New update available
              showUpdateAvailableNotification();
            }
          }
        });
      });
      
    } catch (error) {
      console.log('Service Worker registration failed:', error);
    }
    
    // Listen for controlled page reloads
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
  
  // Handle PWA install prompt
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    // Show install button/notification
    showInstallPrompt();
  });
  
  // Function to show install prompt
  function showInstallPrompt() {
    // Only show if user hasn't dismissed it before
    if (localStorage.getItem('pwa_install_dismissed') === 'true') return;
    
    setTimeout(() => {
      showNotification('💡 Install this app for a better experience! Look for "Add to Home Screen" in your browser menu.', 'info');
    }, 5000); // Show after 5 seconds
  }
  
  // Check for updates when app becomes visible (user returns to app)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(registration => {
        if (registration) {
          registration.update();
        }
      });
    }
  });
}

// PWA Update Management
let newWorker;
let refreshing = false;

// Function to show update notification
function showUpdateAvailableNotification() {
  if (document.getElementById('update-modal')) return; // Prevent duplicate modals
  
  const updateModal = document.createElement('div');
  updateModal.id = 'update-modal';
  updateModal.className = 'update-modal';
  updateModal.innerHTML = `
    <div class="update-content">
      <div class="update-header">
        <h3>🚀 Update Available</h3>
      </div>
      <div class="update-body">
        <p>A new version of AI Expense Tracker is available with improvements and bug fixes.</p>
        <div class="update-actions">
          <button id="apply-update-btn" class="btn-primary">Update Now</button>
          <button id="dismiss-update-btn" class="btn-secondary">Later</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(updateModal);
  
  document.getElementById('apply-update-btn').onclick = applyUpdate;
  document.getElementById('dismiss-update-btn').onclick = dismissUpdate;
}

// Function to apply update
function applyUpdate() {
  if (newWorker) {
    newWorker.postMessage({ type: 'SKIP_WAITING' });
  }
  dismissUpdate();
}

// Function to dismiss update notification
function dismissUpdate() {
  const updateModal = document.getElementById('update-modal');
  if (updateModal) {
    updateModal.remove();
  }
}

main();
