const video = document.getElementById('videoPlayer');
const canvas = document.getElementById('videoOverlay');
const ctx = canvas.getContext('2d');
const videoInput = document.getElementById('videoInput');
const btnConfigurar = document.getElementById('btnConfigurar');
const btnPausar = document.getElementById('btnPausar');
const btnComenzarReal = document.getElementById('btnComenzarReal');
const btnExportarPDF = document.getElementById('btnExportarPDF');

const globalAnalyticsTable = document.getElementById('globalAnalyticsTable');
const overallSentimentText = document.getElementById('overallSentiment');
const faceCountBadge = document.getElementById('faceCount');
const slotsTable = document.getElementById('slotsTable');

const facesGalleryGrid = document.getElementById('facesGalleryGrid');
let avatarsPorCara = {};

let hashVideoActual = null; 
let nombreVideoActual = "";  
let correccionesActivas = []; 
let aplicarCorrecciones = false;

const discardedTable = document.getElementById('discardedTable');
const discardedCount = document.getElementById('discardedCount');
const UMBRAL_RUIDO_FRAMES = 3;
let carasFiltradas = {};

const currentTimeDisplay = document.getElementById('currentTimeDisplay');
const durationDisplay = document.getElementById('durationDisplay');
const videoProgressBar = document.getElementById('videoProgressBar');

const radioAuto = document.getElementById('modeAuto');
const radioCustom = document.getElementById('modeCustom');
const radioJson = document.getElementById('modeJson');
const customScriptContainer = document.getElementById('customScriptContainer');
const jsonScriptContainer = document.getElementById('jsonScriptContainer');
const customScriptInput = document.getElementById('customScriptInput');

const intervalsList = document.getElementById('intervalsList');
const btnAddInterval = document.getElementById('btnAddInterval');
const modalVideoDuration = document.getElementById('modalVideoDuration');
const scriptTimeline = document.getElementById('scriptTimeline');

const faceFilter = document.getElementById('faceFilter');
let chartGlobalInstance = null;
const mapaEmociones = { 'Felicidad': 6, 'Sorpresa': 5, 'Neutral': 4, 'Tristeza': 3, 'Miedo': 2, 'Disgusto': 1, 'Enfado': 0 };
const etiquetasEjeY = { 6: 'Felicidad', 5: 'Sorpresa', 4: 'Neutral', 3: 'Tristeza', 2: 'Miedo', 1: 'Disgusto', 0: 'Enfado' };

const emotionColors = {
    'Neutral': 'bg-secondary', 'Felicidad': 'bg-success', 'Tristeza': 'bg-info',
    'Sorpresa': 'bg-warning', 'Enfado': 'bg-danger', 'Miedo': 'bg-dark', 'Disgusto': 'bg-primary'
};

let isAnalyzing = false;
let enviando = false;
let sessionData = {};
let slotsData = [];
const DEFAULT_NUM_SLOTS = 10;

const panelCorreccion = document.getElementById('panelCorreccion');
const btnMarcarInicio = document.getElementById('btnMarcarInicio');
const btnMarcarFin = document.getElementById('btnMarcarFin');
const correccionInicio = document.getElementById('correccionInicio');
const correccionFin = document.getElementById('correccionFin');
const correccionCara = document.getElementById('correccionCara');
const correccionEmocion = document.getElementById('correccionEmocion');
const btnGuardarCorreccion = document.getElementById('btnGuardarCorreccion');
const correccionFeedback = document.getElementById('correccionFeedback');
const listaCorrecciones = document.getElementById('listaCorrecciones');
const borrarModalEl = document.getElementById('borrarCorreccionModal');
const borrarModal = borrarModalEl ? new bootstrap.Modal(borrarModalEl) : null;
const btnConfirmarBorrado = document.getElementById('btnConfirmarBorrado');
let idCorreccionABorrar = null;

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

