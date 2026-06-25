pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const AUTH_TOKEN_KEY = 'ukeire_auth_token_v2';
const RECORDS_KEY = 'ukeire_nohinsho_records_v1';
const SIDEBAR_COLLAPSED_KEY = 'ukeire_sidebar_collapsed_v1';
const STAMP_NAMES_KEY = 'ukeire_stamp_names_v1';
const API_AUTH_LOGIN = '/api/auth/login';
const API_AUTH_LOGOUT = '/api/auth/logout';
const API_AUTH_ME = '/api/auth/me';
const API_RECORDS = '/api/records';
const API_UPLOADS = '/api/uploads';

const authScreen = document.getElementById('auth-screen');
const appRoot = document.getElementById('app-root');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const btnLogin = document.getElementById('btn-login');

const workspace = document.getElementById('workspace');
const fileInput = document.getElementById('file-input');
const folderInput = document.getElementById('folder-input');
const canvasWrapper = document.getElementById('canvas-wrapper');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const btnSidebarCollapse = document.getElementById('btn-sidebar-collapse');
const sidebarCollapseIcon = document.getElementById('sidebar-collapse-icon');
const eraserIndicator = document.getElementById('eraser-indicator');
const stampIndicator = document.getElementById('stamp-indicator');
const uploadToast = document.getElementById('upload-toast');
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
const btnUploadFolder = document.getElementById('btn-upload-folder');
const recordNameInput = document.getElementById('record-name');
const recordStatusInput = document.getElementById('record-status');
const btnSaveRecord = document.getElementById('btn-save-record');
const btnEditRecord = document.getElementById('btn-edit-record');
const btnDeleteRecord = document.getElementById('btn-delete-record');
const filterDateInput = document.getElementById('filter-date');
const btnFilterToday = document.getElementById('btn-filter-today');
const recordSliderModeSelect = document.getElementById('record-slider-mode');
const btnRecordPrev = document.getElementById('btn-record-prev');
const btnRecordNext = document.getElementById('btn-record-next');
const recordSliderPosition = document.getElementById('record-slider-position');
const mainRecordSliderModeSelect = document.getElementById('main-record-slider-mode');
const mainBtnRecordPrev = document.getElementById('main-btn-record-prev');
const mainBtnRecordNext = document.getElementById('main-btn-record-next');
const mainRecordSliderPosition = document.getElementById('main-record-slider-position');
const mainBtnEditRecord = document.getElementById('main-btn-edit-record');
const mainBtnSaveRecord = document.getElementById('main-btn-save-record');
const recordsList = document.getElementById('records-list');
const stampFamilyNameInput = document.getElementById('stamp-family-name');
const stampGivenNameInput = document.getElementById('stamp-given-name');
const stampDateInput = document.getElementById('stamp-date');

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

let uploadToastTimeout = null;

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

let recordSliderMode = 'unchecked';
const recordSliderIndexByMode = { unchecked: 0, done: 0 };
let doneRecordEditEnabled = false;

const DEFAULT_STORE_DATA = {
    [RECORDS_KEY]: []
};

let storeData = JSON.parse(JSON.stringify(DEFAULT_STORE_DATA));
let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || '';
let currentSessionUser = null;
let recordsSyncTimer = null;
let recordsSyncRunning = false;
const dirtyRecordIds = new Set();
const syncedLinesHashByRecordId = new Map();
const localRecordHashById = new Map();

const DESKTOP_SIDEBAR_EXPANDED_WIDTH = 240;
const DESKTOP_SIDEBAR_COLLAPSED_WIDTH = 68;

function todayDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = `${now.getMonth() + 1}`.padStart(2, '0');
    const d = `${now.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function showUploadToast(message, type = 'info', autoDismiss = 0) {
    uploadToast.className = `upload-toast toast-${type}`;
    uploadToast.innerHTML = `<span style="flex:1">${message}</span>` +
        `<button onclick="document.getElementById('upload-toast').classList.add('hidden')" ` +
        `style="background:none;border:none;cursor:pointer;padding:0 0 0 10px;color:inherit;font-size:1.3em;line-height:1;" title="閉じる">×</button>`;
    if (uploadToastTimeout) clearTimeout(uploadToastTimeout);
    if (autoDismiss > 0) {
        uploadToastTimeout = setTimeout(() => uploadToast.classList.add('hidden'), autoDismiss);
    }
}

function hideUploadToast() {
    if (uploadToastTimeout) clearTimeout(uploadToastTimeout);
    uploadToast.classList.add('hidden');
}

async function apiRequest(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const response = await fetch(url, { ...options, headers });
    const text = await response.text();
    const payload = text ? (() => { try { return JSON.parse(text); } catch { return {}; } })() : {};
    if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
    }
    return payload;
}

function setAuthToken(token) {
    authToken = token || '';
    if (authToken) localStorage.setItem(AUTH_TOKEN_KEY, authToken);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
}

function buildRecordPayload(record) {
    return {
        name: record.name || '無題',
        date: record.date || todayDateString(),
        status: normalizeRecordStatus(record),
        rotation: normalizeRotationDeg(record.rotation || 0),
        sourceUrl: record.sourceUrl || '',
        sourceStoragePath: record.sourceStoragePath || '',
        sourceFileType: record.sourceFileType || '',
        uploadStatus: getEffectiveUploadStatus(record),
        isDeleted: !!record.isDeleted,
        deletedAt: record.deletedAt || null,
        deletedStoragePath: record.deletedStoragePath || ''
    };
}

function getLinesHistoryHash(record) {
    return JSON.stringify(Array.isArray(record?.linesHistory) ? record.linesHistory : []);
}

function getLocalRecordHash(record) {
    return JSON.stringify({
        payload: buildRecordPayload(record),
        lines: Array.isArray(record?.linesHistory) ? record.linesHistory : []
    });
}

function cacheRecordHashes(records) {
    localRecordHashById.clear();
    (Array.isArray(records) ? records : []).forEach((r) => {
        if (r?.id) localRecordHashById.set(r.id, getLocalRecordHash(r));
    });
}

async function uploadImageDataUrl(dataUrl, fileName, dateStr) {
    return apiRequest(API_UPLOADS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            dataUrl,
            fileName,
            date: dateStr || todayDateString()
        })
    });
}

function extractAnnotationLines(latestAnnotation) {
    if (!latestAnnotation) return null;
    return Array.isArray(latestAnnotation.lines_history) ? cloneLines(latestAnnotation.lines_history) : [];
}

async function loadRecordDetail(record) {
    if (!record?.id || !isServerRecordId(record.id)) {
        return { record, linesHistory: Array.isArray(record?.linesHistory) ? cloneLines(record.linesHistory) : [] };
    }

    const detail = await apiRequest(`${API_RECORDS}/${record.id}`);
    if (detail?.record) Object.assign(record, detail.record);

    const annotationLines = extractAnnotationLines(detail?.latestAnnotation);
    const linesHistory = annotationLines ?? (Array.isArray(record?.linesHistory) ? cloneLines(record.linesHistory) : []);
    if (annotationLines !== null) {
        record.linesHistory = linesHistory;
    }
    localRecordHashById.set(record.id, getLocalRecordHash(record));
    if (annotationLines !== null) {
        syncedLinesHashByRecordId.set(record.id, getLinesHistoryHash(record));
    }

    return { record, linesHistory };
}

function isServerRecordId(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${id || ''}`);
}

