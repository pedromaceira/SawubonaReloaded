const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start-btn');
const startScreenBtn = document.getElementById('start-screen-btn'); 
const stopBtn = document.getElementById('stop-btn');
const btnExportarPDF = document.getElementById('btnExportarPDF');
const statusDiv = document.getElementById('status');
const faceFilter = document.getElementById('faceFilter');

const globalAnalyticsTable = document.getElementById('globalAnalyticsTable');
const overallSentimentText = document.getElementById('overallSentiment');
const faceCountBadge = document.getElementById('faceCount');

const discardedTable = document.getElementById('discardedTable');
const discardedCount = document.getElementById('discardedCount');
const UMBRAL_RUIDO_FRAMES = 3;
let carasFiltradas = {};

let chartGlobalInstance = null;
const mapaEmociones = { 'Felicidad': 6, 'Sorpresa': 5, 'Neutral': 4, 'Tristeza': 3, 'Miedo': 2, 'Disgusto': 1, 'Enfado': 0 };
const etiquetasEjeY = { 6: 'Felicidad', 5: 'Sorpresa', 4: 'Neutral', 3: 'Tristeza', 2: 'Miedo', 1: 'Disgusto', 0: 'Enfado' };
const emotionColors = {
    'Neutral': 'bg-secondary', 'Felicidad': 'bg-success', 'Tristeza': 'bg-info',
    'Sorpresa': 'bg-warning', 'Enfado': 'bg-danger', 'Miedo': 'bg-dark', 'Disgusto': 'bg-primary'
};

const toleranciasFrames = {
    'Sorpresa': 2, 'Miedo': 3, 'Disgusto': 3, 'Felicidad': 4,
    'Enfado': 4, 'Tristeza': 6, 'Neutral': 6
};
const MAX_BUFFER_SIZE = 6; 

let stream = null;
let intervalId = null; 
let enviando = false;
let sessionStartTime = null;
let sessionData = {}; 
let isScreenSharing = false; 

let globalBuffer = [];
let slotActivo = {
    emocionGlobal: null,
    startTime: null,
    emotionsPorCara: {} 
};
let timelineData = [];

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

async function iniciarSesion(usarPantalla = false) {
    try {
        try {
            await fetch('http://127.0.0.1:8000/reset', { method: 'POST' });
        } catch (e) { 
            console.warn("Aviso: No se pudo formatear el servidor."); 
        }

        isScreenSharing = usarPantalla;

        if (usarPantalla) {
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            video.style.transform = 'none';
            statusDiv.innerText = "Analizando Pantalla...";
        } else {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.style.transform = 'scaleX(-1)';
            statusDiv.innerText = "Analizando Webcam...";
        }
        
        video.srcObject = stream;
        
        startBtn.classList.add('d-none');
        startScreenBtn.classList.add('d-none');
        stopBtn.classList.remove('d-none');
        btnExportarPDF.classList.add('d-none');
        statusDiv.className = "badge bg-success ms-2 p-2 fs-6";
        
        sessionData = {};
        timelineData = [];
        globalBuffer = [];
        carasFiltradas = {};
        sessionStartTime = Date.now();
        slotActivo = { emocionGlobal: null, startTime: Date.now(), emotionsPorCara: {} };
        
        if (discardedTable) discardedTable.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-2">No se ha filtrado ruido aún</td></tr>';
        if (discardedCount) discardedCount.innerText = "0 descartes";

        if(faceFilter) faceFilter.innerHTML = '<option value="global">Global (Todas las caras)</option>';
        if (chartGlobalInstance) { chartGlobalInstance.destroy(); chartGlobalInstance = null; }

        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const container = document.querySelector('.video-container');
            container.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;

            intervalId = setInterval(capturarYAnalizar, 500);
        };

        stream.getVideoTracks()[0].onended = () => stopBtn.click();

    } catch (err) {
        console.error("Error de hardware/permisos: ", err);
        statusDiv.className = "badge bg-danger ms-2 p-2 fs-6";
        statusDiv.innerText = usarPantalla ? "Permiso de pantalla denegado." : "Error de cámara.";
    }
}

