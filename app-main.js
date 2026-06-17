pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const USERS_KEY = 'ukeire_users_v1';
const SESSION_KEY = 'ukeire_session_v1';
const RECORDS_KEY = 'ukeire_nohinsho_records_v1';
const SIDEBAR_COLLAPSED_KEY = 'ukeire_sidebar_collapsed_v1';

const authScreen = document.getElementById('auth-screen');
const appRoot = document.getElementById('app-root');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const btnLogin = document.getElementById('btn-login');

const workspace = document.getElementById('workspace');
const fileInput = document.getElementById('file-input');
const canvasWrapper = document.getElementById('canvas-wrapper');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const btnSidebarCollapse = document.getElementById('btn-sidebar-collapse');
const sidebarCollapseIcon = document.getElementById('sidebar-collapse-icon');
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
const currentUserLabel = document.getElementById('current-user-label');
const loginUserInfo = document.getElementById('login-user-info');
const btnHeaderLogout = document.getElementById('btn-header-logout');
const btnOpenAdmin = document.getElementById('btn-open-admin');

const btnUpload = document.getElementById('btn-upload');
const recordNameInput = document.getElementById('record-name');
const recordStatusInput = document.getElementById('record-status');
const btnSaveRecord = document.getElementById('btn-save-record');
const filterDateInput = document.getElementById('filter-date');
const btnFilterToday = document.getElementById('btn-filter-today');
const recordsList = document.getElementById('records-list');

let currentUser = null;
let currentRecordId = null;
let rawSourceData = null;

let linesHistory = [];
let currentLine = null;
let isDrawing = false;
let currentTool = 'pan';

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

let isSidebarGestureActive = false;
let sidebarGestureMode = null;
let sidebarGestureStartX = 0;
let sidebarGestureLastX = 0;
let sidebarGesturePointerId = null;
let sidebarGestureStartValue = 0;
let sidebarGestureCurrentValue = 0;

const DESKTOP_SIDEBAR_EXPANDED_WIDTH = 240;
const DESKTOP_SIDEBAR_COLLAPSED_WIDTH = 68;

function todayDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = `${now.getMonth() + 1}`.padStart(2, '0');
    const d = `${now.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getUsers() {
    try {
        const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
        return Array.isArray(users) ? users : [];
    } catch {
        return [];
    }
}

function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function ensureDefaultAdmin() {
    const users = getUsers();
    if (users.length > 0) return;

    saveUsers([
        {
            id: `u-${Date.now()}`,
            username: 'admin',
            password: 'admin123',
            role: 'admin',
            brushColor: '#ff0000'
        }
    ]);
}

function getRecords() {
    try {
        const records = JSON.parse(localStorage.getItem(RECORDS_KEY) || '[]');
        return Array.isArray(records) ? records : [];
    } catch {
        return [];
    }
}

function saveRecords(records) {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function setSession(userId) {
    localStorage.setItem(SESSION_KEY, userId || '');
}

function getSessionUser() {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) return null;
    return getUsers().find((u) => u.id === userId) || null;
}

function isMobileView() {
    return window.innerWidth <= 768;
}

function clearSidebarGestureInlineStyles() {
    appRoot.classList.remove('sidebar-dragging');
    sidebar.style.transform = '';
    sidebar.style.width = '';
    sidebar.style.minWidth = '';
    sidebar.style.transition = '';
    sidebarOverlay.style.opacity = '';
    sidebarOverlay.style.transition = '';
}

function closeSidebar() {
    clearSidebarGestureInlineStyles();
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('show');
}

function openSidebar() {
    if (!isMobileView()) return;
    clearSidebarGestureInlineStyles();
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('show');
}

function isInteractiveElement(target) {
    if (!(target instanceof Element)) return false;
    return !!target.closest('button, input, select, textarea, a, label');
}

function applySidebarGestureVisual(value) {
    const mobile = isMobileView();

    if (mobile) {
        const width = sidebar.getBoundingClientRect().width || DESKTOP_SIDEBAR_EXPANDED_WIDTH;
        const clamped = Math.max(-width, Math.min(0, value));
        const visibleRatio = 1 - Math.abs(clamped) / width;
        sidebar.style.transform = `translateX(${clamped}px)`;
        sidebarOverlay.style.opacity = `${Math.max(0, Math.min(1, visibleRatio))}`;
        return;
    }

    const clamped = Math.max(DESKTOP_SIDEBAR_COLLAPSED_WIDTH, Math.min(DESKTOP_SIDEBAR_EXPANDED_WIDTH, value));
    const collapsedLive = clamped < (DESKTOP_SIDEBAR_COLLAPSED_WIDTH + DESKTOP_SIDEBAR_EXPANDED_WIDTH) / 2;

    appRoot.classList.toggle('sidebar-collapsed', collapsedLive);
    updateSidebarCollapseIcon();

    sidebar.style.width = `${clamped}px`;
    sidebar.style.minWidth = `${clamped}px`;
}

function tryStartSidebarGesture(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return false;
    if (e.pointerType === 'touch' && !e.isPrimary) return false;
    if (isInteractiveElement(e.target)) return false;

    const x = e.clientX;
    const mobile = isMobileView();
    const sidebarRect = sidebar.getBoundingClientRect();
    const isSidebarOpenMobile = mobile && sidebar.classList.contains('open');
    const isCollapsedDesktop = !mobile && appRoot.classList.contains('sidebar-collapsed');

    if (mobile) {
        if (!isSidebarOpenMobile && x <= 26) {
            sidebarGestureMode = 'mobile-open';
        } else if (isSidebarOpenMobile && x <= Math.max(80, sidebarRect.width + 8)) {
            sidebarGestureMode = 'mobile-close';
        } else {
            return false;
        }
    } else {
        if (isCollapsedDesktop && x <= 26) {
            sidebarGestureMode = 'desktop-expand';
        } else if (!isCollapsedDesktop && x <= Math.max(80, sidebarRect.width + 8)) {
            sidebarGestureMode = 'desktop-collapse';
        } else {
            return false;
        }
    }

    appRoot.classList.add('sidebar-dragging');
    sidebar.style.transition = 'none';
    sidebarOverlay.style.transition = 'none';

    if (mobile) {
        const width = sidebarRect.width || DESKTOP_SIDEBAR_EXPANDED_WIDTH;
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('show');
        sidebarGestureStartValue = sidebarGestureMode === 'mobile-open' ? -width : 0;
    } else {
        sidebarGestureStartValue = sidebarGestureMode === 'desktop-expand'
            ? DESKTOP_SIDEBAR_COLLAPSED_WIDTH
            : DESKTOP_SIDEBAR_EXPANDED_WIDTH;
    }

    isSidebarGestureActive = true;
    sidebarGestureStartX = x;
    sidebarGestureLastX = x;
    sidebarGesturePointerId = e.pointerId;
    sidebarGestureCurrentValue = sidebarGestureStartValue;
    applySidebarGestureVisual(sidebarGestureCurrentValue);
    return true;
}

function handleSidebarGestureMove(e) {
    if (!isSidebarGestureActive || e.pointerId !== sidebarGesturePointerId) return;
    sidebarGestureLastX = e.clientX;

    const dx = sidebarGestureLastX - sidebarGestureStartX;
    if (isMobileView()) {
        const width = sidebar.getBoundingClientRect().width || DESKTOP_SIDEBAR_EXPANDED_WIDTH;
        const nextValue = sidebarGestureMode === 'mobile-open'
            ? Math.max(-width, Math.min(0, sidebarGestureStartValue + dx))
            : Math.max(-width, Math.min(0, dx));
        sidebarGestureCurrentValue = nextValue;
    } else {
        const nextValue = Math.max(
            DESKTOP_SIDEBAR_COLLAPSED_WIDTH,
            Math.min(DESKTOP_SIDEBAR_EXPANDED_WIDTH, sidebarGestureStartValue + dx)
        );
        sidebarGestureCurrentValue = nextValue;
    }

    applySidebarGestureVisual(sidebarGestureCurrentValue);
}

function finishSidebarGesture(e) {
    if (!isSidebarGestureActive || e.pointerId !== sidebarGesturePointerId) return;
    const mobile = isMobileView();

    if (mobile) {
        const width = sidebar.getBoundingClientRect().width || DESKTOP_SIDEBAR_EXPANDED_WIDTH;
        const shouldOpen = sidebarGestureCurrentValue > -width * 0.5;
        if (sidebarGestureMode === 'mobile-open') {
            if (shouldOpen) openSidebar();
            else closeSidebar();
        } else if (sidebarGestureMode === 'mobile-close') {
            if (shouldOpen) openSidebar();
            else closeSidebar();
        }
    } else {
        const midpoint = (DESKTOP_SIDEBAR_EXPANDED_WIDTH + DESKTOP_SIDEBAR_COLLAPSED_WIDTH) / 2;
        if (sidebarGestureMode === 'desktop-expand') {
            setSidebarCollapsed(sidebarGestureCurrentValue < midpoint);
        } else if (sidebarGestureMode === 'desktop-collapse') {
            setSidebarCollapsed(sidebarGestureCurrentValue < midpoint);
        }
        clearSidebarGestureInlineStyles();
    }

    isSidebarGestureActive = false;
    sidebarGestureMode = null;
    sidebarGesturePointerId = null;
    sidebarGestureStartValue = 0;
    sidebarGestureCurrentValue = 0;
}

function cancelSidebarGesture(e) {
    if (!isSidebarGestureActive || (e && e.pointerId !== sidebarGesturePointerId)) return;

    if (sidebarGestureMode === 'mobile-open') {
        closeSidebar();
    } else if (sidebarGestureMode === 'mobile-close') {
        openSidebar();
    } else if (sidebarGestureMode === 'desktop-expand') {
        setSidebarCollapsed(true);
        clearSidebarGestureInlineStyles();
    } else if (sidebarGestureMode === 'desktop-collapse') {
        setSidebarCollapsed(false);
        clearSidebarGestureInlineStyles();
    }

    isSidebarGestureActive = false;
    sidebarGestureMode = null;
    sidebarGesturePointerId = null;
    sidebarGestureStartValue = 0;
    sidebarGestureCurrentValue = 0;
}

function updateSidebarCollapseIcon() {
    if (!sidebarCollapseIcon) return;
    const collapsed = appRoot.classList.contains('sidebar-collapsed');
    sidebarCollapseIcon.classList.toggle('fa-angles-left', !collapsed);
    sidebarCollapseIcon.classList.toggle('fa-angles-right', collapsed);
    btnSidebarCollapse.title = collapsed ? 'サイドバーを展開' : 'サイドバーを縮小';
}

function setSidebarCollapsed(collapsed) {
    const nextCollapsed = !!collapsed && !isMobileView();
    appRoot.classList.toggle('sidebar-collapsed', nextCollapsed);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, nextCollapsed ? '1' : '0');
    updateSidebarCollapseIcon();
}

function restoreSidebarCollapsed() {
    const savedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    setSidebarCollapsed(savedCollapsed);
}

function showAppForUser(user) {
    currentUser = user;
    authScreen.classList.add('hidden');
    appRoot.classList.remove('hidden');
    loginUserInfo.textContent = `ログイン中: ${user.username} (${user.role})`;
    currentUserLabel.textContent = `ログイン中: ${user.username} (${user.role})`;

    colorPicker.value = user.brushColor || '#ff0000';
    colorPicker.disabled = true;
    btnOpenAdmin.style.display = user.role === 'admin' ? 'block' : 'none';

    filterDateInput.value = todayDateString();
    renderRecordsByDate();
    updateToolUI();
}

function logout() {
    setSession('');
    currentUser = null;
    currentRecordId = null;
    rawSourceData = null;
    authScreen.classList.remove('hidden');
    appRoot.classList.add('hidden');
    loginPassword.value = '';
    loginError.textContent = '';
}

function handleLogin() {
    const username = loginUsername.value.trim();
    const password = loginPassword.value;
    const user = getUsers().find((u) => u.username === username && u.password === password);

    if (!user) {
        loginError.textContent = 'ユーザー名またはパスワードが違います。';
        return;
    }

    loginError.textContent = '';
    setSession(user.id);
    showAppForUser(user);
}

function formatRecordDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${y}/${m}/${d}`;
}

