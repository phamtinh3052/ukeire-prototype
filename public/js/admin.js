pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const AUTH_TOKEN_KEY = 'ukeire_auth_token_v2';
const RECORDS_KEY = 'ukeire_nohinsho_records_v1';
const USERS_KEY = 'ukeire_users_v1';
const API_AUTH_ME = '/api/auth/me';
const API_AUTH_LOGOUT = '/api/auth/logout';
const API_USERS = '/api/users';
const API_RECORDS = '/api/records';
const API_UPLOADS = '/api/uploads';


const adminStatus = document.getElementById('admin-status');
const usersTable = document.getElementById('users-table');
const toggleShowInactiveUsers = document.getElementById('toggle-show-inactive-users');
const newUsernameInput = document.getElementById('new-username');
const newPasswordInput = document.getElementById('new-password');
const newRoleInput = document.getElementById('new-role');
const newBrushColorInput = document.getElementById('new-brush-color');

const adminTabUsers = document.getElementById('admin-tab-users');
const adminTabNohinsho = document.getElementById('admin-tab-nohinsho');
const adminPanelUsers = document.getElementById('admin-panel-users');
const adminPanelNohinsho = document.getElementById('admin-panel-nohinsho');

const nohinshoDateInput = document.getElementById('nohinsho-date');
const nohinshoSearchInput = document.getElementById('nohinsho-search');
const nohinshoSortInput = document.getElementById('nohinsho-sort');
const btnNohinshoToday = document.getElementById('btn-nohinsho-today');
const btnNohinshoUpload = document.getElementById('btn-nohinsho-upload');
const btnNohinshoUploadFolder = document.getElementById('btn-nohinsho-upload-folder');
const btnNohinshoPurgeDeleted = document.getElementById('btn-nohinsho-purge-deleted');
const nohinshoRecordsList = document.getElementById('nohinsho-records-list');
const nohinshoPreview = document.getElementById('nohinsho-preview');
const nohinshoPreviewCanvas = document.getElementById('nohinsho-preview-canvas');
const nohinshoPreviewCtx = nohinshoPreviewCanvas.getContext('2d');
const nohinshoPreviewEmpty = document.getElementById('nohinsho-preview-empty');
const nohinshoNameInput = document.getElementById('nohinsho-name');
const nohinshoDateEditInput = document.getElementById('nohinsho-date-edit');
const nohinshoStatusInput = document.getElementById('nohinsho-status');
const nohinshoUrlInput = document.getElementById('nohinsho-url');
const btnNohinshoSave = document.getElementById('btn-nohinsho-save');
const btnNohinshoDelete = document.getElementById('btn-nohinsho-delete');
const btnNohinshoApplyUpload = document.getElementById('btn-nohinsho-apply-upload');
const nohinshoFileInput = document.getElementById('nohinsho-file-input');
const nohinshoFolderInput = document.getElementById('nohinsho-folder-input');

let activeAdminTab = 'users';
let selectedRecordId = null;
let showInactiveUsers = false;

const DEFAULT_STORE_DATA = {
    [USERS_KEY]: [],
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

function todayDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = `${now.getMonth() + 1}`.padStart(2, '0');
    const d = `${now.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatRecordDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${y}/${m}/${d}`;
}