startBtn.onclick = () => iniciarSesion(false);
startScreenBtn.onclick = () => iniciarSesion(true);

function ejecutarFiltroDeRuido() {
    let ruidoDetectado = false;
    let carasInvalidas = [];

    Object.keys(sessionData).forEach(idCara => {
        const historial = sessionData[idCara];
        if (historial.length < UMBRAL_RUIDO_FRAMES) {
            carasFiltradas[idCara] = { frames: historial.length };
            carasInvalidas.push(idCara);
            delete sessionData[idCara];
            ruidoDetectado = true;
        }
    });

    if (!ruidoDetectado) return; 

    if (faceFilter) {
        Array.from(faceFilter.options).forEach(opt => {
            if (carasInvalidas.includes(opt.value)) faceFilter.removeChild(opt);
        });
        if (carasInvalidas.includes(faceFilter.value)) faceFilter.value = 'global'; 
    }

    timelineData.forEach(slot => {
        carasInvalidas.forEach(idCara => {
            if (slot.mods && slot.mods[idCara]) {
                delete slot.mods[idCara];
            }
        });
    });

    if (discardedTable && discardedCount) {
        discardedCount.innerText = `${Object.keys(carasFiltradas).length} descartes`;
        discardedTable.innerHTML = "";
        Object.keys(carasFiltradas).forEach(idCara => {
            const info = carasFiltradas[idCara];
            discardedTable.innerHTML += `<tr>
                <td class="fw-bold text-danger">${idCara}</td>
                <td class="small text-muted">Eliminada por ruido (${info.frames} frames)</td>
            </tr>`;
        });
    }

    actualizarTablaGlobal({}); 
    dibujarGraficoGlobal();
}

stopBtn.onclick = () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null; 
        
        clearInterval(intervalId);
        video.srcObject = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        startBtn.classList.remove('d-none');
        startScreenBtn.classList.remove('d-none');
        stopBtn.classList.add('d-none');
        btnExportarPDF.classList.remove('d-none');
        
        statusDiv.className = "badge bg-secondary ms-2 p-2 fs-6";
        statusDiv.innerText = "Sesión finalizada";

        if (slotActivo.emocionGlobal) {
            cerrarSlotYAbrirNuevo(slotActivo.emocionGlobal); 
        }

        ejecutarFiltroDeRuido();

        const segundosTotales = Math.floor((Date.now() - sessionStartTime) / 1000);
        const fechaActual = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit' });
        
        document.getElementById('pdfDate').innerText = `Fecha: ${fechaActual}`;
        document.getElementById('pdfDuration').innerText = `Duración de la sesión: ${formatTime(segundosTotales)}`;
        
        const totalCaras = Object.keys(sessionData).length;
        const totalDescartadas = Object.keys(carasFiltradas).length;
        const emocionGlobal = document.getElementById('overallSentiment').innerText;
        
        let textoRuido = totalDescartadas > 0 
            ? `<br><br><span class="text-danger">Nota de Calidad: El algoritmo purgó automáticamente ${totalDescartadas} rostros fantasma detectados como ruido de fondo o movimiento (menos de ${UMBRAL_RUIDO_FRAMES} frames).</span>` 
            : "";

        document.getElementById('pdfSummaryText').innerHTML = `
            Durante esta sesión en directo se rastrearon <strong>${totalCaras} perfiles biométricos</strong>. 
            La segmentación dinámica detectó los cambios bruscos de estado, ignorando las transiciones pasivas.
            El sentimiento global predominante fue <strong>"${emocionGlobal}"</strong>.
            ${textoRuido}
        `;
    }
};

btnExportarPDF.addEventListener('click', () => { window.print(); });

