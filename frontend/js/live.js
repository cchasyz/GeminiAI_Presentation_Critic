const video = document.getElementById("video");
const cue = document.getElementById("cue");
const endBtn = document.getElementById("endBtn");

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  alert("Speech recognition not supported in this browser.");
}

const synth = window.speechSynthesis;
let speaking = false;

const recognition = new SpeechRecognition();
recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = "en-US";

let lastSpeechTime = Date.now();
let wordTimestamps = []; // { word, time }
let lastInterimWords = 0;
const WINDOW_MS = 8000; // 10 seconds

// New state for Gemini integration
let currentTranscript = "";
let isFetchingFeedback = false;
const BACKEND_URL = "http://localhost:3000/api/coach";


async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true // Re-enabling in case it helps activate mic hardware
    });
    video.srcObject = stream;
    console.log("✓ Camera and Microphone stream active.");
  } catch (e) {
    console.error("Camera/Mic access denied", e);
  }
}

function showCue(text, duration = 2000) {
  cue.textContent = text;
  cue.classList.remove("hidden");

  setTimeout(() => {
    cue.classList.add("hidden");
  }, duration);
}

function pruneOldWords() {
  const cutoff = Date.now() - WINDOW_MS;
  wordTimestamps = wordTimestamps.filter(w => w.time >= cutoff);
}

function getCurrentWPM() {
  pruneOldWords();
  if (wordTimestamps.length === 0) return 0;
  const span = Date.now() - wordTimestamps[0].time;
  const minutes = Math.max(span / 60000, 0.05);
  return Math.round(wordTimestamps.length / minutes);
}

// Ensure audio context is unlocked
document.body.addEventListener("click", () => {
    const u = new SpeechSynthesisUtterance(" ");
    synth.speak(u);
}, { once: true });


function speak(text) {
  if (!text) return;
  
  console.log("Fallback: Using browser native voice for feedback.");
  synth.cancel(); // Interrupt current speech

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.1; // Slightly faster for a coaching feel
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  utterance.onstart = () => { speaking = true; };
  utterance.onend = () => { speaking = false; };
  utterance.onerror = () => { speaking = false; };

  synth.speak(utterance);
}

async function getGeminiFeedback(text) {
    if (isFetchingFeedback || !text || text.length < 10) return;
    
    isFetchingFeedback = true;
    console.log("Asking Gemini...", text);
    
    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: text })
        });
        
        const data = await response.json();
        console.log("Backend response received:", data);
        
        if (data.audio) {
            console.log("✓ Audio data found in response. Length:", data.audio.length);
            // Stop any existing speech
            synth.cancel();
            
            // Play the audio
            const audio = new Audio("data:audio/wav;base64," + data.audio);
            speaking = true;
            audio.onended = () => { 
                console.log("Gemini Audio finished.");
                speaking = false; 
            };
            audio.onerror = (e) => {
                console.error("Audio Load Error:", e);
                speaking = false;
                if (data.feedback) speak(data.feedback);
            };

            try {
                await audio.play();
                console.log("Audio play started successfully.");
            } catch (playErr) {
                console.error("Audio playback failed:", playErr);
                // Fallback to text if audio fails to play
                if (data.feedback) speak(data.feedback);
                else speaking = false;
            }
            
            currentTranscript = ""; 
        } else if (data.feedback) {
            if (data.audioQuotaExceeded) {
                console.warn("Gemini High-Quality Voice Quota Exceeded (10/day). Falling back to browser voice.");
                // Optional: show a small visual hint on screen
                showCue("Standard Voice Active (Quota Reach)", 3000);
            }
            console.log("Gemini says (Text only):", data.feedback);
            speak(data.feedback);
            currentTranscript = ""; 
        } else {
            console.warn("No feedback or audio received in response:", data);
        }
    } catch (err) {
        console.error("Error fetching feedback:", err);
    } finally {
        isFetchingFeedback = false;
    }
}


recognition.onresult = (event) => {
  const now = Date.now();
  lastSpeechTime = now;

  let interimTranscript = "";

  // Update status to show we're hearing speech
  document.querySelector('.status-text').textContent = 'Listening...';
  
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    const transcript = result[0].transcript;

    if (result.isFinal) {
      currentTranscript += " " + transcript;
      const words = transcript.trim().split(/\s+/).filter(Boolean);
      words.forEach(() => {
          wordTimestamps.push({ time: now });
      });
    }
  }
};

recognition.onstart = () => { 
    // Console is clean now
};

recognition.onerror = (e) => { 
    // Ignore no-speech errors to stop the permission nag
    if (e.error !== 'no-speech') {
        console.warn("Recognition error:", e.error);
    }
};

recognition.onend = () => { 
    if (startProcessing) {
        // Automatically restart without logging or delays that might trigger a re-prompt
        try { recognition.start(); } catch(err) {}
    }
};


// Feedback Interval Logic (Every 10 seconds)
let lastFeedbackRequestTime = Date.now();
const FEEDBACK_INTERVAL_MS = 10000; // 10 seconds

setInterval(() => {
    if (!startProcessing || isFetchingFeedback || speaking) return;

    const now = Date.now();
    const timeSinceLastFeedback = now - lastFeedbackRequestTime;
    
    // Trigger feedback every 10 seconds if we have enough new text
    if (timeSinceLastFeedback >= FEEDBACK_INTERVAL_MS) {
        // RESET the timer regardless, so we only try once every 10s
        lastFeedbackRequestTime = now;

        // ONLY bother the user 50% of the time
        if (Math.random() < 0.5) {
            if (currentTranscript.trim().length > 20) {
                console.log("Luck rolled: Sending for feedback...");
                getGeminiFeedback(currentTranscript.trim());
            }
        } else {
            console.log("Luck rolled: Staying silent this interval.");
            currentTranscript = ""; // Clear transcript so we don't carry over old mistakes
        }
    }
}, 1000);

let startProcessing = false;
// Allow some formatting/warmup time? 
setTimeout(() => { startProcessing = true; }, 1000);


function tick() {
  const wpm = getCurrentWPM();
  // console.log("WPM:", wpm); // Optional: debug

  if (wpm > 180) {
    showCue("Slow down");
  }

  requestAnimationFrame(tick);
}
tick();

endBtn.addEventListener("click", () => {
  window.location.href = "index.html";
});

// Expose for debug/button
window.testVoice = () => {
    console.log("Triggering Gemini Voice Test...");
    getGeminiFeedback("I am your presentation coach. Speak, and I will listen.");
};

startCamera();
recognition.start();
