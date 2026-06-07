const router = require('express').Router();
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// POST /api/auth/register-fcm — save FCM token for push notifications
router.post('/register-fcm', requireAuth, async (req, res) => {
  const { fcm_token } = req.body;
  if (!fcm_token) return res.status(400).json({ error: 'fcm_token required' });

  const { error } = await supabase
    .from('profiles')
    .update({ fcm_token })
    .eq('id', req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// GET /api/auth/profile
router.get('/profile', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, college_name')
    .eq('id', req.user.id)
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// PUT /api/auth/profile
router.put('/profile', requireAuth, async (req, res) => {
  const { full_name, college_name, avatar_url } = req.body;
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name, college_name, avatar_url, updated_at: new Date() })
    .eq('id', req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
