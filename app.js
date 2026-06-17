pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const STORAGE_KEY = 'ukeire_saved_docs_v1';
const MAX_SAVED_ITEMS = 30;

const workspace = document.getElementById('workspace');
const fileInput = document.getElementById('file-input');
const canvasWrapper = document.getElementById('canvas-wrapper');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const eraserIndicator = document.getElementById('eraser-indicator');

const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
const paintCanvas = document.getElementById('paint-canvas');
const paintCtx = paintCanvas.getContext('2d');
const cropCanvas = document.getElementById('crop-canvas');
const cropCtx = cropCanvas.getContext('2d');
const cropActions = document.getElementById('crop-actions');

const colorPicker = document.getElementById('color-picker');
const lineWidthPicker = document.getElementById('line-width');
const zoomPercentLabel = document.getElementById('zoom-percent');
const saveNameInput = document.getElementById('save-name');
const savedList = document.getElementById('saved-list');

let linesHistory = [];
let currentLine = null;
let isDrawing = false;
let currentTool = 'pan';
let currentFileName = '';
let rawSourceData = null;

let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let scrollStartX = 0;
let scrollStartY = 0;

let isPinching = false;
let pinchStartDistance = 0;
let pinchStartScale = 1;
const workspacePointers = new Map();

let isCropping = false;
let cropAnchor = null;
let cropRect = null;

let currentRotation = 0;
let currentScale = 1;
let baseScale = 1;

const currentUser = { id: 'user_A', name: 'User', color: '#333333' };

function isMobileView() {
    return window.innerWidth <= 768;
}

function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('show');
}

function openSidebar() {
    if (!isMobileView()) return;
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('show');
}

