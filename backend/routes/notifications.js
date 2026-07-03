const router = require('express').Router();
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/notifications
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', req.user.id)
    .order('sent_at', { ascending: false })
    .limit(30);

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// PATCH /api/notifications/:id/respond
router.patch('/:id/respond', requireAuth, async (req, res) => {
  const { response } = req.body;
  const { data, error } = await supabase
    .from('notifications')
    .update({ response, responded_at: new Date() })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
