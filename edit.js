// edit.js
const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const statusText = document.getElementById('status-text');
const btnSave = document.getElementById('btn-save');
const nameInput = document.getElementById('student-name');
const rollNumberInput = document.getElementById('roll-number');
const urlListContainer = document.getElementById('profiles-list');

let modelsLoadedTime = false;
let displaySize = { width: 480, height: 360 };
let savedProfiles = [];

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/vladmandic/face-api/model/';

function updateStatus(text, color) {
    statusText.textContent = text;
    statusText.style.color = color;
}

function loadProfiles() {
    const data = JSON.parse(localStorage.getItem('faceProfiles') || '[]');
    savedProfiles = data;
    renderProfiles();
}

function saveToLocalStorage() {
    localStorage.setItem('faceProfiles', JSON.stringify(savedProfiles));
    renderProfiles();
}

function deleteProfile(id) {
    savedProfiles = savedProfiles.filter(p => p.id !== id);
    saveToLocalStorage();
    updateStatus('Profile deleted.', 'var(--warning)');
}

function renderProfiles() {
    urlListContainer.innerHTML = '';
    
    if (savedProfiles.length === 0) {
        urlListContainer.innerHTML = '<li><span class="profile-url" style="color: var(--text-secondary); width: 100%;">No students registered yet.</span></li>';
        return;
    }

    savedProfiles.forEach(profile => {
        const li = document.createElement('li');
        li.className = 'profile-item';
        
        const span = document.createElement('span');
        span.className = 'profile-url';
        span.textContent = `${profile.rollNumber} - ${profile.name}`;
        
        const btnDelete = document.createElement('button');
        btnDelete.className = 'delete-btn';
        btnDelete.innerHTML = '🗑️';
        btnDelete.onclick = () => deleteProfile(profile.id);
        
        li.appendChild(span);
        li.appendChild(btnDelete);
        urlListContainer.appendChild(li);
    });
}

async function init() {
    updateStatus('Loading Neural Networks...', 'var(--accent-primary)');
    loadProfiles();

    try {
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        
        modelsLoadedTime = true;
        updateStatus('Models Loaded. Requesting camera access...', 'var(--accent-primary)');
        startVideo();
    } catch (error) {
        console.error("Error loading models:", error);
        updateStatus('Failed to load models. Check internet connection.', 'var(--error)');
    }
}

function startVideo() {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(stream => {
            video.srcObject = stream;
        })
        .catch(err => {
            console.error("Error accessing webcam:", err);
            updateStatus('Webcam access denied or unavailable.', 'var(--error)');
        });
}

video.addEventListener('loadedmetadata', () => {
    setTimeout(() => {
        displaySize = { width: video.videoWidth, height: video.videoHeight };
        faceapi.matchDimensions(canvas, displaySize);
        updateStatus('System Ready. Position face to add profile.', 'var(--accent-primary)');
        btnSave.disabled = false;
    }, 100);
});

btnSave.addEventListener('click', async () => {
    if (!modelsLoadedTime) return;
    
    const studentName = nameInput.value.trim();
    const rollNumber = rollNumberInput.value.trim();
    if (!studentName || !rollNumber) {
        updateStatus('Please provide both Name and Roll Number.', 'var(--error)');
        if (!studentName) nameInput.focus();
        else rollNumberInput.focus();
        return;
    }

    btnSave.disabled = true;
    updateStatus('Analyzing face, please hold still...', 'var(--warning)');
    
    const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (detection) {
        const resizedDetection = faceapi.resizeResults(detection, displaySize);
        const box = resizedDetection.detection.box;
        
        ctx.strokeStyle = 'var(--success)';
        ctx.lineWidth = 3;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        
        // Save the raw descriptor array with ID, Name, and Roll Number
        savedProfiles.push({
            id: Date.now(),
            name: studentName,
            rollNumber: rollNumber,
            descriptor: Array.from(detection.descriptor)
        });
        saveToLocalStorage();
        
        updateStatus('Face profile saved successfully!', 'var(--success)');
        
        setTimeout(() => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            updateStatus('Ready for next profile.', 'var(--accent-primary)');
            btnSave.disabled = false;
            nameInput.value = '';
            rollNumberInput.value = ''; // clear input
        }, 2000);
        
    } else {
        updateStatus('No face detected. Ensure good lighting.', 'var(--error)');
        btnSave.disabled = false;
    }
});

init();
