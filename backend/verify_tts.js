import fetch from 'node-fetch';
import fs from 'fs';

async function testTTS() {
    console.log("Testing TTS Endpoint...");
    try {
        const response = await fetch('http://localhost:3000/api/coach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: "Hello, I am practicing my presentation skills." })
        });
        
        if (!response.ok) {
            console.error("Server returned error:", response.status, response.statusText);
            const text = await response.text();
            console.error("Body:", text);
            return;
        }

        const data = await response.json();
        console.log("Feedback Text:", data.feedback);
        
        if (data.audio) {
            console.log("Audio received! Length:", data.audio.length);
            const buffer = Buffer.from(data.audio, 'base64');
            fs.writeFileSync('test_output.wav', buffer);
            console.log("Saved audio to test_output.wav");
        } else {
            console.warn("No audio data received.");
        }

    } catch (e) {
        console.error("Test failed:", e.message);
        console.error("Make sure the server is running on port 3000");
    }
}

testTTS();