function formatRecordTimestamp(dateTimeStr) {
    if (!dateTimeStr) return '';
    const dt = new Date(dateTimeStr);
    if (Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = `${dt.getMonth() + 1}`.padStart(2, '0');
    const d = `${dt.getDate()}`.padStart(2, '0');
    const hh = `${dt.getHours()}`.padStart(2, '0');
    const mm = `${dt.getMinutes()}`.padStart(2, '0');
    return `${y}/${m}/${d} ${hh}:${mm}`;
}

function pickDefaultNohinshoDate(records) {
    const today = todayDateString();
    const list = Array.isArray(records) ? records : [];
    const active = list.filter((r) => !r?.isDeleted && typeof r?.date === 'string' && r.date);
    if (active.length === 0) return today;
    if (active.some((r) => r.date === today)) return today;
    return active
        .map((r) => r.date)
        .sort((a, b) => (a < b ? 1 : -1))[0] || today;
}

async function apiRequest(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const response = await fetch(url, { ...options, headers });
    const text = await response.text();
    const payload = text ? (() => { try { return JSON.parse(text); } catch { return {}; } })() : {};
    if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    return payload;
}

function setAuthToken(token) {
    authToken = token || '';
    if (authToken) localStorage.setItem(AUTH_TOKEN_KEY, authToken);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
}

function isServerRecordId(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${id || ''}`);
}

function buildRecordPayload(record) {
    return {
        name: record.name || '無題',
        date: record.date || todayDateString(),
        status: normalizeRecordStatus(record),
        rotation: Number.isFinite(record.rotation) ? record.rotation : 0,
        sourceUrl: record.sourceUrl || '',
        sourceStoragePath: record.sourceStoragePath || '',
        sourceFileType: record.sourceFileType || '',
        uploadStatus: record.uploadStatus || 'done',
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
    return Array.isArray(latestAnnotation.lines_history) ? JSON.parse(JSON.stringify(latestAnnotation.lines_history)) : [];
}

async function loadRecordDetail(record) {
    if (!record?.id || !isServerRecordId(record.id)) {
        return { record, linesHistory: Array.isArray(record?.linesHistory) ? JSON.parse(JSON.stringify(record.linesHistory)) : [] };
    }

    const detail = await apiRequest(`${API_RECORDS}/${record.id}`);
    if (detail?.record) Object.assign(record, detail.record);

    const annotationLines = extractAnnotationLines(detail?.latestAnnotation);
    const linesHistory = annotationLines ?? (Array.isArray(record?.linesHistory) ? JSON.parse(JSON.stringify(record.linesHistory)) : []);
    if (annotationLines !== null) {
        record.linesHistory = linesHistory;
    }
    localRecordHashById.set(record.id, getLocalRecordHash(record));
    if (annotationLines !== null) {
        syncedLinesHashByRecordId.set(record.id, getLinesHistoryHash(record));
    }

    return { record, linesHistory };
}

async function syncRecordById(recordId) {
    const records = getRecords();
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
            if (selectedRecordId === recordId) selectedRecordId = newId;
            const oldHash = localRecordHashById.get(recordId);
            if (oldHash !== undefined) {
                localRecordHashById.delete(recordId);
                localRecordHashById.set(newId, oldHash);
            }
            dirtyRecordIds.delete(recordId);
            dirtyRecordIds.add(newId);
            storeData[RECORDS_KEY] = records;
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

async function waitForRecordSyncIdle() {
    for (let i = 0; i < 30; i++) {
        await flushDirtyRecords();
        if (!recordsSyncRunning && dirtyRecordIds.size === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 120));
    }
}

function scheduleRecordsSync() {
    if (recordsSyncTimer) clearTimeout(recordsSyncTimer);
    recordsSyncTimer = setTimeout(() => {
        flushDirtyRecords();
    }, 150);
}

function getUsers() {
    const users = storeData[USERS_KEY];
    return Array.isArray(users) ? users : [];
}

function saveUsers(users) {
    storeData[USERS_KEY] = Array.isArray(users) ? users : [];
}

async function refreshUsers() {
    const query = showInactiveUsers ? '?includeInactive=true' : '';
    const usersPayload = await apiRequest(`${API_USERS}${query}`);
    saveUsers((usersPayload?.users || []).map((u) => ({ ...u, password: '' })));
    renderUsers();
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

async function clearSession() {
    try {
        if (authToken) await apiRequest(API_AUTH_LOGOUT, { method: 'POST' });
    } catch (error) {
        console.warn('Logout failed:', error);
    }
    setAuthToken('');
    currentSessionUser = null;
}

function countAdmins(users) {
    return users.filter((u) => u.role === 'admin').length;
}

function normalizeRecordStatus(record) {
    if (!record) return 'not_checked';
    if (record.status === 'not_checked' || record.status === 'done') return record.status;
    return record.checked ? 'done' : 'not_checked';
}

function getRecordStatusLabel(status) {
    return status === 'done' ? '確認完了' : '未チェック';
}

function getRecordStatusBadgeClass(status) {
    return status === 'done' ? 'done' : 'pending';
}

function setAdminMessage(message, kind = 'muted') {
    adminStatus.className = kind === 'error' ? 'error-text' : 'muted';
    adminStatus.textContent = message;
}

function setActiveTab(tab) {
    activeAdminTab = tab;
    adminTabUsers.classList.toggle('active', tab === 'users');
    adminTabNohinsho.classList.toggle('active', tab === 'nohinsho');
    adminPanelUsers.classList.toggle('active', tab === 'users');
    adminPanelNohinsho.classList.toggle('active', tab === 'nohinsho');

    if (tab === 'nohinsho' && !nohinshoDateInput.value) {
        nohinshoDateInput.value = pickDefaultNohinshoDate(getRecords());
    }

    if (tab === 'nohinsho') {
        renderNohinshoRecords();
    }
}

async function createUser() {
    const username = newUsernameInput.value.trim();
    const password = newPasswordInput.value.trim();
    const role = newRoleInput.value;
    const brushColor = newBrushColorInput.value;

    if (!username || !password) {
        alert('ユーザー名とパスワードを入力してください。');
        return;
    }

    try {
        const result = await apiRequest(API_USERS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role, brushColor })
        });

        newUsernameInput.value = '';
        newPasswordInput.value = '';
        newRoleInput.value = 'user';
        newBrushColorInput.value = '#ff0000';
        await refreshUsers();
        setAdminMessage('ユーザーを追加しました。');
    } catch (error) {
        alert(`ユーザー追加失敗: ${error.message || 'network error'}`);
    }
}

function renderUsers() {
    const sessionUser = getSessionUser();
    const users = getUsers();

    if (users.length === 0) {
        usersTable.innerHTML = '<div class="muted">ユーザーがありません。</div>';
        return;
    }

    usersTable.innerHTML = users.map((u) => {
        const disableDelete = sessionUser && u.id === sessionUser.id;
        const inactiveClass = u.isActive === false ? 'inactive' : '';
        const inactiveLabel = u.isActive === false ? '<span class="user-name-status">inactive</span>' : '';
        return `
            <div class="user-row ${inactiveClass}" data-id="${u.id}">
                <div class="user-name">${u.username}${inactiveLabel}</div>
                <select class="user-role" aria-label="権限: ${u.username}">
                    <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
                </select>
                <input class="user-color" type="color" value="${u.brushColor || '#ff0000'}" aria-label="ブラシ色: ${u.username}" />
                <input class="user-password" type="text" value="" placeholder="変更時のみ入力" aria-label="パスワード: ${u.username}" />
                <button class="btn-save-user btn-primary">保存</button>
                <button class="btn-delete-user btn-danger" ${disableDelete ? 'disabled' : ''}>削除</button>
            </div>
        `;
    }).join('');

    usersTable.querySelectorAll('.btn-save-user').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const row = e.target.closest('.user-row');
            if (!row) return;

            const id = row.dataset.id;
            const role = row.querySelector('.user-role').value;
            const brushColor = row.querySelector('.user-color').value;
            const password = row.querySelector('.user-password').value.trim();

            const list = getUsers();
            const idx = list.findIndex((x) => x.id === id);
            if (idx < 0) return;

            if (list[idx].role === 'admin' && role !== 'admin' && countAdmins(list) <= 1) {
                alert('最後のadminは変更できません。');
                return;
            }

            try {
                const payload = { role, brushColor };
                if (password) payload.password = password;
                const result = await apiRequest(`${API_USERS}/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                list[idx] = { ...list[idx], ...result.user, password: '' };
                await refreshUsers();
                setAdminMessage('ユーザーを更新しました。');
            } catch (error) {
                alert(`ユーザー更新失敗: ${error.message || 'network error'}`);
            }
        });
    });

    usersTable.querySelectorAll('.btn-delete-user').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const row = e.target.closest('.user-row');
            if (!row) return;

            const id = row.dataset.id;
            const list = getUsers();
            const target = list.find((x) => x.id === id);
            if (!target) return;

            if (target.role === 'admin' && countAdmins(list) <= 1) {
                alert('最後のadminは削除できません。');
                return;
            }

            if (!confirm(`ユーザー ${target.username} を削除しますか？`)) return;

            try {
                await apiRequest(`${API_USERS}/${id}`, { method: 'DELETE' });
                await refreshUsers();
                setAdminMessage('ユーザーを削除しました。');
            } catch (error) {
                alert(`ユーザー削除失敗: ${error.message || 'network error'}`);
            }
        });
    });
}

