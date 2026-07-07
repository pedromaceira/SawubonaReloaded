const video = document.getElementById('videoPlayer');
const canvas = document.getElementById('videoOverlay');
const ctx = canvas.getContext('2d');
const videoInput = document.getElementById('videoInput');
const btnConfigurar = document.getElementById('btnConfigurar');
const btnPausar = document.getElementById('btnPausar');
const btnComenzarReal = document.getElementById('btnComenzarReal');
const btnExportarPDF = document.getElementById('btnExportarPDF');
const btnGuardarSesion = document.getElementById('btnGuardarSesion');

const globalAnalyticsTable = document.getElementById('globalAnalyticsTable');
const overallSentimentText = document.getElementById('overallSentiment');
const faceCountBadge = document.getElementById('faceCount');
const slotsTable = document.getElementById('slotsTable');

const facesGalleryGrid = document.getElementById('facesGalleryGrid');
let avatarsPorCara = {};

let hashVideoActual = null;
let nombreVideoActual = "";
let sessionIdActual = null;

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
let sesionTerminada = false;
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

function parseTimeInput(str) {
    if (str === null || str === undefined) return NaN;
    const limpio = String(str).trim();
    if (limpio === "") return NaN;
    if (limpio.includes(":")) {
        const partes = limpio.split(":");
        if (partes.length !== 2) return NaN;
        const min = parseInt(partes[0], 10);
        const seg = parseFloat(partes[1].replace(',', '.'));
        if (isNaN(min) || isNaN(seg) || min < 0 || seg < 0 || seg >= 60) return NaN;
        return min * 60 + seg;
    }
    const val = parseFloat(limpio.replace(',', '.'));
    return isNaN(val) ? NaN : val;
}

async function calcularHashVideo(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const sesionesModalEl = document.getElementById('sesionesModal');
const sesionesModal = sesionesModalEl ? new bootstrap.Modal(sesionesModalEl) : null;
const listaSesiones = document.getElementById('listaSesiones');
const sesionesIntro = document.getElementById('sesionesIntro');
const btnNuevaSesion = document.getElementById('btnNuevaSesion');
const btnCancelarSesion = document.getElementById('btnCancelarSesion');
const nombreNuevaSesion = document.getElementById('nombreNuevaSesion');

const videoTerminadoModalEl = document.getElementById('videoTerminadoModal');
const videoTerminadoModal = videoTerminadoModalEl ? new bootstrap.Modal(videoTerminadoModalEl) : null;
const btnModalExportarPDF = document.getElementById('btnModalExportarPDF');

function mostrarModalVideoTerminado() {
    if (videoTerminadoModal) videoTerminadoModal.show();
}

async function abrirModalSesiones() {
    if (!sesionesModal || !hashVideoActual) return;
    let sesiones = [];
    try {
        const resp = await fetch(`http://127.0.0.1:8000/sesiones/listar/${hashVideoActual}`);
        const datos = await resp.json();
        sesiones = datos.sesiones || [];
    } catch (err) {
        console.warn("No se pudieron listar las sesiones:", err);
    }

    if (sesiones.length === 0) {
        sesionesIntro.innerText = "Este vídeo no tiene sesiones guardadas. Crea una nueva para empezar.";
        listaSesiones.innerHTML = '<div class="text-muted small text-center py-2">No hay sesiones previas</div>';
    } else {
        sesionesIntro.innerText = "Este vídeo tiene sesiones guardadas. Continúa una o empieza de cero.";
        listaSesiones.innerHTML = sesiones.map(s => `
            <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-2">
                <div>
                    <div class="fw-bold">${s.nombre_sesion}</div>
                    <div class="small text-muted">Pausada en ${formatTime(s.segundo_actual)} · ${s.num_correcciones} corrección(es) · ${s.updated_at.slice(0,16).replace('T',' ')}</div>
                </div>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-primary btn-cargar-sesion" data-id="${s.id}">Cargar</button>
                    <button class="btn btn-sm btn-outline-danger btn-borrar-sesion" data-id="${s.id}" title="Borrar sesión">🗑</button>
                </div>
            </div>
        `).join('');
    }

    if (nombreNuevaSesion) nombreNuevaSesion.value = "";
    sesionesModal.show();
}

async function crearSesionNueva() {
    try {
        const nombre = nombreNuevaSesion && nombreNuevaSesion.value.trim() !== ""
            ? nombreNuevaSesion.value.trim()
            : null;
        const resp = await fetch('http://127.0.0.1:8000/sesiones/crear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hash_video: hashVideoActual,
                nombre_original: nombreVideoActual,
                nombre_sesion: nombre
            })
        });
        const datos = await resp.json();
        sessionIdActual = datos.id;
        console.log("Nueva sesión creada con id:", sessionIdActual);
    } catch (err) {
        console.error("No se pudo crear la sesión:", err);
    }
}

