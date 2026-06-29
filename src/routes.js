const express = require('express');
const { PUBLIC_DIR, CORS_ORIGIN } = require('./config');
const { createAuthMiddleware, requireAdmin } = require('./middleware');
const { badRequest, normalizeRecordRow, toSafeUser } = require('./helpers');

function createRoutes({ supabase, services }) {
  const app = express();
  const requireAuth = createAuthMiddleware({ supabase });

  app.use(express.json({ limit: '25mb' }));
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      store: 'supabase',
      bucket: require('./config').SUPABASE_STORAGE_BUCKET,
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
      const result = await services.uploadDataUrlToStorage({ dataUrl, fileName, dateStr: date });
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Upload failed' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const username = `${req.body?.username || ''}`.trim();
      const password = `${req.body?.password || ''}`;
      if (!username || !password) return badRequest(res, 'username and password are required');
      const result = await services.login(username, password);
      if (!result) return res.status(401).json({ error: 'Invalid credentials' });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Login failed' });
    }
  });

  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    try {
      await services.logout(req.authToken);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Logout failed' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    res.json({ user: toSafeUser(req.authUser) });
  });

  app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
      const includeInactive = `${req.query.includeInactive || 'false'}` === 'true';
      const users = await services.listUsers(includeInactive);
      res.json({ users });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Users fetch failed' });
    }
  });

  app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = await services.createUser({
        username: `${req.body?.username || ''}`.trim(),
        password: `${req.body?.password || ''}`,
        role: `${req.body?.role || 'user'}`,
        brushColor: `${req.body?.brushColor || '#ff0000'}`
      });
      if (user?.error) return badRequest(res, user.error);
      res.status(201).json({ user });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Create user failed' });
    }
  });

  app.patch('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await services.updateUser(req.params.id, req.body);
      if (result?.notFound) return res.status(404).json({ error: 'User not found' });
      if (result?.error) return badRequest(res, result.error);
      res.json({ user: result });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Update user failed' });
    }
  });

  app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await services.deleteUser(req.params.id, req.authUser.id);
      if (result?.notFound) return res.status(404).json({ error: 'User not found' });
      if (result?.error) return badRequest(res, result.error);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Delete user failed' });
    }
  });

  app.delete('/api/admin/records/purge-soft-deleted', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const result = await services.purgeSoftDeletedRecords();
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Purge soft-deleted records failed' });
    }
  });

  app.get('/api/records', requireAuth, async (req, res) => {
    try {
      const records = await services.listRecords({
        date: `${req.query.date || ''}`.trim(),
        search: `${req.query.search || ''}`.trim(),
        includeDeleted: `${req.query.includeDeleted || 'false'}` === 'true'
      });
      res.json({ records });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Records fetch failed' });
    }
  });

  app.post('/api/records', requireAuth, async (req, res) => {
    try {
      const result = await services.createRecord(req.body || {}, req.authUser.id);
      if (result?.error) return badRequest(res, result.error);
      await services.logRecordHistory({
        recordId: result.id,
        actorUserId: req.authUser.id,
        action: 'created',
        afterData: normalizeRecordRow(result)
      });
      res.status(201).json({ record: normalizeRecordRow(result) });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Create record failed' });
    }
  });

  app.get('/api/records/:id', requireAuth, async (req, res) => {
    try {
      const result = await services.getRecord(req.params.id);
      if (!result) return res.status(404).json({ error: 'Record not found' });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Fetch record failed' });
    }
  });

  app.patch('/api/records/:id', requireAuth, async (req, res) => {
    try {
      const result = await services.updateRecord(req.params.id, req.body || {}, req.authUser.id);
      if (result?.notFound) return res.status(404).json({ error: 'Record not found' });
      await services.logRecordHistory({
        recordId: req.params.id,
        actorUserId: req.authUser.id,
        action: 'updated',
        beforeData: normalizeRecordRow(result.before),
        afterData: normalizeRecordRow(result.after)
      });
      res.json({ record: normalizeRecordRow(result.after) });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Update record failed' });
    }
  });

  app.delete('/api/records/:id', requireAuth, async (req, res) => {
    try {
      const result = await services.softDeleteRecord(req.params.id, req.authUser.id);
      if (result?.notFound) return res.status(404).json({ error: 'Record not found' });
      await services.logRecordHistory({
        recordId: req.params.id,
        actorUserId: req.authUser.id,
        action: 'soft_deleted',
        beforeData: normalizeRecordRow(result.before),
        afterData: normalizeRecordRow(result.after)
      });
      res.json({ ok: true, record: normalizeRecordRow(result.after) });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Soft delete failed' });
    }
  });

  app.get('/api/records/:id/annotations', requireAuth, async (req, res) => {
    try {
      const annotations = await services.listAnnotations(req.params.id);
      res.json({ annotations });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Annotations fetch failed' });
    }
  });

  app.post('/api/records/:id/annotations', requireAuth, async (req, res) => {
    try {
      const linesHistory = Array.isArray(req.body?.linesHistory) ? req.body.linesHistory : null;
      if (!linesHistory) return badRequest(res, 'linesHistory must be an array');
      const annotation = await services.saveAnnotation(req.params.id, linesHistory, `${req.body?.comment || ''}`, req.authUser.id);
      await services.logRecordHistory({
        recordId: req.params.id,
        actorUserId: req.authUser.id,
        action: 'annotation_saved',
        afterData: { version: annotation.version, comment: annotation.comment }
      });
      res.status(201).json({ annotation });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Save annotation failed' });
    }
  });

  app.get('/api/records/:id/history', requireAuth, async (req, res) => {
    try {
      const history = await services.listHistory(req.params.id);
      res.json({ history });
    } catch (error) {
      res.status(500).json({ error: error.message || 'History fetch failed' });
    }
  });

  app.use(express.static(PUBLIC_DIR));
  app.get('/', (_req, res) => res.sendFile(require('path').join(PUBLIC_DIR, 'index.html')));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err?.message || 'Internal Server Error' }));

  return app;
}

module.exports = { createRoutes };
