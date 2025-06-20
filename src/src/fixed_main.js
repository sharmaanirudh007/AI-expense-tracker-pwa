import './style.css'
import { addExpense, getAllExpenses, getExpense, deleteExpense as dbDeleteExpense, updateExpense } from './db.js'
import { parseExpenseWithGemini } from './gemini.js'
import { analyzeExpensesWithGemini, runSQLOnExpenses } from './analyze.js'
import alasql from 'alasql'
import { signInGoogle, isSignedIn, uploadToDrive, pickAndDownloadFromDrive } from './googleDrive.js'

const app = document.querySelector('#app')

function getGeminiKey() {
  return localStorage.getItem('gemini_key')
}

function setGeminiKey(key) {
  localStorage.setItem('gemini_key', key)
}

function showNotification(message) {
  const notification = document.createElement('div')
  notification.className = 'notification'
  notification.textContent = message
  document.body.appendChild(notification)
  setTimeout(() => {
    notification.classList.add('show')
  }, 10)
  setTimeout(() => {
    notification.classList.remove('show')
    setTimeout(() => notification.remove(), 300)
  }, 3000)
}

function renderNav() {
  app.innerHTML = `
    <header>
      <div class="logo">
        <span>💰 AI Expense Tracker</span>
      </div>
      <button id="hamburger-btn" class="menu-button">☰</button>
      <div id="hamburger-dropdown" style="display:none;position:absolute;right:1rem;top:3.5rem;background:#232526;padding:1rem;border-radius:8px;z-index:1000;box-shadow:0 4px 8px rgba(0,0,0,0.2);">
        <div id="google-account-status"></div>
        <button id="sync-drive" style="display:block;width:100%;margin-bottom:0.5rem;text-align:left;">📤 Save to Drive</button>
        <button id="load-drive" style="display:block;width:100%;margin-bottom:0.5rem;text-align:left;">📥 Load from Drive</button>
        <button id="gemini-key-btn" style="display:block;width:100%;text-align:left;">🔑 Gemini API Key</button>
      </div>
    </header>
    <nav>
      <button id="nav-home">🏠 Home</button>
      <button id="nav-expenses">💸 Expenses</button>
      <button id="nav-analyze">🔍 Analyze</button>
      <button id="nav-summary">📊 Summary</button>
    </nav>
    <main>
      <div id="page-content" class="page-content"></div>
    </main>
  `
  document.getElementById('nav-home').onclick = () => renderForm()
  document.getElementById('nav-expenses').onclick = () => renderExpensesPage()
  document.getElementById('nav-analyze').onclick = () => renderAnalyzePage()
  document.getElementById('nav-summary').onclick = () => renderSummaryPage()
  // Hamburger menu logic
  const hamburgerBtn = document.getElementById('hamburger-btn')
  const dropdown = document.getElementById('hamburger-dropdown')
  hamburgerBtn.onclick = (e) => {
    e.stopPropagation()
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block'
    renderGoogleAccountStatus()
    // Attach Drive button handlers
    document.getElementById('sync-drive').onclick = handleDriveSync
    document.getElementById('load-drive').onclick = handleDriveLoad
    // Gemini key button
    const geminiKey = getGeminiKey()
    const geminiBtn = document.getElementById('gemini-key-btn')
    geminiBtn.textContent = geminiKey ? 'Show Gemini Key' : 'Add Gemini Key'
    geminiBtn.onclick = () => showGeminiKeyPopup(false)
  }
  document.body.onclick = () => {
    dropdown.style.display = 'none'
  }
}

function renderGoogleAccountStatus() {
  const statusDiv = document.getElementById('google-account-status')
  isSignedIn().then(signedIn => {
    if (signedIn) {
      statusDiv.innerHTML = `
        <div style="margin-bottom:0.5rem;color:#4caf50;">✓ Signed in to Google</div>
      `
    } else {
      statusDiv.innerHTML = `
        <button id="google-signin-btn" style="display:block;width:100%;margin-bottom:0.5rem;text-align:left;">🔑 Sign in to Google</button>
      `
      document.getElementById('google-signin-btn').onclick = signInGoogle
    }
  })
}