function isSupportedUploadFile(file) {
    if (!file) return false;
    const type = `${file.type || ''}`.toLowerCase();
    if (type.startsWith('image/') || type === 'application/pdf') return true;
    const name = `${file.name || ''}`.toLowerCase();
    return /\.(png|jpe?g|gif|bmp|webp|svg|pdf)$/i.test(name);
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

function parseFileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました。'));

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
                            resolve(tmpCanvas.toDataURL('image/png'));
                        });
                    })
                    .catch((err) => reject(err instanceof Error ? err : new Error('PDFの処理に失敗しました。')));
            };
            reader.readAsArrayBuffer(file);
            return;
        }

        if (file.type.startsWith('image/')) {
            reader.onload = (ev) => resolve(ev.target.result);
            reader.readAsDataURL(file);
            return;
        }

        reject(new Error('画像またはPDFファイルのみ対応しています。'));
    });
}

function createNohinshoRecordSkeleton(fileName, dateStr) {
    return {
        id: `r-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name: fileName,
        date: dateStr || todayDateString(),
        status: 'not_checked',
        checked: false,
        rotation: 0,
        sourceUrl: '',
        sourceStoragePath: '',
        sourceFileType: '',
        uploadStatus: 'uploading',
        linesHistory: [],
        editorUserId: getSessionUser()?.id || '',
        updatedAt: new Date().toISOString()
    };
}

function filterSortedRecords(records) {
    const selectedDate = nohinshoDateInput.value || todayDateString();
    const search = nohinshoSearchInput.value.trim().toLowerCase();
    const sortOrder = nohinshoSortInput.value;

    const filtered = records
        .filter((r) => !r.isDeleted)
        .filter((r) => !selectedDate || r.date === selectedDate)
        .filter((r) => !search || `${r.name || ''}`.toLowerCase().includes(search));

    const pending = filtered
        .filter((r) => normalizeRecordStatus(r) !== 'done')
        .sort((a, b) => {
            const aKey = a.updatedAt || a.date || '';
            const bKey = b.updatedAt || b.date || '';
            return sortOrder === 'asc' ? aKey.localeCompare(bKey) : bKey.localeCompare(aKey);
        });

    const done = filtered
        .filter((r) => normalizeRecordStatus(r) === 'done')
        .sort((a, b) => {
            const aKey = a.updatedAt || a.date || '';
            const bKey = b.updatedAt || b.date || '';
            return sortOrder === 'asc' ? aKey.localeCompare(bKey) : bKey.localeCompare(aKey);
        });

    return [...pending, ...done];
}

function renderNohinshoRecords() {
    const records = filterSortedRecords(getRecords());

    if (records.length === 0) {
        nohinshoRecordsList.innerHTML = '<div class="muted">該当する納品書はありません。</div>';
        return;
    }

    nohinshoRecordsList.innerHTML = records.map((record) => {
        const status = normalizeRecordStatus(record);
        const active = record.id === selectedRecordId ? 'active' : '';
        return `
            <button type="button" class="admin-record-card ${active}" data-id="${record.id}">
                <div class="admin-record-card-title">${record.name || '無題'}</div>
                <div class="admin-status-badge ${getRecordStatusBadgeClass(status)}">${getRecordStatusLabel(status)}</div>
                <div class="admin-record-card-meta">追加: ${formatRecordTimestamp(record.updatedAt || record.createdAt || record.date)}</div>
            </button>
        `;
    }).join('');

    nohinshoRecordsList.querySelectorAll('.admin-record-card').forEach((btn) => {
        btn.addEventListener('click', () => openNohinshoRecord(btn.dataset.id));
    });
}

function setPreviewImage(imageUrl) {
    if (!imageUrl) {
        nohinshoPreview.removeAttribute('src');
        nohinshoPreview.style.display = 'none';
        nohinshoPreviewCanvas.style.display = 'none';
        nohinshoPreviewCtx.clearRect(0, 0, nohinshoPreviewCanvas.width, nohinshoPreviewCanvas.height);
        nohinshoPreviewEmpty.style.display = 'block';
        return;
    }

    nohinshoPreviewEmpty.style.display = 'none';
    nohinshoPreview.style.display = 'none';
    nohinshoPreview.src = imageUrl;
}

function drawLinesOnPreview(linesHistory) {
    (Array.isArray(linesHistory) ? linesHistory : []).forEach((line) => {
        if (!Array.isArray(line?.points) || line.points.length < 1) return;

        nohinshoPreviewCtx.beginPath();
        nohinshoPreviewCtx.lineWidth = line.width;
        nohinshoPreviewCtx.lineCap = 'round';
        nohinshoPreviewCtx.lineJoin = 'round';

        if (line.tool === 'eraser') {
            nohinshoPreviewCtx.globalCompositeOperation = 'destination-out';
            nohinshoPreviewCtx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            nohinshoPreviewCtx.globalCompositeOperation = 'source-over';
            nohinshoPreviewCtx.strokeStyle = line.color || '#ff0000';
        }

        nohinshoPreviewCtx.moveTo(line.points[0].x, line.points[0].y);
        for (let i = 1; i < line.points.length; i++) {
            nohinshoPreviewCtx.lineTo(line.points[i].x, line.points[i].y);
        }
        nohinshoPreviewCtx.stroke();
    });

    nohinshoPreviewCtx.globalCompositeOperation = 'source-over';
}

function renderPreviewCanvas(imageUrl, linesHistory = []) {
    if (!imageUrl) {
        setPreviewImage('');
        return;
    }

    const img = new Image();
    img.onload = () => {
        if (!selectedRecordId) return;

        nohinshoPreviewCanvas.width = img.naturalWidth || img.width;
        nohinshoPreviewCanvas.height = img.naturalHeight || img.height;
        nohinshoPreviewCtx.clearRect(0, 0, nohinshoPreviewCanvas.width, nohinshoPreviewCanvas.height);
        nohinshoPreviewCtx.drawImage(img, 0, 0);
        drawLinesOnPreview(linesHistory);

        const container = nohinshoPreviewCanvas.parentElement;
        const availableWidth = Math.max(1, (container?.clientWidth || nohinshoPreviewCanvas.width) - 24);
        const availableHeight = 640;
        const scale = Math.min(
            availableWidth / nohinshoPreviewCanvas.width,
            availableHeight / nohinshoPreviewCanvas.height,
            1
        );

        nohinshoPreviewCanvas.style.width = `${Math.max(1, nohinshoPreviewCanvas.width * scale)}px`;
        nohinshoPreviewCanvas.style.height = `${Math.max(1, nohinshoPreviewCanvas.height * scale)}px`;
        nohinshoPreviewCanvas.style.display = 'block';
        nohinshoPreview.style.display = 'none';
        nohinshoPreviewEmpty.style.display = 'none';
    };

    img.onerror = () => {
        setPreviewImage(imageUrl);
    };

    img.src = imageUrl;
}

function clearNohinshoDetailForm() {
    nohinshoNameInput.value = '';
    nohinshoDateEditInput.value = nohinshoDateInput.value || todayDateString();
    nohinshoStatusInput.value = 'not_checked';
    nohinshoUrlInput.value = '';
    setPreviewImage('');
}

async function openNohinshoRecord(recordId) {
    selectedRecordId = recordId;
    const record = getRecords().find((r) => r.id === recordId);
    if (!record) {
        renderNohinshoRecords();
        return;
    }

    let linesHistory = Array.isArray(record.linesHistory) ? JSON.parse(JSON.stringify(record.linesHistory)) : [];

    try {
        const detail = await loadRecordDetail(record);
        if (selectedRecordId !== record.id) return;
        linesHistory = detail.linesHistory;
    } catch (error) {
        console.warn('Failed to load latest annotation for admin preview:', error);
    }

    nohinshoNameInput.value = record.name || '';
    nohinshoDateEditInput.value = record.date || todayDateString();
    nohinshoStatusInput.value = normalizeRecordStatus(record);
    nohinshoUrlInput.value = record.sourceUrl || '';

    let imageUrl = record.sourceUrl || '';
    if (!imageUrl && record.bgDataUrl) {
        imageUrl = record.bgDataUrl;
    }

    renderPreviewCanvas(imageUrl, linesHistory);
    renderNohinshoRecords();
}

function saveSelectedNohinshoRecord() {
    if (!selectedRecordId) {
        alert('対象の納品書を選択してください。');
        return;
    }

    const records = getRecords();
    const idx = records.findIndex((r) => r.id === selectedRecordId);
    if (idx < 0) return;

    records[idx].name = nohinshoNameInput.value.trim() || records[idx].name;
    records[idx].date = nohinshoDateEditInput.value || records[idx].date;
    records[idx].status = nohinshoStatusInput.value === 'done' ? 'done' : 'not_checked';
    records[idx].checked = records[idx].status === 'done';
    records[idx].updatedAt = new Date().toISOString();

    saveRecords(records);
    renderNohinshoRecords();
    setAdminMessage('納品書を保存しました。');
}

async function deleteSelectedNohinshoRecord() {
    if (!selectedRecordId) {
        alert('対象の納品書を選択してください。');
        return;
    }

    const records = getRecords();
    const idx = records.findIndex((r) => r.id === selectedRecordId);
    if (idx < 0) return;

    const record = records[idx];
    if (!confirm(`「${record.name || '無題'}」を削除一覧へ移動しますか？`)) return;

    records[idx] = {
        ...record,
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        uploadStatus: 'deleted',
        updatedAt: new Date().toISOString()
    };

    saveRecords(records);
    try {
        await waitForRecordSyncIdle();
    } catch (error) {
        console.warn('Failed to sync soft delete immediately in admin:', error);
    }
    selectedRecordId = null;
    nohinshoNameInput.value = '';
    nohinshoDateEditInput.value = nohinshoDateInput.value || todayDateString();
    nohinshoStatusInput.value = 'not_checked';
    nohinshoUrlInput.value = '';
    setPreviewImage('');
    renderNohinshoRecords();
    setAdminMessage('納品書を削除一覧へ移動しました。');
}

async function uploadNohinshoFile(file, dateStr, options = {}) {
    const { silent = false, selectOnDone = true } = options;
    const targetDate = dateStr || nohinshoDateInput.value || todayDateString();

    const record = createNohinshoRecordSkeleton(file.name, targetDate);
    record.sourceFileType = file.type || '';

    const records = getRecords();
    records.push(record);
    saveRecords(records);
    if (activeAdminTab === 'nohinsho') renderNohinshoRecords();

    try {
        const dataUrl = await parseFileToDataUrl(file);
        const latest = getRecords();
        const idx = latest.findIndex((r) => r.id === record.id);
        if (!silent) setAdminMessage('Supabase Storage へアップロード中...');

        const uploadResult = await uploadImageDataUrl(dataUrl, file.name, targetDate);
        if (idx >= 0) {
            latest[idx].sourceUrl = uploadResult.publicUrl || '';
            latest[idx].sourceStoragePath = uploadResult.storagePath || '';
            latest[idx].uploadStatus = 'done';
            latest[idx].updatedAt = new Date().toISOString();
            saveRecords(latest);
        }

        if (selectOnDone && activeAdminTab === 'nohinsho') {
            selectedRecordId = record.id;
            openNohinshoRecord(record.id);
        }

        if (!silent) setAdminMessage('画像をアップロードしました。');
        return { ok: true, recordId: record.id };
    } catch (error) {
        const latest = getRecords();
        const idx = latest.findIndex((r) => r.id === record.id);
        if (idx >= 0) {
            latest[idx].uploadStatus = 'failed';
            latest[idx].updatedAt = new Date().toISOString();
            saveRecords(latest);
        }
        if (!silent) setAdminMessage(`アップロード失敗: ${error.message || 'network error'}`, 'error');
        return { ok: false, recordId: record.id, error };
    } finally {
        if (activeAdminTab === 'nohinsho') renderNohinshoRecords();
    }
}

async function uploadNohinshoFolder(files) {
    const targetFiles = Array.from(files || []).filter(isSupportedUploadFile);
    if (targetFiles.length === 0) {
        alert('対応ファイル（画像/PDF）がありません。');
        return;
    }

    setAdminMessage(`フォルダアップロード中... 0/${targetFiles.length}`);
    btnNohinshoUpload.disabled = true;
    btnNohinshoUploadFolder.disabled = true;

    let success = 0;
    let failed = 0;

    for (let i = 0; i < targetFiles.length; i++) {
        const result = await uploadNohinshoFile(targetFiles[i], nohinshoDateInput.value || todayDateString(), { silent: true, selectOnDone: false });
        if (result.ok) success += 1; else failed += 1;
        setAdminMessage(`フォルダアップロード中... ${i + 1}/${targetFiles.length}`);
    }

    btnNohinshoUpload.disabled = false;
    btnNohinshoUploadFolder.disabled = false;
    setAdminMessage(`フォルダアップロード完了: 成功 ${success}件 / 失敗 ${failed}件`);
    renderNohinshoRecords();
}

async function purgeSoftDeletedRecords() {
    const confirmed = confirm('削除済みの納品書を完全削除します。元に戻せません。実行しますか？');
    if (!confirmed) return;

    try {
        btnNohinshoPurgeDeleted.disabled = true;
        setAdminMessage('削除済みデータを完全削除中...');

        await waitForRecordSyncIdle();

        const result = await apiRequest('/api/admin/records/purge-soft-deleted', {
            method: 'DELETE'
        });

        const recordsPayload = await apiRequest(`${API_RECORDS}?includeDeleted=true`);
        saveRecords(recordsPayload?.records || []);
        cacheRecordHashes(storeData[RECORDS_KEY]);
        dirtyRecordIds.clear();

        selectedRecordId = null;
        clearNohinshoDetailForm();
        renderNohinshoRecords();

        setAdminMessage(`完全削除しました: ${result?.purgedCount || 0}件（Storage削除: ${result?.removedStorageCount || 0}件）`);
    } catch (error) {
        setAdminMessage(`完全削除失敗: ${error.message || 'network error'}`, 'error');
    } finally {
        btnNohinshoPurgeDeleted.disabled = false;
    }
}

async function boot() {
    try {
        const me = await apiRequest(API_AUTH_ME);
        currentSessionUser = me?.user || null;
        const recordsPayload = await apiRequest(`${API_RECORDS}?includeDeleted=true`);
        saveRecords(recordsPayload?.records || []);
        await refreshUsers();
        cacheRecordHashes(storeData[RECORDS_KEY]);
        dirtyRecordIds.clear();
    } catch (error) {
        console.warn('Admin boot failed:', error);
        setAuthToken('');
        currentSessionUser = null;
    }

    const sessionUser = getSessionUser();

    if (!sessionUser || sessionUser.role !== 'admin') {
        alert('管理者のみアクセス可能です。');
        window.location.href = 'index.html';
        return;
    }

    adminStatus.textContent = `ログイン中: ${sessionUser.username} (admin)`;
    const defaultDate = pickDefaultNohinshoDate(getRecords());
    nohinshoDateInput.value = defaultDate;
    nohinshoDateEditInput.value = defaultDate;
    renderUsers();
    renderNohinshoRecords();
    setActiveTab('users');
}

adminTabUsers.addEventListener('click', () => setActiveTab('users'));
adminTabNohinsho.addEventListener('click', () => setActiveTab('nohinsho'));
toggleShowInactiveUsers.addEventListener('change', async (e) => {
    showInactiveUsers = !!e.target.checked;
    try {
        await refreshUsers();
    } catch (error) {
        setAdminMessage(`ユーザー一覧の更新失敗: ${error.message || 'network error'}`, 'error');
    }
});

document.getElementById('btn-create-user').addEventListener('click', createUser);
document.getElementById('btn-back').addEventListener('click', () => {
    window.location.href = 'index.html';
});
document.getElementById('btn-logout-admin').addEventListener('click', () => {
    clearSession().finally(() => {
        window.location.href = 'index.html';
    });
});

btnNohinshoToday.addEventListener('click', () => {
    nohinshoDateInput.value = todayDateString();
    selectedRecordId = null;
    clearNohinshoDetailForm();
    renderNohinshoRecords();
});
nohinshoDateInput.addEventListener('change', () => {
    selectedRecordId = null;
    clearNohinshoDetailForm();
    renderNohinshoRecords();
});
nohinshoSearchInput.addEventListener('input', renderNohinshoRecords);
nohinshoSortInput.addEventListener('change', renderNohinshoRecords);

btnNohinshoUpload.addEventListener('click', () => nohinshoFileInput.click());
btnNohinshoUploadFolder.addEventListener('click', () => nohinshoFolderInput.click());
btnNohinshoPurgeDeleted.addEventListener('click', purgeSoftDeletedRecords);
nohinshoFileInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) await uploadNohinshoFile(file, nohinshoDateInput.value || todayDateString());
    nohinshoFileInput.value = '';
});
nohinshoFolderInput.addEventListener('change', async (e) => {
    await uploadNohinshoFolder(e.target.files);
    nohinshoFolderInput.value = '';
});

btnNohinshoSave.addEventListener('click', saveSelectedNohinshoRecord);
btnNohinshoDelete.addEventListener('click', deleteSelectedNohinshoRecord);
btnNohinshoApplyUpload.addEventListener('click', () => nohinshoFileInput.click());

window.addEventListener('beforeunload', () => {
    flushDirtyRecords();
});

boot();
