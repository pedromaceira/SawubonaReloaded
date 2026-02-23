// SE ENCARGA DE PROCESAR LOS VÍDEOS
const video = document.getElementById('videoPlayer');
const canvas = document.getElementById('videoOverlay');
const ctx = canvas.getContext('2d');
const videoInput = document.getElementById('videoInput');
const btnProcesar = document.getElementById('btnProcesar');
const currentFacesTable = document.getElementById('currentFacesTable');
const faceCountBadge = document.getElementById('faceCount');
const statusUpdate = document.getElementById('statusUpdate');

let isAnalyzing = false;
let knownFaces = {}; // Persistencia de caras

// se sincroniza el canvas con el tamaño real del video en pantalla
function sincronizarDimensiones() {
    if (video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.style.width = video.clientWidth + "px";
    canvas.style.height = video.clientHeight + "px";
    canvas.style.top = video.offsetTop + "px";
    canvas.style.left = video.offsetLeft + "px";
}

videoInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        video.src = URL.createObjectURL(file);
        btnProcesar.disabled = false;
        video.onloadedmetadata = sincronizarDimensiones;
        statusUpdate.innerText = "Vídeo listo para procesar.";
    }
};

window.onresize = sincronizarDimensiones;

btnProcesar.onclick = () => {
    if (!isAnalyzing) {
        video.play();
        isAnalyzing = true;
        btnProcesar.innerText = "Detener Análisis";
        btnProcesar.className = "btn btn-danger w-100";
        sincronizarDimensiones();
        procesarFrame();
    } else {
        video.pause();
        detenerAnalisis();
    }
};

function detenerAnalisis() {
    isAnalyzing = false;
    btnProcesar.innerText = "Iniciar Análisis";
    btnProcesar.className = "btn btn-primary w-100";
}

async function procesarFrame() {
    if (video.paused || video.ended || !isAnalyzing) {
        detenerAnalisis();
        return;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    tempCanvas.getContext('2d').drawImage(video, 0, 0);
    
    const base64Image = tempCanvas.toDataURL('image/jpeg', 0.6);

    try {
        const response = await fetch('http://127.0.0.1:8000/analizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_base64: base64Image })
        });

        const data = await response.json();
        actualizarSistema(data.analisis);

    } catch (err) { 
        console.error("Error en backend:", err); 
    }

    // intervalo de 150ms para permitir fluidez en el servidor local
    setTimeout(() => { 
        if(isAnalyzing) requestAnimationFrame(procesarFrame); 
    }, 150);
}

function actualizarSistema(analisis) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    faceCountBadge.innerText = `${analisis.length} Detectadas`;

    // se marcan todas las caras conocidas como "no visibles" temporalmente
    Object.keys(knownFaces).forEach(id => knownFaces[id].visible = false);

    analisis.forEach((det, index) => {
        const idCara = `Cara ${index + 1}`;
        
        // se actualizan datos de la cara
        knownFaces[idCara] = {
            emotion: det.emotion,
            confidence: det.confidence,
            lastSeen: Date.now(),
            visible: true
        };

        // dibujo en el Canvas (con id)
        const [x1, y1, x2, y2] = det.box;
        ctx.strokeStyle = "#00FF00";
        ctx.lineWidth = 1.5; 
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        
        ctx.fillStyle = "#00FF00";
        ctx.font = "bold 14px Arial";
        ctx.fillText(idCara, x1, y1 - 7);
    });

    renderizarTabla();
}

function renderizarTabla() {
    currentFacesTable.innerHTML = "";
    
    // se ordenan las caras por id
    const sortedIds = Object.keys(knownFaces).sort();

    sortedIds.forEach(id => {
        const f = knownFaces[id];
        // Si no se ve hace más de 1.5 segundos, la baja la opacidad
        const isOld = (Date.now() - f.lastSeen > 1500);
        const style = isOld ? "opacity: 0.4; background-color: #f1f1f1;" : "";
        const confPct = (f.confidence * 100).toFixed(0);

        const row = `<tr style="${style}">
            <td class="text-id">${id}</td>
            <td><span class="badge ${isOld ? 'bg-secondary' : 'bg-success'}">${f.emotion}</span></td>
            <td>
                <div class="progress" style="height: 15px;">
                    <div class="progress-bar" role="progressbar" style="width: ${confPct}%">
                        ${confPct}%
                    </div>
                </div>
            </td>
        </tr>`;
        currentFacesTable.innerHTML += row;
    });
}