function actualizarBotonGuardarSesion() {
    if (!btnGuardarSesion) return;
    btnGuardarSesion.disabled = !(sessionIdActual && !isAnalyzing);
}

async function guardarSesionActual() {
    if (!sessionIdActual) return;
    const snapshot = {
        sessionData: sessionData,
        slotsData: slotsData,
        avatarsPorCara: avatarsPorCara,
        carasFiltradas: carasFiltradas
    };
    const textoOriginal = btnGuardarSesion ? btnGuardarSesion.innerHTML : "";
    try {
        const resp = await fetch('http://127.0.0.1:8000/sesiones/guardar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionIdActual,
                segundo_actual: video.currentTime,
                snapshot_display: snapshot
            })
        });
        if (!resp.ok) throw new Error("Respuesta no OK del servidor");
        console.log(`Sesión ${sessionIdActual} guardada en el segundo ${video.currentTime.toFixed(1)}.`);
        if (btnGuardarSesion) {
            btnGuardarSesion.className = "btn btn-success";
            btnGuardarSesion.innerHTML = "Sesión guardada ✓";
            setTimeout(() => {
                btnGuardarSesion.className = "btn btn-outline-success";
                btnGuardarSesion.innerHTML = textoOriginal;
                actualizarBotonGuardarSesion();
            }, 1800);
        }
    } catch (err) {
        console.error("Error guardando la sesión:", err);
        if (btnGuardarSesion) {
            btnGuardarSesion.className = "btn btn-danger";
            btnGuardarSesion.innerHTML = "Error al guardar";
            setTimeout(() => {
                btnGuardarSesion.className = "btn btn-outline-success";
                btnGuardarSesion.innerHTML = textoOriginal;
                actualizarBotonGuardarSesion();
            }, 1800);
        }
    }
}

if (btnGuardarSesion) {
    btnGuardarSesion.addEventListener('click', guardarSesionActual);
}

function renderizarDescartes() {
    if (!discardedTable || !discardedCount) return;
    const ids = Object.keys(carasFiltradas);
    discardedCount.innerText = `${ids.length} descartes`;
    if (ids.length === 0) {
        discardedTable.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-2">No se ha filtrado ruido aún</td></tr>';
        return;
    }
    discardedTable.innerHTML = "";
    ids.forEach(idCara => {
        const info = carasFiltradas[idCara];
        const frames = (info && info.frames !== undefined) ? info.frames : '—';
        const avatar = avatarsPorCara[idCara];
        const celdaCara = avatar
            ? `<img src="${avatar}" style="width: 55px; height: 55px; border-radius: 8px; object-fit: cover; border: 2px solid #dc3545;">
               <div class="small fw-bold text-danger mt-1">${idCara}</div>`
            : `<div class="fw-bold text-danger">${idCara}</div>`;
        discardedTable.innerHTML += `<tr>
            <td class="align-middle">${celdaCara}</td>
            <td class="small text-muted align-middle">Eliminada por ruido (${frames} frames de aparición)</td>
        </tr>`;
    });
}

