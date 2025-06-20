// src/gemini.js
// Utility for interacting with Gemini API for expense parsing and analysis

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.0-flash-001:generateContent';

export async function parseExpenseWithGemini(text, apiKey) {
  const today = new Date().toISOString().slice(0, 10)
  const prompt = `You are an assistant that extracts structured data from text related to expenses.\nExtract amount (number), category (string) (if item is provided here instead of general category infer it yourself), description (original input), and date in YYYY-MM-DD format.\nIf the date is relative (like 'yesterday', 'today', 'last Sunday'), convert it based on today's date. Make sure all letters should be smallcase.\nToday's date is ${today}.\n\nText: "${text}"\nOutput:`

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
