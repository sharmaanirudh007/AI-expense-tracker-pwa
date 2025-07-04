// src/gemini.js
// Utility for interacting with Gemini API for expense parsing and analysis

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.0-flash-001:generateContent';

export async function parseExpenseWithGemini(text, apiKey) {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const localTodayString = `${year}-${month}-${day}`;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yearY = yesterday.getFullYear();
  const monthY = String(yesterday.getMonth() + 1).padStart(2, '0');
  const dayY = String(yesterday.getDate()).padStart(2, '0');
  const localYesterdayString = `${yearY}-${monthY}-${dayY}`;

  const prompt = `
    Analyze the following text and extract the expense details into a JSON object.

    **Instructions:**
    1.  **description**: A concise summary of the expense. If the text is a simple description like "groceries", use that directly.
    2.  **amount**: The numeric cost. Extract only the number.
    3.  **category**: Choose the most fitting category from this list: Food, Transport, Shopping, Utilities, Entertainment, Health, Education, Other.
    4.  **date**: The date of the expense in YYYY-MM-DD format. If no date is mentioned, use today's date: ${localTodayString}.
    5.  **paymentMode**: Choose the most likely payment method from this list: UPI, Credit Card, Debit Card, Cash. If not mentioned, use "UPI" as default.

    **Input Text:**
    ${text}

    **Examples:**
    - Text: "I spent 200 on tea yesterday"
      JSON: {"description": "Tea", "amount": 200, "category": "Food", "date": "${localYesterdayString}", "paymentMode": "UPI"}
    - Text: "monthly electricity bill 5000 paid by credit card"
      JSON: {"description": "Monthly electricity bill", "amount": 5000, "category": "Utilities", "date": "${localTodayString}", "paymentMode": "Credit Card"}
    - Text: "uber to office 150 on 2nd jan cash"
      JSON: {"description": "Uber to office", "amount": 150, "category": "Transport", "date": "${new Date().getFullYear()}-01-02", "paymentMode": "Cash"}

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

export async function getAIInsight(expenses, apiKey) {
  const prompt = `
    Analyze the provided expense data and generate a single, concise, and interesting insight for the user. 

    **Instructions:**
    1.  **Be encouraging and friendly.** Frame the insight in a positive or neutral way.
    2.  **Keep it short and scannable.** Aim for one sentence.
    3.  **Focus on recent trends or interesting patterns.** Avoid just stating obvious totals.
    4.  **Vary the insights.** Don't always focus on the same thing (e.g., top category).
    5.  **If there are very few expenses, provide a simple welcome or encouragement.**

    **Today's Date:** ${new Date().toISOString().slice(0, 10)}

    **Expense Data (JSON):**
    ${JSON.stringify(expenses, null, 2)}

    **Example Insights:**
    - "Your spending on Food has decreased by 20% this week. Keep it up!"
    - "Looks like you're a fan of shopping! It's your top category this month."
    - "You haven't logged any transport costs in the last 3 days."
    - "Welcome! Add a few more expenses to start seeing personalized insights."
    - "Your average daily spend is ₹350 this week."

    **Your Insight (as a single string):**
  `

  try {
    const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // Add safety settings to prevent unsafe content
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
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
    
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        // Clean up the response, removing potential markdown or quotes
        return data.candidates[0].content.parts[0].text.trim().replace(/"/g, '');
    } else {
        console.error("Unexpected Gemini response structure for insight:", data);
        // Check for blocked content
        if (data?.promptFeedback?.blockReason) {
            return "The AI couldn't generate an insight due to safety filters.";
        }
        return "Add some expenses to see your first AI insight!";
    }

  } catch (err) {
    console.error('Gemini insight error:', err);
    return "Couldn't generate an AI insight at the moment.";
  }
}