async function calcularHashVideo(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const correccionesModalEl = document.getElementById('correccionesModal');
const correccionesModal = correccionesModalEl ? new bootstrap.Modal(correccionesModalEl) : null;
const correccionesCountSpan = document.getElementById('correccionesCount');
const btnAplicarCorrecciones = document.getElementById('btnAplicarCorrecciones');
const btnAnalizarDesdeCero = document.getElementById('btnAnalizarDesdeCero');

let resolverModalCorrecciones = null;

function preguntarCorrecciones(total) {
    return new Promise((resolve) => {
        if (!correccionesModal) { resolve(false); return; }
        correccionesCountSpan.innerText = total;
        resolverModalCorrecciones = resolve;
        correccionesModal.show();
    });
}

if (btnAplicarCorrecciones) {
    btnAplicarCorrecciones.addEventListener('click', () => {
        if (resolverModalCorrecciones) { resolverModalCorrecciones(true); resolverModalCorrecciones = null; }
        correccionesModal.hide();
    });
}
if (btnAnalizarDesdeCero) {
    btnAnalizarDesdeCero.addEventListener('click', () => {
        if (resolverModalCorrecciones) { resolverModalCorrecciones(false); resolverModalCorrecciones = null; }
        correccionesModal.hide();
    });
}
if (correccionesModalEl) {
    correccionesModalEl.addEventListener('hidden.bs.modal', () => {
        if (resolverModalCorrecciones) { resolverModalCorrecciones(false); resolverModalCorrecciones = null; }
    });
}


function actualizarSelectorCarasCorreccion() {
    if (!correccionCara) return;
    const seleccionActual = correccionCara.value;
    const ids = Object.keys(avatarsPorCara);
    correccionCara.innerHTML = "";
    if (ids.length === 0) {
        correccionCara.innerHTML = '<option value="">Sin caras detectadas</option>';
        return;
    }
    ids.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.innerText = id;
        correccionCara.appendChild(opt);
    });
    if (ids.includes(seleccionActual)) correccionCara.value = seleccionActual;
}

function actualizarEstadoPanelCorreccion() {
    if (!panelCorreccion) return;
    const hayCaras = Object.keys(avatarsPorCara).length > 0;
    if (!isAnalyzing && hayCaras) {
        panelCorreccion.style.display = "";
        actualizarSelectorCarasCorreccion();
        if (correccionInicio.value === "") correccionInicio.value = video.currentTime.toFixed(1);
        if (correccionFin.value === "") correccionFin.value = video.currentTime.toFixed(1);
        renderListaCorrecciones();
    } else {
        panelCorreccion.style.display = "none";
    }
}

// pinta el listado de correcciones guardadas del vídeo actual (inicio–fin / cara / emoción)
async function renderListaCorrecciones() {
    if (!listaCorrecciones || !hashVideoActual) return;
    try {
        const resp = await fetch(`http://127.0.0.1:8000/correcciones/${hashVideoActual}`);
        const datos = await resp.json();
        const items = datos.correcciones || [];

        if (items.length === 0) {
            listaCorrecciones.innerHTML = '<div class="text-muted small text-center py-2">Aún no hay correcciones guardadas para este vídeo</div>';
            return;
        }

        listaCorrecciones.innerHTML = items.map(c => {
            const colorClase = emotionColors[c.emocion_corregida] || 'bg-secondary';
            const cara = (c.id_tracking !== null && c.id_tracking !== undefined) ? `Cara ${c.id_tracking}` : 'Cara —';
            return `<div class="d-flex align-items-center justify-content-between border-bottom py-1">
                <span class="small fw-bold text-nowrap" style="color:#fd7e14;">${c.segundo_inicio.toFixed(1)}s – ${c.segundo_fin.toFixed(1)}s</span>
                <span class="small text-muted mx-2 text-nowrap">${cara}</span>
                <span class="badge ${colorClase}">${c.emocion_corregida}</span>
                <button class="btn btn-sm btn-link text-danger p-0 ms-2 btn-borrar-correccion" data-id="${c.id}" title="Borrar corrección">🗑</button>
            </div>`;
        }).join('');
    } catch (err) {
        console.warn("No se pudo cargar la lista de correcciones:", err);
    }
}

// borrado de correcciones (con confirmación en modal)
if (listaCorrecciones) {
    listaCorrecciones.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-borrar-correccion');
        if (!btn) return;
        idCorreccionABorrar = parseInt(btn.dataset.id);
        if (borrarModal) borrarModal.show();
    });
}

if (btnConfirmarBorrado) {
    btnConfirmarBorrado.addEventListener('click', async () => {
        if (idCorreccionABorrar === null) return;
        try {
            const resp = await fetch(`http://127.0.0.1:8000/correcciones/${idCorreccionABorrar}`, { method: 'DELETE' });
            if (!resp.ok) throw new Error("Respuesta no OK del servidor");
            console.log(`Corrección ${idCorreccionABorrar} borrada.`);

            if (hashVideoActual) {
                try {
                    const r2 = await fetch('http://127.0.0.1:8000/correcciones/cargar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hash_video: hashVideoActual })
                    });
                    const d2 = await r2.json();
                    console.log(`Correcciones recargadas en el servidor: ${d2.total}`);
                } catch (e) {
                    console.warn("No se pudieron recargar las correcciones tras borrar.", e);
                }
            }

            renderListaCorrecciones();
        } catch (err) {
            console.error("Error borrando la corrección:", err);
        } finally {
            idCorreccionABorrar = null;
            if (borrarModal) borrarModal.hide();
        }
    });
}