async function capturarYAnalizar() {
    if (!stream || enviando) return;
    enviando = true;

    const tempCanvas = document.createElement('canvas');
    
    const MAX_WIDTH = 480;
    const scale = Math.min(MAX_WIDTH / video.videoWidth, 1);
    
    tempCanvas.width = video.videoWidth * scale;
    tempCanvas.height = video.videoHeight * scale;
    
    tempCanvas.getContext('2d').drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    const base64Image = tempCanvas.toDataURL('image/jpeg', 0.5); 

    try {
        const response = await fetch('http://127.0.0.1:8000/analizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                image_base64: base64Image,
                is_screen_share: isScreenSharing
            })
        });
        
        if (!response.ok) throw new Error("Error en la respuesta del servidor");
        const data = await response.json();
        
        if (!stream) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return; 
        }

        const analisisEscalado = data.analisis.map(cara => ({
            ...cara,
            box: [
                cara.box[0] / scale,
                cara.box[1] / scale,
                cara.box[2] / scale,
                cara.box[3] / scale
            ]
        }));

        dibujarResultados(analisisEscalado);
    } catch (err) {
        console.error("Fallo de Inferencia Backend:", err);
    } finally {
        enviando = false;
    }
}

function dibujarResultados(analisis) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let carasEnPantalla = {}; 
    let emocionesGlobalesEsteFrame = [];

    analisis.forEach(persona => {
        let [x1, y1, x2, y2] = persona.box;
        const idCara = `Cara ${persona.id_tracking}`;
        const emocion = persona.emotion;

        emocionesGlobalesEsteFrame.push(emocion);

        if (!sessionData[idCara]) sessionData[idCara] = [];
        sessionData[idCara].push(emocion);
        
        if (!slotActivo.emotionsPorCara[idCara]) slotActivo.emotionsPorCara[idCara] = [];
        slotActivo.emotionsPorCara[idCara].push(emocion);
        if (!slotActivo.emotionsPorCara['global']) slotActivo.emotionsPorCara['global'] = [];
        slotActivo.emotionsPorCara['global'].push(emocion);

        carasEnPantalla[idCara] = emocion;

        let drawX = x1;
        let boxWidth = x2 - x1;

        if (!isScreenSharing) {
            drawX = canvas.width - x2;
        }

        ctx.strokeStyle = "#00FF00"; ctx.lineWidth = 3;
        ctx.strokeRect(drawX, y1, boxWidth, y2 - y1);
        ctx.fillStyle = "#00FF00"; ctx.font = "bold 16px Arial";
        ctx.fillText(idCara, drawX, y1 - 7);
    });

    actualizarTablaGlobal(carasEnPantalla);
    evaluarCambioEvento(emocionesGlobalesEsteFrame);
}

function evaluarCambioEvento(emocionesFrame) {
    if (emocionesFrame.length === 0) return;

    let modaInstantanea = calcularModa(emocionesFrame);
    
    globalBuffer.push(modaInstantanea);
    if (globalBuffer.length > MAX_BUFFER_SIZE) globalBuffer.shift();

    if (modaInstantanea === "-" || modaInstantanea === "Procesando...") return;

    let framesRequeridos = toleranciasFrames[modaInstantanea] || 6;

    if (globalBuffer.length < framesRequeridos) return;

    let bufferEvaluacion = globalBuffer.slice(-framesRequeridos);
    let modaSuavizada = calcularModa(bufferEvaluacion);

    if (modaSuavizada === modaInstantanea) {
        
        if (!slotActivo.emocionGlobal) {
            slotActivo.emocionGlobal = modaSuavizada;
            slotActivo.startTime = Date.now();
            avanzarGrafico(modaSuavizada, true); 
            return;
        }

        if (slotActivo.emocionGlobal !== modaSuavizada) {
            if (modaSuavizada !== "Neutral") {
                cerrarSlotYAbrirNuevo(modaSuavizada);
            }
        }
    }
}

function cerrarSlotYAbrirNuevo(nuevaEmocion) {
    let inicioRelativo = Math.floor((slotActivo.startTime - sessionStartTime) / 1000);
    let finRelativo = Math.floor((Date.now() - sessionStartTime) / 1000);
    
    if (finRelativo - inicioRelativo < 0.5) return;

    let etiquetaTime = `${formatTime(inicioRelativo)} a ${formatTime(finRelativo)}`;
    let bloqueCerrado = { label: etiquetaTime, mods: {} };
    
    Object.keys(slotActivo.emotionsPorCara).forEach(id => {
        bloqueCerrado.mods[id] = calcularModa(slotActivo.emotionsPorCara[id]);
    });
    
    if(faceFilter) {
        [...faceFilter.options].forEach(opt => {
            if(!bloqueCerrado.mods[opt.value]) bloqueCerrado.mods[opt.value] = "-";
        });
    }

    timelineData.push(bloqueCerrado);
    dibujarGraficoGlobal();

    slotActivo = {
        emocionGlobal: nuevaEmocion,
        startTime: Date.now(),
        emotionsPorCara: {}
    };
}

