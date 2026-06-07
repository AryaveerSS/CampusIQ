const { createClient } = require('@supabase/supabase-js');

/**
 * Middleware: verify Supabase JWT from Authorization header
 * Attaches req.user = { id, email }
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing auth token' });
    }

    const token = authHeader.split(' ')[1];

    // Create a client with the user's token to verify it
    const supabaseUser = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error } = await supabaseUser.auth.getUser();
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Auth failed' });
  }
}

module.exports = { requireAuth };
