const path = require('path');
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const PORT = process.env.PORT ? Number(process.env.PORT) : 5173;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_STORAGE_BUCKET = (process.env.SUPABASE_STORAGE_BUCKET || 'nohinsho-assets').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const SESSION_DAYS = 30;
const ROLES = new Set(['admin', 'user']);
const RECORD_STATUSES = new Set(['not_checked', 'done']);
const UPLOAD_STATUSES = new Set(['uploading', 'done', 'failed', 'deleted']);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: {
    transport: ws
  }
});

const app = express();
app.use(express.json({ limit: '25mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
});

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
    isDeleted: !!row.is_deleted,
    deletedAt: row.deleted_at || null,
    deletedStoragePath: row.deleted_storage_path || '',
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    legacyId: row.legacy_id || ''
  };
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
  const mimeType = match[1];
  const base64 = match[2];
  return {
    mimeType,
    buffer: Buffer.from(base64, 'base64')
  };
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
  const path = `${folder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${baseName}.${ext}`;

  const { error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: false
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(path);
  return {
    storagePath: path,
    publicUrl: data?.publicUrl || ''
  };
}

async function getSessionByToken(token) {
  const { data: session, error } = await supabase
    .from('user_sessions')
    .select('id, user_id, token, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (error) throw new Error(`Session query failed: ${error.message}`);
  if (!session) return null;
  if (session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) return null;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user_id)
    .maybeSingle();

  if (userError) throw new Error(`User query failed: ${userError.message}`);
  if (!user || !user.is_active) return null;
  return { session, user };
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = `${req.headers.authorization || ''}`;
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.slice(7).trim();
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const session = await getSessionByToken(token);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });

    req.authToken = token;
    req.authUser = session.user;
    req.authSession = session.session;
    return next();
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Auth error' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.authUser || req.authUser.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  return next();
}