// si se cierra el modal sin confirmar, se limpia la selección
if (borrarModalEl) {
    borrarModalEl.addEventListener('hidden.bs.modal', () => { idCorreccionABorrar = null; });
}

if (btnMarcarInicio) btnMarcarInicio.addEventListener('click', () => { correccionInicio.value = video.currentTime.toFixed(1); });
if (btnMarcarFin) btnMarcarFin.addEventListener('click', () => { correccionFin.value = video.currentTime.toFixed(1); });

if (btnGuardarCorreccion) {
    btnGuardarCorreccion.addEventListener('click', async () => {
        correccionFeedback.innerText = "";
        correccionFeedback.className = "small mt-2";

        if (!hashVideoActual) {
            correccionFeedback.className = "small mt-2 text-danger";
            correccionFeedback.innerText = "No hay vídeo cargado.";
            return;
        }

        const inicio = parseFloat(correccionInicio.value);
        const fin = parseFloat(correccionFin.value);
        const caraSel = correccionCara.value;
        const emocion = correccionEmocion.value;

        if (isNaN(inicio) || isNaN(fin) || inicio < 0 || fin <= inicio) {
            correccionFeedback.className = "small mt-2 text-danger";
            correccionFeedback.innerText = "Rango de tiempo no válido (el inicio debe ser menor que el fin).";
            return;
        }
        if (video.duration && fin > video.duration) {
            correccionFeedback.className = "small mt-2 text-danger";
            correccionFeedback.innerText = `El fin (${fin}s) excede la duración del vídeo (${video.duration.toFixed(1)}s).`;
            return;
        }
        if (!caraSel) {
            correccionFeedback.className = "small mt-2 text-danger";
            correccionFeedback.innerText = "Selecciona una cara.";
            return;
        }

        const idTracking = parseInt(caraSel.match(/\d+/)[0]);

        try {
            const resp = await fetch('http://127.0.0.1:8000/correcciones/guardar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hash_video: hashVideoActual,
                    nombre_original: nombreVideoActual,
                    duracion: video.duration || 0.0,
                    id_tracking: idTracking,
                    segundo_inicio: inicio,
                    segundo_fin: fin,
                    emocion_corregida: emocion
                })
            });

            if (resp.status === 404) {
                correccionFeedback.className = "small mt-2 text-danger";
                correccionFeedback.innerText = "Esa cara ya no está en memoria del servidor. Vuelve a analizar el vídeo antes de corregir.";
                return;
            }
            if (!resp.ok) throw new Error("Respuesta no OK del servidor");

            const data = await resp.json();

            try {
                const r2 = await fetch('http://127.0.0.1:8000/correcciones/cargar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hash_video: hashVideoActual })
                });
                const d2 = await r2.json();
                aplicarCorrecciones = true;
                console.log(`Correcciones recargadas en el servidor: ${d2.total}`);
            } catch (e) {
                console.warn("No se pudieron recargar las correcciones en el servidor.", e);
            }

            correccionFeedback.className = "small mt-2 text-success";
            correccionFeedback.innerText = `Corrección guardada (#${data.id_correccion}). Para que afecte a todas las métricas, vuelve a analizar el vídeo.`;
            renderListaCorrecciones();
        } catch (err) {
            console.error("Error guardando la corrección:", err);
            correccionFeedback.className = "small mt-2 text-danger";
            correccionFeedback.innerText = "Error guardando la corrección. Revisa la consola.";
        }
    });
}

video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    currentTimeDisplay.innerText = formatTime(video.currentTime);
    const progressPct = (video.currentTime / video.duration) * 100;
    videoProgressBar.style.width = `${progressPct}%`;
});

radioAuto.addEventListener('change', () => {
    customScriptContainer.classList.add('d-none');
    jsonScriptContainer.classList.add('d-none');
});

radioCustom.addEventListener('change', () => {
    customScriptContainer.classList.remove('d-none');
    jsonScriptContainer.classList.add('d-none');
    if (intervalsList.children.length === 0) btnAddInterval.click();
    actualizarTimeline();
});

radioJson.addEventListener('change', () => {
    customScriptContainer.classList.add('d-none');
    jsonScriptContainer.classList.remove('d-none');
});

intervalsList.addEventListener('input', actualizarTimeline);
intervalsList.addEventListener('change', actualizarTimeline);

