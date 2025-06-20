// src/analyze.js
// Analyze expenses using Gemini and natural language queries
import { getAllExpenses } from './db.js'
import alasql from 'alasql'
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.0-flash-001:generateContent';

export async function analyzeExpensesWithGemini(query, apiKey) {
  const today = new Date().toISOString().slice(0, 10)
  const expenses = await getAllExpenses()
  const schema = `Table: expenses\nColumns:\n- id (INTEGER, PRIMARY KEY)\n- date (TEXT, format 'YYYY-MM-DD')\n- category (TEXT)\n- amount (REAL)\n- description (TEXT)\n- created_at (TEXT, format 'YYYY-MM-DD')`
  const prompt = `You are an expert SQLite assistant. Your task is to convert a natural language question into a single, executable SQLite query for a personal expense tracker.\ncreated_at is when the record is created. Infer value for date from prompt. I might ask question based on description.\nDatabase Schema:\n${schema}\nToday's date is ${today}.\nConvert the following natural language question into a syntactically correct SQLite query. Only output the SQL query and nothing else.\n\nQuestion: "${query}"\nSQL Query:`

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
