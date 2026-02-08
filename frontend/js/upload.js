const videoInput = document.getElementById('videoInput');
const dropZone = document.getElementById('dropZone');
const videoPreview = document.getElementById('videoPreview');
const actionBtnContainer = document.getElementById('actionBtnContainer');
const reviewBtn = document.getElementById('reviewBtn');
const resultSection = document.getElementById('resultSection');
const feedbackResult = document.getElementById('feedbackResult');
const playAudioBtn = document.getElementById('playAudioBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');

let selectedFile = null;
let currentAudio = null;

// Handle File Selection
dropZone.onclick = () => videoInput.click();

videoInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
};

// Drag and Drop
dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#fff';
};
dropZone.ondragleave = () => {
    dropZone.style.borderColor = '#2a2b2f';
};
dropZone.ondrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
};

function handleFile(file) {
    if (!file.type.startsWith('video/')) {
        alert('Please upload a video file.');
        return;
    }

    selectedFile = file;
    const url = URL.createObjectURL(file);
    videoPreview.src = url;
    videoPreview.classList.remove('hidden');
    actionBtnContainer.classList.remove('hidden');
    dropZone.querySelector('p').textContent = `Selected: ${file.name}`;
    dropZone.style.borderColor = '#2a2b2f';
    
    // Reset results
    resultSection.classList.add('hidden');
}

// Handle Review Click
reviewBtn.onclick = async () => {
    if (!selectedFile) return;

    loadingOverlay.classList.add('active');
    loadingText.textContent = "AI Teacher is watching...";
    
    const formData = new FormData();
    formData.append('video', selectedFile);

    try {
        const response = await fetch('http://localhost:3000/api/review-video', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Failed to analyze video');

        const data = await response.json();
        
        // Display Text
        feedbackResult.textContent = data.feedback;
        resultSection.classList.remove('hidden');
        
        // Prepare Audio
        if (data.audio) {
            currentAudio = new Audio("data:audio/wav;base64," + data.audio);
            // Auto play if available
            currentAudio.play().catch(e => console.log("Auto-play blocked"));
        } else {
            currentAudio = null;
        }

        // Scroll to result
        resultSection.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        console.error(err);
        alert('Error: ' + err.message);
    } finally {
        loadingOverlay.classList.remove('active');
    }
};

// Play Audio Button
playAudioBtn.onclick = () => {
    if (currentAudio) {
        currentAudio.currentTime = 0;
        currentAudio.play();
    } else {
        alert('No audio feedback available.');
    }
};