async function handleDriveSync() {
  try {
    const expenses = await getAllExpenses()
    if (!expenses.length) {
      showNotification('No expenses to sync')
      return
    }
    const signedIn = await isSignedIn()
    if (!signedIn) {
      await signInGoogle()
    }
    await uploadToDrive(expenses)
    showNotification('Expenses saved to Google Drive!')
  } catch (err) {
    showNotification('Error: ' + err.message)
  }
}

async function handleDriveLoad() {
  try {
    const signedIn = await isSignedIn()
    if (!signedIn) {
      await signInGoogle()
    }
    const expenses = await pickAndDownloadFromDrive()
    if (expenses && expenses.length) {
      // Add all expenses to local DB
      for (const expense of expenses) {
        await addExpense(expense)
      }
      showNotification(`Loaded ${expenses.length} expenses!`)
      renderTodayExpenses()
    }
  } catch (err) {
    showNotification('Error: ' + err.message)
  }
}

function renderForm() {
  document.getElementById('page-content').innerHTML = `
    <h1 class="app-title"><span class="highlight">AI</span> Expense Tracker</h1>
    <div id="today-expenses-block"></div>
    <form id="expense-form" class="modern-form">
      <div class="input-group">
        <label for="description">Enter your expense</label>
        <div class="input-container">
          <textarea 
            id="description" 
            class="modern-input modern-textarea" 
            placeholder="Type or paste your expense (e.g. I spent 200 on tea yesterday)" 
            required
          ></textarea>
          <button type="button" id="clear-description" class="clear-button">
            <i class="fas fa-times-circle"></i>
          </button>
        </div>
        <div class="input-hint">Use natural language to describe your expense</div>
      </div>
      <button type="submit" class="modern-button">
        <i class="fas fa-plus-circle"></i> Add Expense with AI
      </button>
    </form>
    <div id="review-expense-modal" style="display:none;"></div>
    <div id="error-msg" class="error-message"></div>
  `
  renderTodayExpenses()
  document.getElementById('clear-description').onclick = () => {
    document.getElementById('description').value = ''
    document.getElementById('description').focus()
  }
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
        amount: parseFloat(aiExpense.amount),
        category: aiExpense.category,
        description: aiExpense.description || text,
        date: aiExpense.date || new Date().toISOString().slice(0, 10)
      }
      showReviewExpenseModal(expense)
    } catch (err) {
      document.getElementById('error-msg').textContent = 'Error: ' + err.message
    }
  }
}