async function syncRecordById(recordId) {
    const records = storeData[RECORDS_KEY] || [];
    const idx = records.findIndex((r) => r.id === recordId);
    if (idx < 0) return;
    const record = records[idx];

    if (!isServerRecordId(record.id)) {
        const created = await apiRequest(API_RECORDS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildRecordPayload(record))
        });
        const newId = created?.record?.id;
        if (newId) {
            record.id = newId;
            records[idx] = record;
            if (currentRecordId === recordId) currentRecordId = newId;
            const oldHash = localRecordHashById.get(recordId);
            if (oldHash !== undefined) {
                localRecordHashById.delete(recordId);
                localRecordHashById.set(newId, oldHash);
            }
            dirtyRecordIds.delete(recordId);
            dirtyRecordIds.add(newId);
        }
        if (newId && Array.isArray(record.linesHistory)) {
            await apiRequest(`${API_RECORDS}/${newId}/annotations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ linesHistory: record.linesHistory, comment: 'sync-create' })
            });
            syncedLinesHashByRecordId.set(newId, getLinesHistoryHash(record));
        }
        return;
    }

    await apiRequest(`${API_RECORDS}/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRecordPayload(record))
    });

    if (Array.isArray(record.linesHistory)) {
        const currentHash = getLinesHistoryHash(record);
        const previousHash = syncedLinesHashByRecordId.get(record.id);
        if (currentHash === previousHash) return;
        await apiRequest(`${API_RECORDS}/${record.id}/annotations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ linesHistory: record.linesHistory, comment: 'sync-update' })
        });
        syncedLinesHashByRecordId.set(record.id, currentHash);
    }
}

async function flushDirtyRecords() {
    if (recordsSyncRunning || !authToken) return;
    recordsSyncRunning = true;
    try {
        while (dirtyRecordIds.size > 0) {
            const [id] = Array.from(dirtyRecordIds);
            dirtyRecordIds.delete(id);
            await syncRecordById(id);
        }
    } catch (error) {
        console.warn('Failed to sync record changes:', error);
    } finally {
        recordsSyncRunning = false;
    }
}

function scheduleRecordsSync() {
    if (recordsSyncTimer) clearTimeout(recordsSyncTimer);
    recordsSyncTimer = setTimeout(() => {
        flushDirtyRecords();
    }, 150);
}

function getRecords() {
    const records = storeData[RECORDS_KEY];
    return Array.isArray(records) ? records : [];
}

function saveRecords(records) {
    const next = Array.isArray(records) ? records : [];
    const liveIds = new Set();

    next.forEach((r) => {
        if (!r?.id) return;
        liveIds.add(r.id);
        const currentHash = getLocalRecordHash(r);
        const previousHash = localRecordHashById.get(r.id);
        if (currentHash !== previousHash) {
            dirtyRecordIds.add(r.id);
            localRecordHashById.set(r.id, currentHash);
        }
    });

    Array.from(localRecordHashById.keys()).forEach((id) => {
        if (!liveIds.has(id)) localRecordHashById.delete(id);
    });

    storeData[RECORDS_KEY] = next;
    scheduleRecordsSync();
}

function getSessionUser() {
    return currentSessionUser;
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

function pickDefaultFilterDate(records) {
    const today = todayDateString();
    const list = Array.isArray(records) ? records : [];
    const active = list.filter((r) => !r?.isDeleted && typeof r?.date === 'string' && r.date);
    if (active.length === 0) return today;

    if (active.some((r) => r.date === today)) return today;

    const sorted = active
        .map((r) => r.date)
        .sort((a, b) => (a < b ? 1 : -1));

    return sorted[0] || today;
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
    loadStampNameInputs(user.id);

    filterDateInput.value = pickDefaultFilterDate(getRecords());
    recordSliderMode = 'unchecked';
    recordSliderModeSelect.value = 'unchecked';
    recordSliderIndexByMode.unchecked = 0;
    recordSliderIndexByMode.done = 0;
    doneRecordEditEnabled = false;
    renderRecordsByDate();
    openCurrentSliderRecord();
    updateToolUI();
}

async function logout() {
    try {
        if (authToken) {
            await apiRequest(API_AUTH_LOGOUT, { method: 'POST' });
        }
    } catch (error) {
        console.warn('Logout failed:', error);
    }
    setAuthToken('');
    currentSessionUser = null;
    currentUser = null;
    currentRecordId = null;
    rawSourceData = null;
    storeData[RECORDS_KEY] = [];
    authScreen.classList.remove('hidden');
    appRoot.classList.add('hidden');
    loginPassword.value = '';
    loginError.textContent = '';
}

async function handleLogin() {
    const username = loginUsername.value.trim();
    const password = loginPassword.value;
    if (!username || !password) {
        loginError.textContent = 'ユーザー名とパスワードを入力してください。';
        return;
    }

    try {
        const result = await apiRequest(API_AUTH_LOGIN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        setAuthToken(result.token || '');
        currentSessionUser = result.user || null;
        loginError.textContent = '';

        const recordsPayload = await apiRequest(`${API_RECORDS}?includeDeleted=true`);
        storeData[RECORDS_KEY] = Array.isArray(recordsPayload?.records) ? recordsPayload.records : [];
        cacheRecordHashes(storeData[RECORDS_KEY]);
        showAppForUser(currentSessionUser);
    } catch (error) {
        loginError.textContent = 'ユーザー名またはパスワードが違います。';
    }
}

function formatRecordDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${y}/${m}/${d}`;
}

function formatStampDate(dateStr) {
    const value = dateStr || todayDateString();
    const match = `${value}`.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return value;
    return `${match[1]}.${parseInt(match[2], 10)}.${parseInt(match[3], 10)}`;
}

function getStampNamesStore() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STAMP_NAMES_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function resetStampDateInput() {
    if (stampDateInput) stampDateInput.value = todayDateString();
}

function loadStampNameInputs(userId) {
    const saved = getStampNamesStore()[userId] || {};
    if (stampFamilyNameInput) stampFamilyNameInput.value = saved.family || '';
    if (stampGivenNameInput) stampGivenNameInput.value = saved.given || '';
    resetStampDateInput();
}

function saveStampNameInputs(userId) {
    if (!userId) return;
    const store = getStampNamesStore();
    store[userId] = {
        family: stampFamilyNameInput?.value.trim() || '',
        given: stampGivenNameInput?.value.trim() || ''
    };
    localStorage.setItem(STAMP_NAMES_KEY, JSON.stringify(store));
}

function getStampDateString() {
    return stampDateInput?.value || todayDateString();
}

function getStampDiameter() {
    const width = parseInt(lineWidthPicker.value, 10);
    return Math.max(56, Math.min(220, width * 16));
}

function getHorizontalCircleChord(cx, cy, radius, yPos) {
    const dy = yPos - cy;
    if (Math.abs(dy) >= radius) return null;
    const halfLen = Math.sqrt((radius * radius) - (dy * dy));
    return { y: yPos, x1: cx - halfLen, x2: cx + halfLen };
}

function getStampSectionWidth(cx, cy, radius, sectionCenterY, paddingRatio = 0.88) {
    const chord = getHorizontalCircleChord(cx, cy, radius, sectionCenterY);
    if (!chord) return radius * paddingRatio;
    return (chord.x2 - chord.x1) * paddingRatio;
}

function drawFittedHorizontalStampText(ctx, text, centerX, centerY, maxWidth, maxHeight, maxFontSize, color) {
    const value = `${text || ''}`.trim();
    if (!value || maxWidth <= 0 || maxHeight <= 0) return;

    ctx.save();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let fontSize = Math.min(maxFontSize, maxHeight);
    while (fontSize > 6) {
        ctx.font = `700 ${fontSize}px "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif`;
        const metrics = ctx.measureText(value);
        if (metrics.width <= maxWidth && fontSize <= maxHeight) break;
        fontSize -= 1;
    }

    ctx.fillText(value, centerX, centerY);
    ctx.restore();
}

function drawJapaneseCircleStamp(ctx, stamp) {
    const cx = stamp.x;
    const cy = stamp.y;
    const diameter = stamp.size || 80;
    const radius = diameter / 2;
    const color = stamp.color || '#c41e3a';
    const borderWidth = Math.max(2.5, diameter * 0.045);
    const dividerWidth = Math.max(1.5, diameter * 0.028);
    const innerRadius = radius - borderWidth * 0.6;
    const topDividerY = cy - radius / 3;
    const bottomDividerY = cy + radius / 3;
    const topSectionY = cy - (radius * 2) / 3;
    const bottomSectionY = cy + (radius * 2) / 3;
    const sectionHeight = radius / 3;
    const nameMaxFontSize = Math.max(11, diameter * 0.18);
    const dateMaxFontSize = Math.max(9, diameter * 0.13);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineCap = 'butt';

    ctx.beginPath();
    ctx.lineWidth = borderWidth;
    ctx.arc(cx, cy, radius - borderWidth / 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = dividerWidth;
    [topDividerY, bottomDividerY].forEach((yPos) => {
        const chord = getHorizontalCircleChord(cx, cy, innerRadius, yPos);
        if (!chord) return;
        ctx.beginPath();
        ctx.moveTo(chord.x1, chord.y);
        ctx.lineTo(chord.x2, chord.y);
        ctx.stroke();
    });

    const topWidth = getStampSectionWidth(cx, cy, innerRadius, topSectionY);
    const middleWidth = getStampSectionWidth(cx, cy, innerRadius, cy);
    const bottomWidth = getStampSectionWidth(cx, cy, innerRadius, bottomSectionY);

    drawFittedHorizontalStampText(
        ctx, stamp.familyName, cx, topSectionY, topWidth, sectionHeight * 0.82, nameMaxFontSize, color
    );
    drawFittedHorizontalStampText(
        ctx, stamp.dateText || formatStampDate(stamp.date), cx, cy, middleWidth, sectionHeight * 0.82, dateMaxFontSize, color
    );
    drawFittedHorizontalStampText(
        ctx, stamp.givenName, cx, bottomSectionY, bottomWidth, sectionHeight * 0.82, nameMaxFontSize, color
    );

    ctx.restore();
}

function createStampAt(x, y) {
    const familyName = stampFamilyNameInput?.value.trim() || '';
    const givenName = stampGivenNameInput?.value.trim() || '';
    if (!familyName && !givenName) {
        showUploadToast('<i class="fa-solid fa-stamp"></i> サイドバーに姓と名を入力してください。', 'info', 2800);
        return null;
    }

    const date = getStampDateString();
    return {
        user: currentUser,
        tool: 'stamp',
        color: colorPicker.value || '#c41e3a',
        size: getStampDiameter(),
        x,
        y,
        familyName,
        givenName,
        date,
        dateText: formatStampDate(date),
        timestamp: new Date().toLocaleTimeString()
    };
}

function placeStampAtCoordinates(coords) {
    const stamp = createStampAt(coords.x, coords.y);
    if (!stamp) return false;
    linesHistory.push(stamp);
    redrawCanvas();
    autoSaveCurrentRecord();
    return true;
}

function normalizeRotationDeg(rotation) {
    const r = Number(rotation);
    if (!Number.isFinite(r)) return 0;
    return ((r % 360) + 360) % 360;
}

function normalizeRecordStatus(record) {
    if (!record) return 'not_checked';
    if (record.status === 'not_checked' || record.status === 'done') {
        return record.status;
    }
    return record.checked ? 'done' : 'not_checked';
}

function getEffectiveUploadStatus(record) {
    if (!record) return 'done';
    if (record.isDeleted) return 'deleted';
    if (record.sourceUrl || record.bgDataUrl) return 'done';
    if (record.uploadStatus === 'failed') return 'failed';
    return record.uploadStatus || 'uploading';
}

function getRecordStatusLabel(status) {
    if (status === 'done') return '確認完了';
    return '未チェック';
}

function getRecordStatusClass(status) {
    if (status === 'done') return 'checked';
    return 'unchecked';
}

function getRecordsForSelectedDate() {
    const selectedDate = filterDateInput.value || todayDateString();
    return getRecords()
        .filter((r) => r.date === selectedDate && !r.isDeleted)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

function getRecordGroupsForSlider() {
    const all = getRecordsForSelectedDate();
    const unchecked = [];
    const done = [];

    all.forEach((record) => {
        const status = normalizeRecordStatus(record);
        if (status === 'done') done.push(record);
        else unchecked.push(record);
    });

    return { unchecked, done };
}

function setCurrentSliderIndexByRecordId(recordId) {
    const groups = getRecordGroupsForSlider();
    const modeRecords = groups[recordSliderMode] || [];
    const idx = modeRecords.findIndex((r) => r.id === recordId);
    if (idx >= 0) recordSliderIndexByMode[recordSliderMode] = idx;
}

function getCurrentRecord() {
    if (!currentRecordId) return null;
    return getRecords().find((r) => r.id === currentRecordId) || null;
}

function isCurrentRecordEditable() {
    const record = getCurrentRecord();
    if (!record) return false;
    const status = normalizeRecordStatus(record);
    if (status !== 'done') return true;
    return doneRecordEditEnabled;
}

function syncWorkflowModeSelectors() {
    recordSliderModeSelect.value = recordSliderMode;
    if (mainRecordSliderModeSelect) mainRecordSliderModeSelect.value = recordSliderMode;
}

function updateRecordControlsState() {
    const record = getCurrentRecord();
    const status = normalizeRecordStatus(record);
    const isDone = status === 'done';
    const isLockedDone = isDone && !doneRecordEditEnabled;
    const hasRecord = !!record;

    const showEdit = recordSliderMode === 'done' && isDone && hasRecord;
    btnEditRecord.classList.toggle('hidden', !showEdit);
    if (mainBtnEditRecord) mainBtnEditRecord.classList.toggle('hidden', !showEdit);

    btnSaveRecord.innerHTML = '<i class="fa-solid fa-floppy-disk"></i><span class="sidebar-label">保存して次へ</span>';
    if (mainBtnSaveRecord) {
        mainBtnSaveRecord.innerHTML = '<i class="fa-solid fa-floppy-disk"></i><span>保存して次へ</span>';
    }

    recordNameInput.disabled = !hasRecord || isLockedDone;
    recordStatusInput.disabled = !hasRecord || recordSliderMode === 'done' || isLockedDone;
    btnSaveRecord.disabled = !hasRecord || (recordSliderMode === 'done' && !doneRecordEditEnabled);
    if (mainBtnSaveRecord) {
        mainBtnSaveRecord.disabled = btnSaveRecord.disabled;
    }
    if (mainBtnEditRecord) {
        mainBtnEditRecord.disabled = !showEdit;
    }

    const lockEditTools = !hasRecord || isLockedDone;
    ['btn-brush', 'btn-eraser', 'btn-stamp', 'btn-crop', 'btn-undo', 'btn-clear'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = lockEditTools;
    });
}

function renderSliderRecordCard(record) {
    const status = normalizeRecordStatus(record);
    const uploadStatus = getEffectiveUploadStatus(record);
    const item = document.createElement('div');
    item.className = `record-item ${getRecordStatusClass(status)} active`;
    const uploadBadge = uploadStatus === 'uploading'
        ? '<div class="meta"><span class="upload-badge badge-uploading">\u2601 アップロード中</span></div>'
        : uploadStatus === 'failed'
        ? '<div class="meta"><span class="upload-badge badge-failed">&#9888; アップロード失敗</span></div>'
        : '';
    item.innerHTML = `
        <div class="title">${record.name}</div>
        <div class="meta">日付: ${formatRecordDate(record.date)}</div>
        <div class="meta">状態: ${getRecordStatusLabel(status)}</div>
        ${uploadBadge}
    `;
    return item;
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
    syncWorkflowModeSelectors();
    const groups = getRecordGroupsForSlider();
    const modeRecords = groups[recordSliderMode] || [];

    if (currentRecordId) {
        const currentIdx = modeRecords.findIndex((r) => r.id === currentRecordId);
        if (currentIdx >= 0) recordSliderIndexByMode[recordSliderMode] = currentIdx;
    }

    const count = modeRecords.length;
    let index = recordSliderIndexByMode[recordSliderMode] || 0;
    if (index < 0) index = 0;
    if (count > 0 && index > count - 1) index = count - 1;
    recordSliderIndexByMode[recordSliderMode] = index;

    recordSliderPosition.textContent = `${count === 0 ? 0 : index + 1} / ${count}`;
    btnRecordPrev.disabled = count <= 1;
    btnRecordNext.disabled = count <= 1;
    if (mainRecordSliderPosition) mainRecordSliderPosition.textContent = recordSliderPosition.textContent;
    if (mainBtnRecordPrev) mainBtnRecordPrev.disabled = btnRecordPrev.disabled;
    if (mainBtnRecordNext) mainBtnRecordNext.disabled = btnRecordNext.disabled;

    recordsList.innerHTML = '';

    if (count === 0) {
        const modeLabel = recordSliderMode === 'unchecked' ? '未チェック' : '確認完了';
        recordsList.innerHTML = `<div class="muted">${modeLabel}の納品書はありません。</div>`;
        updateRecordControlsState();
        return;
    }

    const active = modeRecords[index];
    recordsList.appendChild(renderSliderRecordCard(active));
    updateRecordControlsState();
}

function updateRecordMetaUI(record) {
    if (!record) {
        recordNameInput.value = '';
        recordStatusInput.value = 'not_checked';
        return;
    }

    recordNameInput.value = record.name || '';
    recordStatusInput.value = normalizeRecordStatus(record);
    updateRecordControlsState();
}

function resetWorkspaceForNoRecord(message = '先に納品書を選択またはアップロードしてください') {
    currentRecordId = null;
    rawSourceData = null;
    linesHistory = [];
    currentLine = null;
    isDrawing = false;
    isCropping = false;
    cropAnchor = null;
    cropRect = null;

    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);

    const dropZone = document.getElementById('drop-zone-text');
    dropZone.style.display = '';
    dropZone.textContent = message;
    canvasWrapper.style.display = 'none';

    updateRecordMetaUI(null);
    cancelCropSelection();
    setTool('pan');
    updateToolUI();
}

async function deleteCurrentRecord() {
    if (!currentRecordId) {
        alert('削除する納品書が選択されていません。');
        return;
    }

    const records = getRecords();
    const record = records.find((r) => r.id === currentRecordId);
    if (!record) {
        resetWorkspaceForNoRecord();
        renderRecordsByDate();
        return;
    }

    const confirmed = confirm(`「${record.name || '無題'}」を削除しますか？`);
    if (!confirmed) return;

    const idx = records.findIndex((r) => r.id === currentRecordId);
    if (idx < 0) return;

    const updatedRecord = {
        ...record,
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        uploadStatus: 'deleted',
        updatedAt: new Date().toISOString(),
        editorUserId: currentUser?.id || record.editorUserId
    };

    records[idx] = updatedRecord;
    saveRecords(records);
    try {
        await persistPendingRecordChanges();
    } catch (error) {
        console.warn('Failed to sync soft delete immediately:', error);
    }
    resetWorkspaceForNoRecord('納品書を削除一覧へ移動しました。');
    renderRecordsByDate();
    await openCurrentSliderRecord();
    showUploadToast('<i class="fa-solid fa-box-archive"></i> 削除一覧へ移動しました。', 'success', 4000);
}

function cloneLines(lines) {
    return JSON.parse(JSON.stringify(lines || []));
}

function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    if (parts.length !== 2) throw new Error('Invalid data URL');
    const mimeMatch = parts[0].match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = atob(parts[1]);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

function parseFileToDataUrl(file, done) {
    const reader = new FileReader();

    reader.onerror = () => done(null, new Error('ファイルの読み込みに失敗しました。'));

    if (file.type === 'application/pdf') {
        reader.onload = (ev) => {
            const typedarray = new Uint8Array(ev.target.result);
            pdfjsLib.getDocument(typedarray).promise
                .then((pdf) => pdf.getPage(1))
                .then((page) => {
                    const viewport = page.getViewport({ scale: 1.2 });
                    const tmpCanvas = document.createElement('canvas');
                    const tmpCtx = tmpCanvas.getContext('2d');
                    tmpCanvas.width = viewport.width;
                    tmpCanvas.height = viewport.height;
                    return page.render({ canvasContext: tmpCtx, viewport }).promise.then(() => {
                        done(tmpCanvas.toDataURL('image/png'), null);
                    });
                })
                .catch((err) => done(null, err instanceof Error ? err : new Error('PDFの処理に失敗しました。')));
        };
        reader.readAsArrayBuffer(file);
        return;
    }

    if (file.type.startsWith('image/'))  {
        reader.onload = (ev) => {
            done(ev.target.result, null);
        };
        reader.readAsDataURL(file);
        return;
    }

    done(null, new Error('画像またはPDFファイルのみ対応しています。'));
}

function isSupportedUploadFile(file) {
    if (!file) return false;
    const type = `${file.type || ''}`.toLowerCase();
    if (type.startsWith('image/') || type === 'application/pdf') return true;
    const name = `${file.name || ''}`.toLowerCase();
    return /\.(png|jpe?g|gif|bmp|webp|svg|pdf)$/i.test(name);
}

function createRecordFromUpload(file, options = {}) {
    if (!file) return Promise.resolve(null);
    const {
        lockSingleButton = true,
        showSingleToast = true,
        focusPreview = true
    } = options;

    if (lockSingleButton) btnUpload.disabled = true;

    const date = filterDateInput.value || todayDateString();
    const records = getRecords();

    const record = {
        id: `r-${Date.now()}`,
        name: file.name,
        date,
        status: 'not_checked',
        checked: false,
        rotation: 0,
        sourceUrl: '',
        sourceFileType: file.type || '',
        uploadStatus: 'uploading',
        linesHistory: [],
        editorUserId: currentUser.id,
        updatedAt: new Date().toISOString()
    };

    records.push(record);
    saveRecords(records);
    renderRecordsByDate();

    // Display locally and store the rendered image as a data URL.
    return new Promise((resolve) => {
        parseFileToDataUrl(file, (bgDataUrl, parseError) => {
            if (parseError || !bgDataUrl) {
                const latestRecords = getRecords();
                const latestIdx = latestRecords.findIndex((r) => r.id === record.id);
                if (latestIdx >= 0) {
                    latestRecords[latestIdx].uploadStatus = 'failed';
                    latestRecords[latestIdx].updatedAt = new Date().toISOString();
                    saveRecords(latestRecords);
                    renderRecordsByDate();
                }
                if (lockSingleButton) btnUpload.disabled = false;
                if (showSingleToast) {
                    showUploadToast(
                        `<i class="fa-solid fa-circle-exclamation"></i> ファイル処理失敗: ${parseError?.message || '不明なエラー'}`,
                        'error'
                    );
                }
                resolve({ ok: false, recordId: record.id, reason: 'parse-failed' });
                return;
            }

            if (focusPreview) {
                currentRecordId = record.id;
                updateRecordMetaUI(record);
                const localImg = new Image();
                localImg.onload = () => {
                    rawSourceData = { type: 'image', data: localImg };
                    currentRotation = 0;
                    initContainer([]);
                    renderRecordsByDate();
                };
                localImg.onerror = () => {
                    if (showSingleToast) {
                        showUploadToast('<i class="fa-solid fa-circle-exclamation"></i> 画像プレビューの表示に失敗しました。', 'error');
                    }
                };
                localImg.src = bgDataUrl;
            }

            if (showSingleToast) {
                showUploadToast('<i class="fa-solid fa-spinner fa-spin"></i> Supabase Storage にアップロード中...', 'info');
            }

            uploadImageDataUrl(bgDataUrl, file.name, record.date)
                .then(async (uploadResult) => {
                    const latestRecords = getRecords();
                    const latestIdx = latestRecords.findIndex((r) => r.id === record.id);
                    if (latestIdx >= 0) {
                        latestRecords[latestIdx].sourceUrl = uploadResult.publicUrl || '';
                        latestRecords[latestIdx].sourceStoragePath = uploadResult.storagePath || '';
                        latestRecords[latestIdx].uploadStatus = 'done';
                        latestRecords[latestIdx].updatedAt = new Date().toISOString();
                        saveRecords(latestRecords);
                        renderRecordsByDate();
                    }

                    if (showSingleToast) {
                        showUploadToast('<i class="fa-solid fa-circle-check"></i> 画像をアップロードしました。', 'success', 4000);
                    }
                    resolve({ ok: true, recordId: record.id });
                })
                .catch((error) => {
                    const latestRecords = getRecords();
                    const latestIdx = latestRecords.findIndex((r) => r.id === record.id);
                    if (latestIdx >= 0) {
                        latestRecords[latestIdx].uploadStatus = 'failed';
                        latestRecords[latestIdx].updatedAt = new Date().toISOString();
                        saveRecords(latestRecords);
                        renderRecordsByDate();
                    }

                    if (showSingleToast) {
                        showUploadToast(
                            `<i class="fa-solid fa-circle-exclamation"></i> アップロード失敗: ${error.message || 'ネットワークエラー'}`,
                            'error'
                        );
                    }
                    resolve({ ok: false, recordId: record.id, reason: 'upload-failed' });
                })
                .finally(() => {
                    if (lockSingleButton) btnUpload.disabled = false;
                });
        });
    });
}

async function createRecordsFromFolder(files) {
    const allFiles = Array.from(files || []);
    const targetFiles = allFiles.filter(isSupportedUploadFile);

    if (targetFiles.length === 0) {
        showUploadToast('<i class="fa-solid fa-circle-info"></i> フォルダ内に対応ファイル（画像/PDF）がありません。', 'error', 4500);
        return;
    }

    btnUpload.disabled = true;
    btnUploadFolder.disabled = true;

    showUploadToast(`<i class="fa-solid fa-spinner fa-spin"></i> フォルダアップロード中... (0/${targetFiles.length})`, 'info');

    let success = 0;
    let failed = 0;
    let firstSuccessRecordId = null;

    for (let i = 0; i < targetFiles.length; i++) {
        const file = targetFiles[i];
        const result = await createRecordFromUpload(file, {
            lockSingleButton: false,
            showSingleToast: false,
            focusPreview: false
        });

        if (result?.ok) {
            success += 1;
            if (!firstSuccessRecordId) firstSuccessRecordId = result.recordId;
        } else {
            failed += 1;
        }

        showUploadToast(
            `<i class="fa-solid fa-spinner fa-spin"></i> フォルダアップロード中... (${i + 1}/${targetFiles.length})`,
            'info'
        );
    }

    btnUpload.disabled = false;
    btnUploadFolder.disabled = false;

    if (firstSuccessRecordId) {
        openRecord(firstSuccessRecordId);
    }

    showUploadToast(
        `<i class="fa-solid fa-circle-check"></i> フォルダアップロード完了: 成功 ${success}件 / 失敗 ${failed}件`,
        failed > 0 ? 'error' : 'success',
        5500
    );
}

async function openRecord(recordId) {
    autoSaveCurrentRecord();
    const record = getRecords().find((r) => r.id === recordId);
    if (!record) return;

    currentRecordId = record.id;
    setCurrentSliderIndexByRecordId(record.id);
    doneRecordEditEnabled = false;
    updateRecordMetaUI(record);

    let displayLinesHistory = Array.isArray(record.linesHistory) ? cloneLines(record.linesHistory) : [];

    try {
        const detail = await loadRecordDetail(record);
        if (currentRecordId !== record.id) return;
        displayLinesHistory = detail.linesHistory;
        updateRecordMetaUI(record);
    } catch (error) {
        console.warn('Failed to load latest annotation:', error);
    }

    let imageUrl = record.sourceUrl || '';
    if (!imageUrl && record.bgDataUrl) {
        imageUrl = record.bgDataUrl;
    }
    const uploadStatus = getEffectiveUploadStatus(record);

    if (!imageUrl) {
        const dropZone = document.getElementById('drop-zone-text');
        dropZone.style.display = '';
        dropZone.textContent = uploadStatus === 'failed'
            ? '画像の保存に失敗しました。再度アップロードしてください。'
            : '画像を読み込み中です。しばらくお待ちください。';
        canvasWrapper.style.display = 'none';
        rawSourceData = null;
        renderRecordsByDate();
        return;
    }

    const loadImage = (useCors) => {
        const img = new Image();
        if (useCors && imageUrl.startsWith('http')) {
            // Try CORS first so crop re-upload can use canvas.toBlob later.
            img.crossOrigin = 'anonymous';
        }

        img.onload = () => {
            if (currentRecordId !== record.id) return;
            rawSourceData = { type: 'image', data: img };
            currentRotation = normalizeRotationDeg(record.rotation);
            initContainer(displayLinesHistory);
            renderRecordsByDate();
        };

        img.onerror = () => {
            if (useCors && imageUrl.startsWith('http')) {
                // Some delivery settings block CORS; retry without CORS so at least preview is visible.
                loadImage(false);
                return;
            }

            const dropZone = document.getElementById('drop-zone-text');
            dropZone.style.display = '';
            dropZone.textContent = '画像の読み込みに失敗しました。';
            canvasWrapper.style.display = 'none';
            rawSourceData = null;
            renderRecordsByDate();
            showUploadToast('<i class="fa-solid fa-circle-exclamation"></i> 画像URLは有効ですが、アプリ内プレビューに失敗しました。', 'error', 5000);
        };

        img.src = imageUrl;
    };

    loadImage(imageUrl.startsWith('http'));
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
    record.updatedAt = new Date().toISOString();
    record.editorUserId = currentUser.id;
    if (record.sourceUrl && record.bgDataUrl) {
        delete record.bgDataUrl;
    }

    records[idx] = record;
    saveRecords(records);
    renderRecordsByDate();
}

function autoSaveCurrentRecord() {
    if (!currentRecordId || !rawSourceData) return;
    saveCurrentRecordMetaAndCanvas();
}

async function persistPendingRecordChanges() {
    autoSaveCurrentRecord();

    for (let i = 0; i < 30; i++) {
        await flushDirtyRecords();
        if (!recordsSyncRunning && dirtyRecordIds.size === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 120));
    }
}