function normalizeRotationDeg(rotation) {
    const r = Number(rotation);
    if (!Number.isFinite(r)) return 0;
    return ((r % 360) + 360) % 360;
}

function normalizeRecordStatus(record) {
    if (!record) return 'not_checked';
    if (record.status === 'not_checked' || record.status === 'checking' || record.status === 'done') {
        return record.status;
    }
    return record.checked ? 'done' : 'not_checked';
}

function getRecordStatusLabel(status) {
    if (status === 'checking') return '確認中';
    if (status === 'done') return '確認完了';
    return '未チェック';
}

function getRecordStatusClass(status) {
    if (status === 'checking') return 'checking';
    if (status === 'done') return 'checked';
    return 'unchecked';
}

function buildRecordSection(title, records) {
    const section = document.createElement('section');
    section.className = 'record-section';

    const heading = document.createElement('div');
    heading.className = 'record-section-title';
    heading.textContent = `${title} (${records.length})`;
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'record-section-grid';

    if (records.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = '該当なし';
        grid.appendChild(empty);
    } else {
        records.forEach((record) => {
            const status = normalizeRecordStatus(record);
            const item = document.createElement('div');
            item.className = `record-item ${getRecordStatusClass(status)} ${record.id === currentRecordId ? 'active' : ''}`;
            item.innerHTML = `
                <div class="title">${record.name}</div>
                <div class="meta">日付: ${formatRecordDate(record.date)}</div>
                <div class="meta">状態: ${getRecordStatusLabel(status)}</div>
            `;
            item.addEventListener('click', () => openRecord(record.id));
            grid.appendChild(item);
        });
    }

    section.appendChild(grid);
    return section;
}