sidebarToggle.addEventListener('click', () => {
    if (!isMobileView()) return;
    if (sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
});

sidebarOverlay.addEventListener('click', closeSidebar);

function getSavedDocuments() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function setSavedDocuments(docs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

function formatSavedTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ja-JP');
}

function refreshSavedList(selectedId = '') {
    const docs = getSavedDocuments();
    savedList.innerHTML = '';

    if (docs.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '保存データなし';
        savedList.appendChild(option);
        return;
    }

    docs.forEach((doc) => {
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = `${doc.name} (${formatSavedTime(doc.updatedAt)})`;
        savedList.appendChild(option);
    });

    if (selectedId) {
        savedList.value = selectedId;
    }
}

function getSelectedSavedDoc() {
    const id = savedList.value;
    if (!id) return null;
    return getSavedDocuments().find((doc) => doc.id === id) || null;
}

function cloneLines(lines) {
    return JSON.parse(JSON.stringify(lines || []));
}

function saveCurrentDocument() {
    if (!rawSourceData) {
        alert('先にファイルを開いてください。');
        return;
    }

    const inputName = saveNameInput.value.trim();
    const docName = inputName || currentFileName || `ドキュメント ${new Date().toLocaleString('ja-JP')}`;
    const docs = getSavedDocuments();
    const existingIndex = docs.findIndex((d) => d.name === docName);
    const nowIso = new Date().toISOString();

    const payload = {
        id: existingIndex >= 0 ? docs[existingIndex].id : `${Date.now()}`,
        name: docName,
        updatedAt: nowIso,
        bgDataUrl: bgCanvas.toDataURL('image/png'),
        linesHistory: cloneLines(linesHistory)
    };

    if (existingIndex >= 0) {
        docs[existingIndex] = payload;
    } else {
        docs.unshift(payload);
    }

    const trimmed = docs.slice(0, MAX_SAVED_ITEMS);
    setSavedDocuments(trimmed);
    refreshSavedList(payload.id);

    currentFileName = docName;
    saveNameInput.value = docName;
    alert('保存しました。');
}

function loadSavedDocument(doc) {
    if (!doc) return;

    const img = new Image();
    img.onload = () => {
        rawSourceData = { type: 'image', data: img };
        currentRotation = 0;
        currentFileName = doc.name || '';
        saveNameInput.value = currentFileName;
        initContainer(cloneLines(doc.linesHistory));
    };
    img.src = doc.bgDataUrl;
}

function deleteSavedDocument() {
    const selectedDoc = getSelectedSavedDoc();
    if (!selectedDoc) return;

    const ok = confirm(`「${selectedDoc.name}」を削除しますか？`);
    if (!ok) return;

    const docs = getSavedDocuments().filter((doc) => doc.id !== selectedDoc.id);
    setSavedDocuments(docs);
    refreshSavedList();
}

workspace.addEventListener('dragover', (e) => {
    e.preventDefault();
    workspace.style.backgroundColor = '#efefef';
});

workspace.addEventListener('dragleave', () => {
    workspace.style.backgroundColor = '#fff';
});

workspace.addEventListener('drop', (e) => {
    e.preventDefault();
    workspace.style.backgroundColor = '#fff';
    handleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', (e) => {
    handleFile(e.target.files[0]);
});

function handleFile(file) {
    if (!file) return;

    currentFileName = file.name;
    saveNameInput.value = currentFileName;
    currentRotation = 0;

    const reader = new FileReader();

    if (file.type === 'application/pdf') {
        reader.onload = (ev) => {
            const typedarray = new Uint8Array(ev.target.result);
            pdfjsLib.getDocument(typedarray).promise.then((pdf) => {
                pdf.getPage(1).then((page) => {
                    rawSourceData = { type: 'pdf', data: page };
                    initContainer([]);
                });
            });
        };
        reader.readAsArrayBuffer(file);
        return;
    }

    if (file.type.startsWith('image/')) {
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                rawSourceData = { type: 'image', data: img };
                initContainer([]);
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function initContainer(initialLines = []) {
    document.getElementById('drop-zone-text').style.display = 'none';
    canvasWrapper.style.display = 'block';
    if (isMobileView()) closeSidebar();

    let originalWidth = 0;
    let originalHeight = 0;

    if (rawSourceData.type === 'pdf') {
        const viewport = rawSourceData.data.getViewport({ scale: 1.0 });
        originalWidth = viewport.width;
        originalHeight = viewport.height;
    } else {
        originalWidth = rawSourceData.data.width;
        originalHeight = rawSourceData.data.height;
    }

    bgCanvas.width = originalWidth;
    bgCanvas.height = originalHeight;
    paintCanvas.width = originalWidth;
    paintCanvas.height = originalHeight;
    cropCanvas.width = originalWidth;
    cropCanvas.height = originalHeight;
    cancelCropSelection();

    if (rawSourceData.type === 'pdf') {
        const viewport = rawSourceData.data.getViewport({ scale: 1.0 });
        rawSourceData.data.render({ canvasContext: bgCtx, viewport });
    } else {
        bgCtx.drawImage(rawSourceData.data, 0, 0);
    }

    linesHistory = cloneLines(initialLines);
    redrawCanvas();
    resetToFit();
    updateToolUI();
}

function applyTransform() {
    if (!rawSourceData) return;

    zoomPercentLabel.innerText = `${Math.round(currentScale * 100)}%`;
    canvasWrapper.style.transform = `scale(${currentScale}) rotate(${currentRotation}deg)`;

    const isRotatedVertical = currentRotation % 180 !== 0;
    const cW = bgCanvas.width;
    const cH = bgCanvas.height;

    const renderedW = (isRotatedVertical ? cH : cW) * currentScale;
    const renderedH = (isRotatedVertical ? cW : cH) * currentScale;

    canvasWrapper.style.margin = `${Math.max(0, (workspace.clientHeight - renderedH) / 2)}px ${Math.max(0, (workspace.clientWidth - renderedW) / 2)}px`;
}

function resetToFit() {
    const wsW = workspace.clientWidth - 40;
    const wsH = workspace.clientHeight - 40;
    const isRotatedVertical = currentRotation % 180 !== 0;
    const currentW = isRotatedVertical ? bgCanvas.height : bgCanvas.width;
    const currentH = isRotatedVertical ? bgCanvas.width : bgCanvas.height;

    baseScale = Math.min(wsW / currentW, wsH / currentH, 1);
    currentScale = baseScale;
    applyTransform();
}

document.getElementById('btn-zoom-in').addEventListener('click', () => zoom(0.1));
document.getElementById('btn-zoom-out').addEventListener('click', () => zoom(-0.1));
document.getElementById('btn-zoom-fit').addEventListener('click', resetToFit);

workspace.addEventListener('wheel', (e) => {
    if (!rawSourceData) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    zoom(delta);
}, { passive: false });

function zoom(amount) {
    currentScale += amount;
    currentScale = Math.max(0.1, Math.min(4.0, currentScale));
    applyTransform();

    if (currentTool === 'eraser' && eraserIndicator.style.display === 'block') {
        const size = Math.max(8, parseInt(lineWidthPicker.value, 10) * currentScale);
        eraserIndicator.style.width = `${size}px`;
        eraserIndicator.style.height = `${size}px`;
    }
}

function getPinchDistance(pointers) {
    const pts = Array.from(pointers.values());
    if (pts.length < 2) return 0;
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return Math.hypot(dx, dy);
}

function cancelInProgressStroke() {
    if (!isDrawing) return;
    if (currentLine) linesHistory.pop();
    isDrawing = false;
    redrawCanvas();
}

function endPinch() {
    isPinching = false;
    pinchStartDistance = 0;
}

function getCanvasCoordinates(e) {
    const rect = paintCanvas.getBoundingClientRect();

    const x = (e.clientX - rect.left) / currentScale;
    const y = (e.clientY - rect.top) / currentScale;

    const w = paintCanvas.width;
    const h = paintCanvas.height;

    let finalX;
    let finalY;
    const normalizedRotation = (currentRotation % 360 + 360) % 360;

    if (normalizedRotation === 90) {
        finalX = y;
        finalY = h - x;
    } else if (normalizedRotation === 180) {
        finalX = w - x;
        finalY = h - y;
    } else if (normalizedRotation === 270) {
        finalX = w - y;
        finalY = x;
    } else {
        finalX = x;
        finalY = y;
    }

    return { x: finalX, y: finalY };
}

function canPan() {
    return currentTool !== 'brush' && currentTool !== 'eraser' && currentTool !== 'crop' && !isDrawing && !isCropping;
}

function hideEraserIndicator() {
    eraserIndicator.style.display = 'none';
}

function updateEraserIndicatorPosition(e) {
    if (currentTool !== 'eraser' || !rawSourceData) {
        hideEraserIndicator();
        return;
    }
    const size = Math.max(8, parseInt(lineWidthPicker.value, 10) * currentScale);
    eraserIndicator.style.width = `${size}px`;
    eraserIndicator.style.height = `${size}px`;
    eraserIndicator.style.left = `${e.clientX}px`;
    eraserIndicator.style.top = `${e.clientY}px`;
    eraserIndicator.style.display = 'block';
}

function updateToolUI() {
    const isDrawTool = currentTool === 'brush' || currentTool === 'eraser';
    const isCropTool = currentTool === 'crop';
    paintCanvas.classList.toggle('no-draw', !isDrawTool && !isCropTool);
    paintCanvas.style.cursor = isCropTool ? 'crosshair' : (currentTool === 'eraser' ? 'none' : '');
    cropActions.style.display = isCropTool && cropRect ? 'flex' : 'none';
    workspace.classList.toggle('pan-mode', canPan());
    if (currentTool !== 'eraser') hideEraserIndicator();
    if (!isCropTool) drawCropOverlay();
}

function clampCropRect(rect) {
    const maxW = paintCanvas.width;
    const maxH = paintCanvas.height;
    const x = Math.max(0, Math.min(rect.x, maxW));
    const y = Math.max(0, Math.min(rect.y, maxH));
    const w = Math.max(0, Math.min(rect.w, maxW - x));
    const h = Math.max(0, Math.min(rect.h, maxH - y));
    return { x, y, w, h };
}

function makeCropRect(x1, y1, x2, y2) {
    return clampCropRect({
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1)
    });
}

function drawCropOverlay() {
    if (currentTool !== 'crop' || !cropRect || cropRect.w < 1 || cropRect.h < 1) {
        cropCanvas.style.display = 'none';
        cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
        return;
    }

    cropCanvas.width = paintCanvas.width;
    cropCanvas.height = paintCanvas.height;
    cropCanvas.style.display = 'block';

    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    cropCtx.strokeStyle = '#ffffff';
    cropCtx.lineWidth = 2;
    cropCtx.setLineDash([6, 4]);
    cropCtx.strokeRect(cropRect.x + 0.5, cropRect.y + 0.5, cropRect.w, cropRect.h);
    cropCtx.setLineDash([]);
}

function cancelCropSelection() {
    isCropping = false;
    cropAnchor = null;
    cropRect = null;
    drawCropOverlay();
    updateToolUI();
}

function applyCrop() {
    if (!cropRect || cropRect.w < 5 || cropRect.h < 5) return;
    const { x, y, w, h } = cropRect;

    const tmpBg = document.createElement('canvas');
    tmpBg.width = w;
    tmpBg.height = h;
    tmpBg.getContext('2d').drawImage(bgCanvas, x, y, w, h, 0, 0, w, h);

    const tmpPaint = document.createElement('canvas');
    tmpPaint.width = w;
    tmpPaint.height = h;
    tmpPaint.getContext('2d').drawImage(paintCanvas, x, y, w, h, 0, 0, w, h);

    bgCanvas.width = w;
    bgCanvas.height = h;
    paintCanvas.width = w;
    paintCanvas.height = h;
    cropCanvas.width = w;
    cropCanvas.height = h;
    bgCtx.drawImage(tmpBg, 0, 0);
    paintCtx.drawImage(tmpPaint, 0, 0);

    linesHistory = linesHistory
        .map((line) => ({
            ...line,
            points: line.points
                .map((p) => ({ x: p.x - x, y: p.y - y }))
                .filter((p) => p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h)
        }))
        .filter((line) => line.points.length > 0);

    const img = new Image();
    img.onload = () => {
        rawSourceData = { type: 'image', data: img };
        currentRotation = 0;
        cancelCropSelection();
        resetToFit();
        setTool('pan');
    };
    img.src = bgCanvas.toDataURL();
}

function endPan() {
    if (!isPanning) return;
    isPanning = false;
    workspace.classList.remove('panning');
}

function trackWorkspacePointer(e) {
    workspacePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
}

function untrackWorkspacePointer(e) {
    workspacePointers.delete(e.pointerId);
    if (workspacePointers.size < 2) endPinch();
}

workspace.addEventListener('pointerdown', (e) => {
    if (!rawSourceData) return;
    trackWorkspacePointer(e);

    if (workspacePointers.size === 2) {
        endPan();
        cancelInProgressStroke();
        if (isCropping) handleCropEnd();
        isPinching = true;
        pinchStartDistance = getPinchDistance(workspacePointers);
        pinchStartScale = currentScale;
        e.preventDefault();
    }
}, { passive: false, capture: true });

workspace.addEventListener('pointermove', (e) => {
    if (!rawSourceData || !isPinching || workspacePointers.size < 2) return;
    trackWorkspacePointer(e);
    const dist = getPinchDistance(workspacePointers);
    if (pinchStartDistance > 0) {
        currentScale = Math.max(0.1, Math.min(4.0, pinchStartScale * (dist / pinchStartDistance)));
        applyTransform();
    }
    e.preventDefault();
}, { passive: false, capture: true });

workspace.addEventListener('pointerup', (e) => {
    untrackWorkspacePointer(e);
}, { capture: true });

workspace.addEventListener('pointercancel', (e) => {
    untrackWorkspacePointer(e);
}, { capture: true });

workspace.addEventListener('pointerdown', (e) => {
    if (!rawSourceData || !canPan() || e.button !== 0 || isPinching || workspacePointers.size > 1) return;
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    scrollStartX = workspace.scrollLeft;
    scrollStartY = workspace.scrollTop;
    workspace.classList.add('panning');
    workspace.setPointerCapture(e.pointerId);
    e.preventDefault();
}, { passive: false });

workspace.addEventListener('pointermove', (e) => {
    if (isPinching || !isPanning) return;
    workspace.scrollLeft = scrollStartX - (e.clientX - panStartX);
    workspace.scrollTop = scrollStartY - (e.clientY - panStartY);
    e.preventDefault();
}, { passive: false });

workspace.addEventListener('pointerup', endPan);
workspace.addEventListener('pointercancel', endPan);

function handleCropEnd() {
    isCropping = false;
    if (cropRect && (cropRect.w < 5 || cropRect.h < 5)) cropRect = null;
    drawCropOverlay();
    updateToolUI();
}

paintCanvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || isPinching || workspacePointers.size > 1) return;
    updateEraserIndicatorPosition(e);

    if (currentTool === 'crop') {
        isCropping = true;
        cropAnchor = getCanvasCoordinates(e);
        cropRect = makeCropRect(cropAnchor.x, cropAnchor.y, cropAnchor.x, cropAnchor.y);
        drawCropOverlay();
        updateToolUI();
        paintCanvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
    }

    if (currentTool !== 'brush' && currentTool !== 'eraser') return;

    isDrawing = true;
    workspace.classList.remove('pan-mode');
    const coords = getCanvasCoordinates(e);
    currentLine = {
        user: currentUser,
        tool: currentTool,
        color: colorPicker.value,
        width: parseInt(lineWidthPicker.value, 10),
        points: [coords],
        timestamp: new Date().toLocaleTimeString()
    };

    linesHistory.push(currentLine);
    redrawCanvas();
    paintCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
}, { passive: false });

