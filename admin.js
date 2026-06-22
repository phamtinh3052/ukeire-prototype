const USERS_KEY = 'ukeire_users_v1';
const SESSION_KEY = 'ukeire_session_v1';
const RECORDS_KEY = 'ukeire_nohinsho_records_v1';
const CLOUDINARY_CLOUD_NAME = 'dlnvnf9h3';
const CLOUDINARY_UPLOAD_PRESET = 'ukeire-prototype';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const adminStatus = document.getElementById('admin-status');
const usersTable = document.getElementById('users-table');
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
const nohinshoRecordsList = document.getElementById('nohinsho-records-list');
const nohinshoPreview = document.getElementById('nohinsho-preview');
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

function buildDeletedStoragePath(record) {
    const folder = `${buildCloudinaryFolderByDate(record?.date || todayDateString())}/deleted`;
    const sourcePath = `${record?.sourceStoragePath || ''}`.trim();
    const fileName = sourcePath.split('/').pop() || `${record?.id || `r-${Date.now()}`}`;
    return `${folder}/${fileName}`;
}

function buildCloudinaryAssetUrl(publicId) {
    if (!publicId) return '';
    const cleanId = `${publicId}`.replace(/^\/+/, '');
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${cleanId}`;
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

function getSessionUser() {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) return null;
    return getUsers().find((u) => u.id === userId) || null;
}

function clearSession() {
    localStorage.setItem(SESSION_KEY, '');
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
        nohinshoDateInput.value = todayDateString();
    }

    if (tab === 'nohinsho') {
        renderNohinshoRecords();
    }
}

function createUser() {
    const username = newUsernameInput.value.trim();
    const password = newPasswordInput.value.trim();
    const role = newRoleInput.value;
    const brushColor = newBrushColorInput.value;

    if (!username || !password) {
        alert('ユーザー名とパスワードを入力してください。');
        return;
    }

    const users = getUsers();
    if (users.some((u) => u.username === username)) {
        alert('同じユーザー名が存在します。');
        return;
    }

    users.push({
        id: `u-${Date.now()}`,
        username,
        password,
        role,
        brushColor
    });

    saveUsers(users);
    newUsernameInput.value = '';
    newPasswordInput.value = '';
    newRoleInput.value = 'user';
    newBrushColorInput.value = '#ff0000';
    renderUsers();
    setAdminMessage('ユーザーを追加しました。');
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
        return `
            <div class="user-row" data-id="${u.id}">
                <div class="user-name">${u.username}</div>
                <select class="user-role" aria-label="権限: ${u.username}">
                    <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
                </select>
                <input class="user-color" type="color" value="${u.brushColor || '#ff0000'}" aria-label="ブラシ色: ${u.username}" />
                <input class="user-password" type="text" value="${u.password}" aria-label="パスワード: ${u.username}" />
                <button class="btn-save-user btn-primary">保存</button>
                <button class="btn-delete-user btn-danger" ${disableDelete ? 'disabled' : ''}>削除</button>
            </div>
        `;
    }).join('');

    usersTable.querySelectorAll('.btn-save-user').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const row = e.target.closest('.user-row');
            if (!row) return;

            const id = row.dataset.id;
            const role = row.querySelector('.user-role').value;
            const brushColor = row.querySelector('.user-color').value;
            const password = row.querySelector('.user-password').value.trim();

            if (!password) {
                alert('パスワードは空にできません。');
                return;
            }

            const list = getUsers();
            const idx = list.findIndex((x) => x.id === id);
            if (idx < 0) return;

            if (list[idx].role === 'admin' && role !== 'admin' && countAdmins(list) <= 1) {
                alert('最後のadminは変更できません。');
                return;
            }

            list[idx].role = role;
            list[idx].brushColor = brushColor;
            list[idx].password = password;
            saveUsers(list);
            renderUsers();
            setAdminMessage('ユーザーを更新しました。');
        });
    });

    usersTable.querySelectorAll('.btn-delete-user').forEach((btn) => {
        btn.addEventListener('click', (e) => {
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

            saveUsers(list.filter((x) => x.id !== id));
            renderUsers();
            setAdminMessage('ユーザーを削除しました。');
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

async function uploadFileToCloudinary(file, dateStr) {
    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', buildCloudinaryFolderByDate(dateStr || todayDateString()));

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
        downloadURL: result.secure_url || ''
    };
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
        nohinshoPreviewEmpty.style.display = 'block';
        return;
    }

    nohinshoPreviewEmpty.style.display = 'none';
    nohinshoPreview.style.display = 'block';
    nohinshoPreview.src = imageUrl;
}

function clearNohinshoDetailForm() {
    nohinshoNameInput.value = '';
    nohinshoDateEditInput.value = nohinshoDateInput.value || todayDateString();
    nohinshoStatusInput.value = 'not_checked';
    nohinshoUrlInput.value = '';
    setPreviewImage('');
}

function openNohinshoRecord(recordId) {
    selectedRecordId = recordId;
    const record = getRecords().find((r) => r.id === recordId);
    if (!record) {
        renderNohinshoRecords();
        return;
    }

    nohinshoNameInput.value = record.name || '';
    nohinshoDateEditInput.value = record.date || todayDateString();
    nohinshoStatusInput.value = normalizeRecordStatus(record);
    nohinshoUrlInput.value = record.sourceUrl || record.sourceStoragePath || '';

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

    setPreviewImage(imageUrl);
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

function deleteSelectedNohinshoRecord() {
    if (!selectedRecordId) {
        alert('対象の納品書を選択してください。');
        return;
    }

    const records = getRecords();
    const idx = records.findIndex((r) => r.id === selectedRecordId);
    if (idx < 0) return;

    const record = records[idx];
    if (!confirm(`「${record.name || '無題'}」を deleted フォルダへ移動しますか？`)) return;

    const deletedPath = buildDeletedStoragePath(record);
    records[idx] = {
        ...record,
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedStoragePath: deletedPath,
        sourceStoragePath: deletedPath,
        uploadStatus: 'deleted',
        updatedAt: new Date().toISOString()
    };

    saveRecords(records);
    selectedRecordId = null;
    nohinshoNameInput.value = '';
    nohinshoDateEditInput.value = nohinshoDateInput.value || todayDateString();
    nohinshoStatusInput.value = 'not_checked';
    nohinshoUrlInput.value = '';
    setPreviewImage('');
    renderNohinshoRecords();
    setAdminMessage('納品書を deleted フォルダへ移動しました。');
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
        const uploadBlob = dataUrlToBlob(dataUrl);
        if (!silent) setAdminMessage('Cloudinaryへアップロード中...');

        const uploadResult = await uploadFileToCloudinary(uploadBlob, targetDate);
        const latest = getRecords();
        const idx = latest.findIndex((r) => r.id === record.id);
        if (idx >= 0) {
            latest[idx].sourceUrl = uploadResult.downloadURL;
            latest[idx].sourceStoragePath = uploadResult.storagePath;
            latest[idx].uploadStatus = 'done';
            latest[idx].updatedAt = new Date().toISOString();
            saveRecords(latest);
        }

        if (selectOnDone && activeAdminTab === 'nohinsho') {
            selectedRecordId = record.id;
            openNohinshoRecord(record.id);
        }

        if (!silent) setAdminMessage('アップロードしました。');
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

function boot() {
    ensureDefaultAdmin();
    const sessionUser = getSessionUser();

    if (!sessionUser || sessionUser.role !== 'admin') {
        alert('管理者のみアクセス可能です。');
        window.location.href = 'index.html';
        return;
    }

    adminStatus.textContent = `ログイン中: ${sessionUser.username} (admin)`;
    nohinshoDateInput.value = todayDateString();
    nohinshoDateEditInput.value = todayDateString();
    renderUsers();
    renderNohinshoRecords();
    setActiveTab('users');
}

adminTabUsers.addEventListener('click', () => setActiveTab('users'));
adminTabNohinsho.addEventListener('click', () => setActiveTab('nohinsho'));

document.getElementById('btn-create-user').addEventListener('click', createUser);
document.getElementById('btn-back').addEventListener('click', () => {
    window.location.href = 'index.html';
});
document.getElementById('btn-logout-admin').addEventListener('click', () => {
    clearSession();
    window.location.href = 'index.html';
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

boot();