async function cargarSesion(id) {
    sessionIdActual = id;
    let datos;
    try {
        const resp = await fetch('http://127.0.0.1:8000/sesiones/activar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: id })
        });
        if (!resp.ok) throw new Error("Respuesta no OK del servidor");
        datos = await resp.json();
    } catch (err) {
        console.error("No se pudo activar la sesión:", err);
        return;
    }

    const snap = datos.snapshot_display || {};
    sessionData = snap.sessionData || {};
    slotsData = snap.slotsData || [];
    avatarsPorCara = snap.avatarsPorCara || {};
    carasFiltradas = snap.carasFiltradas || {};

    if (faceFilter) {
        faceFilter.innerHTML = '<option value="global">Global (Todas las caras)</option>';
        Object.keys(sessionData).forEach(idCara => {
            const opt = document.createElement('option');
            opt.value = idCara;
            opt.innerText = idCara;
            faceFilter.appendChild(opt);
        });
    }

    if (chartGlobalInstance) {
        chartGlobalInstance.destroy();
        chartGlobalInstance = null;
    }

    renderizarAnaliticaGlobal({});
    renderizarGaleriaCaras();
    renderizarDescartes();
    if (slotsData.length > 0) renderizarTablaSlots();

    const haySnapshot = slotsData.length > 0;
    isAnalyzing = false;
    enviando = false;

    if (haySnapshot) {
        const segundo = datos.segundo_actual || 0;
        btnConfigurar.classList.add('d-none');
        btnPausar.className = "btn btn-success";
        btnPausar.innerHTML = "Reanudar";

        const aplicarEstadoSesion = () => {
            try { video.currentTime = segundo; } catch (e) {}
            currentTimeDisplay.innerText = formatTime(segundo);
            if (video.duration) videoProgressBar.style.width = `${(segundo / video.duration) * 100}%`;

            const duracion = video.duration || 0;
            sesionTerminada = duracion > 0 && segundo >= duracion - 0.3;

            if (sesionTerminada) {
                btnExportarPDF.classList.remove('d-none');
                rellenarCabeceraPDF();
                console.log(`Sesión ${id} cargada y ya finalizada. Consulta los resultados o expórtalos a PDF.`);
            } else {
                btnExportarPDF.classList.add('d-none');
                console.log(`Sesión ${id} cargada. Reanuda para continuar desde el segundo ${segundo.toFixed(1)}.`);
            }
        };

        if (video.readyState >= 1) aplicarEstadoSesion();
        else video.addEventListener('loadedmetadata', aplicarEstadoSesion, { once: true });
    } else {
        sesionTerminada = false;
        btnConfigurar.classList.remove('d-none');
        btnConfigurar.disabled = false;
        btnPausar.className = "btn btn-warning d-none";
        console.log(`Sesión ${id} cargada (sin análisis previo). Configura el análisis para empezar.`);
    }

    actualizarBotonGuardarSesion();
    actualizarEstadoPanelCorreccion();
    renderListaCorrecciones();
}

if (btnNuevaSesion) {
    btnNuevaSesion.addEventListener('click', async () => {
        await crearSesionNueva();
        actualizarBotonGuardarSesion();
        sesionesModal.hide();
    });
}

function descartarVideoCargado() {
    isAnalyzing = false;
    enviando = false;
    sesionTerminada = false;

    video.pause();
    if (video.src) {
        try { URL.revokeObjectURL(video.src); } catch (e) {}
    }
    video.removeAttribute('src');
    video.load();
    if (videoInput) videoInput.value = "";

    sessionData = {};
    slotsData = [];
    carasFiltradas = {};
    avatarsPorCara = {};
    hashVideoActual = null;
    nombreVideoActual = "";
    sessionIdActual = null;

    btnConfigurar.classList.remove('d-none');
    btnConfigurar.disabled = true;
    btnPausar.className = "btn btn-warning d-none";
    btnPausar.innerHTML = "Pausar";
    btnExportarPDF.classList.add('d-none');
    actualizarBotonGuardarSesion();

    if (panelCorreccion) panelCorreccion.style.display = "none";
    if (correccionInicio) correccionInicio.value = "";
    if (correccionFin) correccionFin.value = "";
    if (correccionFeedback) correccionFeedback.innerText = "";
    if (listaCorrecciones) listaCorrecciones.innerHTML = '<div class="text-muted small text-center py-2">Aún no hay correcciones en esta sesión</div>';

    if (facesGalleryGrid) facesGalleryGrid.innerHTML = '<div class="col-12 text-center text-muted py-3">Aún no se han detectado caras</div>';
    globalAnalyticsTable.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Sin datos acumulados</td></tr>';
    slotsTable.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Configura el análisis para ver los slots</td></tr>';
    if (discardedTable) discardedTable.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-2">No se ha filtrado ruido aún</td></tr>';
    if (discardedCount) discardedCount.innerText = "0 descartes";

    overallSentimentText.innerText = "-";
    faceCountBadge.innerText = "0 Caras";
    if (faceFilter) faceFilter.innerHTML = '<option value="global">Global (Todas las caras)</option>';

    if (chartGlobalInstance) { chartGlobalInstance.destroy(); chartGlobalInstance = null; }
    if (canvas.width > 0 && canvas.height > 0) ctx.clearRect(0, 0, canvas.width, canvas.height);

    currentTimeDisplay.innerText = "00:00";
    durationDisplay.innerText = "00:00";
    videoProgressBar.style.width = "0%";
}