paintCanvas.addEventListener('pointermove', (e) => {
    if (isPinching) return;
    updateEraserIndicatorPosition(e);

    if (currentTool === 'crop' && isCropping && cropAnchor) {
        const coords = getCanvasCoordinates(e);
        cropRect = makeCropRect(cropAnchor.x, cropAnchor.y, coords.x, coords.y);
        drawCropOverlay();
        updateToolUI();
        e.preventDefault();
        return;
    }

    if (!isDrawing) return;
    const coords = getCanvasCoordinates(e);
    currentLine.points.push(coords);
    redrawCanvas();
    e.preventDefault();
}, { passive: false });

paintCanvas.addEventListener('pointerup', () => {
    if (currentTool === 'crop' && isCropping) {
        handleCropEnd();
        return;
    }
    stopDrawing();
});

paintCanvas.addEventListener('pointerleave', () => {
    hideEraserIndicator();
    if (currentTool === 'crop' && isCropping) {
        handleCropEnd();
        return;
    }
    stopDrawing();
});

paintCanvas.addEventListener('pointercancel', () => {
    hideEraserIndicator();
    if (currentTool === 'crop' && isCropping) {
        handleCropEnd();
        return;
    }
    stopDrawing();
});

paintCanvas.addEventListener('pointerenter', (e) => {
    updateEraserIndicatorPosition(e);
});

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    updateToolUI();
}