btnAddInterval.addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'row g-2 mb-2 align-items-center interval-row';
    const maxDur = video.duration ? video.duration.toFixed(1) : 0;
    row.innerHTML = `
        <div class="col-3"><input type="number" class="form-control form-control-sm start-time" placeholder="Inicio" min="0" max="${maxDur}"></div>
        <div class="col-3"><input type="number" class="form-control form-control-sm end-time" placeholder="Fin" min="0" max="${maxDur}"></div>
        <div class="col-5">
            <select class="form-select form-select-sm expected-emotion">
                <option value="Neutral">Neutral</option><option value="Felicidad">Felicidad</option>
                <option value="Tristeza">Tristeza</option><option value="Sorpresa">Sorpresa</option>
                <option value="Enfado">Enfado</option><option value="Miedo">Miedo</option><option value="Disgusto">Disgusto</option>
            </select>
        </div>
        <div class="col-1 text-end"><button type="button" class="btn btn-sm btn-outline-danger btn-remove-interval" title="Eliminar">✖</button></div>
    `;
    intervalsList.appendChild(row);
});

intervalsList.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-remove-interval')) {
        e.target.closest('.interval-row').remove();
        actualizarTimeline();
    }
});

function actualizarTimeline() {
    const duration = video.duration || 1;
    const rows = document.querySelectorAll('.interval-row');
    let validIntervals = [];

    rows.forEach(row => {
        const start = parseFloat(row.querySelector('.start-time').value);
        const end = parseFloat(row.querySelector('.end-time').value);
        const emotion = row.querySelector('.expected-emotion').value;
        if (!isNaN(start) && !isNaN(end) && start < end) validIntervals.push({ start, end, emotion });
    });

    validIntervals.sort((a, b) => a.start - b.start);
    scriptTimeline.innerHTML = '';

    if (validIntervals.length === 0) {
        scriptTimeline.innerHTML = '<div class="progress-bar bg-secondary opacity-50 w-100" style="font-size: 0.8rem;">Añade intervalos válidos</div>';
        return;
    }

    let currentSec = 0;
    validIntervals.forEach(inv => {
        if (inv.start > currentSec) {
            const gapPct = ((inv.start - currentSec) / duration) * 100;
            if (gapPct > 0) scriptTimeline.innerHTML += `<div class="progress-bar bg-transparent text-dark border-bottom" style="width: ${gapPct}%; font-size: 0.7rem;"></div>`;
        }
        let actualStart = Math.max(currentSec, inv.start);
        let actualEnd = Math.min(inv.end, duration);
        if (actualEnd > actualStart) {
            const pct = ((actualEnd - actualStart) / duration) * 100;
            const colorClass = emotionColors[inv.emotion] || 'bg-primary';
            scriptTimeline.innerHTML += `<div class="progress-bar ${colorClass} overflow-hidden text-truncate px-1" style="width: ${pct}%; font-size: 0.8rem; font-weight:bold;">${inv.emotion}</div>`;
        }
        currentSec = actualEnd;
    });
}

function sincronizarDimensiones() {
    if (video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.style.width = video.clientWidth + "px";
    canvas.style.height = video.clientHeight + "px";
    canvas.style.top = video.offsetTop + "px";
    canvas.style.left = video.offsetLeft + "px";
}

window.onresize = sincronizarDimensiones;

if (faceFilter) {
    faceFilter.addEventListener('change', dibujarGraficoGlobal);
}

btnExportarPDF.addEventListener('click', () => {
    window.print();
});

videoInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
        isAnalyzing = false;
        enviando = false;
        video.pause();
        video.controls = false;

        btnPausar.className = "btn btn-warning d-none";
        btnPausar.innerHTML = "Pausar";
        btnConfigurar.classList.remove('d-none');
        btnConfigurar.disabled = false;

        btnExportarPDF.classList.add('d-none');

        sessionData = {};
        slotsData = [];
        carasFiltradas = {};
        avatarsPorCara = {};

        hashVideoActual = null;
        nombreVideoActual = file.name;
        correccionesActivas = [];
        aplicarCorrecciones = false;

        if (panelCorreccion) panelCorreccion.style.display = "none";
        if (correccionInicio) correccionInicio.value = "";
        if (correccionFin) correccionFin.value = "";
        if (correccionFeedback) correccionFeedback.innerText = "";
        if (listaCorrecciones) listaCorrecciones.innerHTML = '<div class="text-muted small text-center py-2">Aún no hay correcciones guardadas para este vídeo</div>';

        if (facesGalleryGrid) {
            facesGalleryGrid.innerHTML = '<div class="col-12 text-center text-muted py-3">Aún no se han detectado caras</div>';
        }

        globalAnalyticsTable.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Sin datos acumulados</td></tr>';
        slotsTable.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Configura el análisis para ver los slots</td></tr>';

        if (discardedTable) discardedTable.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-2">No se ha filtrado ruido aún</td></tr>';
        if (discardedCount) discardedCount.innerText = "0 descartes";

        overallSentimentText.innerText = "-";
        faceCountBadge.innerText = "0 Caras";

        if (faceFilter) {
            faceFilter.innerHTML = '<option value="global">Global (Todas las caras)</option>';
        }

        if (chartGlobalInstance) {
            chartGlobalInstance.destroy();
            chartGlobalInstance = null;
        }

        if (canvas.width > 0 && canvas.height > 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        video.src = URL.createObjectURL(file);
        video.onloadedmetadata = () => {
            sincronizarDimensiones();
            durationDisplay.innerText = formatTime(video.duration);
            currentTimeDisplay.innerText = "00:00";
            videoProgressBar.style.width = "0%";
            modalVideoDuration.innerText = video.duration.toFixed(1);

            intervalsList.innerHTML = '';
            scriptTimeline.innerHTML = '<div class="progress-bar bg-secondary opacity-50 w-100" style="font-size: 0.8rem;">Añade intervalos abajo</div>';
        };

        try {
            hashVideoActual = await calcularHashVideo(file);
            console.log("Hash del vídeo:", hashVideoActual);

            const resp = await fetch(`http://127.0.0.1:8000/correcciones/${hashVideoActual}`);
            const datos = await resp.json();

            if (datos.existe) {
                const aplicar = await preguntarCorrecciones(datos.total);

                if (aplicar) {
                    aplicarCorrecciones = true;
                    correccionesActivas = datos.correcciones;
                    console.log(`Se aplicarán ${correccionesActivas.length} correcciones.`);
                } else {
                    aplicarCorrecciones = false;
                    correccionesActivas = [];
                    console.log("El usuario eligió analizar desde cero.");
                }
            } else {
                console.log("Este vídeo no tiene correcciones previas.");
            }
        } catch (err) {
            console.warn("No se pudo consultar correcciones previas:", err);
        }
    }
};

