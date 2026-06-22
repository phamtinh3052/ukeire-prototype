pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Cloudinary unsigned upload settings
// File-backed store (data/store.json via /api/store) lưu users/session/records/ui state
const CLOUDINARY_CLOUD_NAME = 'dlnvnf9h3';
const CLOUDINARY_UPLOAD_PRESET = 'ukeire-prototype';

const USERS_KEY = 'ukeire_users_v1';
const SESSION_KEY = 'ukeire_session_v1';
const RECORDS_KEY = 'ukeire_nohinsho_records_v1';
const SIDEBAR_COLLAPSED_KEY = 'ukeire_sidebar_collapsed_v1';
const STORE_API_ENDPOINT = '/api/store';

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
const btnDeleteRecord = document.getElementById('btn-delete-record');
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

const DEFAULT_STORE_DATA = {
    [USERS_KEY]: [],
    [SESSION_KEY]: '',
    [RECORDS_KEY]: [],
    [SIDEBAR_COLLAPSED_KEY]: '0'
};

let storeData = JSON.parse(JSON.stringify(DEFAULT_STORE_DATA));
let storeLoaded = false;
let storePersistTimer = null;

const DESKTOP_SIDEBAR_EXPANDED_WIDTH = 240;
const DESKTOP_SIDEBAR_COLLAPSED_WIDTH = 68;

function todayDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = `${now.getMonth() + 1}`.padStart(2, '0');
    const d = `${now.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function buildCloudinaryFolderByDate(dateStr) {
    const fallback = todayDateString();
    const target = (dateStr || fallback).trim();
    const match = target.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        const [fy, fm, fd] = fallback.split('-');
        return `nouhinsho/${fy}_${fm}_${fd}`;
    }
    const [, y, m, d] = match;
    return `nouhinsho/${y}_${m}_${d}`;
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

function normalizeStorePayload(payload) {
    const normalized = JSON.parse(JSON.stringify(DEFAULT_STORE_DATA));
    if (!payload || typeof payload !== 'object') return normalized;

    normalized[USERS_KEY] = Array.isArray(payload[USERS_KEY]) ? payload[USERS_KEY] : [];
    normalized[SESSION_KEY] = typeof payload[SESSION_KEY] === 'string' ? payload[SESSION_KEY] : '';
    normalized[RECORDS_KEY] = Array.isArray(payload[RECORDS_KEY]) ? payload[RECORDS_KEY] : [];
    normalized[SIDEBAR_COLLAPSED_KEY] = payload[SIDEBAR_COLLAPSED_KEY] === '1' ? '1' : '0';
    return normalized;
}

function readLegacyStoreFromLocalStorage() {
    try {
        const usersRaw = localStorage.getItem(USERS_KEY);
        const sessionRaw = localStorage.getItem(SESSION_KEY);
        const recordsRaw = localStorage.getItem(RECORDS_KEY);
        const sidebarRaw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);

        const hasLegacyData = usersRaw !== null || sessionRaw !== null || recordsRaw !== null || sidebarRaw !== null;
        if (!hasLegacyData) return null;

        let users = [];
        let records = [];

        if (usersRaw) {
            try {
                const parsed = JSON.parse(usersRaw);
                users = Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                users = [];
            }
        }

        if (recordsRaw) {
            try {
                const parsed = JSON.parse(recordsRaw);
                records = Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                records = [];
            }
        }

        return normalizeStorePayload({
            [USERS_KEY]: users,
            [SESSION_KEY]: typeof sessionRaw === 'string' ? sessionRaw : '',
            [RECORDS_KEY]: records,
            [SIDEBAR_COLLAPSED_KEY]: sidebarRaw === '1' ? '1' : '0'
        });
    } catch (error) {
        console.warn('Failed to read legacy localStorage data:', error);
        return null;
    }
}

function isStoreDataEffectivelyEmpty(payload) {
    if (!payload || typeof payload !== 'object') return true;
    const users = Array.isArray(payload[USERS_KEY]) ? payload[USERS_KEY] : [];
    const records = Array.isArray(payload[RECORDS_KEY]) ? payload[RECORDS_KEY] : [];
    const session = typeof payload[SESSION_KEY] === 'string' ? payload[SESSION_KEY].trim() : '';
    const sidebar = payload[SIDEBAR_COLLAPSED_KEY] === '1' ? '1' : '0';
    return users.length === 0 && records.length === 0 && !session && sidebar === '0';
}

async function migrateLegacyLocalStorageToFileStoreIfNeeded() {
    if (!isStoreDataEffectivelyEmpty(storeData)) return;

    const legacyData = readLegacyStoreFromLocalStorage();
    if (!legacyData || isStoreDataEffectivelyEmpty(legacyData)) return;

    storeData = legacyData;
    await persistStoreToFile();
    console.log('Migrated legacy localStorage data to file store.');
}

async function loadStoreFromFile() {
    try {
        const response = await fetch(STORE_API_ENDPOINT, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        storeData = normalizeStorePayload(payload);
    } catch (error) {
        console.warn('Failed to load store file:', error);
        storeData = JSON.parse(JSON.stringify(DEFAULT_STORE_DATA));
    }
    storeLoaded = true;
}

async function persistStoreToFile() {
    if (!storeLoaded) return;
    try {
        await fetch(STORE_API_ENDPOINT, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(storeData)
        });
    } catch (error) {
        console.warn('Failed to persist store file:', error);
    }
}

function scheduleStorePersist() {
    if (!storeLoaded) return;
    if (storePersistTimer) clearTimeout(storePersistTimer);
    storePersistTimer = setTimeout(() => {
        persistStoreToFile();
    }, 80);
}

function getUsers() {
    const users = storeData[USERS_KEY];
    return Array.isArray(users) ? users : [];
}

function saveUsers(users) {
    storeData[USERS_KEY] = Array.isArray(users) ? users : [];
    scheduleStorePersist();
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
    const records = storeData[RECORDS_KEY];
    return Array.isArray(records) ? records : [];
}

function saveRecords(records) {
    storeData[RECORDS_KEY] = Array.isArray(records) ? records : [];
    scheduleStorePersist();
}

function readCloudinaryConfig() {
    // Lấy từ constants (hardcoded)
    return { cloudName: CLOUDINARY_CLOUD_NAME, uploadPreset: CLOUDINARY_UPLOAD_PRESET };
}

function ensureCloudinaryConfig() {
    // Không cần prompt, lấy từ constants luôn
    return readCloudinaryConfig();
}

function buildCloudinaryAssetUrl(publicId) {
    const config = ensureCloudinaryConfig();
    if (!config || !publicId) return '';
    const cleanId = `${publicId}`.replace(/^\/+/, '');
    return `https://res.cloudinary.com/${config.cloudName}/image/upload/${cleanId}`;
}

