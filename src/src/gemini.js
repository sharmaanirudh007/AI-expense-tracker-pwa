// src/gemini.js
// Utility for interacting with Gemini API for expense parsing and analysis

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.0-flash-001:generateContent';

export async function parseExpenseWithGemini(text, apiKey) {
  const prompt = `
    Analyze the following text and extract the expense details into a JSON object.

    **Instructions:**
    1.  **description**: A concise summary of the expense. If the text is a simple description like "groceries", use that directly.
    2.  **amount**: The numeric cost. Extract only the number.
    3.  **category**: Choose the most fitting category from this list: Food, Transport, Shopping, Utilities, Entertainment, Health, Education, Other.
    4.  **date**: The date of the expense in YYYY-MM-DD format. If no date is mentioned, use today's date: ${new Date().toISOString().slice(0, 10)}.

    **Input Text:**
    ${text}

    **Examples:**
    - Text: "I spent 200 on tea yesterday"
      JSON: {"description": "Tea", "amount": 200, "category": "Food", "date": "${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}"}
    - Text: "monthly electricity bill 5000"
      JSON: {"description": "Monthly electricity bill", "amount": 5000, "category": "Utilities", "date": "${new Date().toISOString().slice(0, 10)}"}
    - Text: "uber to office 150 on 2nd jan"
      JSON: {"description": "Uber to office", "amount": 150, "category": "Transport", "date": "${new Date().getFullYear()}-01-02"}

    **Output JSON:**
  `

  try {
    const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Gemini API Error Response:", errorBody);
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
    let jsonString = '';
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        jsonString = data.candidates[0].content.parts[0].text.trim();
    } else {
        console.error("Unexpected Gemini response structure:", data);
        throw new Error("Failed to get valid content from Gemini response.");
    }

    // Clean the response to ensure it's valid JSON
    jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonString);

  } catch (err) {
    console.error('Gemini parsing error:', err);
    // Check if the error is a SyntaxError from JSON.parse
    if (err instanceof SyntaxError) {
        throw new Error('Failed to parse expense with AI. The response from the AI was not valid JSON.');
    }
    throw new Error(`Failed to parse expense with AI: ${err.message}`);
  }
}