function inicializarSlots() {
    slotsData = [];
    sessionData = {};
    const duration = video.duration;

    const pushSlot = (id, start, end, expected) => {
        slotsData.push({
            id: id, start: start, end: end, expected: expected,
            emotions: [],
            emotionsPorCara: {},
            moda: "Procesando...", finished: false
        });
    };

    if (radioAuto.checked) {
        const slotDuration = duration / DEFAULT_NUM_SLOTS;
        for (let i = 0; i < DEFAULT_NUM_SLOTS; i++) {
            pushSlot(i + 1, i * slotDuration, (i + 1) * slotDuration, "-");
        }
    }
    else if (radioCustom.checked) {
        const rows = document.querySelectorAll('.interval-row');
        if (rows.length === 0) { alert("Añade al menos un intervalo de tiempo."); return false; }
        let tempIntervals = [];
        let hasError = false;

        rows.forEach((row, rowIndex) => {
            if (hasError) return;
            const start = parseFloat(row.querySelector('.start-time').value);
            const end = parseFloat(row.querySelector('.end-time').value);
            const expected = row.querySelector('.expected-emotion').value;

            if (isNaN(start) || isNaN(end) || start >= end) {
                alert(`Fila ${rowIndex + 1}: El inicio debe ser menor que el fin.`); hasError = true; return;
            }
            if (end > duration) {
                alert(`Fila ${rowIndex + 1}: El final (${end}s) excede el vídeo (${duration.toFixed(1)}s).`); hasError = true; return;
            }
            for (let i = 0; i < tempIntervals.length; i++) {
                const existing = tempIntervals[i];
                if (Math.max(start, existing.start) < Math.min(end, existing.end)) {
                    alert(`Solapamiento: Fila ${rowIndex + 1} se solapa con el intervalo anterior.`); hasError = true; return;
                }
            }
            tempIntervals.push({ start, end, expected });
        });
        if (hasError) return false;
        tempIntervals.sort((a, b) => a.start - b.start);
        tempIntervals.forEach((item, index) => {
            pushSlot(index + 1, item.start, item.end, item.expected);
        });
    }
    else if (radioJson.checked) {
        try {
            const guion = JSON.parse(customScriptInput.value);
            let tempIntervals = [];
            let hasError = false;

            guion.forEach((item, index) => {
                if (hasError) return;
                const start = parseFloat(item.start);
                const end = parseFloat(item.end);
                const expected = item.expected;

                if (isNaN(start) || isNaN(end) || start >= end) {
                    alert(`Error en JSON (Bloque ${index + 1}): El inicio debe ser menor que el fin.`);
                    hasError = true; return;
                }
                if (end > duration) {
                    alert(`Error en JSON: El final (${end}s) excede la duración del vídeo (${duration.toFixed(1)}s).`);
                    hasError = true; return;
                }
                for (let i = 0; i < tempIntervals.length; i++) {
                    const existing = tempIntervals[i];
                    if (Math.max(start, existing.start) < Math.min(end, existing.end)) {
                        alert(`Solapamiento en JSON: El bloque ${index + 1} choca con otro tiempo.`);
                        hasError = true; return;
                    }
                }
                tempIntervals.push({ start, end, expected });
            });

            if (hasError) return false;

            tempIntervals.sort((a, b) => a.start - b.start);
            tempIntervals.forEach((item, index) => {
                pushSlot(index + 1, item.start, item.end, item.expected);
            });

        } catch (error) {
            alert("Error en el formato JSON. Revisa las llaves, comillas y comas.\n\n" + error.message);
            return false;
        }
    }

    renderizarTablaSlots();
    return true;
}