if (btnCancelarSesion) {
    btnCancelarSesion.addEventListener('click', () => {
        sesionesModal.hide();
        descartarVideoCargado();
    });
}

if (listaSesiones) {
    listaSesiones.addEventListener('click', async (e) => {
        const cargar = e.target.closest('.btn-cargar-sesion');
        const borrar = e.target.closest('.btn-borrar-sesion');

        if (cargar) {
            const idSesion = parseInt(cargar.dataset.id);
            sesionesModal.hide();
            await cargarSesion(idSesion);
        }

        if (borrar) {
            const id = parseInt(borrar.dataset.id);
            try {
                await fetch(`http://127.0.0.1:8000/sesiones/${id}`, { method: 'DELETE' });
                console.log("Sesión borrada:", id);
                abrirModalSesiones();
            } catch (err) {
                console.error("No se pudo borrar la sesión:", err);
            }
        }
    });
}

function actualizarSelectorCarasCorreccion() {
    if (!correccionCara) return;
    const seleccionActual = correccionCara.value;
    const ids = Object.keys(avatarsPorCara).filter(id => !carasFiltradas[id]);
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
        if (correccionInicio.value === "") correccionInicio.value = formatTime(video.currentTime);
        if (correccionFin.value === "") correccionFin.value = formatTime(video.currentTime);
        renderListaCorrecciones();
    } else {
        panelCorreccion.style.display = "none";
    }
}

async function renderListaCorrecciones() {
    if (!listaCorrecciones || !sessionIdActual) return;
    try {
        const resp = await fetch(`http://127.0.0.1:8000/correcciones/activas`);
        const datos = await resp.json();
        const items = datos.correcciones || [];

        if (items.length === 0) {
            listaCorrecciones.innerHTML = '<div class="text-muted small text-center py-2">Aún no hay correcciones en esta sesión</div>';
            return;
        }

        const filas = items.map(c => {
            const colorClase = emotionColors[c.emocion_corregida] || 'bg-secondary';
            const cara = (c.id_tracking !== null && c.id_tracking !== undefined) ? `Cara ${c.id_tracking}` : 'Cara —';
            return `<tr>
                <td class="small fw-bold text-nowrap align-middle" style="color:#fd7e14;">${formatTime(c.segundo_inicio)} – ${formatTime(c.segundo_fin)}</td>
                <td class="small text-muted text-nowrap align-middle">${cara}</td>
                <td class="align-middle"><span class="badge ${colorClase}">${c.emocion_corregida}</span></td>
                <td class="text-end align-middle d-print-none"><button class="btn btn-sm btn-link text-danger p-0 btn-borrar-correccion" data-indice="${c.indice}" title="Borrar corrección">🗑</button></td>
            </tr>`;
        }).join('');

        listaCorrecciones.innerHTML = `
            <table class="table table-sm table-striped mb-0">
                <thead class="table-light">
                    <tr>
                        <th class="small">Intervalo</th>
                        <th class="small">ID</th>
                        <th class="small">Emoción corregida</th>
                        <th class="small d-print-none"></th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>`;
    } catch (err) {
        console.warn("No se pudo cargar la lista de correcciones:", err);
    }
}

if (listaCorrecciones) {
    listaCorrecciones.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-borrar-correccion');
        if (!btn) return;
        idCorreccionABorrar = parseInt(btn.dataset.indice);
        if (borrarModal) borrarModal.show();
    });
}

if (btnConfirmarBorrado) {
    btnConfirmarBorrado.addEventListener('click', async () => {
        if (idCorreccionABorrar === null) return;
        try {
            const resp = await fetch(`http://127.0.0.1:8000/correcciones/memoria/${idCorreccionABorrar}`, { method: 'DELETE' });
            if (!resp.ok) throw new Error("Respuesta no OK del servidor");
            console.log(`Corrección (índice ${idCorreccionABorrar}) eliminada de la sesión.`);
            renderListaCorrecciones();
        } catch (err) {
            console.error("Error borrando la corrección:", err);
        } finally {
            idCorreccionABorrar = null;
            if (borrarModal) borrarModal.hide();
        }
    });
}

if (borrarModalEl) {
    borrarModalEl.addEventListener('hidden.bs.modal', () => { idCorreccionABorrar = null; });
}