async function openCurrentSliderRecord() {
    const groups = getRecordGroupsForSlider();
    const modeRecords = groups[recordSliderMode] || [];
    if (modeRecords.length === 0) {
        currentRecordId = null;
        resetWorkspaceForNoRecord('対象の納品書がありません。');
        renderRecordsByDate();
        return;
    }

    let index = recordSliderIndexByMode[recordSliderMode] || 0;
    if (index < 0) index = 0;
    if (index > modeRecords.length - 1) index = modeRecords.length - 1;
    recordSliderIndexByMode[recordSliderMode] = index;

    await openRecord(modeRecords[index].id);
}

async function moveSliderRecord(direction) {
    const groups = getRecordGroupsForSlider();
    const modeRecords = groups[recordSliderMode] || [];
    if (modeRecords.length === 0) return;

    const current = recordSliderIndexByMode[recordSliderMode] || 0;
    let next = current + direction;
    if (next < 0) next = 0;
    if (next > modeRecords.length - 1) next = modeRecords.length - 1;
    if (next === current) return;

    recordSliderIndexByMode[recordSliderMode] = next;
    await openRecord(modeRecords[next].id);
}

async function handleSaveRecordAction() {
    const current = getCurrentRecord();
    if (!current) {
        showUploadToast('<i class="fa-solid fa-circle-info"></i> 納品書を選択してください。', 'error', 2500);
        return;
    }

    const beforeIndex = recordSliderIndexByMode[recordSliderMode] || 0;

    if (recordSliderMode === 'done' && !doneRecordEditEnabled) {
        showUploadToast('<i class="fa-solid fa-pen-to-square"></i> 先に「編集」を押してください。', 'info', 2500);
        return;
    }

    if (recordSliderMode === 'unchecked') {
        recordStatusInput.value = 'done';
    }

    saveCurrentRecordMetaAndCanvas();

    const records = getRecords();
    const idx = records.findIndex((r) => r.id === current.id);
    if (idx >= 0) {
        if (recordSliderMode === 'unchecked') {
            records[idx].status = 'done';
            records[idx].checked = true;
        }
        records[idx].updatedAt = new Date().toISOString();
        saveRecords(records);
    }

    doneRecordEditEnabled = false;
    renderRecordsByDate();

    if (recordSliderMode === 'unchecked') {
        const groups = getRecordGroupsForSlider();
        const list = groups.unchecked || [];
        if (list.length === 0) {
            resetWorkspaceForNoRecord('未チェックの納品書はありません。');
            showUploadToast('<i class="fa-solid fa-circle-check"></i> 保存して確認完了にしました。', 'success', 2500);
            return;
        }
        const nextIndex = Math.min(beforeIndex, list.length - 1);
        recordSliderIndexByMode.unchecked = nextIndex;
        showUploadToast('<i class="fa-solid fa-circle-check"></i> 保存して次の未チェックへ移動します。', 'success', 2500);
        await openRecord(list[nextIndex].id);
        return;
    }

    const doneGroups = getRecordGroupsForSlider();
    const doneList = doneGroups.done || [];
    if (doneList.length === 0) {
        resetWorkspaceForNoRecord('確認完了の納品書はありません。');
        return;
    }

    const nextDoneIndex = Math.min(beforeIndex + 1, doneList.length - 1);
    recordSliderIndexByMode.done = nextDoneIndex;
    showUploadToast('<i class="fa-solid fa-circle-check"></i> 保存して次の確認完了へ移動します。', 'success', 2500);
    await openRecord(doneList[nextDoneIndex].id);
}