btnComenzarReal.onclick = async () => {
    if (inicializarSlots()) {
        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('configModal'));
        modalInstance.hide();

        btnConfigurar.classList.add('d-none');
        btnPausar.className = "btn btn-warning";
        btnPausar.innerHTML = "Pausar";

        if (panelCorreccion) panelCorreccion.style.display = "none";
        video.controls = false;

        try {
            await fetch('http://127.0.0.1:8000/reset', { method: 'POST' });
            console.log("Memoria biométrica del servidor formateada.");
        } catch (error) {
            console.error("No se pudo contactar con /reset en el servidor.", error);
        }

        if (aplicarCorrecciones && hashVideoActual) {
            try {
                const resp = await fetch('http://127.0.0.1:8000/correcciones/cargar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hash_video: hashVideoActual })
                });
                const data = await resp.json();
                console.log(`Correcciones cargadas en el servidor: ${data.total}`);
            } catch (error) {
                console.error("No se pudieron cargar las correcciones en el servidor.", error);
            }
        }

        video.play();
        isAnalyzing = true;
        procesarFrame();
    }
};

btnPausar.onclick = () => {
    if (isAnalyzing) {
        video.pause();
        isAnalyzing = false;
        btnPausar.innerHTML = "Reanudar";
        btnPausar.className = "btn btn-success";
        actualizarEstadoPanelCorreccion();
    } else {
        video.play();
        isAnalyzing = true;
        btnPausar.innerHTML = "Pausar";
        btnPausar.className = "btn btn-warning";
        if (panelCorreccion) panelCorreccion.style.display = "none";
        procesarFrame();
    }
};

function ejecutarFiltroDeRuido() {
    let ruidoDetectado = false;
    let carasInvalidas = [];

    Object.keys(sessionData).forEach(idCara => {
        const historial = sessionData[idCara];
        if (historial.length < UMBRAL_RUIDO_FRAMES) {
            carasFiltradas[idCara] = {
                frames: historial.length
            };
            carasInvalidas.push(idCara);
            delete sessionData[idCara];
            ruidoDetectado = true;
        }
    });

    if (!ruidoDetectado) return;

    if (faceFilter) {
        Array.from(faceFilter.options).forEach(opt => {
            if (carasInvalidas.includes(opt.value)) {
                faceFilter.removeChild(opt);
            }
        });
        if (carasInvalidas.includes(faceFilter.value)) {
            faceFilter.value = 'global';
        }
    }

    slotsData.forEach(slot => {
        carasInvalidas.forEach(idCara => {
            if (slot.emotionsPorCara[idCara]) {
                delete slot.emotionsPorCara[idCara];
            }
        });

        let emocionesValidas = [];
        Object.values(slot.emotionsPorCara).forEach(historialCara => {
            emocionesValidas.push(...historialCara);
        });
        slot.emotions = emocionesValidas;

        if (slot.finished) {
            slot.moda = calcularModa(emocionesValidas);
        }
    });

    if (discardedTable && discardedCount) {
        discardedCount.innerText = `${Object.keys(carasFiltradas).length} descartes`;
        discardedTable.innerHTML = "";
        Object.keys(carasFiltradas).forEach(idCara => {
            const info = carasFiltradas[idCara];
            discardedTable.innerHTML += `<tr>
                <td class="fw-bold text-danger">${idCara}</td>
                <td class="small text-muted">Eliminada por ruido (${info.frames} frames de aparición)</td>
            </tr>`;
        });
    }

    renderizarAnaliticaGlobal({});
    renderizarTablaSlots();
}