function redrawCanvas() {
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);

    linesHistory.forEach((line) => {
        if (line.points.length < 1) return;

        paintCtx.beginPath();
        paintCtx.lineWidth = line.width;
        paintCtx.lineCap = 'round';
        paintCtx.lineJoin = 'round';

        if (line.tool === 'eraser') {
            paintCtx.globalCompositeOperation = 'destination-out';
            paintCtx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            paintCtx.globalCompositeOperation = 'source-over';
            paintCtx.strokeStyle = line.color;
        }

        paintCtx.moveTo(line.points[0].x, line.points[0].y);
        for (let i = 1; i < line.points.length; i++) {
            paintCtx.lineTo(line.points[i].x, line.points[i].y);
        }
        paintCtx.stroke();
    });

    paintCtx.globalCompositeOperation = 'source-over';
}

document.getElementById('btn-rotate-cw').addEventListener('click', () => {
    currentRotation += 90;
    applyTransform();
});

window.addEventListener('resize', () => {
    if (rawSourceData && currentScale === baseScale) resetToFit();
    if (!isMobileView()) closeSidebar();
});

function setTool(tool) {
    if (isDrawing) stopDrawing();
    if (tool !== 'crop') cancelCropSelection();
    currentTool = tool;

    document.getElementById('btn-pan').classList.toggle('active', tool === 'pan');
    document.getElementById('btn-brush').classList.toggle('active', tool === 'brush');
    document.getElementById('btn-eraser').classList.toggle('active', tool === 'eraser');
    document.getElementById('btn-crop').classList.toggle('active', tool === 'crop');

    updateToolUI();
    if (isMobileView()) closeSidebar();
}