async function logRecordHistory({ recordId, actorUserId, action, beforeData = null, afterData = null }) {
  const { error } = await supabase
    .from('nohinsho_record_history')
    .insert({
      record_id: recordId,
      actor_user_id: actorUserId || null,
      action,
      before_data: beforeData,
      after_data: afterData
    });
  if (error) throw new Error(`History insert failed: ${error.message}`);
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    store: 'supabase',
    bucket: SUPABASE_STORAGE_BUCKET,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.post('/api/uploads', requireAuth, async (req, res) => {
  try {
    const dataUrl = `${req.body?.dataUrl || ''}`;
    const fileName = `${req.body?.fileName || 'upload.png'}`;
    const date = `${req.body?.date || ''}`;

    if (!dataUrl) return badRequest(res, 'dataUrl is required');

    const result = await uploadDataUrlToStorage({ dataUrl, fileName, dateStr: date });
    res.status(201).json({
      storagePath: result.storagePath,
      publicUrl: result.publicUrl
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = `${req.body?.username || ''}`.trim();
    const password = `${req.body?.password || ''}`;
    if (!username || !password) return badRequest(res, 'username and password are required');

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    if (error) throw new Error(`Login query failed: ${error.message}`);
    if (!user || !user.is_active) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { error: sessionError } = await supabase
      .from('user_sessions')
      .insert({ user_id: user.id, token, expires_at: expiresAt });
    if (sessionError) throw new Error(`Session create failed: ${sessionError.message}`);

    res.json({ token, expiresAt, user: toSafeUser(user) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('user_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', req.authToken);
    if (error) throw new Error(`Logout failed: ${error.message}`);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Logout failed' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: toSafeUser(req.authUser) });
});

app.get('/api/users', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Users fetch failed: ${error.message}`);
    res.json({ users: (data || []).map(toSafeUser) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Users fetch failed' });
  }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const username = `${req.body?.username || ''}`.trim();
    const password = `${req.body?.password || ''}`;
    const role = `${req.body?.role || 'user'}`;
    const brushColor = `${req.body?.brushColor || '#ff0000'}`;

    if (!username || !password) return badRequest(res, 'username and password are required');
    if (!ROLES.has(role)) return badRequest(res, 'invalid role');

    const passwordHash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('users')
      .insert({
        username,
        password_hash: passwordHash,
        role,
        brush_color: brushColor,
        is_active: true
      })
      .select('*')
      .single();

    if (error) throw new Error(`Create user failed: ${error.message}`);
    res.status(201).json({ user: toSafeUser(data) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Create user failed' });
  }
});

app.patch('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const patch = {};

    if (typeof req.body?.role === 'string') {
      if (!ROLES.has(req.body.role)) return badRequest(res, 'invalid role');
      patch.role = req.body.role;
    }
    if (typeof req.body?.brushColor === 'string') {
      patch.brush_color = req.body.brushColor;
    }
    if (typeof req.body?.isActive === 'boolean') {
      patch.is_active = req.body.isActive;
    }
    if (typeof req.body?.password === 'string' && req.body.password.trim()) {
      patch.password_hash = await bcrypt.hash(req.body.password.trim(), 10);
    }
    if (Object.keys(patch).length === 0) return badRequest(res, 'no valid fields to update');

    const { data, error } = await supabase
      .from('users')
      .update(patch)
      .eq('id', userId)
      .select('*')
      .maybeSingle();

    if (error) throw new Error(`Update user failed: ${error.message}`);
    if (!data) return res.status(404).json({ error: 'User not found' });
    res.json({ user: toSafeUser(data) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Update user failed' });
  }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    if (req.authUser.id === userId) return badRequest(res, 'cannot delete current user');

    const { error } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', userId);
    if (error) throw new Error(`Delete user failed: ${error.message}`);

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Delete user failed' });
  }
});

app.get('/api/records', requireAuth, async (req, res) => {
  try {
    const date = `${req.query.date || ''}`.trim();
    const search = `${req.query.search || ''}`.trim().toLowerCase();
    const includeDeleted = `${req.query.includeDeleted || 'false'}` === 'true';

    let query = supabase
      .from('nohinsho_records')
      .select('*')
      .order('updated_at', { ascending: false });

    if (isValidDateString(date)) query = query.eq('work_date', date);
    if (!includeDeleted) query = query.eq('is_deleted', false);

    const { data, error } = await query;
    if (error) throw new Error(`Records fetch failed: ${error.message}`);

    let rows = data || [];
    if (search) {
      rows = rows.filter((r) => `${r.name || ''}`.toLowerCase().includes(search));
    }

    res.json({ records: rows.map(normalizeRecordRow) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Records fetch failed' });
  }
});

app.post('/api/records', requireAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    const name = `${payload.name || ''}`.trim();
    const date = `${payload.date || ''}`.trim();
    if (!name) return badRequest(res, 'name is required');
    if (!isValidDateString(date)) return badRequest(res, 'date must be YYYY-MM-DD');

    const status = RECORD_STATUSES.has(payload.status) ? payload.status : 'not_checked';
    const uploadStatus = UPLOAD_STATUSES.has(payload.uploadStatus) ? payload.uploadStatus : 'done';

    const insertData = {
      name,
      work_date: date,
      status,
      rotation: Number.isFinite(payload.rotation) ? payload.rotation : 0,
      source_url: `${payload.sourceUrl || ''}`,
      source_storage_path: `${payload.sourceStoragePath || ''}`,
      source_file_type: `${payload.sourceFileType || ''}`,
      upload_status: uploadStatus,
      editor_user_id: req.authUser.id,
      created_by: req.authUser.id,
      updated_by: req.authUser.id,
      is_deleted: false
    };

    const { data, error } = await supabase
      .from('nohinsho_records')
      .insert(insertData)
      .select('*')
      .single();
    if (error) throw new Error(`Create record failed: ${error.message}`);

    await logRecordHistory({
      recordId: data.id,
      actorUserId: req.authUser.id,
      action: 'created',
      afterData: normalizeRecordRow(data)
    });

    res.status(201).json({ record: normalizeRecordRow(data) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Create record failed' });
  }
});

app.get('/api/records/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('nohinsho_records')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw new Error(`Fetch record failed: ${error.message}`);
    if (!data) return res.status(404).json({ error: 'Record not found' });

    const { data: latestAnnotation } = await supabase
      .from('nohinsho_annotations')
      .select('*')
      .eq('record_id', data.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({
      record: normalizeRecordRow(data),
      latestAnnotation: latestAnnotation || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Fetch record failed' });
  }
});

app.patch('/api/records/:id', requireAuth, async (req, res) => {
  try {
    const recordId = req.params.id;
    const { data: before, error: beforeError } = await supabase
      .from('nohinsho_records')
      .select('*')
      .eq('id', recordId)
      .maybeSingle();
    if (beforeError) throw new Error(`Fetch before update failed: ${beforeError.message}`);
    if (!before) return res.status(404).json({ error: 'Record not found' });

    const patch = { updated_by: req.authUser.id };
    if (typeof req.body?.name === 'string' && req.body.name.trim()) patch.name = req.body.name.trim();
    if (typeof req.body?.date === 'string' && isValidDateString(req.body.date)) patch.work_date = req.body.date;
    if (typeof req.body?.status === 'string' && RECORD_STATUSES.has(req.body.status)) patch.status = req.body.status;
    if (Number.isFinite(req.body?.rotation)) patch.rotation = req.body.rotation;
    if (typeof req.body?.sourceUrl === 'string') patch.source_url = req.body.sourceUrl;
    if (typeof req.body?.sourceStoragePath === 'string') patch.source_storage_path = req.body.sourceStoragePath;
    if (typeof req.body?.sourceFileType === 'string') patch.source_file_type = req.body.sourceFileType;
    if (typeof req.body?.uploadStatus === 'string' && UPLOAD_STATUSES.has(req.body.uploadStatus)) {
      patch.upload_status = req.body.uploadStatus;
    }
    if (typeof req.body?.isDeleted === 'boolean') patch.is_deleted = req.body.isDeleted;
    if (typeof req.body?.deletedStoragePath === 'string') patch.deleted_storage_path = req.body.deletedStoragePath;
    if (typeof req.body?.deletedAt === 'string' || req.body?.deletedAt === null) patch.deleted_at = req.body.deletedAt;

    const { data: after, error } = await supabase
      .from('nohinsho_records')
      .update(patch)
      .eq('id', recordId)
      .select('*')
      .single();
    if (error) throw new Error(`Update record failed: ${error.message}`);

    await logRecordHistory({
      recordId,
      actorUserId: req.authUser.id,
      action: 'updated',
      beforeData: normalizeRecordRow(before),
      afterData: normalizeRecordRow(after)
    });

    res.json({ record: normalizeRecordRow(after) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Update record failed' });
  }
});

app.delete('/api/records/:id', requireAuth, async (req, res) => {
  try {
    const recordId = req.params.id;
    const { data: before, error: beforeError } = await supabase
      .from('nohinsho_records')
      .select('*')
      .eq('id', recordId)
      .maybeSingle();
    if (beforeError) throw new Error(`Fetch record failed: ${beforeError.message}`);
    if (!before) return res.status(404).json({ error: 'Record not found' });

    const { data: after, error } = await supabase
      .from('nohinsho_records')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        upload_status: 'deleted',
        updated_by: req.authUser.id
      })
      .eq('id', recordId)
      .select('*')
      .single();
    if (error) throw new Error(`Soft delete failed: ${error.message}`);

    await logRecordHistory({
      recordId,
      actorUserId: req.authUser.id,
      action: 'soft_deleted',
      beforeData: normalizeRecordRow(before),
      afterData: normalizeRecordRow(after)
    });

    res.json({ ok: true, record: normalizeRecordRow(after) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Soft delete failed' });
  }
});

app.get('/api/records/:id/annotations', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('nohinsho_annotations')
      .select('*')
      .eq('record_id', req.params.id)
      .order('version', { ascending: false });
    if (error) throw new Error(`Annotations fetch failed: ${error.message}`);
    res.json({ annotations: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Annotations fetch failed' });
  }
});

app.post('/api/records/:id/annotations', requireAuth, async (req, res) => {
  try {
    const recordId = req.params.id;
    const linesHistory = Array.isArray(req.body?.linesHistory) ? req.body.linesHistory : null;
    if (!linesHistory) return badRequest(res, 'linesHistory must be an array');
    const comment = `${req.body?.comment || ''}`;

    const { data: latest } = await supabase
      .from('nohinsho_annotations')
      .select('version')
      .eq('record_id', recordId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latest?.version || 0) + 1;
    const { data, error } = await supabase
      .from('nohinsho_annotations')
      .insert({
        record_id: recordId,
        version: nextVersion,
        lines_history: linesHistory,
        comment,
        created_by: req.authUser.id
      })
      .select('*')
      .single();
    if (error) throw new Error(`Save annotation failed: ${error.message}`);

    await logRecordHistory({
      recordId,
      actorUserId: req.authUser.id,
      action: 'annotation_saved',
      afterData: { version: data.version, comment: data.comment }
    });

    const { error: touchError } = await supabase
      .from('nohinsho_records')
      .update({ updated_by: req.authUser.id })
      .eq('id', recordId);
    if (touchError) throw new Error(`Touch record failed: ${touchError.message}`);

    res.status(201).json({ annotation: data });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Save annotation failed' });
  }
});

app.get('/api/records/:id/history', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('nohinsho_record_history')
      .select('id, record_id, actor_user_id, action, before_data, after_data, created_at')
      .eq('record_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`History fetch failed: ${error.message}`);
    res.json({ history: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'History fetch failed' });
  }
});

app.use(express.static(PUBLIC_DIR));
app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, _req, res, _next) => {
  res.status(500).json({ error: err?.message || 'Internal Server Error' });
});

async function ensureDefaultAdmin() {
  const { data: users, error } = await supabase
    .from('users')
    .select('id')
    .limit(1);
  if (error) throw new Error(`Default admin check failed: ${error.message}`);
  if (users && users.length > 0) return;

  const passwordHash = await bcrypt.hash('admin123', 10);
  const { error: insertError } = await supabase
    .from('users')
    .insert({
      username: 'admin',
      password_hash: passwordHash,
      role: 'admin',
      brush_color: '#ff0000',
      is_active: true
    });
  if (insertError) throw new Error(`Default admin create failed: ${insertError.message}`);
}

async function verifySchema() {
  const checks = ['users', 'user_sessions', 'nohinsho_records', 'nohinsho_annotations', 'nohinsho_record_history'];
  for (const table of checks) {
    const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      throw new Error(`Schema missing or inaccessible table '${table}': ${error.message}`);
    }
  }
}

Promise.resolve()
  .then(async () => {
    await verifySchema();
    await ensureStorageBucket();
    await ensureDefaultAdmin();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT} (supabase REST backend)`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  });