video.onended = () => {
    isAnalyzing = false;
    btnPausar.className = "btn btn-warning d-none";
    btnConfigurar.classList.remove('d-none');
    btnExportarPDF.classList.remove('d-none');

    finalizarUltimoSlot();

    ejecutarFiltroDeRuido();

    video.controls = true;
    actualizarEstadoPanelCorreccion();

    const fechaActual = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('pdfDate').innerText = `Fecha: ${fechaActual}`;
    document.getElementById('pdfDuration').innerText = `Duración analizada: ${formatTime(video.duration)}`;

    const totalCaras = Object.keys(sessionData).length;
    const totalDescartadas = Object.keys(carasFiltradas).length;
    const emocionGlobal = document.getElementById('overallSentiment').innerText;

    let textoRuido = totalDescartadas > 0
        ? `<br><span class="text-danger">Nota de Calidad: El algoritmo purgó automáticamente ${totalDescartadas} rostros fantasma detectados como ruido de fondo o movimiento (menos de ${UMBRAL_RUIDO_FRAMES} frames).</span>`
        : "";

    document.getElementById('pdfSummaryText').innerHTML = `
        En este análisis se identificaron y analizaron <strong>${totalCaras} rostros</strong> distintos en la escena. 
        El motor de IA determinó que el sentimiento global predominante del evento fue <strong>"${emocionGlobal}"</strong>. 
        A continuación, se presentan las gráficas y métricas detalladas, mostrando el nivel de coincidencia entre la curva emocional esperada (guion) y las reacciones reales detectadas.
        ${textoRuido}
    `;
};

async function procesarFrame() {
    if (video.paused || video.ended || !isAnalyzing) return;

    if (enviando) {
        requestAnimationFrame(procesarFrame);
        return;
    }

    enviando = true;

    const tempCanvas = document.createElement('canvas');
    const MAX_WIDTH = 640;
    const scale = Math.min(MAX_WIDTH / video.videoWidth, 1);

    tempCanvas.width = video.videoWidth * scale;
    tempCanvas.height = video.videoHeight * scale;

    tempCanvas.getContext('2d').drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    const base64Image = tempCanvas.toDataURL('image/jpeg', 0.6);

    try {
        const response = await fetch('http://127.0.0.1:8000/analizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_base64: base64Image, tiempo_actual: video.currentTime })
        });

        if (!response.ok) throw new Error("Error en la respuesta del servidor");

        const data = await response.json();

        const analisisEscalado = data.analisis.map(cara => ({
            ...cara,
            box: [
                cara.box[0] / scale,
                cara.box[1] / scale,
                cara.box[2] / scale,
                cara.box[3] / scale
            ]
        }));

        if (isAnalyzing) {
            actualizarInterfaz(analisisEscalado, video.currentTime);
        }
    } catch (err) {
        console.error("Error conectando con el CESGA:", err);
    } finally {
        enviando = false;
        requestAnimationFrame(procesarFrame);
    }
}

function actualizarInterfaz(analisis, currentTime) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    faceCountBadge.innerText = `${Object.keys(sessionData).length} Caras detectadas`;

    let currentSlot = slotsData.find(s => currentTime >= s.start && currentTime < s.end);
    let carasEnPantalla = {};

    let hayNuevaCara = false;

    analisis.forEach((det, index) => {
        const idCara = `Cara ${det.id_tracking}`;

        if (!sessionData[idCara]) sessionData[idCara] = [];
        sessionData[idCara].push(det.emotion);

        if (det.avatar) {
            avatarsPorCara[idCara] = det.avatar;
            hayNuevaCara = true;
        }

        if (currentSlot) {
            currentSlot.emotions.push(det.emotion);
            if (!currentSlot.emotionsPorCara[idCara]) currentSlot.emotionsPorCara[idCara] = [];
            currentSlot.emotionsPorCara[idCara].push(det.emotion);
        }

        carasEnPantalla[idCara] = det.emotion;

        const [x1, y1, x2, y2] = det.box;
        const color = det.corregido ? "#FFA500" : "#00FF00";
        const etiqueta = det.corregido ? `${idCara} (corregido)` : idCara;
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx.fillStyle = color; ctx.font = "bold 16px Arial"; ctx.fillText(etiqueta, x1, y1 - 7);
    });

    if (hayNuevaCara) renderizarGaleriaCaras();

    renderizarAnaliticaGlobal(carasEnPantalla);
    evaluarProgresoSlots(currentTime);
}

