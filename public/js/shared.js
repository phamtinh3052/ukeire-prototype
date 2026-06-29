const AUTH_TOKEN_KEY = 'ukeire_auth_token_v2';
const RECORDS_KEY = 'ukeire_nohinsho_records_v1';
const USERS_KEY = 'ukeire_users_v1';
const SIDEBAR_COLLAPSED_KEY = 'ukeire_sidebar_collapsed_v1';
const STAMP_NAMES_KEY = 'ukeire_stamp_names_v1';
const API_AUTH_LOGIN = '/api/auth/login';
const API_AUTH_LOGOUT = '/api/auth/logout';
const API_AUTH_ME = '/api/auth/me';
const API_USERS = '/api/users';
const API_RECORDS = '/api/records';
const API_UPLOADS = '/api/uploads';

function todayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function apiRequest(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = window.authToken || localStorage.getItem(AUTH_TOKEN_KEY) || '';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  const payload = text ? (() => { try { return JSON.parse(text); } catch { return {}; } })() : {};
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload;
}

function setAuthToken(token) {
  window.authToken = token || '';
  if (window.authToken) localStorage.setItem(AUTH_TOKEN_KEY, window.authToken);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}

function isServerRecordId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${id || ''}`);
}

function cloneLines(lines) {
  return JSON.parse(JSON.stringify(Array.isArray(lines) ? lines : []));
}

function buildRecordPayload(record) {
  return {
    name: record.name || '無題',
    date: record.date || todayDateString(),
    status: typeof normalizeRecordStatus === 'function' ? normalizeRecordStatus(record) : (record.status || 'not_checked'),
    rotation: typeof normalizeRotationDeg === 'function' ? normalizeRotationDeg(record.rotation || 0) : (record.rotation || 0),
    sourceUrl: record.sourceUrl || '',
    sourceStoragePath: record.sourceStoragePath || '',
    sourceFileType: record.sourceFileType || '',
    uploadStatus: typeof getEffectiveUploadStatus === 'function' ? getEffectiveUploadStatus(record) : (record.uploadStatus || 'done'),
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
  if (!window.localRecordHashById) window.localRecordHashById = new Map();
  window.localRecordHashById.clear();
  (Array.isArray(records) ? records : []).forEach((r) => {
    if (r?.id) window.localRecordHashById.set(r.id, getLocalRecordHash(r));
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

function dataUrlToBlob(dataUrl) {
  const match = `${dataUrl || ''}`.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid dataUrl');
  const mimeType = match[1];
  const bytes = atob(match[2]);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type: mimeType });
}

function parseFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(`${reader.result || ''}`);
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function isSupportedUploadFile(file) {
  if (!file) return false;
  return file.type.startsWith('image/') || file.type === 'application/pdf';
}
