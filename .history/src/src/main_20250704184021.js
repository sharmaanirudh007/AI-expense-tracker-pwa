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

// Edit and Delete Functions
window.editExpense = async function(id) {
  const expense = await getExpenseById(id);
  if (!expense) {
    showNotification('Expense not found', 'error');
    return;
  }
  
  showEditExpensePopup(expense);
};

window.deleteExpenseConfirm = async function(id) {
  const expense = await getExpenseById(id);
  if (!expense) {
    showNotification('Expense not found', 'error');
    return;
  }
  
  showDeleteConfirmationPopup(expense, id);
};

function showEditExpensePopup(expense) {
  if (document.getElementById('edit-expense-popup')) return;
  
  const popup = document.createElement('div');
  popup.id = 'edit-expense-popup';
  popup.className = 'popup-overlay';
  
  const formattedDate = expense.date.split('T')[0]; // Extract YYYY-MM-DD
  
  popup.innerHTML = `
    <div class="popup-content">
      <div class="popup-header">
        <h2>Edit Expense</h2>
        <button id="close-edit-popup" class="close-btn">&times;</button>
      </div>
      <form id="edit-expense-form">
        <div class="form-group">
          <label for="edit-description">Description</label>
          <input type="text" id="edit-description" value="${expense.description}" required>
        </div>
        <div class="form-group">
          <label for="edit-amount">Amount (₹)</label>
          <input type="number" id="edit-amount" step="0.01" value="${expense.amount}" required>
        </div>
        <div class="form-group">
          <label for="edit-category">Category</label>
          <select id="edit-category" required>
            <option value="Food" ${expense.category === 'Food' ? 'selected' : ''}>Food</option>
            <option value="Transport" ${expense.category === 'Transport' ? 'selected' : ''}>Transport</option>
            <option value="Shopping" ${expense.category === 'Shopping' ? 'selected' : ''}>Shopping</option>
            <option value="Utilities" ${expense.category === 'Utilities' ? 'selected' : ''}>Utilities</option>
            <option value="Entertainment" ${expense.category === 'Entertainment' ? 'selected' : ''}>Entertainment</option>
            <option value="Health" ${expense.category === 'Health' ? 'selected' : ''}>Health</option>
            <option value="Education" ${expense.category === 'Education' ? 'selected' : ''}>Education</option>
            <option value="Other" ${expense.category === 'Other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="form-group">
          <label for="edit-payment-mode">Payment Mode</label>
          <select id="edit-payment-mode" required>
            <option value="UPI" ${(expense.paymentMode || 'UPI') === 'UPI' ? 'selected' : ''}>UPI</option>
            <option value="Credit Card" ${expense.paymentMode === 'Credit Card' ? 'selected' : ''}>Credit Card</option>
            <option value="Debit Card" ${expense.paymentMode === 'Debit Card' ? 'selected' : ''}>Debit Card</option>
            <option value="Cash" ${expense.paymentMode === 'Cash' ? 'selected' : ''}>Cash</option>
          </select>
        </div>
        <div class="form-group">
          <label for="edit-date">Date</label>
          <input type="date" id="edit-date" value="${formattedDate}" required>
        </div>
        <div class="popup-buttons">
          <button type="button" id="cancel-edit-expense" class="btn-secondary">Cancel</button>
          <button type="submit" class="btn-primary">Save Changes</button>
        </div>
      </form>
    </div>
  `;
  
  document.body.appendChild(popup);
  
  // Event listeners
  document.getElementById('close-edit-popup').onclick = () => {
    document.body.removeChild(popup);
  };
  
  document.getElementById('cancel-edit-expense').onclick = () => {
    document.body.removeChild(popup);
  };
  
  document.getElementById('edit-expense-form').onsubmit = async (e) => {
    e.preventDefault();
    
    const updatedExpense = {
      ...expense,
      description: document.getElementById('edit-description').value,
      amount: parseFloat(document.getElementById('edit-amount').value),
      category: document.getElementById('edit-category').value,
      paymentMode: document.getElementById('edit-payment-mode').value,
      date: document.getElementById('edit-date').value,
      updated_at: new Date().toISOString()
    };
    
    try {
      await updateExpense(expense.id, updatedExpense);
      document.body.removeChild(popup);
      showNotification('Expense updated successfully!', 'success');
      
      // Refresh the current view
      if (document.querySelector('#expenses-list')) {
        renderExpenses();
      }
      if (document.querySelector('#recent-expenses')) {
        renderRecentExpenses();
      }
      
      // Trigger sync
      triggerSync(false);
    } catch (error) {
      showNotification('Failed to update expense', 'error');
      console.error('Error updating expense:', error);
    }
  };
}

function showDeleteConfirmationPopup(expense, id) {
  if (document.getElementById('delete-expense-popup')) return;
  
  const popup = document.createElement('div');
  popup.id = 'delete-expense-popup';
  popup.className = 'popup-overlay';
  
  popup.innerHTML = `
    <div class="popup-content">
      <div class="popup-header">
        <h2>Delete Expense</h2>
      </div>
      <div class="popup-body">
        <p>Are you sure you want to delete this expense?</p>
        <div class="expense-preview">
          <div class="expense-category-icon">${getCategoryIcon(expense.category)}</div>
          <div>
            <strong>${capitalizeWords(expense.description)}</strong>
            <div>₹${expense.amount.toFixed(2)} • ${expense.paymentMode || 'UPI'}</div>
            <div class="expense-date">${new Date(expense.date).toLocaleDateString()}</div>
          </div>
        </div>
        <p class="warning-text">This action cannot be undone.</p>
      </div>
      <div class="popup-buttons">
        <button id="cancel-delete-expense" class="btn-secondary">Cancel</button>
        <button id="confirm-delete-expense" class="btn-danger">Delete</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(popup);
  
  document.getElementById('cancel-delete-expense').onclick = () => {
    document.body.removeChild(popup);
  };
  
  document.getElementById('confirm-delete-expense').onclick = async () => {
    try {
      await deleteExpense(id);
      document.body.removeChild(popup);
      showNotification('Expense deleted successfully!', 'success');
      
      // Refresh the current view
      if (document.querySelector('#expenses-list')) {
        renderExpenses();
      }
      if (document.querySelector('#recent-expenses')) {
        renderRecentExpenses();
      }
      
      // Trigger sync
      triggerSync(false);
    } catch (error) {
      showNotification('Failed to delete expense', 'error');
      console.error('Error deleting expense:', error);
    }
  };
}
