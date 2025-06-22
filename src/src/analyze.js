// src/analyze.js
// Analyze expenses using Gemini and natural language queries
import { getAllExpenses } from './db.js'
import alasql from 'alasql'
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.0-flash-001:generateContent';

export async function analyzeExpensesWithGemini(query, apiKey) {
  const today = new Date().toISOString().slice(0, 10)
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = yesterdayDate.toISOString().slice(0, 10)
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
    You are a world-class database expert specializing in converting natural language questions into precise, executable SQL queries for an expense tracking application that uses AlaSQL.

    **Your Task:**
    First, determine if the user's question is related to analyzing their expenses based on the provided schema.
    - If the question **is related** to expenses, generate a single, valid AlaSQL query to answer it.
    - If the question **is not related** to expenses (e.g., "what is the capital of France?", "who are you?"), your output must be ONLY the word \`IRRELEVANT\`.

    **Database Schema:**
    ${schema}

    **Important Rules:**
    1.  **Output Format:**
        - For relevant queries: Your output must be ONLY the raw SQL query. No explanations, no comments, no markdown.
        - For irrelevant queries: Your output must be ONLY the word \`IRRELEVANT\`.
    2.  **Date Handling (for AlaSQL):**
        - Today's date is: ${today}.
        - The 'date' column is a TEXT field in 'YYYY-MM-DD' format.
        - **DO NOT use SQLite-specific date functions like \`strftime\`, \`date\`, or \`now()\`.** AlaSQL does not support them.
        - For date comparisons, use string manipulation with functions like \`SUBSTR\` or the \`LIKE\` operator.
        - To get the current month, use \`SUBSTR(date, 1, 7) = '${today.slice(0, 7)}'\`.
        - To get the current year, use \`SUBSTR(date, 1, 4) = '${today.slice(0, 4)}'\`.
        - For "yesterday", use the provided date string: \`date = '${yesterday}'\`.
    3.  **Case-Insensitive Search:** For text searches on 'description' or 'category', use the \`LOWER()\` function and \`LIKE\` operator for case-insensitive matching (e.g., \`LOWER(description) LIKE '%tea%'\`).
    4.  **Aggregation:** When asked for a total, sum, average, etc., use the appropriate aggregate function (e.g., \`SUM(amount)\`). If the result of an aggregation is NULL (e.g., no matching records), the query should return 0. Use \`COALESCE(SUM(amount), 0)\`.
    5.  **Column Aliases:** For aggregated columns (like SUM, AVG, COUNT), always use a simple, descriptive alias in \`snake_case\` (e.g., \`SELECT SUM(amount) AS total_spending\`). This is required to avoid parsing errors in the SQL engine.

    **Examples:**

    *   **Question:** "How much did I spend on food this month?"
        **SQL Query:** SELECT COALESCE(SUM(amount), 0) AS total_spent FROM expenses WHERE LOWER(category) = 'food' AND SUBSTR(date, 1, 7) = '${today.slice(0, 7)}';

    *   **Question:** "what did I spend on yesterday"
        **SQL Query:** SELECT description, amount FROM expenses WHERE date = '${yesterday}';

    *   **Question:** "total spending in january"
        **SQL Query:** SELECT COALESCE(SUM(amount), 0) AS total_spent FROM expenses WHERE SUBSTR(date, 1, 7) = '${new Date().getFullYear()}-01';

    *   **Question:** "average spending on shopping"
        **SQL Query:** SELECT COALESCE(AVG(amount), 0) AS average_spent FROM expenses WHERE LOWER(category) = 'shopping';

    *   **Question:** "show all shopping expenses"
        **SQL Query:** SELECT date, description, amount FROM expenses WHERE LOWER(category) = 'shopping' ORDER BY date DESC;

    *   **Question:** "what is the tallest building in the world?"
        **SQL Query:** IRRELEVANT

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

  if (sql.toUpperCase() === 'IRRELEVANT') {
    throw new Error("I can only answer questions about your expenses. Please try a different query.");
  }

  // Remove all code block markers and newlines
  sql = sql.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim()
  // Remove any leading 'sql' or 'sqlite' and newlines
  sql = sql.replace(/^(sql|sqlite)?\s*/i, '').trim()
  // If the SQL still contains newlines at the start, remove them
  while (sql.startsWith('\n')) sql = sql.slice(1).trim()
  // If the SQL is empty or not a SELECT, throw a more helpful error
  if (!sql || !/^select/i.test(sql)) {
    throw new Error('Gemini did not return a valid SQL SELECT statement.\\n\\nRaw response:\\n' + JSON.stringify(data, null, 2) + '\\n\\nExtracted SQL:\\n' + sql)
  }
  // alasql requires SELECT to be uppercase and may not support single quotes for date, so fix that
  sql = sql.replace(/select/i, 'SELECT').replace(/from/i, 'FROM').replace(/where/i, 'WHERE')
  // Replace single quotes with double quotes for string literals (alasql expects double quotes)
  // sql = sql.replace(/'([^']+)'/g, '"$1"')
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