function showReviewExpenseModal(expense) {
  const modal = document.getElementById('review-expense-modal')
  modal.style.display = 'block'
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-container theme-modal">
        <h3 class="modal-title">Review Expense</h3>
        <div class="review-expense-content">
          <div class="review-expense-amount">₹${expense.amount.toFixed(2)}</div>
          <div class="review-expense-details">
            <div class="review-detail-item">
              <span class="detail-label">Category</span>
              <span class="detail-value">${expense.category}</span>
            </div>
            <div class="review-detail-item">
              <span class="detail-label">Date</span>
              <span class="detail-value">${expense.date}</span>
            </div>
            <div class="review-detail-item">
              <span class="detail-label">Description</span>
              <span class="detail-value">${expense.description || 'No description'}</span>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button id="confirm-expense-btn" class="action-button confirm-button">
            <i class="fas fa-check"></i> Confirm
          </button>
          <button id="delete-expense-btn" class="action-button delete-button">
            <i class="fas fa-times"></i> Delete
          </button>
        </div>
      </div>
    </div>
  `
  document.getElementById('confirm-expense-btn').onclick = async () => {
    await addExpense(expense)
    modal.style.display = 'none'
    renderTodayExpenses()
    showNotification('Expense added!')
    document.getElementById('expense-form').reset()
  }
  document.getElementById('delete-expense-btn').onclick = () => {
    modal.style.display = 'none'
  }
}

function showGeminiKeyPopup(isRequired = false) {
  const currentKey = getGeminiKey()
  const modal = document.createElement('div')
  modal.innerHTML = `
    <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;">
      <div style="background:#232526;padding:2rem;border-radius:8px;min-width:300px;max-width:90vw;box-shadow:0 4px 24px rgba(0,0,0,0.18);color:#fff;">
        <h3 style="margin-top:0;">${isRequired ? 'Gemini API Key Required' : 'Gemini API Key'}</h3>
        <p>This app uses Gemini AI by Google to analyze expenses. You need your own API key.</p>
        <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
          <input type="password" id="gemini-key-input" value="${currentKey || ''}" placeholder="Enter your Gemini API key" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid #444;background:#333;color:#fff;">
          <button id="toggle-key-visibility" style="background:none;border:none;color:#aaa;cursor:pointer;">👁️</button>
        </div>
        <div style="display:flex;gap:1em;justify-content:flex-end;">
          <button id="save-key-btn" style="background:#4caf50;color:#fff;padding:0.5em 1.5em;border:none;border-radius:4px;">Save</button>
          ${!isRequired ? `<button id="cancel-key-btn" style="background:#666;color:#fff;padding:0.5em 1.5em;border:none;border-radius:4px;">Cancel</button>` : ''}
        </div>
        <div style="margin-top:1rem;font-size:0.8em;">
          <a href="https://ai.google.dev/tutorials/setup" target="_blank" style="color:#4caf50;">Get your API key from Google AI Studio</a>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(modal)
  
  const keyInput = document.getElementById('gemini-key-input')
  const toggleBtn = document.getElementById('toggle-key-visibility')
  const saveBtn = document.getElementById('save-key-btn')
  const cancelBtn = document.getElementById('cancel-key-btn')
  
  toggleBtn.onclick = () => {
    if (keyInput.type === 'password') {
      keyInput.type = 'text'
      toggleBtn.textContent = '🙈'
    } else {
      keyInput.type = 'password'
      toggleBtn.textContent = '👁️'
    }
  }
  
  saveBtn.onclick = () => {
    const key = keyInput.value.trim()
    if (key) {
      setGeminiKey(key)
      document.body.removeChild(modal)
      showNotification('API key saved!')
      if (isRequired) {
        document.getElementById('error-msg').textContent = ''
      }
    }
  }
  
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      document.body.removeChild(modal)
    }
  }
}

function renderTodayExpenses() {
  const block = document.getElementById('today-expenses-block')
  const today = new Date().toISOString().slice(0,10)
  getAllExpenses().then(expenses => {
    const todays = expenses.filter(e => e.date === today)
    if (!todays.length) {
      block.innerHTML = `
        <div class="no-expenses-message">
          <span>✨ No expenses added for today yet!</span>
          <p>Start tracking your spending by adding your first expense for today. Stay on top of your finances! 🚀</p>
        </div>
      `
      return
    }
    block.innerHTML = `<h3 class="section-title">Today's Expenses</h3><div class="expense-deck scrollable-expense-list"></div>`
    const list = block.querySelector('.expense-deck')
    
    // Reverse the array to show newest expenses on top
    todays.reverse().forEach((e, index) => {
      const card = document.createElement('div')
      card.className = 'card-in-deck metallic theme-card'
      card.style.zIndex = 100 - index
      card.style.transform = `translateY(${index * 10}px) rotate(${index % 2 === 0 ? -1 : 1}deg)`
      card.style.animationDelay = `${index * 0.1}s`
      
      const formattedTime = new Date(e.date).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      card.innerHTML = `
        <div class="expense-row">
          <div class="expense-deck-amount">₹${e.amount.toFixed(2)}</div>
          <div class="expense-deck-details">
            <span class="expense-deck-category">${e.category}</span>
            <span class="expense-deck-desc">${e.description || 'No description'}</span>
            <span class="expense-deck-time">${formattedTime}</span>
          </div>
        </div>
      `
      list.appendChild(card)
    })
  })
}