function setSession(userId) {
    storeData[SESSION_KEY] = userId || '';
    scheduleStorePersist();
}

function getSessionUser() {
    const userId = storeData[SESSION_KEY];
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
    storeData[SIDEBAR_COLLAPSED_KEY] = nextCollapsed ? '1' : '0';
    scheduleStorePersist();
    updateSidebarCollapseIcon();
}

function restoreSidebarCollapsed() {
    const savedCollapsed = storeData[SIDEBAR_COLLAPSED_KEY] === '1';
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
    if (record.status === 'not_checked' || record.status === 'done') {
        return record.status;
    }
    return record.checked ? 'done' : 'not_checked';
}

function getRecordStatusLabel(status) {
    if (status === 'done') return '確認完了';
    return '未チェック';
}

function getRecordStatusClass(status) {
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
            const uploadBadge = record.uploadStatus === 'uploading'
                ? '<div class="meta"><span class="upload-badge badge-uploading">\u2601 アップロード中</span></div>'
                : record.uploadStatus === 'failed'
                ? '<div class="meta"><span class="upload-badge badge-failed">&#9888; アップロード失敗</span></div>'
                : '';
            item.innerHTML = `
                <div class="title">${record.name}</div>
                <div class="meta">日付: ${formatRecordDate(record.date)}</div>
                <div class="meta">状態: ${getRecordStatusLabel(status)}</div>
                ${uploadBadge}
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
        .filter((r) => r.date === selectedDate && !r.isDeleted)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    recordsList.innerHTML = '';

    if (records.length === 0) {
        recordsList.innerHTML = '<div class="muted">この日の納品書はありません。</div>';
        return;
    }

    const notCheckedRecords = [];
    const doneRecords = [];

    records.forEach((record) => {
        const status = normalizeRecordStatus(record);
        if (status === 'done') {
            doneRecords.push(record);
        } else {
            notCheckedRecords.push(record);
        }
    });

    recordsList.appendChild(buildRecordSection('未チェック', notCheckedRecords));
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

function buildDeletedStoragePath(record) {
    const baseFolder = `${buildCloudinaryFolderByDate(record?.date || todayDateString())}/deleted`;
    const sourcePath = `${record?.sourceStoragePath || ''}`.trim();

    if (sourcePath.includes('/deleted/')) return sourcePath;

    const fileName = sourcePath.split('/').pop() || `${record?.id || `r-${Date.now()}`}`;
    return `${baseFolder}/${fileName}`;
}

function deleteCurrentRecord() {
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

    const deletedPath = buildDeletedStoragePath(record);
    const updatedRecord = {
        ...record,
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedStoragePath: deletedPath,
        sourceStoragePath: deletedPath,
        uploadStatus: 'deleted',
        updatedAt: new Date().toISOString(),
        editorUserId: currentUser?.id || record.editorUserId
    };

    records[idx] = updatedRecord;
    saveRecords(records);
    resetWorkspaceForNoRecord('納品書をdeletedフォルダに移動しました。');
    renderRecordsByDate();
    showUploadToast('<i class="fa-solid fa-box-archive"></i> 削除せずに deleted フォルダへ移動しました。', 'success', 4000);
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

async function uploadFileToCloudinary(file, recordId, dateStr) {
    const config = ensureCloudinaryConfig();
    if (!config) return null;

    const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', config.uploadPreset);
    formData.append('folder', buildCloudinaryFolderByDate(dateStr || filterDateInput.value || todayDateString()));

    const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const text = await response.text();
        let detail = text;
        try { detail = JSON.parse(text)?.error?.message || text; } catch {}
        throw new Error(`Cloudinary upload failed (${response.status}): ${detail}`);
    }

    const result = await response.json();
    return {
        storagePath: result.public_id || '',
        downloadURL: result.secure_url || '',
        deleteToken: result.delete_token || ''
    };
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
        sourceStoragePath: '',
        sourceDeleteToken: '',
        sourceFileType: file.type || '',
        uploadStatus: 'uploading',
        linesHistory: [],
        editorUserId: currentUser.id,
        updatedAt: new Date().toISOString()
    };

    records.push(record);
    saveRecords(records);
    renderRecordsByDate();

    // Display locally from memory (not stored in localStorage), then upload processed image blob.
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

            let uploadBlob;
            try {
                uploadBlob = dataUrlToBlob(bgDataUrl);
            } catch (blobError) {
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
                        `<i class="fa-solid fa-circle-exclamation"></i> 画像変換失敗: ${blobError?.message || '不明なエラー'}`,
                        'error'
                    );
                }
                resolve({ ok: false, recordId: record.id, reason: 'blob-failed' });
                return;
            }

            if (showSingleToast) {
                showUploadToast('<i class="fa-solid fa-spinner fa-spin"></i> Cloudinaryにアップロード中...', 'info');
            }

            uploadFileToCloudinary(uploadBlob, record.id, record.date)
                .then((uploadResult) => {
                    if (!uploadResult) {
                        resolve({ ok: false, recordId: record.id, reason: 'upload-empty' });
                        return;
                    }

                    const latestRecords = getRecords();
                    const latestIdx = latestRecords.findIndex((r) => r.id === record.id);
                    if (latestIdx < 0) {
                        resolve({ ok: false, recordId: record.id, reason: 'record-missing' });
                        return;
                    }

                    latestRecords[latestIdx].sourceUrl = uploadResult.downloadURL;
                    latestRecords[latestIdx].sourceStoragePath = uploadResult.storagePath;
                    latestRecords[latestIdx].sourceDeleteToken = uploadResult.deleteToken || '';
                    latestRecords[latestIdx].uploadStatus = 'done';
                    latestRecords[latestIdx].updatedAt = new Date().toISOString();
                    saveRecords(latestRecords);
                    renderRecordsByDate();

                    if (showSingleToast) {
                        showUploadToast('<i class="fa-solid fa-circle-check"></i> Cloudinaryへのアップロード完了', 'success', 4000);
                    }
                    resolve({ ok: true, recordId: record.id });
                })
                .catch((error) => {
                    console.warn('Cloudinary upload failed:', error);

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

function openRecord(recordId) {
    autoSaveCurrentRecord();
    const record = getRecords().find((r) => r.id === recordId);
    if (!record) return;

    currentRecordId = record.id;
    updateRecordMetaUI(record);

    // Prefer Cloudinary URL; fall back to public_id and then legacy bgDataUrl for old records
    let imageUrl = record.sourceUrl || '';
    if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
        imageUrl = buildCloudinaryAssetUrl(imageUrl);
    }
    if (!imageUrl && record.sourceStoragePath) {
        imageUrl = buildCloudinaryAssetUrl(record.sourceStoragePath);
    }
    if (!imageUrl && record.bgDataUrl) {
        imageUrl = record.bgDataUrl;
    }

    if (!imageUrl) {
        const dropZone = document.getElementById('drop-zone-text');
        dropZone.style.display = '';
        dropZone.textContent = record.uploadStatus === 'failed'
            ? 'アップロード失敗。ファイルを再アップロードしてください。'
            : '画像をアップロード中... しばらくお待ちください。';
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
            rawSourceData = { type: 'image', data: img };
            currentRotation = normalizeRotationDeg(record.rotation);
            initContainer(cloneLines(record.linesHistory));
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
    // Migrate legacy records: remove bgDataUrl blob once sourceUrl is available
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

        // Upload cropped image to Cloudinary and update sourceUrl
        const cropRecordId = currentRecordId;
        if (!cropRecordId) return;
        const cropRecord = getRecords().find((r) => r.id === cropRecordId);
        const cropFolderDate = cropRecord?.date || filterDateInput.value || todayDateString();
        bgCanvas.toBlob((blob) => {
            if (!blob) return;
            showUploadToast('<i class="fa-solid fa-spinner fa-spin"></i> 切り抜き画像をアップロード中...', 'info');
            uploadFileToCloudinary(blob, `${cropRecordId}_crop`, cropFolderDate)
                .then((uploadResult) => {
                    if (!uploadResult) return;
                    const latestRecords = getRecords();
                    const latestIdx = latestRecords.findIndex((r) => r.id === cropRecordId);
                    if (latestIdx < 0) return;
                    latestRecords[latestIdx].sourceUrl = uploadResult.downloadURL;
                    latestRecords[latestIdx].sourceStoragePath = uploadResult.storagePath;
                    latestRecords[latestIdx].sourceDeleteToken = uploadResult.deleteToken || '';
                    latestRecords[latestIdx].uploadStatus = 'done';
                    if (latestRecords[latestIdx].bgDataUrl) delete latestRecords[latestIdx].bgDataUrl;
                    latestRecords[latestIdx].updatedAt = new Date().toISOString();
                    saveRecords(latestRecords);
                    renderRecordsByDate();
                    showUploadToast('<i class="fa-solid fa-circle-check"></i> 切り抜き完了・アップロード済み', 'success', 4000);
                })
                .catch((error) => {
                    console.warn('Crop re-upload failed:', error);
                    showUploadToast(
                        `<i class="fa-solid fa-circle-exclamation"></i> アップロード失敗: ${error.message || 'ネットワークエラー'}`,
                        'error'
                    );
                });
        }, 'image/png');
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
btnUploadFolder.addEventListener('click', () => folderInput.click());
folderInput.addEventListener('change', async (e) => {
    await createRecordsFromFolder(e.target.files);
    folderInput.value = '';
});

recordStatusInput.addEventListener('change', saveCurrentRecordMetaAndCanvas);
btnSaveRecord.addEventListener('click', () => {
    saveCurrentRecordMetaAndCanvas();
    alert('保存しました。');
});
btnDeleteRecord.addEventListener('click', deleteCurrentRecord);

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
    persistStoreToFile();
});

async function initApp() {
    await loadStoreFromFile();
    await migrateLegacyLocalStorageToFileStoreIfNeeded();

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
}

initApp();
