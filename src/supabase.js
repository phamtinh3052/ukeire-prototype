const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
} = require('./config');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws }
});

module.exports = { supabase };