function renderExpensesPage() {
  document.getElementById('page-content').innerHTML = `
    <h2><span class="expense-icon">💸</span> Expenses</h2>
    
    <div class="time-filter-tabs">
      <button class="time-filter-tab active" data-period="daily">Daily</button>
      <button class="time-filter-tab" data-period="monthly">Monthly</button>
      <button class="time-filter-tab" data-period="yearly">Yearly</button>
    </div>
    
    <div class="date-selector">
      <button id="prev-date" class="date-nav-button">
        <i class="fas fa-chevron-left"></i>
      </button>
      <div id="current-date-display" class="current-date"></div>
      <button id="next-date" class="date-nav-button">
        <i class="fas fa-chevron-right"></i>
      </button>
    </div>
    
    <div id="expenses-list" class="expenses-container"></div>
    
    <div id="expenses-summary" class="expenses-summary"></div>
  `
  
  // Set up the time period filter tabs
  const tabs = document.querySelectorAll('.time-filter-tab')
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      updateExpensesView()
    })
  })
  
  // Set up date navigation
  document.getElementById('prev-date').addEventListener('click', () => {
    navigateDate('prev')
  })
  
  document.getElementById('next-date').addEventListener('click', () => {
    navigateDate('next')
  })
  
  // Initial render
  updateExpensesView()
}

// Global variables to track current date view
let currentViewDate = new Date()
let currentPeriod = 'daily'

function updateExpensesView() {
  // Get the currently selected period
  currentPeriod = document.querySelector('.time-filter-tab.active').dataset.period
  
  // Update the date display
  updateDateDisplay()
  
  // Fetch and display expenses
  renderFilteredExpenses()
}

function updateDateDisplay() {
  const display = document.getElementById('current-date-display')
  
  switch(currentPeriod) {
    case 'daily':
      display.textContent = currentViewDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
      break
    case 'monthly':
      display.textContent = currentViewDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long'
      })
      break
    case 'yearly':
      display.textContent = currentViewDate.getFullYear().toString()
      break
  }
}

function navigateDate(direction) {
  switch(currentPeriod) {
    case 'daily':
      if (direction === 'prev') {
        currentViewDate.setDate(currentViewDate.getDate() - 1)
      } else {
        currentViewDate.setDate(currentViewDate.getDate() + 1)
      }
      break
    case 'monthly':
      if (direction === 'prev') {
        currentViewDate.setMonth(currentViewDate.getMonth() - 1)
      } else {
        currentViewDate.setMonth(currentViewDate.getMonth() + 1)
      }
      break
    case 'yearly':
      if (direction === 'prev') {
        currentViewDate.setFullYear(currentViewDate.getFullYear() - 1)
      } else {
        currentViewDate.setFullYear(currentViewDate.getFullYear() + 1)
      }
      break
  }
  
  updateExpensesView()
}

async function renderFilteredExpenses() {
  const expenses = await getAllExpenses()
  const filteredExpenses = filterExpensesByPeriod(expenses, currentPeriod, currentViewDate)
  
  // Display the filtered expenses
  const listElement = document.getElementById('expenses-list')
  
  if (filteredExpenses.length === 0) {
    listElement.innerHTML = `
      <div class="no-expenses-message">
        <span>No expenses found for this period</span>
        <p>Try selecting a different date or time period.</p>
      </div>
    `
    document.getElementById('expenses-summary').innerHTML = ''
    return
  }
  
  if (currentPeriod === 'yearly') {
    renderYearlySummary(filteredExpenses)
  } else {
    renderExpensesList(filteredExpenses, listElement)
    renderPeriodSummary(filteredExpenses)
  }
}

function filterExpensesByPeriod(expenses, period, date) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()
  
  return expenses.filter(expense => {
    const expenseDate = new Date(expense.date)
    const expenseYear = expenseDate.getFullYear()
    const expenseMonth = expenseDate.getMonth()
    const expenseDay = expenseDate.getDate()
    
    switch(period) {
      case 'daily':
        return expenseYear === year && expenseMonth === month && expenseDay === day
      case 'monthly':
        return expenseYear === year && expenseMonth === month
      case 'yearly':
        return expenseYear === year
      default:
        return true
    }
  })
}