function renderizarAnaliticaGlobal(carasEnPantalla = {}) {
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

function evaluarProgresoSlots(currentTime) {
    let necesitaRender = false;
    slotsData.forEach(slot => {
        if (currentTime >= slot.end && !slot.finished) {
            slot.finished = true;
            slot.moda = calcularModa(slot.emotions);
            necesitaRender = true;
        }
    });
    if (necesitaRender) renderizarTablaSlots();
}

function finalizarUltimoSlot() {
    const currentTime = video.currentTime;
    let currentSlot = slotsData.find(s => currentTime >= s.start && currentTime < s.end);
    if (!currentSlot && slotsData.length > 0) currentSlot = slotsData[slotsData.length - 1];

    if (currentSlot && !currentSlot.finished) {
        currentSlot.finished = true;
        currentSlot.moda = calcularModa(currentSlot.emotions);
        renderizarTablaSlots();
    }
}

function dibujarGraficoGlobal() {
    if (slotsData.length === 0) return;
    const ctxChart = document.getElementById('graficoGlobal').getContext('2d');
    const selectedFace = faceFilter ? faceFilter.value : 'global';

    const etiquetasX = slotsData.map(s => `${s.start.toFixed(0)}s - ${s.end.toFixed(0)}s`);
    const datosGuion = slotsData.map(s => s.expected !== "-" && mapaEmociones[s.expected] !== undefined ? mapaEmociones[s.expected] : null);

    const datosReales = slotsData.map(s => {
        if (!s.finished) return null;

        let emocionFinal = "-";
        if (selectedFace === 'global') {
            emocionFinal = s.moda;
        } else {
            const emocionesDeEstaPersona = s.emotionsPorCara[selectedFace] || [];
            emocionFinal = calcularModa(emocionesDeEstaPersona);
        }

        return (emocionFinal !== "-" && emocionFinal !== "Procesando..." && mapaEmociones[emocionFinal] !== undefined)
            ? mapaEmociones[emocionFinal]
            : null;
    });

    if (chartGlobalInstance) chartGlobalInstance.destroy();

    const labelReal = selectedFace === 'global' ? 'Moda Global (Real)' : `Emoción de ${selectedFace}`;

    chartGlobalInstance = new Chart(ctxChart, {
        type: 'line',
        data: {
            labels: etiquetasX,
            datasets: [
                {
                    label: 'Guion (Esperado)',
                    data: datosGuion,
                    borderColor: 'rgba(100, 100, 100, 0.5)',
                    borderDash: [5, 5],
                    tension: 0.1,
                    fill: false,
                    pointBackgroundColor: 'rgba(100, 100, 100, 0.5)'
                },
                {
                    label: labelReal,
                    data: datosReales,
                    borderColor: 'rgba(13, 110, 253, 1)',
                    backgroundColor: 'rgba(13, 110, 253, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: 'rgba(13, 110, 253, 1)',
                    pointRadius: 4
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

function renderizarGaleriaCaras() {
    if (!facesGalleryGrid) return;
    facesGalleryGrid.innerHTML = "";

    const ids = Object.keys(avatarsPorCara);
    if (ids.length === 0) {
        facesGalleryGrid.innerHTML = '<div class="col-12 text-center text-muted py-3">Aún no se han detectado caras</div>';
        return;
    }

    ids.forEach(id => {
        facesGalleryGrid.innerHTML += `
            <div class="col-auto text-center mb-2">
                <img src="${avatarsPorCara[id]}" style="width: 85px; height: 85px; border-radius: 8px; object-fit: cover; border: 2px solid #6f42c1; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div class="small fw-bold mt-1 text-dark">${id}</div>
            </div>
        `;
    });

    actualizarSelectorCarasCorreccion();
}

function renderizarTablaSlots() {
    slotsTable.innerHTML = "";
    if (slotsData.length === 0) return;

    slotsData.forEach(slot => {
        const startSec = slot.start.toFixed(1);
        const endSec = slot.end.toFixed(1);
        const opacityClass = slot.finished ? "" : "text-muted opacity-50";
        const realBadgeClass = slot.finished ? "bg-primary" : "bg-secondary";

        const expectedBadge = slot.expected !== "-"
            ? `<span class="badge bg-dark border border-light">${slot.expected}</span>`
            : `<span class="text-muted">-</span>`;

        let coincidenciaHtml = `<span class="text-muted">-</span>`;

        if (slot.finished && slot.expected !== "-") {
            const totalFrames = slot.emotions.length;
            if (totalFrames > 0) {
                const expectedCount = slot.emotions.filter(e => e === slot.expected).length;
                const matchPct = ((expectedCount / totalFrames) * 100).toFixed(0);

                let badgeColor = "bg-danger";
                if (matchPct >= 60) badgeColor = "bg-success";
                else if (matchPct >= 30) badgeColor = "bg-warning text-dark";

                coincidenciaHtml = `<span class="badge ${badgeColor}">${matchPct}%</span>`;
            } else {
                coincidenciaHtml = `<span class="badge bg-secondary">0%</span>`;
            }
        }

        slotsTable.innerHTML += `<tr class="${opacityClass}">
            <td class="fw-bold">#${slot.id}</td>
            <td class="small">${startSec}s - ${endSec}s</td>
            <td>${expectedBadge}</td>
            <td><span class="badge ${realBadgeClass}">${slot.moda}</span></td>
            <td>${coincidenciaHtml}</td>
        </tr>`;
    });

    dibujarGraficoGlobal();
}