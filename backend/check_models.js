import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function listModels() {
  try {
    const list = await ai.models.list();
    console.log("AVAILABLE MODELS:");
    for await (const model of list) {
        console.log(`- ${model.name}`);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

listModels();