function avanzarGrafico(emocionArranque, isInitial = false) {
    if(isInitial) {
        timelineData.push({
            label: `Inicio`,
            mods: { 'global': emocionArranque }
        });
        dibujarGraficoGlobal();
    }
}

function actualizarTablaGlobal(carasEnPantalla = {}) {
    globalAnalyticsTable.innerHTML = "";
    let todasLasEmociones = [];
    
    Object.keys(sessionData).forEach(id => {
        if (faceFilter && ![...faceFilter.options].some(opt => opt.value === id)) {
            const newOption = document.createElement('option');
            newOption.value = id;
            newOption.innerText = id;
            faceFilter.appendChild(newOption);
        }

        const historial = sessionData[id];
        const moda = calcularModa(historial);
        todasLasEmociones.push(...historial);
        
        let badgeActual = `<span class="badge bg-light text-muted border">No visible</span>`;
        if (carasEnPantalla[id]) {
            const colorClase = emotionColors[carasEnPantalla[id]] || 'bg-primary';
            badgeActual = `<span class="badge ${colorClase}">${carasEnPantalla[id]}</span>`;
        }
        const colorModa = emotionColors[moda] || 'bg-secondary';

        globalAnalyticsTable.innerHTML += `<tr>
            <td class="fw-bold">${id}</td>
            <td>${badgeActual}</td>
            <td><span class="badge ${colorModa}">${moda}</span></td>
            <td class="text-muted small">${historial.length} frames</td>
        </tr>`;
    });
    
    if (todasLasEmociones.length > 0) overallSentimentText.innerText = calcularModa(todasLasEmociones);

    if (faceCountBadge) faceCountBadge.innerText = `${Object.keys(sessionData).length} caras`;
}

function calcularModa(arr) {
    if (!arr || arr.length === 0) return "-";
    const frecuencias = {};
    let maxFreq = 0, moda = arr[0];
    arr.forEach(val => {
        frecuencias[val] = (frecuencias[val] || 0) + 1;
        if (frecuencias[val] > maxFreq) { maxFreq = frecuencias[val]; moda = val; }
    });
    return moda;
}

function dibujarGraficoGlobal() {
    if (timelineData.length === 0) return;
    const ctxChart = document.getElementById('graficoGlobal').getContext('2d');
    const selectedFace = faceFilter ? faceFilter.value : 'global'; 

    const etiquetasX = timelineData.map(t => t.label);
    
    const datosReales = timelineData.map(t => {
        let emocionFinal = t.mods[selectedFace] || "-";
        return (emocionFinal !== "-" && mapaEmociones[emocionFinal] !== undefined) 
               ? mapaEmociones[emocionFinal] 
               : null;
    });

    if (chartGlobalInstance) chartGlobalInstance.destroy(); 

    const labelReal = selectedFace === 'global' ? 'Evolución de Sala (Eventos)' : `Emoción de ${selectedFace}`;

    chartGlobalInstance = new Chart(ctxChart, {
        type: 'line',
        data: {
            labels: etiquetasX,
            datasets: [
                {
                    label: labelReal,
                    data: datosReales,
                    borderColor: 'rgba(13, 110, 253, 1)', 
                    backgroundColor: 'rgba(13, 110, 253, 0.1)',
                    tension: 0.3, 
                    fill: true,
                    stepped: true,
                    pointBackgroundColor: 'rgba(13, 110, 253, 1)',
                    pointRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 0,
                    max: 6,
                    ticks: {
                        stepSize: 1,
                        callback: function(value) { return etiquetasEjeY[value] || ''; }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) { return context.dataset.label + ': ' + etiquetasEjeY[context.raw]; }
                    }
                }
            }
        }
    });
}