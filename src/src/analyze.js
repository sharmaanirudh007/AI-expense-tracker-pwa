// src/analyze.js
// Analyze expenses using Gemini and natural language queries
import { getAllExpenses } from './db.js'
import alasql from 'alasql'
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.0-flash-001:generateContent';

export async function analyzeExpensesWithGemini(query, apiKey) {
  const today = new Date().toISOString().slice(0, 10)
  const expenses = await getAllExpenses()
  const schema = `
    Table: expenses
    Columns:
    - id (INTEGER, PRIMARY KEY)
    - date (TEXT, format 'YYYY-MM-DD')
    - category (TEXT)
    - amount (REAL)
    - description (TEXT)
    - created_at (TEXT, format 'YYYY-MM-DD')
  `

  const prompt = `
    You are a world-class SQLite expert specializing in converting natural language questions into precise, executable SQL queries for an expense tracking application.

    **Your Task:**
    Given a user's question and the database schema, generate a single, valid SQLite query to answer the question.

    **Database Schema:**
    ${schema}

    **Important Rules:**
    1.  **Query Only:** Your output must be ONLY the raw SQL query. No explanations, no comments, no markdown, no "SQL Query:".
    2.  **Date Handling:**
        - Today's date is: ${today}.
        - Use SQLite date functions for any date-based questions (e.g., date('now'), strftime).
        - The 'date' column is the primary source for expense dates. 'created_at' is for record tracking.
    3.  **Case-Insensitive Search:** For text searches on 'description' or 'category', use the LOWER() function and LIKE operator for case-insensitive matching (e.g., LOWER(description) LIKE '%tea%').
    4.  **Aggregation:** When asked for a total, sum, average, etc., use the appropriate aggregate function (e.g., SUM(amount)). If the result of an aggregation is NULL (e.g., no matching records), the query should return 0. Use COALESCE(SUM(amount), 0).

    **Examples:**

    *   **Question:** "How much did I spend on food this month?"
        **SQL Query:** SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE LOWER(category) = 'food' AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now');

    *   **Question:** "what did I spend on yesterday"
        **SQL Query:** SELECT description, amount FROM expenses WHERE date = date('now', '-1 day');

    *   **Question:** "total spending in january"
        **SQL Query:** SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE strftime('%Y-%m', date) = '${new Date().getFullYear()}-01';

    *   **Question:** "show all shopping expenses"
        **SQL Query:** SELECT date, description, amount FROM expenses WHERE LOWER(category) = 'shopping' ORDER BY date DESC;

    **User's Question:**
    "${query}"

    **SQL Query:**
  `

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) throw new Error('Gemini API error: ' + response.status)
  const data = await response.json()
  console.log('Gemini analyze response:', data)
  // Python logic: response.text.strip(), handle code block, strip 'sql', trim
  let sql = ''
  if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
    sql = data.candidates[0].content.parts[0].text.trim()
  }
  // Remove all code block markers and newlines
  sql = sql.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim()
  // Remove any leading 'sql' or 'sqlite' and newlines
  sql = sql.replace(/^(sql|sqlite)?\s*/i, '').trim()
  // If the SQL still contains newlines at the start, remove them
  while (sql.startsWith('\n')) sql = sql.slice(1).trim()
  // If the SQL is empty or not a SELECT, throw a more helpful error
  if (!sql || !/^select/i.test(sql)) {
    throw new Error('Gemini did not return a valid SQL SELECT statement.\n\nRaw response:\n' + JSON.stringify(data, null, 2) + '\n\nExtracted SQL:\n' + sql)
  }
  // alasql requires SELECT to be uppercase and may not support single quotes for date, so fix that
  sql = sql.replace(/select/i, 'SELECT').replace(/from/i, 'FROM').replace(/where/i, 'WHERE')
  // Replace single quotes with double quotes for string literals (alasql expects double quotes)
  sql = sql.replace(/'([^']+)'/g, '"$1"')
  return { sql, expenses }
}

// Simple in-memory SQL execution using alasql (or similar library)
export function runSQLOnExpenses(sql, expenses) {
  // This function expects alasql to be loaded globally
  if (typeof alasql === 'undefined') throw new Error('alasql library not loaded')
  alasql('CREATE TABLE IF NOT EXISTS expenses (id INT, date STRING, category STRING, amount NUMBER, description STRING, created_at STRING)')
  alasql('DELETE FROM expenses')
  expenses.forEach(e => {
    alasql('INSERT INTO expenses VALUES (?,?,?,?,?,?)', [e.id||null, e.date, e.category, e.amount, e.description, e.created_at])
  })
  console.log('Running SQL:', sql)
  try {
    return alasql(sql)
  } catch (err) {
    throw new Error('alasql error: ' + err.message + '\nSQL: ' + sql)
  }
}
