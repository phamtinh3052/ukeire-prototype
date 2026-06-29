const crypto = require('crypto');
const { supabase } = require('./supabase');
const { SUPABASE_STORAGE_BUCKET } = require('./config');

function toSafeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    brushColor: user.brush_color,
    isActive: user.is_active,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    legacyId: user.legacy_id || ''
  };
}

function normalizeRecordRow(row) {
  const isDeleted = !!row.is_deleted || row.upload_status === 'deleted';
  return {
    id: row.id,
    name: row.name,
    date: row.work_date,
    status: row.status,
    checked: row.status === 'done',
    rotation: row.rotation || 0,
    sourceUrl: row.source_url || '',
    sourceStoragePath: row.source_storage_path || '',
    sourceFileType: row.source_file_type || '',
    uploadStatus: row.upload_status || 'done',
    editorUserId: row.editor_user_id || '',
    isDeleted,
    deletedAt: row.deleted_at || null,
    deletedStoragePath: row.deleted_storage_path || '',
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    legacyId: row.legacy_id || ''
  };
}

function withLinesHistory(record, linesHistory = []) {
  return { ...record, linesHistory: Array.isArray(linesHistory) ? linesHistory : [] };
}

async function fetchLatestAnnotationsMap(recordIds) {
  const ids = Array.from(new Set((Array.isArray(recordIds) ? recordIds : []).filter(Boolean)));
  const result = new Map();
  if (ids.length === 0) return result;

  const { data, error } = await supabase
    .from('nohinsho_annotations')
    .select('record_id, version, lines_history')
    .in('record_id', ids)
    .order('record_id', { ascending: true })
    .order('version', { ascending: false });

  if (error) throw new Error(`Latest annotations fetch failed: ${error.message}`);

  (data || []).forEach((row) => {
    if (!result.has(row.record_id)) {
      result.set(row.record_id, Array.isArray(row.lines_history) ? row.lines_history : []);
    }
  });

  return result;
}

function randomToken() {
  return crypto.randomBytes(48).toString('hex');
}

function isValidDateString(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(`${v || ''}`);
}

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

async function countActiveAdmins() {
  const { count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true);
  if (error) throw new Error(`Active admin count failed: ${error.message}`);
  return count || 0;
}

function buildStorageFolderByDate(dateStr) {
  const fallback = new Date().toISOString().slice(0, 10);
  const target = isValidDateString(dateStr) ? dateStr : fallback;
  const [y, m, d] = target.split('-');
  return `nouhinsho/${y}_${m}_${d}`;
}

function sanitizeFileName(fileName) {
  return `${fileName || 'upload'}`
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'upload';
}

function extensionFromMime(mime) {
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg'
  };
  return map[mime] || 'png';
}

function parseDataUrl(dataUrl) {
  const match = `${dataUrl || ''}`.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid dataUrl');
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function ensureStorageBucket() {
  const { data, error } = await supabase.storage.getBucket(SUPABASE_STORAGE_BUCKET);
  if (!error && data) return;
  const { error: createError } = await supabase.storage.createBucket(SUPABASE_STORAGE_BUCKET, {
    public: true,
    fileSizeLimit: '20MB'
  });
  if (createError && !/already exists/i.test(createError.message || '')) {
    throw new Error(`Storage bucket init failed: ${createError.message}`);
  }
}

async function uploadDataUrlToStorage({ dataUrl, fileName, dateStr }) {
  const { mimeType, buffer } = parseDataUrl(dataUrl);
  const safeFileName = sanitizeFileName(fileName);
  const folder = buildStorageFolderByDate(dateStr);
  const ext = safeFileName.includes('.') ? safeFileName.split('.').pop() : extensionFromMime(mimeType);
  const baseName = safeFileName.includes('.') ? safeFileName.slice(0, safeFileName.lastIndexOf('.')) : safeFileName;
  const filePath = `${folder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${baseName}.${ext}`;

  const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(filePath, buffer, {
    contentType: mimeType,
    upsert: false
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(filePath);
  return { storagePath: filePath, publicUrl: data?.publicUrl || '' };
}

async function removeStoragePaths(paths) {
  const normalized = Array.from(new Set((Array.isArray(paths) ? paths : []).map((p) => `${p || ''}`.trim()).filter(Boolean)));
  if (normalized.length === 0) return { removedStorageCount: 0 };

  let removedStorageCount = 0;
  for (let i = 0; i < normalized.length; i += 100) {
    const chunk = normalized.slice(i, i + 100);
    const { data, error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove(chunk);
    if (error) throw new Error(`Storage delete failed: ${error.message}`);
    removedStorageCount += Array.isArray(data) ? data.length : 0;
  }
  return { removedStorageCount };
}

module.exports = {
  toSafeUser,
  normalizeRecordRow,
  withLinesHistory,
  fetchLatestAnnotationsMap,
  randomToken,
  isValidDateString,
  badRequest,
  countActiveAdmins,
  ensureStorageBucket,
  uploadDataUrlToStorage,
  removeStoragePaths
};