function renderExpensesList(expenses, container) {
  // Sort expenses by date (newest first)
  const sortedExpenses = [...expenses].sort((a, b) => 
    new Date(b.date + 'T' + (b.time || '00:00')) - new Date(a.date + 'T' + (a.time || '00:00'))
  )
  
  // Group expenses by date for daily/monthly views
  const groupedByDate = {}
  
  sortedExpenses.forEach(expense => {
    if (!groupedByDate[expense.date]) {
      groupedByDate[expense.date] = []
    }
    groupedByDate[expense.date].push(expense)
  })
  
  let html = '<div class="expense-cards expense-cards-list">'
  
  // Create date groups
  Object.entries(groupedByDate).forEach(([date, dateExpenses], groupIndex) => {
    const formattedGroupDate = new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    
    html += `
      <div class="expense-date-divider" style="animation-delay: ${groupIndex * 0.15}s;">
        <span>${formattedGroupDate}</span>
      </div>
    `
    
    dateExpenses.forEach((expense, index) => {
      const formattedDate = new Date(expense.date).toLocaleDateString('en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: '2-digit'
      })
      
      const animationDelay = (groupIndex * dateExpenses.length + index) * 0.08
      
      html += `
        <div class="expense-card" style="animation-delay: ${animationDelay}s;" data-id="${expense.id}" onclick="showExpenseDetails(this)">
          <div class="expense-amount">₹${expense.amount.toFixed(2)}</div>
          <div class="expense-date"><i class="fas fa-calendar-alt"></i> ${formattedDate}</div>
          <div class="expense-category">${expense.category}</div>
          <div class="expense-desc">${expense.description || 'No description'}</div>
          <div class="expense-card-action">
            <span class="view-more">Tap for details</span>
          </div>
        </div>
      `
    })
  })
  
  html += '</div>'
  container.innerHTML = html
}

function renderPeriodSummary(expenses) {
  const summaryContainer = document.getElementById('expenses-summary')
  
  // Calculate total
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  
  // Group by category
  const categories = {}
  expenses.forEach(expense => {
    if (!categories[expense.category]) {
      categories[expense.category] = 0
    }
    categories[expense.category] += expense.amount
  })
  
  // Sort categories by amount
  const sortedCategories = Object.entries(categories)
    .sort(([, amountA], [, amountB]) => amountB - amountA)
  
  let html = `
    <div class="period-summary">
      <h3>Summary - ${currentPeriod === 'daily' ? 'Daily' : 'Monthly'}</h3>
      <div class="total-amount">₹${total.toFixed(2)}</div>
      <div class="category-breakdown">
  `
  
  sortedCategories.forEach(([category, amount]) => {
    const percentage = Math.round((amount / total) * 100)
    
    html += `
      <div class="category-item">
        <div class="category-header">
          <span class="category-name">${category}</span>
          <span class="category-amount">₹${amount.toFixed(2)}</span>
        </div>
        <div class="category-bar-container">
          <div class="category-bar" style="width: ${percentage}%"></div>
          <span class="category-percentage">${percentage}%</span>
        </div>
      </div>
    `
  })
  
  html += `
      </div>
    </div>
  `
  
  summaryContainer.innerHTML = html
}

