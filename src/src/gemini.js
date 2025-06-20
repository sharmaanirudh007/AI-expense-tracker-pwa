// src/gemini.js
// Utility for interacting with Gemini API for expense parsing and analysis

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.0-flash-001:generateContent';

export async function parseExpenseWithGemini(text, apiKey) {
  const today = new Date().toISOString().slice(0, 10)
  const prompt = `You are an expert assistant for extracting structured expense data from user input. Your job is to return a single JSON object with the following fields:

- amount (number): The expense amount. Always extract as a number.
- category (string): The most relevant category for the expense. If only an item is mentioned, infer the general category (e.g., 'tea' → 'beverage').
- description (string): The original input text, or a concise summary if possible.
- date (string, YYYY-MM-DD): The date of the expense. If the input uses a relative date (like 'yesterday', 'today', 'last Sunday'), convert it to the correct YYYY-MM-DD format based on today's date (${today}).

Guidelines:
- All values must be in lowercase.
- If a value is missing or ambiguous, make your best guess.
- Output only the JSON object, nothing else.

Text: "${text}"
Output:`

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
  // Try to extract JSON from the response
  let output = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (output.startsWith('```')) {
    output = output.replace(/```(json)?/g, '').trim()
  }
  try {
    const parsed = JSON.parse(output)
    return parsed
  } catch (e) {
    throw new Error('Failed to parse Gemini output: ' + output)
  }
}