function initButtonTooltips() {
    document.querySelectorAll('button').forEach((btn) => {
        if (btn.dataset.noTooltip === '1') return;

        const explicitLabel = btn.querySelector('.sidebar-label, span');
        const label = (explicitLabel?.textContent || btn.textContent || '').trim();
        if (label) btn.title = label;
    });
}

function renderRecordsByDate() {
    const selectedDate = filterDateInput.value || todayDateString();
    const records = getRecords()
        .filter((r) => r.date === selectedDate)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    recordsList.innerHTML = '';

    if (records.length === 0) {
        recordsList.innerHTML = '<div class="muted">この日の納品書はありません。</div>';
        return;
    }

    const notCheckedRecords = [];
    const checkingRecords = [];
    const doneRecords = [];

    records.forEach((record) => {
        const status = normalizeRecordStatus(record);
        if (status === 'checking') {
            checkingRecords.push(record);
        } else if (status === 'done') {
            doneRecords.push(record);
        } else {
            notCheckedRecords.push(record);
        }
    });

    recordsList.appendChild(buildRecordSection('未チェック', notCheckedRecords));
    recordsList.appendChild(buildRecordSection('確認中', checkingRecords));
    recordsList.appendChild(buildRecordSection('確認完了', doneRecords));
}

function updateRecordMetaUI(record) {
    if (!record) {
        recordNameInput.value = '';
        recordStatusInput.value = 'not_checked';
        return;
    }

    recordNameInput.value = record.name || '';
    recordStatusInput.value = normalizeRecordStatus(record);
}

function cloneLines(lines) {
    return JSON.parse(JSON.stringify(lines || []));
}

function dataUrlToImage(dataUrl, callback) {
    const img = new Image();
    img.onload = () => callback(img);
    img.src = dataUrl;
}