document.getElementById('btn-pan').addEventListener('click', () => setTool('pan'));
document.getElementById('btn-brush').addEventListener('click', () => setTool('brush'));
document.getElementById('btn-eraser').addEventListener('click', () => setTool('eraser'));
document.getElementById('btn-crop').addEventListener('click', () => setTool('crop'));
document.getElementById('btn-crop-apply').addEventListener('click', applyCrop);
document.getElementById('btn-crop-cancel').addEventListener('click', cancelCropSelection);

document.getElementById('btn-undo').addEventListener('click', () => {
    if (linesHistory.length > 0) {
        linesHistory.pop();
        stopDrawing();
        redrawCanvas();
    }
});

document.getElementById('btn-clear').addEventListener('click', () => {
    if (linesHistory.length > 0 && confirm('すべて削除しますか？')) {
        linesHistory = [];
        stopDrawing();
        redrawCanvas();
    }
});

lineWidthPicker.addEventListener('input', () => {
    if (currentTool !== 'eraser' || eraserIndicator.style.display !== 'block') return;
    const currentSize = Math.max(8, parseInt(lineWidthPicker.value, 10) * currentScale);
    eraserIndicator.style.width = `${currentSize}px`;
    eraserIndicator.style.height = `${currentSize}px`;
});

document.getElementById('btn-save-local').addEventListener('click', saveCurrentDocument);
document.getElementById('btn-load-saved').addEventListener('click', () => {
    const doc = getSelectedSavedDoc();
    if (!doc) {
        alert('読み込みデータを選択してください。');
        return;
    }
    loadSavedDocument(doc);
});

document.getElementById('btn-delete-saved').addEventListener('click', deleteSavedDocument);

savedList.addEventListener('change', () => {
    const doc = getSelectedSavedDoc();
    if (doc) saveNameInput.value = doc.name;
});

refreshSavedList();
updateToolUI();
