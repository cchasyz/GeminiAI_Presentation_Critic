import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Configure Multer for video uploads
const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = 'gemini-2.0-flash-lite';

/**
 * Adds a WAV header to raw PCM data (L16, Mono, 24kHz)
 */
function addWavHeader(pcmData, sampleRate = 24000) {
    const dataLen = pcmData.length;
    const buffer = Buffer.alloc(44 + dataLen);
    
    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLen, 4);
    buffer.write('WAVE', 8);
    
    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // length of fmt chunk
    buffer.writeUInt16LE(1, 20); // PCM format
    buffer.writeUInt16LE(1, 22); // Mono
    buffer.writeUInt32LE(sampleRate, 24); // Sample rate
    buffer.writeUInt32LE(sampleRate * 2, 28); // Byte rate (rate * channels * sampleWidth)
    buffer.writeUInt16LE(2, 32); // Block align (channels * sampleWidth)
    buffer.writeUInt16LE(16, 34); // Bits per sample
    
    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLen, 40);
    
    pcmData.copy(buffer, 44);
    return buffer;
}

app.post('/api/coach', async (req, res) => {
  try {
    const { transcript } = req.body;
    
    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    console.log(`Analyzing transcript (${transcript.length} chars):`, transcript.substring(0, 50) + "...");

    // 1. Generate Feedback Text
    const TEXT_MODEL_NAME = 'models/gemini-2.5-flash';
    const textPrompt = `You are a helpful presentation teacher. 
    Use very simple, natural language and don't be formal. Talk like a real person giving a quick tip.
    The user is practicing a speech. 
    
    Review the snippet and suggest ONE clear improvement ONLY if there's a major issue (like too many "ums", speaking too fast, or being hard to understand).
    
    CRITICAL RULES:
    1. If the speech is okay, you MUST respond with ONLY the word "NONE".
    2. Don't be formal or use "big" words. Keep it simple.
    3. NO praise or encouragement. ONLY speak if there's a mistake to fix.
    4. Feedback must be under 15 words.
    
    Transcript: "${transcript}"`;

    let textResponse;
    try {
        const textResult = await ai.models.generateContent({
            model: TEXT_MODEL_NAME,
            contents: textPrompt
        });
        textResponse = textResult.text.trim().replace(/[".!]/g, ''); // Remove punctuation from NONE
    } catch (e) {
        console.error("Text Generation Error:", e);
        throw e;
    }

    console.log("Gemini Feedback Raw:", textResponse);

    // If AI says NONE, we don't need audio or feedback
    if (textResponse.toUpperCase() === "NONE") {
        console.log("AI STAYS SILENT: Speech was good enough.");
        return res.json({ feedback: null, audio: null });
    }

    // 2. Generate Audio from Feedback
    let audioData = null;
    let audioQuotaExceeded = false;
    try {
        const AUDIO_MODEL_NAME = 'models/gemini-2.5-flash-preview-tts'; 
        
        const audioResult = await ai.models.generateContent({
            model: AUDIO_MODEL_NAME,
            contents: { parts: [{ text: textResponse }] },
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });

        if (audioResult.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
            const pcmBuffer = Buffer.from(audioResult.candidates[0].content.parts[0].inlineData.data, 'base64');
            // Wrap PCM in WAV header so it's playable in browser
            const wavBuffer = addWavHeader(pcmBuffer, 24000);
            audioData = wavBuffer.toString('base64');
            console.log("SUCCESS: Audio Data Generated and Wrapped (WAV) - Length:", audioData.length);
        } else {
             console.warn("No audio data found in response");
        }

    } catch (audioError) {
        console.warn("Audio Generation Failed:", audioError.message);
        if (audioError.status === 429 || audioError.message.includes("quota")) {
            console.error("QUOTA EXCEEDED for Gemini TTS (10 requests/day). Falling back to browser voice on next request.");
            audioQuotaExceeded = true;
        }
    }

    res.json({ 
        feedback: textResponse, 
        audio: audioData,
        audioQuotaExceeded,
        _debug: {
            textModel: TEXT_MODEL_NAME,
            audioModel: 'models/gemini-2.5-flash-preview-tts',
            hasAudio: !!audioData
        }
    });

  } catch (error) {
    console.error('Error generating feedback:', error.message);
    
    if (error.status === 400 && error.message.includes("API key expired")) {
        console.error("CRITICAL: Your API Key has expired. Please get a new key from Google AI Studio.");
        return res.status(401).json({ error: 'API Key Expired', details: 'Please check server logs.' });
    }

    if (error.status === 429) {
         console.warn("QUOTA EXCEEDED. Retries exhausted.");
         return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    }
    
    res.status(500).json({ error: 'Failed to generate feedback', details: error.message });
  }
});

// 3. Video Review Endpoint (Multimodal)
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

app.post('/api/review-video', upload.single('video'), async (req, res) => {
  const filePath = req.file?.path;
  
  try {
    if (!filePath) {
        return res.status(400).json({ error: 'No video file provided' });
    }

    console.log("Analyzing video:", req.file.originalname);

    // 1. Upload to Gemini File API
    const uploadResult = await fileManager.uploadFile(filePath, {
        mimeType: req.file.mimetype,
        displayName: req.file.originalname,
    });

    console.log(`Uploaded file ${uploadResult.file.displayName} as: ${uploadResult.file.uri}`);

    // 2. Wait for file to be ready (ACTIVE state)
    let file = await fileManager.getFile(uploadResult.file.name);
    while (file.state === "PROCESSING") {
        process.stdout.write(".");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        file = await fileManager.getFile(uploadResult.file.name);
    }

    if (file.state === "FAILED") {
        throw new Error("Video processing failed.");
    }

    console.log("Video is ready for analysis.");

    // 3. Generate Critique using Gemini 2.5 Flash
    const VIDEO_MODEL_NAME = 'models/gemini-2.5-flash';
    const videoPrompt = `You are a professional presentation coach. 
    Watch this presentation video and provide a concise, high-impact critique. 
    Focus on:
    - Body language and eye contact
    - Use of visuals/slides
    - Tone and clarity of speech
    
    Keep it under 3-4 specific bullet points. 
    Then provide a final summary tip in 1 sentence.
    Use simple, natural language.`;

    const result = await ai.models.generateContent({
        model: VIDEO_MODEL_NAME,
        contents: [
            {
                role: 'user',
                parts: [
                    { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
                    { text: videoPrompt },
                ],
            },
        ],
    });

    const textResponse = result.text;
    console.log("Gemini Video Critique:", textResponse);

    // 4. Generate Audio from Feedback Summary (using only the last sentence for TTS)
    // Actually let's just generate TTS for the whole thing or a summary.
    // Let's do a summary sentence specifically for the TTS.
    const audioSummaryResult = await ai.models.generateContent({
        model: 'models/gemini-2.5-flash',
        contents: `Summarize this critique into one friendly, spoken sentence for the user: "${textResponse}"`
    });
    const spokenFeedback = audioSummaryResult.text;

    let audioData = null;
    try {
        const audioResult = await ai.models.generateContent({
            model: 'models/gemini-2.5-flash-preview-tts',
            contents: { parts: [{ text: spokenFeedback }] },
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });

        if (audioResult.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
            const pcmBuffer = Buffer.from(audioResult.candidates[0].content.parts[0].inlineData.data, 'base64');
            const wavBuffer = addWavHeader(pcmBuffer, 24000);
            audioData = wavBuffer.toString('base64');
        }
    } catch (audioError) {
        console.warn("Video Review Audio Generation Failed:", audioError.message);
    }

    // Clean up local file
    fs.unlinkSync(filePath);

    res.json({ 
        feedback: textResponse, 
        spokenFeedback: spokenFeedback,
        audio: audioData 
    });

  } catch (error) {
    console.error('Error reviewing video:', error);
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: 'Failed to review video', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Using Gemini API Key: ${process.env.GEMINI_API_KEY ? '******' + process.env.GEMINI_API_KEY.slice(-4) : 'NOT SET'}`);
  console.log(`Text Model: models/gemini-2.5-flash`);
  console.log(`Audio Model: models/gemini-2.5-flash-preview-tts`);
});