function parseFileToDataUrl(file, done) {
    const reader = new FileReader();

    if (file.type === 'application/pdf') {
        reader.onload = (ev) => {
            const typedarray = new Uint8Array(ev.target.result);
            pdfjsLib.getDocument(typedarray).promise.then((pdf) => {
                pdf.getPage(1).then((page) => {
                    const viewport = page.getViewport({ scale: 1.2 });
                    const tmpCanvas = document.createElement('canvas');
                    const tmpCtx = tmpCanvas.getContext('2d');
                    tmpCanvas.width = viewport.width;
                    tmpCanvas.height = viewport.height;
                    page.render({ canvasContext: tmpCtx, viewport }).promise.then(() => {
                        done(tmpCanvas.toDataURL('image/png'));
                    });
                });
            });
        };
        reader.readAsArrayBuffer(file);
        return;
    }

    if (file.type.startsWith('image/')) {
        reader.onload = (ev) => {
            done(ev.target.result);
        };
        reader.readAsDataURL(file);
    }
}

function createRecordFromUpload(file) {
    if (!file) return;

    parseFileToDataUrl(file, (bgDataUrl) => {
        const date = filterDateInput.value || todayDateString();
        const records = getRecords();

        const record = {
            id: `r-${Date.now()}`,
            name: file.name,
            date,
            status: 'not_checked',
            checked: false,
            rotation: 0,
            bgDataUrl,
            linesHistory: [],
            editorUserId: currentUser.id,
            updatedAt: new Date().toISOString()
        };

        records.push(record);
        saveRecords(records);
        renderRecordsByDate();
        openRecord(record.id);
    });
}

function openRecord(recordId) {
    autoSaveCurrentRecord();
    const record = getRecords().find((r) => r.id === recordId);
    if (!record) return;

    currentRecordId = record.id;
    updateRecordMetaUI(record);

    dataUrlToImage(record.bgDataUrl, (img) => {
        rawSourceData = { type: 'image', data: img };
        currentRotation = normalizeRotationDeg(record.rotation);
        initContainer(cloneLines(record.linesHistory));
        renderRecordsByDate();
    });
}

function saveCurrentRecordMetaAndCanvas() {
    if (!currentRecordId || !rawSourceData) return;

    const records = getRecords();
    const idx = records.findIndex((r) => r.id === currentRecordId);
    if (idx < 0) return;

    const record = records[idx];
    record.name = recordNameInput.value.trim() || record.name;
    record.status = recordStatusInput.value;
    record.checked = record.status === 'done';
    record.rotation = normalizeRotationDeg(currentRotation);
    record.linesHistory = cloneLines(linesHistory);
    record.bgDataUrl = bgCanvas.toDataURL('image/png');
    record.updatedAt = new Date().toISOString();
    record.editorUserId = currentUser.id;

    records[idx] = record;
    saveRecords(records);
    renderRecordsByDate();
}

function autoSaveCurrentRecord() {
    if (!currentRecordId || !rawSourceData) return;
    saveCurrentRecordMetaAndCanvas();
}

function initContainer(initialLines = []) {
    document.getElementById('drop-zone-text').style.display = 'none';
    canvasWrapper.style.display = 'block';
    if (isMobileView()) closeSidebar();

    const originalWidth = rawSourceData.data.width;
    const originalHeight = rawSourceData.data.height;

    bgCanvas.width = originalWidth;
    bgCanvas.height = originalHeight;
    paintCanvas.width = originalWidth;
    paintCanvas.height = originalHeight;
    cropCanvas.width = originalWidth;
    cropCanvas.height = originalHeight;
    cancelCropSelection();

    bgCtx.drawImage(rawSourceData.data, 0, 0);
    linesHistory = cloneLines(initialLines);
    redrawCanvas();
    resetToFit();
    updateToolUI();
}

function applyTransform() {
    if (!rawSourceData) return;

    currentRotation = normalizeRotationDeg(currentRotation);

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
        autoSaveCurrentRecord();
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

function handleCropEnd() {
    isCropping = false;
    if (cropRect && (cropRect.w < 5 || cropRect.h < 5)) cropRect = null;
    drawCropOverlay();
    updateToolUI();
}

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    updateToolUI();
    autoSaveCurrentRecord();
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

btnLogin.addEventListener('click', handleLogin);
loginPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
});
btnHeaderLogout.addEventListener('click', () => {
    autoSaveCurrentRecord();
    logout();
});