if (btnMarcarInicio) btnMarcarInicio.addEventListener('click', () => { correccionInicio.value = formatTime(video.currentTime); });
if (btnMarcarFin) btnMarcarFin.addEventListener('click', () => { correccionFin.value = formatTime(video.currentTime); });

function aplicarMascaraTiempo(input) {
    let digitos = input.value.replace(/\D/g, '');
    if (digitos.length > 4) digitos = digitos.slice(-4);
    digitos = digitos.padStart(4, '0');
    input.value = `${digitos.slice(0, 2)}:${digitos.slice(2, 4)}`;
}

function ajustarTiempoInput(input) {
    const partes = input.value.split(':');
    const mm = parseInt(partes[0], 10) || 0;
    const ss = parseInt(partes[1], 10) || 0;
    let total = mm * 60 + ss;
    if (total < 0) total = 0;
    const dur = video.duration || 0;
    if (dur > 0 && total > dur) total = dur;
    input.value = formatTime(total);
}

[correccionInicio, correccionFin].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('input', () => aplicarMascaraTiempo(inp));
    inp.addEventListener('blur', () => ajustarTiempoInput(inp));
    inp.addEventListener('focus', () => { requestAnimationFrame(() => inp.setSelectionRange(inp.value.length, inp.value.length)); });
});

if (btnGuardarCorreccion) {
    btnGuardarCorreccion.addEventListener('click', async () => {
        correccionFeedback.innerText = "";
        correccionFeedback.className = "small mt-2";

        if (!hashVideoActual || !sessionIdActual) {
            correccionFeedback.className = "small mt-2 text-danger";
            correccionFeedback.innerText = "No hay sesión activa.";
            return;
        }

        ajustarTiempoInput(correccionInicio);
        ajustarTiempoInput(correccionFin);
        const inicio = parseTimeInput(correccionInicio.value);
        const fin = parseTimeInput(correccionFin.value);
        const caraSel = correccionCara.value;
        const emocion = correccionEmocion.value;

        if (isNaN(inicio) || isNaN(fin)) {
            correccionFeedback.className = "small mt-2 text-danger";
            correccionFeedback.innerText = "Introduce el inicio y el fin en formato mm:ss.";
            return;
        }
        if (inicio < 0) {
            correccionFeedback.className = "small mt-2 text-danger";
            correccionFeedback.innerText = "El inicio no puede ser negativo.";
            return;
        }
        if (fin <= inicio) {
            correccionFeedback.className = "small mt-2 text-danger";
            correccionFeedback.innerText = `El inicio (${formatTime(inicio)}) debe ser anterior al fin (${formatTime(fin)}).`;
            return;
        }
        if (video.duration && fin > video.duration) {
            correccionFeedback.className = "small mt-2 text-danger";
            correccionFeedback.innerText = `El fin (${formatTime(fin)}) supera la duración del vídeo (${formatTime(video.duration)}).`;
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
                    session_id: sessionIdActual,
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

            await resp.json();

            correccionFeedback.className = "small mt-2 text-success";
            correccionFeedback.innerText = "Corrección añadida. Se aplicará al continuar el análisis y se guardará al pulsar \u201cGuardar sesión\u201d.";
            renderListaCorrecciones();
        } catch (err) {
            console.error("Error añadiendo la corrección:", err);
            correccionFeedback.className = "small mt-2 text-danger";
            correccionFeedback.innerText = "Error añadiendo la corrección. Revisa la consola.";
        }
    });
}

video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    currentTimeDisplay.innerText = formatTime(video.currentTime);
    const progressPct = (video.currentTime / video.duration) * 100;
    videoProgressBar.style.width = `${progressPct}%`;
});

video.addEventListener('play', () => {
    if (sesionTerminada) { video.pause(); return; }
    if (slotsData.length > 0 && !video.ended && !isAnalyzing) {
        isAnalyzing = true;
        btnPausar.className = "btn btn-warning";
        btnPausar.innerHTML = "Pausar";
        if (panelCorreccion) panelCorreccion.style.display = "none";
        actualizarBotonGuardarSesion();
        procesarFrame();
    }
});

video.addEventListener('pause', () => {
    if (isAnalyzing && !video.ended) {
        isAnalyzing = false;
        btnPausar.className = "btn btn-success";
        btnPausar.innerHTML = "Reanudar";
        actualizarEstadoPanelCorreccion();
        actualizarBotonGuardarSesion();
    }
});

