// scan.js
const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const statusText = document.getElementById('status-text');
const btnScan = document.getElementById('btn-scan');
const scanningBar = document.getElementById('scanning-bar');
const appContainer = document.querySelector('.app-container');
const presentListContainer = document.getElementById('present-list');
const presentCountText = document.getElementById('present-count');
const btnDownload = document.getElementById('btn-download');

let scanningInterval = null;
let modelsLoadedTime = false;
let displaySize = { width: 480, height: 360 };
let savedProfiles = []; // Array of { id, name, rollNumber, descriptor (Float32Array) }
let presentStudents = new Set();
let presentStudentsData = [];

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/vladmandic/face-api/model/';
const MATCH_THRESHOLD = 0.45;

function updateStatus(text, color) {
    statusText.textContent = text;
    statusText.style.color = color;
}

function loadProfiles() {
    const data = JSON.parse(localStorage.getItem('faceProfiles') || '[]');
    savedProfiles = data.map(p => ({
        ...p,
        descriptor: new Float32Array(p.descriptor)
    }));
}

function renderPresentList() {
    presentListContainer.innerHTML = '';
    presentCountText.textContent = presentStudentsData.length;

    if (presentStudentsData.length === 0) {
        presentListContainer.innerHTML = '<li><span class="profile-url" style="color: var(--text-secondary); width: 100%;">No students marked present yet.</span></li>';
        return;
    }

    presentStudentsData.forEach(student => {
        const li = document.createElement('li');
        li.className = 'profile-item';

        const span = document.createElement('span');
        span.className = 'profile-url';
        span.textContent = `${student.rollNumber} - ${student.name} (${student.time})`;

        const iconSpan = document.createElement('span');
        iconSpan.innerHTML = '✅';

        li.appendChild(span);
        li.appendChild(iconSpan);
        presentListContainer.appendChild(li);
    });
}

async function init() {
    updateStatus('Loading Neural Networks...', 'var(--accent-primary)');
    loadProfiles();
    renderPresentList();

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

        if (savedProfiles.length > 0) {
            updateStatus(`System Ready. ${savedProfiles.length} profiles loaded.`, 'var(--accent-primary)');
            btnScan.disabled = false;
        } else {
            updateStatus('No profiles found. Go to Manage Profiles.', 'var(--warning)');
            btnScan.disabled = true;
        }
    }, 100);
});

btnScan.addEventListener('click', () => {
    if (savedProfiles.length === 0) return;

    const isScanning = scanningBar.classList.contains('active');

    if (isScanning) {
        stopScanning();
        if (presentStudentsData.length > 0) {
            btnDownload.style.display = 'flex';
        }
    } else {
        btnDownload.style.display = 'none';
        startScanning();
    }
});

function startScanning() {
    scanningBar.classList.add('active');
    btnScan.innerHTML = '<span class="icon">⏹️</span> Stop Scan';
    btnScan.classList.replace('primary-btn', 'secondary-btn');
    btnScan.style.borderColor = 'var(--error)';
    btnScan.style.color = 'var(--error)';
    updateStatus('Scanning for authorization match...', 'var(--accent-secondary)');

    scanningInterval = setInterval(async () => {
        const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (detection) {
            const resizedDetection = faceapi.resizeResults(detection, displaySize);
            const box = resizedDetection.detection.box;

            // Find the best match among all profiles
            let bestMatch = null;
            let lowestDistance = Infinity;

            for (const profile of savedProfiles) {
                const distance = faceapi.euclideanDistance(profile.descriptor, detection.descriptor);
                if (distance < lowestDistance) {
                    lowestDistance = distance;
                    bestMatch = profile;
                }
            }

            if (bestMatch && lowestDistance < MATCH_THRESHOLD) {
                // Match confirmed!
                ctx.strokeStyle = 'var(--success)';
                ctx.lineWidth = 4;
                ctx.strokeRect(box.x, box.y, box.width, box.height);

                if (!presentStudents.has(bestMatch.id)) {
                    presentStudents.add(bestMatch.id);

                    // Add timestamp
                    const now = new Date();
                    bestMatch.time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                    presentStudentsData.push(bestMatch);
                    renderPresentList();
                    updateStatus(`Marked ${bestMatch.name} present!`, 'var(--success)');
                    appContainer.style.boxShadow = '0 0 50px rgba(0, 255, 102, 0.4)';

                    setTimeout(() => {
                        appContainer.style.boxShadow = '';
                    }, 1500);
                } else {
                    updateStatus(`${bestMatch.name} already marked present.`, 'var(--accent-primary)');
                    appContainer.style.boxShadow = '0 0 50px rgba(255, 204, 0, 0.2)';
                    setTimeout(() => {
                        appContainer.style.boxShadow = '';
                    }, 1500);
                }
            } else {
                ctx.strokeStyle = 'var(--error)';
                ctx.lineWidth = 2;
                ctx.strokeRect(box.x, box.y, box.width, box.height);
                updateStatus('Unrecognized face.', 'var(--error)');
            }
        } else {
            updateStatus('Position your face clearly in frame.', 'var(--accent-secondary)');
        }
    }, 400);
}

function stopScanning(isSuccess = false) {
    scanningBar.classList.remove('active');
    btnScan.innerHTML = '<span class="icon">🔍</span> Start Scan';
    btnScan.classList.replace('secondary-btn', 'primary-btn');
    btnScan.style.borderColor = '';
    btnScan.style.color = '';
    clearInterval(scanningInterval);

    if (!isSuccess) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        updateStatus('Scan cancelled. Ready.', 'var(--accent-primary)');
    }
}

btnDownload.addEventListener('click', () => {
    if (presentStudentsData.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,Name,Roll Number,Time\n";
    presentStudentsData.forEach(student => {
        csvContent += `"${student.name}","${student.rollNumber}","${student.time}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
    link.setAttribute("download", `attendance_${dateStr}_${timeStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

init();
