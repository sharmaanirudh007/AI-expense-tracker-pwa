import './style.css'
import { addExpense, getAllExpenses } from './db.js'
import { parseExpenseWithGemini } from './gemini.js'
import { analyzeExpensesWithGemini, runSQLOnExpenses } from './analyze.js'
import alasql from 'alasql'
import { signInGoogle, isSignedIn, uploadToDrive, pickAndDownloadFromDrive } from './googleDrive.js'

const app = document.querySelector('#app')

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
  popup.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;'
  popup.innerHTML = `
    <div style="background:#222;padding:2rem;border-radius:10px;min-width:300px;max-width:90vw;display:flex;flex-direction:column;align-items:center;">
      <h2>Enter Gemini API Key</h2>
      <input type="password" id="popup-gemini-key" placeholder="Gemini API Key" style="width:100%;margin-bottom:1rem;" />
      <div id="popup-error" style="color:red;margin-bottom:1rem;"></div>
      <div style="display:flex;gap:1rem;">
        <button id="save-gemini-key">Save</button>
        <button id="close-gemini-popup">${force ? 'Close (disabled)' : 'Close'}</button>
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

function renderNav() {
  app.innerHTML = `
    <nav class="main-nav">
      <button id="nav-home">🏠 Home</button>
      <button id="nav-analyze">🔍 Analyze</button>
      <button id="nav-summary">📊 Summary</button>
    </nav>
    <div id="page-content"></div>
  `
  document.getElementById('nav-home').onclick = () => renderForm()
  document.getElementById('nav-analyze').onclick = () => renderAnalyzePage()
  document.getElementById('nav-summary').onclick = () => renderSummaryPage()
}

function renderForm() {
  document.getElementById('page-content').innerHTML = `
    <h1>AI Expense Tracker</h1>
    <div id="google-account-status" style="margin-bottom:1em;"></div>
    <form id="expense-form" style="display:flex; flex-direction:column; align-items:center; gap:1rem; max-width:600px; margin:auto;">
      <textarea id="description" placeholder="Type or paste your expense (e.g. I spent 200 on tea yesterday)" required style="width:100%; min-height:60px;"></textarea>
      <button type="submit" style="width:100%;">Add Expense (AI)</button>
    </form>
    <button id="show-gemini-popup" style="margin-top:1rem;">Set Gemini API Key</button>
    <div style="margin-top:1.5rem;">
      <button id="sync-drive" style="background:#4285F4;color:#fff;padding:0.5rem 1.5rem;border:none;border-radius:6px;font-size:1em;">🔄 Sync with Google Drive</button>
      <button id="load-drive" style="background:#34A853;color:#fff;padding:0.5rem 1.5rem;border:none;border-radius:6px;font-size:1em;margin-left:1rem;">⬇️ Load from Google Drive</button>
    </div>
    <div id="expenses-list" style="margin-top:2rem;"></div>
    <div id="error-msg" style="color:red;"></div>
    <div id="drive-msg" style="color:#4285F4;margin-top:1rem;"></div>
  `
  renderGoogleAccountStatus()
  document.getElementById('show-gemini-popup').onclick = () => showGeminiKeyPopup(false)
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
        date: aiExpense.date || new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString().slice(0, 10)
      }
      await addExpense(expense)
      renderExpenses()
      e.target.reset()
      document.getElementById('error-msg').textContent = ''
    } catch (err) {
      document.getElementById('error-msg').textContent = err.message
    }
  }
  document.getElementById('sync-drive').onclick = async () => {
    console.log('SYNC BUTTON CLICKED');
    document.getElementById('drive-msg').textContent = 'Syncing to Google Drive...';
    try {
      const signedIn = await isSignedIn();
      console.log('isSignedIn() result:', signedIn);
      if (!signedIn) {
        await signInGoogle();
        console.log('signInGoogle() completed');
      }
      const expenses = await getAllExpenses();
      console.log('getAllExpenses() result:', expenses);
      const filename = `expenses-backup-${new Date().toISOString().slice(0,10)}.json`;
      let result;
      try {
        console.log('About to call uploadToDrive');
        result = await uploadToDrive(filename, JSON.stringify(expenses, null, 2));
        console.log('Google Drive upload result:', result);
        if (result && result.id) {
          document.getElementById('drive-msg').textContent = 'Backup uploaded to Google Drive!';
        } else {
          document.getElementById('drive-msg').textContent = 'Google Drive sync failed: ' + JSON.stringify(result);
        }
      } catch (err) {
        console.error('Google Drive upload error:', err);
        let errorMsg = '';
        try {
          errorMsg = JSON.stringify(err);
        } catch (e) {
          errorMsg = String(err);
        }
        document.getElementById('drive-msg').textContent = 'Google Drive sync failed: ' + errorMsg;
      }
      console.log('isSignedIn (after upload):', await isSignedIn());
    } catch (e) {
      console.error('Sync handler outer catch:', e);
      document.getElementById('drive-msg').textContent = 'Google Drive sync failed: ' + e.message;
    }
  }
  document.getElementById('load-drive').onclick = async () => {
    document.getElementById('drive-msg').textContent = 'Loading from Google Drive... (feature coming soon)'
    // TODO: Implement file picker and restore logic
  }
  renderExpenses()
}

function renderAnalyzePage() {
  document.getElementById('page-content').innerHTML = `
    <h2>🔍 Analyze Your Expenses</h2>
    <form id="analyze-form" style="display:flex;gap:1rem;align-items:center;">
      <input type="text" id="analyze-query" placeholder="Ask a question (e.g., How much did I spend on tea yesterday?)" style="flex:1;" required />
      <button type="submit">Analyze</button>
    </form>
    <div id="analyze-results" style="margin-top:1rem;"></div>
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
          <div style='margin-top:0.5rem;color:#888;font-size:0.9em;'>SQL: <code>${sql}</code></div>
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
    <div id="tab-content" style="margin-top:1.5rem;"></div>
  `
  document.getElementById('tab-daily').onclick = () => renderSummaryTab('daily')
  document.getElementById('tab-monthly').onclick = () => renderSummaryTab('monthly')
  document.getElementById('tab-yearly').onclick = () => renderSummaryTab('yearly')
  renderSummaryTab('daily')
}

async function renderSummaryTab(type) {
  const content = document.getElementById('tab-content')
  content.innerHTML = `<div id="summary-chart" style="height:300px;"></div><div id="summary-table"></div>`
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

async function renderExpenses() {
  const expenses = await getAllExpenses()
  const list = document.getElementById('expenses-list')
  if (!expenses.length) {
    list.innerHTML = '<p>No expenses yet.</p>'
    return
  }
  list.innerHTML = `
    <h2>Expenses</h2>
    <ul>
      ${expenses.map(e => `<li>₹${e.amount.toFixed(2)} - ${e.category} - ${e.description} (${e.date})</li>`).join('')}
    </ul>
  `
}

async function renderGoogleAccountStatus() {
  const statusDiv = document.getElementById('google-account-status')
  statusDiv.innerHTML = 'Checking Google account...'
  try {
    const { isSignedIn } = await import('./googleDrive.js')
    const signedIn = await isSignedIn()
    if (signedIn) {
      const { getGoogleUserProfile, signOutGoogle } = await import('./googleDrive.js')
      const profile = await getGoogleUserProfile()
      statusDiv.innerHTML = `
        <img src="${profile.imageUrl}" alt="Profile" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;"> 
        <span>${profile.name} (${profile.email})</span>
        <button id="google-signout-btn" style="margin-left:1em;">Sign out</button>
      `
      document.getElementById('google-signout-btn').onclick = async () => {
        await signOutGoogle()
        statusDiv.innerHTML = 'Signed out.'
      }
    } else {
      statusDiv.innerHTML = '<span>Not signed in to Google</span>'
    }
  } catch (e) {
    statusDiv.innerHTML = '<span style="color:red;">Google account status error</span>'
  }
}

// On load, call renderNav() and renderForm() for Home as default
renderNav()
renderForm()
if (!getGeminiKey()) showGeminiKeyPopup(false)
