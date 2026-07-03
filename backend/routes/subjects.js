const router = require('express').Router();
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/subjects — list all subjects for user
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/subjects — create subject
router.post('/', requireAuth, async (req, res) => {
  const { name, code, professor, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const { data, error } = await supabase
    .from('subjects')
    .insert({ user_id: req.user.id, name, code, professor, color })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/subjects/:id — update subject
router.put('/:id', requireAuth, async (req, res) => {
  const { name, code, professor, color } = req.body;
  const { data, error } = await supabase
    .from('subjects')
    .update({ name, code, professor, color })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/subjects/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('subjects')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