video.addEventListener('click', () => {
    if (sesionTerminada) { mostrarModalVideoTerminado(); return; }
    if (slotsData.length === 0 || video.ended) return;
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
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

function exportarInformePDF() {
    const ahora = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const sello = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}_${pad(ahora.getHours())}-${pad(ahora.getMinutes())}-${pad(ahora.getSeconds())}`;

    const tituloOriginal = document.title;
    document.title = `Informe_Sawubona_${sello}`;

    const restaurarTitulo = () => {
        document.title = tituloOriginal;
        window.removeEventListener('afterprint', restaurarTitulo);
    };
    window.addEventListener('afterprint', restaurarTitulo);

    window.print();
}

btnExportarPDF.addEventListener('click', exportarInformePDF);

if (btnModalExportarPDF) {
    btnModalExportarPDF.addEventListener('click', () => {
        if (videoTerminadoModal && videoTerminadoModalEl) {
            videoTerminadoModalEl.addEventListener('hidden.bs.modal', () => exportarInformePDF(), { once: true });
            videoTerminadoModal.hide();
        } else {
            exportarInformePDF();
        }
    });
}

videoInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
        isAnalyzing = false;
        enviando = false;
        sesionTerminada = false;
        video.pause();

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
        sessionIdActual = null;
        actualizarBotonGuardarSesion();

        if (panelCorreccion) panelCorreccion.style.display = "none";
        if (correccionInicio) correccionInicio.value = "";
        if (correccionFin) correccionFin.value = "";
        if (correccionFeedback) correccionFeedback.innerText = "";
        if (listaCorrecciones) listaCorrecciones.innerHTML = '<div class="text-muted small text-center py-2">Aún no hay correcciones en esta sesión</div>';

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
            await abrirModalSesiones();
        } catch (err) {
            console.warn("No se pudo preparar la sesión:", err);
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
        sesionTerminada = false;
        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('configModal'));
        modalInstance.hide();

        btnConfigurar.classList.add('d-none');
        btnPausar.className = "btn btn-warning";
        btnPausar.innerHTML = "Pausar";

        if (panelCorreccion) panelCorreccion.style.display = "none";

        try {
            await fetch('http://127.0.0.1:8000/reset', { method: 'POST' });
            console.log("Memoria biométrica del servidor formateada.");
        } catch (error) {
            console.error("No se pudo contactar con /reset en el servidor.", error);
        }

        if (sessionIdActual) {
            try {
                const respCorr = await fetch('http://127.0.0.1:8000/correcciones/cargar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionIdActual })
                });
                const dataCorr = await respCorr.json();
                console.log(`Correcciones de la sesión cargadas: ${dataCorr.total}`);
            } catch (error) {
                console.error("No se pudieron cargar las correcciones de la sesión.", error);
            }
        }

        video.currentTime = 0;
        video.play();
        isAnalyzing = true;
        actualizarBotonGuardarSesion();
        procesarFrame();
    }
};

btnPausar.onclick = () => {
    if (sesionTerminada) {
        mostrarModalVideoTerminado();
        return;
    }
    if (isAnalyzing) {
        video.pause();
        isAnalyzing = false;
        btnPausar.innerHTML = "Reanudar";
        btnPausar.className = "btn btn-success";
        actualizarEstadoPanelCorreccion();
        actualizarBotonGuardarSesion();
    } else {
        video.play();
        isAnalyzing = true;
        btnPausar.innerHTML = "Pausar";
        btnPausar.className = "btn btn-warning";
        if (panelCorreccion) panelCorreccion.style.display = "none";
        actualizarBotonGuardarSesion();
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

    renderizarDescartes();
    renderizarGaleriaCaras();

    renderizarAnaliticaGlobal({});
    renderizarTablaSlots();
}

function rellenarCabeceraPDF() {
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
}

video.onended = () => {
    isAnalyzing = false;
    sesionTerminada = true;
    btnPausar.className = "btn btn-warning d-none";
    btnConfigurar.classList.remove('d-none');
    btnExportarPDF.classList.remove('d-none');

    finalizarUltimoSlot();

    ejecutarFiltroDeRuido();

    actualizarEstadoPanelCorreccion();
    actualizarBotonGuardarSesion();

    rellenarCabeceraPDF();
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

    const ids = Object.keys(avatarsPorCara).filter(id => !carasFiltradas[id]);
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