function renderYearlySummary(expenses) {
  const listContainer = document.getElementById('expenses-list')
  const summaryContainer = document.getElementById('expenses-summary')
  
  // Group expenses by month
  const months = Array(12).fill(0).map((_, i) => {
    return {
      month: i,
      name: new Date(0, i).toLocaleString('default', { month: 'long' }),
      amount: 0
    }
  })
  
  // Group by category
  const categories = {}
  
  expenses.forEach(expense => {
    const expenseDate = new Date(expense.date)
    const monthIndex = expenseDate.getMonth()
    
    // Add to month total
    months[monthIndex].amount += expense.amount
    
    // Add to category
    if (!categories[expense.category]) {
      categories[expense.category] = 0
    }
    categories[expense.category] += expense.amount
  })
  
  // Sort categories by amount
  const sortedCategories = Object.entries(categories)
    .sort(([, amountA], [, amountB]) => amountB - amountA)
  
  // Calculate total
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  
  // Create monthly chart
  let monthsHtml = `
    <div class="yearly-chart">
      <h3>Monthly Breakdown - ${currentViewDate.getFullYear()}</h3>
      <div class="monthly-chart">
  `
  
  const highestMonth = Math.max(...months.map(m => m.amount))
  
  months.forEach(month => {
    const height = month.amount > 0 ? (month.amount / highestMonth) * 100 : 0
    monthsHtml += `
      <div class="month-column">
        <div class="month-bar-container">
          <div class="month-amount">₹${month.amount.toFixed(0)}</div>
          <div class="month-bar" style="height: ${height}%"></div>
        </div>
        <div class="month-name">${month.name.substr(0, 3)}</div>
      </div>
    `
  })
  
  monthsHtml += `
      </div>
    </div>
  `
  
  // Create category breakdown
  let categoriesHtml = `
    <div class="yearly-categories">
      <h3>Categories - ${currentViewDate.getFullYear()}</h3>
      <div class="total-amount">₹${total.toFixed(2)}</div>
      <div class="category-breakdown">
  `
  
  sortedCategories.forEach(([category, amount]) => {
    const percentage = Math.round((amount / total) * 100)
    
    categoriesHtml += `
      <div class="category-item">
        <div class="category-header">
          <span class="category-name">${category}</span>
          <span class="category-amount">₹${amount.toFixed(2)}</span>
        </div>
        <div class="category-bar-container">
          <div class="category-bar" style="width: ${percentage}%"></div>
          <span class="category-percentage">${percentage}%</span>
        </div>
      </div>
    `
  })
  
  categoriesHtml += `
      </div>
    </div>
  `
  
  // Combine both visualizations
  listContainer.innerHTML = monthsHtml
  summaryContainer.innerHTML = categoriesHtml
}

function renderAnalyzePage() {
  document.getElementById('page-content').innerHTML = `
    <h2>🔍 Analyze Your Expenses</h2>
    <form id="analyze-form" style="display:flex;gap:1rem;align-items:center;">
      <input id="analyze-query" placeholder="Ask about your expenses..." style="flex:1;">
      <button type="submit">Ask AI</button>
    </form>
    <div id="analysis-results" style="margin-top:2rem;"></div>
  `
  document.getElementById('analyze-form').onsubmit = async (e) => {
    e.preventDefault()
    const query = document.getElementById('analyze-query').value
    if (!query) return
    
    const apiKey = getGeminiKey()
    if (!apiKey) {
      showGeminiKeyPopup(true)
      return
    }
    
    const results = document.getElementById('analysis-results')
    results.innerHTML = `<div style="text-align:center;">Analyzing your expenses...</div>`
    
    try {
      const expenses = await getAllExpenses()
      let analysis
      
      if (query.toLowerCase().includes('sql') || query.toLowerCase().includes('query')) {
        // Handle SQL-specific queries
        const sqlQuery = await runSQLOnExpenses(query, apiKey, expenses)
        try {
          const result = alasql(sqlQuery, [expenses])
          analysis = `
            <div>
              <h3>SQL Query:</h3>
              <pre>${sqlQuery}</pre>
              <h3>Results:</h3>
              <pre>${JSON.stringify(result, null, 2)}</pre>
            </div>
          `
        } catch (sqlErr) {
          analysis = `
            <div>
              <h3>Generated SQL:</h3>
              <pre>${sqlQuery}</pre>
              <h3>Error:</h3>
              <pre>${sqlErr.message}</pre>
            </div>
          `
        }
      } else {
        // Handle natural language analysis
        analysis = await analyzeExpensesWithGemini(query, apiKey, expenses)
      }
      
      results.innerHTML = `
        <div class="analysis-result">
          <h3>You asked: "${query}"</h3>
          <div>${analysis}</div>
        </div>
      `
    } catch (err) {
      results.innerHTML = `<div style="color:red;">Error: ${err.message}</div>`
    }
  }
}

