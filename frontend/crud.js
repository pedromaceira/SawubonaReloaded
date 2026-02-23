// SE ENCARGA DE PROCESAR LA WEBCAM
const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const statusDiv = document.getElementById('status');
const resultsLog = document.getElementById('results-log');

let stream = null;
let intervalId = null;

// se enciende la cámara
startBtn.onclick = async () => {
    try {
        // se solicita acceso a la webcam
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusDiv.className = "alert alert-success";
        statusDiv.innerText = "Cámara activa - Analizando...";

        // cuando el video cargue sus metadatos, ajustamos el canvas
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            // se inicia el bucle de análisis cada 500ms (2 veces por segundo)
            intervalId = setInterval(capturarYAnalizar, 500);
        };
    } catch (err) {
        console.error("Error al acceder a la webcam: ", err);
        statusDiv.className = "alert alert-danger";
        statusDiv.innerText = "Error: No se pudo acceder a la cámara.";
    }
};

// se apaga la cámara
stopBtn.onclick = () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        clearInterval(intervalId);
        video.srcObject = null;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusDiv.className = "alert alert-secondary";
        statusDiv.innerText = "Cámara apagada.";
        // se limpia el canvas para que no se queden cuadros congelados
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
};

// se captura el frame, se envía al backend y se reciben datos
async function capturarYAnalizar() {
    if (!stream) return;

    // se crea un canvas invisible para extraer la foto actual
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const tempCtx = tempCanvas.getContext('2d');
    
    // se dibuja el frame actual del video en el canvas temporal
    tempCtx.drawImage(video, 0, 0);

    // se convierte a Base64 (JPEG al 80% para que la subida sea rápida)
    const base64Image = tempCanvas.toDataURL('image/jpeg', 0.8);

    try {
        const response = await fetch('http://127.0.0.1:8000/analizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_base64: base64Image })
        });

        if (!response.ok) throw new Error("Error en la respuesta del servidor");

        const data = await response.json();
        dibujarResultados(data.analisis);
    } catch (err) {
        console.error("Error en la conexión con el backend:", err);
    }
}

// se dibujan rectángulos y etiquetas con CORRECCIÓN DE ESPEJO
function dibujarResultados(analisis) {

    // se limpia el canvas anterior
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resultsLog.innerHTML = ""; 

    analisis.forEach(persona => {
        let [x1, y1, x2, y2] = persona.box;
        const emocion = persona.emotion;
        const confianza = (persona.confidence * 100).toFixed(1);

        /**
         EXPLICACIÓN CORRECCIÓN ESPEJO:
         Como el video tiene CSS 'transform: scaleX(-1)', lo vemos invertido.
         La IA detecta en la imagen original (no invertida).
         Restamos las coordenadas X del ancho total para que coincidan visualmente.
         */
        
        let x1_mirror = canvas.width - x2;
        let x2_mirror = canvas.width - x1;

        // se dibuja la bounding box
        ctx.strokeStyle = "#00FF00"; // Color verde neón
        ctx.lineWidth = 3;
        ctx.strokeRect(x1_mirror, y1, x2_mirror - x1_mirror, y2 - y1);

        // se dibuja el texto de la emoción
        ctx.fillStyle = "#00FF00";
        ctx.font = "bold 20px Arial";
        ctx.fillText(`${emocion} (${confianza}%)`, x1_mirror, y1 - 10);

        // se actualiza el panel lateral de resultados
        const p = document.createElement('p');
        p.className = "mb-1 border-bottom pb-1";
        p.innerHTML = `<strong>${emocion}</strong> <span class="badge bg-info text-dark">${confianza}%</span>`;
        resultsLog.appendChild(p);
    });
}