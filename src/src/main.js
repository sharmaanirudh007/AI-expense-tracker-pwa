import './style.css'
import { addExpense, getAllExpenses, clearExpenses } from './db.js'
import { parseExpenseWithGemini, getAIInsight } from './gemini.js'
import { analyzeExpensesWithGemini, runSQLOnExpenses } from './analyze.js'
import alasql from 'alasql'
import { signInGoogle, isSignedIn, uploadToDrive, pickAndDownloadFromDrive, trySilentSignIn } from './googleDrive.js'

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
  settings: '<svg class="nav-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>'
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
  const popup = document.createElement('div')
  popup.id = 'gemini-popup'
  popup.className = 'popup-overlay'
  popup.innerHTML = `
    <div class="popup-content">
      <h2>Enter Gemini API Key</h2>
      <input type="password" id="popup-gemini-key" placeholder="Gemini API Key" />
      <div id="popup-error" class="popup-error"></div>
      <div class="popup-buttons">
        <button id="save-gemini-key">Save</button>
        <button id="close-gemini-popup" class="btn-secondary">${force ? 'Close (disabled)' : 'Close'}</button>
      </div>
    </div>
  `
  document.body.appendChild(popup)
  document.getElementById('save-gemini-key').onclick = () => {
    const key = document.getElementById('popup-gemini-key').value
    if (!key) {
      document.getElementById('popup-error').textContent = 'API key required.'
      return
    }
    setGeminiKey(key)
    document.body.removeChild(popup)
    renderForm()
  }
  document.getElementById('close-gemini-popup').onclick = () => {
    if (force) return
    document.body.removeChild(popup)
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
      <div id="google-account-status"></div>
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
    const apiKey = getGeminiKey()
    if (!apiKey) {
      document.getElementById('error-msg').textContent = 'Gemini API key is required.'
      showGeminiKeyPopup(true)
      return
    }
    try {
      const aiExpense = await parseExpenseWithGemini(text, apiKey)
      const expense = {
        description: aiExpense.description || text,
        amount: parseFloat(aiExpense.amount) || 0,
        category: aiExpense.category || 'other',
        date: aiExpense.date || getLocalDateString(),
        created_at: new Date().toISOString()
      }
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
            </div>
          </div>
          <span class="expense-amount">₹${e.amount.toFixed(2)}</span>
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
    <h2>📊 Spending Summary</h2>
    <div class="tabs">
      <button class="tab-btn" id="tab-daily">📅 Daily</button>
      <button class="tab-btn" id="tab-monthly">📆 Monthly</button>
      <button class="tab-btn" id="tab-yearly">📈 Yearly</button>
    </div>
    <div id="tab-content" class="tab-content"></div>
  `
  document.getElementById('tab-daily').onclick = () => renderSummaryTab('daily')
  document.getElementById('tab-monthly').onclick = () => renderSummaryTab('monthly')
  document.getElementById('tab-yearly').onclick = () => renderSummaryTab('yearly')
  renderSummaryTab('daily')
}

async function renderSummaryTab(type) {
  const content = document.getElementById('tab-content')
  content.innerHTML = `<div id="summary-chart" class="summary-chart"></div><div id="summary-table"></div>`
  const expenses = await getAllExpenses()
  let groups = {}
  if (type === 'daily') {
    groups = groupBy(expenses, e => e.date)
  } else if (type === 'monthly') {
    groups = groupBy(expenses, e => e.date.slice(0,7))
  } else if (type === 'yearly') {
    groups = groupBy(expenses, e => e.date.slice(0,4))
  }
  // Prepare data for chart and table
  const labels = Object.keys(groups)
  const data = labels.map(label => groups[label].reduce((sum, e) => sum + (e.amount || 0), 0))
  // Render chart
  renderChart(labels, data, type)
  // Render table by category
  let table = `<table class="analyze-table"><thead><tr><th>${type.charAt(0).toUpperCase()+type.slice(1)}</th><th>Total</th></tr></thead><tbody>`
  labels.forEach((label, i) => {
    table += `<tr><td>${label}</td><td>₹${data[i].toFixed(2)}</td></tr>`
  })
  table += '</tbody></table>'
  document.getElementById('summary-table').innerHTML = table
}

function groupBy(arr, fn) {
  return arr.reduce((acc, x) => {
    const k = fn(x)
    acc[k] = acc[k] || []
    acc[k].push(x)
    return acc
  }, {})
}

function renderChart(labels, data, type) {
  // Use Chart.js from CDN if not already loaded
  if (!window.Chart) {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js'
    script.onload = () => renderChart(labels, data, type)
    document.body.appendChild(script)
    return
  }
  const ctxId = 'chart-canvas'
  let canvas = document.getElementById(ctxId)
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.id = ctxId
    document.getElementById('summary-chart').appendChild(canvas)
  }
  if (window._chart) window._chart.destroy()
  window._chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: `Spending (${type})`,
        data,
        backgroundColor: '#4caf50',
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  })
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
          </div>
        </div>
        <span class="expense-amount">₹${e.amount.toFixed(2)}</span>
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
                         </div>
                       </div>
                       <span class="expense-amount">₹${e.amount.toFixed(2)}</span>
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
      statusDiv.innerHTML = `
        <div class="profile-info">
            <img src="${profile.imageUrl}" alt="Profile">
        </div>
        <button id="google-signout-btn" class="btn-secondary">Sign out</button>
      `
      document.getElementById('google-signout-btn').onclick = async () => {
        await signOutGoogle()
        renderGoogleAccountStatus(); // Re-render to show signed-out state
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
                <input type="password" id="gemini-key-input" value="${getGeminiKey()}">
                <button id="save-gemini-key">Save Key</button>
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
}

main();

if (!getGeminiKey()) showGeminiKeyPopup(false)