function renderSummaryPage() {
  document.getElementById('page-content').innerHTML = `
    <h2>📊 Spending Summary</h2>
    <div id="summary-content" style="margin-top:2rem;">Loading...</div>
  `
  
  getAllExpenses().then(expenses => {
    if (!expenses.length) {
      document.getElementById('summary-content').innerHTML = `
        <p>No expenses to summarize yet. Start adding some expenses first!</p>
      `
      return
    }
    
    // Calculate totals
    const total = expenses.reduce((sum, e) => sum + e.amount, 0)
    
    // Group by category
    const byCategory = {}
    expenses.forEach(e => {
      if (!byCategory[e.category]) {
        byCategory[e.category] = 0
      }
      byCategory[e.category] += e.amount
    })
    
    // Sort categories
    const sortedCategories = Object.entries(byCategory)
      .sort(([,a], [,b]) => b - a)
    
    // Create HTML
    const summaryDiv = document.getElementById('summary-content')
    summaryDiv.innerHTML = `
      <div class="summary-stats">
        <div class="stat-card">
          <div class="stat-value">₹${total.toFixed(2)}</div>
          <div class="stat-label">Total Expenses</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${expenses.length}</div>
          <div class="stat-label">Transactions</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${sortedCategories.length}</div>
          <div class="stat-label">Categories</div>
        </div>
      </div>
      
      <div class="chart-container">
        <h3>Top Categories</h3>
        <div id="category-chart"></div>
      </div>
    `
    
    // Add category breakdown
    const chartDiv = document.getElementById('category-chart')
    chartDiv.innerHTML = sortedCategories.map(([category, amount]) => {
      const percentage = Math.round((amount / total) * 100)
      return `
        <div style="margin-bottom:1rem;">
          <div style="display:flex;justify-content:space-between;margin-bottom:0.3rem;">
            <div>${category}</div>
            <div>₹${amount.toFixed(2)} (${percentage}%)</div>
          </div>
          <div style="height:10px;background:#333;border-radius:5px;overflow:hidden;">
            <div style="height:100%;background:#4caf50;width:${percentage}%;"></div>
          </div>
        </div>
      `
    }).join('')
  })
}

async function showExpenseDetails(cardElement) {
  const id = cardElement.getAttribute('data-id')
  const expense = await getExpense(id)
  
  if (!expense) return
  
  const formattedDate = new Date(expense.date).toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  
  // Create modal if it doesn't exist
  let modal = document.getElementById('expense-detail-modal')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'expense-detail-modal'
    modal.className = 'expense-detail-modal'
    document.body.appendChild(modal)
  }
  
  // Populate modal content
  modal.innerHTML = `
    <div class="expense-detail-content">
      <button class="modal-close" onclick="closeExpenseDetails()">&times;</button>
      <h3>Expense Details</h3>
      <div class="expense-amount">₹${expense.amount.toFixed(2)}</div>
      <div class="form-group">
        <label>Category</label>
        <div>${expense.category}</div>
      </div>
      <div class="form-group">
        <label>Description</label>
        <div>${expense.description || 'No description'}</div>
      </div>
      <div class="form-group">
        <label>Date</label>
        <div>${formattedDate}</div>
      </div>
      <div class="expense-actions">
        <button class="action-button" onclick="editExpense('${expense.id}')">
          <i class="fas fa-edit"></i> Edit
        </button>
        <button class="action-button" style="background-color: #f44336;" onclick="deleteExpense('${expense.id}')">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>
    </div>
  `
  
  // Show modal
  setTimeout(() => {
    modal.classList.add('show')
  }, 10)
}

function closeExpenseDetails() {
  const modal = document.getElementById('expense-detail-modal')
  if (modal) {
    modal.classList.remove('show')
    setTimeout(() => {
      modal.remove()
    }, 300)
  }
}

async function editExpense(id) {
  // Implementation for editing expenses can be added here
  console.log(`Edit expense ${id}`)
  closeExpenseDetails()
}

async function deleteExpense(id) {
  if (confirm('Are you sure you want to delete this expense?')) {
    await dbDeleteExpense(id)
    closeExpenseDetails()
    // Update the current view based on where we are in the app
    if (document.querySelector('.time-filter-tab')) {
      // If we're on the expenses page
      updateExpensesView()
    } else {
      // If we're on the home page
      renderTodayExpenses()
    }
  }
}

// Legacy function - now replaced by the new filtering system
// Kept for backwards compatibility
async function renderExpensesElegant() {
  // Redirect to the new system
  if (document.querySelector('.time-filter-tab')) {
    updateExpensesView()
  }
}

// On load, call renderNav() and renderForm() for Home as default
renderNav()
renderForm()
