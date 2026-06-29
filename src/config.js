const path = require('path');
require('dotenv').config();

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

module.exports = {
  PORT,
  PUBLIC_DIR,
  CORS_ORIGIN,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET,
  SESSION_DAYS,
  ROLES,
  RECORD_STATUSES,
  UPLOAD_STATUSES
};
