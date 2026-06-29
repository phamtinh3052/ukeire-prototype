async function getSessionByToken(supabase, token) {
  const { data: session, error } = await supabase
    .from('user_sessions')
    .select('id, user_id, token, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle();
  if (error) throw new Error(`Session query failed: ${error.message}`);
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return null;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user_id)
    .maybeSingle();
  if (userError) throw new Error(`User query failed: ${userError.message}`);
  if (!user || !user.is_active) return null;
  return { session, user };
}

function createAuthMiddleware({ supabase }) {
  return async function requireAuth(req, res, next) {
    try {
      const authHeader = `${req.headers.authorization || ''}`;
      if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
      const token = authHeader.slice(7).trim();
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const session = await getSessionByToken(supabase, token);
      if (!session) return res.status(401).json({ error: 'Unauthorized' });

      req.authToken = token;
      req.authUser = session.user;
      req.authSession = session.session;
      return next();
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Auth error' });
    }
  };
}

function requireAdmin(req, res, next) {
  if (!req.authUser || req.authUser.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  return next();
}

module.exports = { createAuthMiddleware, requireAdmin };