function enableDoneRecordEditMode() {
    const record = getCurrentRecord();
    if (!record) return;
    if (normalizeRecordStatus(record) !== 'done') return;
    doneRecordEditEnabled = true;
    updateRecordControlsState();
    showUploadToast('<i class="fa-solid fa-pen-to-square"></i> 編集モードを有効にしました。', 'info', 2500);
}

async function setSliderModeAndOpen(mode) {
    recordSliderMode = mode === 'done' ? 'done' : 'unchecked';
    doneRecordEditEnabled = false;
    renderRecordsByDate();
    await openCurrentSliderRecord();
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
    return currentTool !== 'brush' && currentTool !== 'eraser' && currentTool !== 'stamp' && currentTool !== 'crop' && !isDrawing && !isCropping;
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

function hideStampIndicator() {
    if (stampIndicator) stampIndicator.style.display = 'none';
}

function colorToTransparentRgba(color, alpha = 0.12) {
    const value = `${color || ''}`.trim();
    const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        let hex = hexMatch[1];
        if (hex.length === 3) {
            hex = hex.split('').map((ch) => ch + ch).join('');
        }
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgba(196, 30, 58, ${alpha})`;
}

function updateStampIndicatorPosition(e) {
    if (!stampIndicator || currentTool !== 'stamp' || !rawSourceData) {
        hideStampIndicator();
        return;
    }

    const size = Math.max(24, getStampDiameter() * currentScale);
    const color = colorPicker.value || '#c41e3a';
    stampIndicator.style.width = `${size}px`;
    stampIndicator.style.height = `${size}px`;
    stampIndicator.style.left = `${e.clientX}px`;
    stampIndicator.style.top = `${e.clientY}px`;
    stampIndicator.style.borderColor = color;
    stampIndicator.style.color = color;
    stampIndicator.style.background = colorToTransparentRgba(color, 0.14);
    stampIndicator.style.display = 'block';
}

function updateToolUI() {
    const isDrawTool = currentTool === 'brush' || currentTool === 'eraser' || currentTool === 'stamp';
    const isCropTool = currentTool === 'crop';
    paintCanvas.classList.toggle('no-draw', !isDrawTool && !isCropTool);
    paintCanvas.style.cursor = isCropTool
        ? 'crosshair'
        : (currentTool === 'stamp' ? 'copy' : (currentTool === 'eraser' ? 'none' : ''));
    cropActions.style.display = isCropTool && cropRect ? 'flex' : 'none';
    workspace.classList.toggle('pan-mode', canPan());
    if (currentTool !== 'eraser') hideEraserIndicator();
    if (currentTool !== 'stamp') hideStampIndicator();
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
    if (!isCurrentRecordEditable()) {
        showUploadToast('<i class="fa-solid fa-lock"></i> この納品書は「編集」を押してから変更してください。', 'info', 2500);
        return;
    }
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
        .map((line) => {
            if (line.tool === 'stamp') {
                return {
                    ...line,
                    x: line.x - x,
                    y: line.y - y
                };
            }
            return {
                ...line,
                points: line.points
                    .map((p) => ({ x: p.x - x, y: p.y - y }))
                    .filter((p) => p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h)
            };
        })
        .filter((line) => {
            if (line.tool === 'stamp') {
                return line.x >= 0 && line.x <= w && line.y >= 0 && line.y <= h;
            }
            return line.points.length > 0;
        });

    const img = new Image();
    img.onload = () => {
        rawSourceData = { type: 'image', data: img };
        currentRotation = 0;
        cancelCropSelection();
        resetToFit();
        setTool('pan');
        autoSaveCurrentRecord();

        const cropRecordId = currentRecordId;
        if (!cropRecordId) return;
        const latestRecords = getRecords();
        const latestIdx = latestRecords.findIndex((r) => r.id === cropRecordId);
        if (latestIdx < 0) return;
        const cropDataUrl = bgCanvas.toDataURL('image/png');
        showUploadToast('<i class="fa-solid fa-spinner fa-spin"></i> 切り抜き画像をアップロード中...', 'info');
        uploadImageDataUrl(cropDataUrl, `${latestRecords[latestIdx].name || 'crop'}.png`, latestRecords[latestIdx].date)
            .then((uploadResult) => {
                latestRecords[latestIdx].sourceUrl = uploadResult.publicUrl || '';
                latestRecords[latestIdx].sourceStoragePath = uploadResult.storagePath || '';
                latestRecords[latestIdx].uploadStatus = 'done';
                if (latestRecords[latestIdx].bgDataUrl) delete latestRecords[latestIdx].bgDataUrl;
                latestRecords[latestIdx].updatedAt = new Date().toISOString();
                saveRecords(latestRecords);
                renderRecordsByDate();
                showUploadToast('<i class="fa-solid fa-circle-check"></i> 切り抜き画像をアップロードしました。', 'success', 4000);
            })
            .catch((error) => {
                showUploadToast(
                    `<i class="fa-solid fa-circle-exclamation"></i> アップロード失敗: ${error.message || 'ネットワークエラー'}`,
                    'error'
                );
            });
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
        if (line.tool === 'stamp') {
            paintCtx.globalCompositeOperation = 'source-over';
            drawJapaneseCircleStamp(paintCtx, line);
            return;
        }

        if (!Array.isArray(line.points) || line.points.length < 1) return;

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
    document.getElementById('btn-stamp').classList.toggle('active', tool === 'stamp');
    document.getElementById('btn-crop').classList.toggle('active', tool === 'crop');

    updateToolUI();
    if (isMobileView()) closeSidebar();
}

btnLogin.addEventListener('click', handleLogin);
loginPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
});
btnHeaderLogout.addEventListener('click', async () => {
    try {
        await persistPendingRecordChanges();
    } catch (error) {
        console.warn('Failed to persist pending changes before logout:', error);
    }
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

btnOpenAdmin.addEventListener('click', async () => {
    try {
        await persistPendingRecordChanges();
    } catch (error) {
        console.warn('Failed to persist pending changes before opening admin:', error);
    }
    window.location.href = 'admin.html';
});

btnUpload.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => createRecordFromUpload(e.target.files[0]));
btnUploadFolder.addEventListener('click', () => folderInput.click());
folderInput.addEventListener('change', async (e) => {
    await createRecordsFromFolder(e.target.files);
    folderInput.value = '';
});

recordStatusInput.addEventListener('change', () => {
    if (!isCurrentRecordEditable()) {
        const current = getCurrentRecord();
        recordStatusInput.value = normalizeRecordStatus(current);
        showUploadToast('<i class="fa-solid fa-lock"></i> この納品書は編集モードでのみ変更できます。', 'info', 2200);
        return;
    }
    saveCurrentRecordMetaAndCanvas();
});
btnSaveRecord.addEventListener('click', handleSaveRecordAction);
if (mainBtnSaveRecord) mainBtnSaveRecord.addEventListener('click', handleSaveRecordAction);
btnEditRecord.addEventListener('click', enableDoneRecordEditMode);
if (mainBtnEditRecord) mainBtnEditRecord.addEventListener('click', enableDoneRecordEditMode);
btnDeleteRecord.addEventListener('click', deleteCurrentRecord);

recordSliderModeSelect.addEventListener('change', async (e) => {
    await setSliderModeAndOpen(e.target.value);
});
if (mainRecordSliderModeSelect) {
    mainRecordSliderModeSelect.addEventListener('change', async (e) => {
        await setSliderModeAndOpen(e.target.value);
    });
}
btnRecordPrev.addEventListener('click', () => moveSliderRecord(-1));
btnRecordNext.addEventListener('click', () => moveSliderRecord(1));
if (mainBtnRecordPrev) mainBtnRecordPrev.addEventListener('click', () => moveSliderRecord(-1));
if (mainBtnRecordNext) mainBtnRecordNext.addEventListener('click', () => moveSliderRecord(1));

filterDateInput.addEventListener('change', async () => {
    autoSaveCurrentRecord();
    currentRecordId = null;
    doneRecordEditEnabled = false;
    renderRecordsByDate();
    await openCurrentSliderRecord();
});

btnFilterToday.addEventListener('click', async () => {
    filterDateInput.value = todayDateString();
    autoSaveCurrentRecord();
    currentRecordId = null;
    doneRecordEditEnabled = false;
    renderRecordsByDate();
    await openCurrentSliderRecord();
});

document.getElementById('btn-pan').addEventListener('click', () => setTool('pan'));
document.getElementById('btn-brush').addEventListener('click', () => setTool('brush'));
document.getElementById('btn-eraser').addEventListener('click', () => setTool('eraser'));
document.getElementById('btn-stamp').addEventListener('click', () => setTool('stamp'));
document.getElementById('btn-crop').addEventListener('click', () => setTool('crop'));
document.getElementById('btn-crop-apply').addEventListener('click', applyCrop);
document.getElementById('btn-crop-cancel').addEventListener('click', cancelCropSelection);
document.getElementById('btn-zoom-in').addEventListener('click', () => zoom(0.1));
document.getElementById('btn-zoom-out').addEventListener('click', () => zoom(-0.1));
document.getElementById('btn-zoom-fit').addEventListener('click', resetToFit);
document.getElementById('btn-rotate-cw').addEventListener('click', () => {
    if (!isCurrentRecordEditable()) {
        showUploadToast('<i class="fa-solid fa-lock"></i> この納品書は編集モードでのみ変更できます。', 'info', 2500);
        return;
    }
    currentRotation = normalizeRotationDeg(currentRotation + 90);
    applyTransform();
    autoSaveCurrentRecord();
});

document.getElementById('btn-undo').addEventListener('click', () => {
    if (!isCurrentRecordEditable()) {
        showUploadToast('<i class="fa-solid fa-lock"></i> この納品書は編集モードでのみ変更できます。', 'info', 2500);
        return;
    }
    if (linesHistory.length > 0) {
        linesHistory.pop();
        stopDrawing();
        redrawCanvas();
    }
});

document.getElementById('btn-clear').addEventListener('click', () => {
    if (!isCurrentRecordEditable()) {
        showUploadToast('<i class="fa-solid fa-lock"></i> この納品書は編集モードでのみ変更できます。', 'info', 2500);
        return;
    }
    if (linesHistory.length > 0 && confirm('すべて削除しますか？')) {
        linesHistory = [];
        stopDrawing();
        redrawCanvas();
        autoSaveCurrentRecord();
    }
});

lineWidthPicker.addEventListener('input', () => {
    if (currentTool === 'eraser' && eraserIndicator.style.display === 'block') {
        const currentSize = Math.max(8, parseInt(lineWidthPicker.value, 10) * currentScale);
        eraserIndicator.style.width = `${currentSize}px`;
        eraserIndicator.style.height = `${currentSize}px`;
    }
    if (currentTool === 'stamp' && stampIndicator && stampIndicator.style.display === 'block') {
        const size = Math.max(24, getStampDiameter() * currentScale);
        stampIndicator.style.width = `${size}px`;
        stampIndicator.style.height = `${size}px`;
        const color = colorPicker.value || '#c41e3a';
        stampIndicator.style.borderColor = color;
        stampIndicator.style.color = color;
        stampIndicator.style.background = colorToTransparentRgba(color, 0.14);
    }
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

stampFamilyNameInput?.addEventListener('input', () => {
    if (currentUser?.id) saveStampNameInputs(currentUser.id);
});
stampGivenNameInput?.addEventListener('input', () => {
    if (currentUser?.id) saveStampNameInputs(currentUser.id);
});

paintCanvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || isPinching || workspacePointers.size > 1) return;
    updateEraserIndicatorPosition(e);

    if (!isCurrentRecordEditable()) {
        showUploadToast('<i class="fa-solid fa-lock"></i> 「編集」を押すとこの画像を修正できます。', 'info', 2200);
        return;
    }

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

    if (currentTool === 'stamp') {
        const coords = getCanvasCoordinates(e);
        placeStampAtCoordinates(coords);
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
    updateStampIndicatorPosition(e);

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
    hideStampIndicator();
    if (currentTool === 'crop' && isCropping) {
        handleCropEnd();
        return;
    }
    stopDrawing();
});

paintCanvas.addEventListener('pointercancel', () => {
    hideEraserIndicator();
    hideStampIndicator();
    if (currentTool === 'crop' && isCropping) {
        handleCropEnd();
        return;
    }
    stopDrawing();
});

paintCanvas.addEventListener('pointerenter', (e) => {
    updateEraserIndicatorPosition(e);
    updateStampIndicatorPosition(e);
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
    flushDirtyRecords();
});

async function initApp() {
    if (authToken) {
        try {
            const me = await apiRequest(API_AUTH_ME);
            currentSessionUser = me?.user || null;
            const recordsPayload = await apiRequest(`${API_RECORDS}?includeDeleted=true`);
            storeData[RECORDS_KEY] = Array.isArray(recordsPayload?.records) ? recordsPayload.records : [];
            cacheRecordHashes(storeData[RECORDS_KEY]);
        } catch (error) {
            console.warn('Session restore failed:', error);
            setAuthToken('');
            currentSessionUser = null;
            storeData[RECORDS_KEY] = [];
            cacheRecordHashes(storeData[RECORDS_KEY]);
        }
    }

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
}

initApp();
