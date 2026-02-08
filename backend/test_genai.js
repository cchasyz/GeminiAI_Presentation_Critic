import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("No API key found in .env");
  process.exit(1);
}

console.log("Testing with API Key ending in:", apiKey.slice(-4));

const ai = new GoogleGenAI({ apiKey });

console.log("AI Client keys:", Object.keys(ai));

async function test() {
  try {
    console.log("Testing text generation with gemini-2.0-flash...");
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: 'Hello, explain who you are in one sentence.'
        });
        
        console.log("Full Response Object:", JSON.stringify(response, null, 2));
        
        if (response.text) {
             console.log("Response text:", response.text);
        } else if (response.candidates && response.candidates[0].content.parts[0].text) {
             console.log("Response text (deep):", response.candidates[0].content.parts[0].text);
        }

    } catch (e) {
        console.log("Generation failed:", e.message);
        console.log("Error details:", e);
    }
    
  } catch (err) {
    console.error("Top level error:", err);
  }
}

test();