btnSidebarCollapse.addEventListener('click', () => {
    if (isMobileView()) return;
    const collapsed = appRoot.classList.contains('sidebar-collapsed');
    setSidebarCollapsed(!collapsed);
});

sidebarToggle.addEventListener('click', () => {
    if (!isMobileView()) return;
    if (sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
});
sidebarOverlay.addEventListener('click', closeSidebar);

window.addEventListener('pointerdown', (e) => {
    const started = tryStartSidebarGesture(e);
    if (started) e.preventDefault();
}, { passive: false, capture: true });

window.addEventListener('pointermove', (e) => {
    if (!isSidebarGestureActive) return;
    handleSidebarGestureMove(e);
    e.preventDefault();
}, { passive: false, capture: true });

window.addEventListener('pointerup', (e) => {
    if (!isSidebarGestureActive) return;
    finishSidebarGesture(e);
}, { capture: true });

window.addEventListener('pointercancel', (e) => {
    cancelSidebarGesture(e);
}, { capture: true });

btnOpenAdmin.addEventListener('click', () => {
    window.location.href = 'admin.html';
});

btnUpload.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => createRecordFromUpload(e.target.files[0]));

recordStatusInput.addEventListener('change', saveCurrentRecordMetaAndCanvas);
btnSaveRecord.addEventListener('click', () => {
    saveCurrentRecordMetaAndCanvas();
    alert('保存しました。');
});

filterDateInput.addEventListener('change', () => {
    autoSaveCurrentRecord();
    currentRecordId = null;
    renderRecordsByDate();
});

btnFilterToday.addEventListener('click', () => {
    filterDateInput.value = todayDateString();
    autoSaveCurrentRecord();
    currentRecordId = null;
    renderRecordsByDate();
});

document.getElementById('btn-pan').addEventListener('click', () => setTool('pan'));
document.getElementById('btn-brush').addEventListener('click', () => setTool('brush'));
document.getElementById('btn-eraser').addEventListener('click', () => setTool('eraser'));
document.getElementById('btn-crop').addEventListener('click', () => setTool('crop'));
document.getElementById('btn-crop-apply').addEventListener('click', applyCrop);
document.getElementById('btn-crop-cancel').addEventListener('click', cancelCropSelection);
document.getElementById('btn-zoom-in').addEventListener('click', () => zoom(0.1));
document.getElementById('btn-zoom-out').addEventListener('click', () => zoom(-0.1));
document.getElementById('btn-zoom-fit').addEventListener('click', resetToFit);
document.getElementById('btn-rotate-cw').addEventListener('click', () => {
    currentRotation = normalizeRotationDeg(currentRotation + 90);
    applyTransform();
    autoSaveCurrentRecord();
});

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
        autoSaveCurrentRecord();
    }
});

lineWidthPicker.addEventListener('input', () => {
    if (currentTool !== 'eraser' || eraserIndicator.style.display !== 'block') return;
    const currentSize = Math.max(8, parseInt(lineWidthPicker.value, 10) * currentScale);
    eraserIndicator.style.width = `${currentSize}px`;
    eraserIndicator.style.height = `${currentSize}px`;
});

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
    createRecordFromUpload(e.dataTransfer.files[0]);
});

workspace.addEventListener('wheel', (e) => {
    if (!rawSourceData) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    zoom(delta);
}, { passive: false });

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

window.addEventListener('resize', () => {
    if (rawSourceData && currentScale === baseScale) resetToFit();
    if (isMobileView()) {
        appRoot.classList.remove('sidebar-collapsed');
    } else {
        closeSidebar();
        restoreSidebarCollapsed();
    }
});

window.addEventListener('beforeunload', () => {
    autoSaveCurrentRecord();
});

ensureDefaultAdmin();
const sessionUser = getSessionUser();
if (sessionUser) {
    showAppForUser(sessionUser);
} else {
    authScreen.classList.remove('hidden');
    appRoot.classList.add('hidden');
}

updateToolUI();
restoreSidebarCollapsed();
initButtonTooltips();
