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
let speakingState = "idle";
const WINDOW_MS = 8000; // 10 seconds
let lastInterruption = 0;
const INTERRUPT_COOLDOWN = 3000;


const session = {
  startTime: Date.now(),
  maxWPM: 0,
  avgWPM: 0,
  pauses: 0,
  cues: []
};

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });
  video.srcObject = stream;
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

  const span =
    Date.now() - wordTimestamps[0].time;

  const minutes = Math.max(span / 60000, 0.05);
  return Math.round(wordTimestamps.length / minutes);
}

function unlockSpeech() {
  const u = new SpeechSynthesisUtterance(" ");
  synth.speak(u);
}
document.body.addEventListener("click", () => {
  unlockSpeech();
}, { once: true });


let lastSpoken = "";function speak(text) {
  synth.cancel(); // always reset

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 1.0;
  utterance.volume = 0.9;

  utterance.onend = () => {
    speaking = false;
  };

  utterance.onerror = () => {
    speaking = false;
  };

  speaking = true;
  synth.speak(utterance);
}

recognition.onresult = (event) => {
  const now = Date.now();
  lastSpeechTime = now;

  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    const transcript = result[0].transcript.trim();
    const words = transcript.split(/\s+/).filter(Boolean);

    if (!result.isFinal) {
      const newWords = words.length - lastInterimWords;
      if (newWords > 0) {
        for (let j = 0; j < newWords; j++) {
          wordTimestamps.push({ time: now });
        }
        lastInterimWords = words.length;
      }
    } else {
      lastInterimWords = 0;
    }
  }

  lastWordTime = now;
  pruneOldWords();
};

setInterval(() => {
  if (Date.now() - lastSpeechTime > 1200) {
    lastInterimWords = 0;
  }
}, 300);

let lastWordTime = Date.now();

function detectPause() {
  const gap = Date.now() - lastWordTime;
  if (gap > 1800 && gap < 4000) {
    showCue("Take your time");
  }
}

function updateState(wpm) {
  if (wpm === 0) return "idle";
  if (wpm < 120) return "warming";
  if (wpm < 170) return "steady";
  return "rushing";
}

function tick() {
  const wpm = getCurrentWPM();
  console.log("WPM:", wpm);

  if (wpm > 180) {
    showCue("Slow down");
  }

  requestAnimationFrame(tick);
}
tick();

endBtn.addEventListener("click", () => {
  window.location.href = "index.html";
});

startCamera();
recognition.start();