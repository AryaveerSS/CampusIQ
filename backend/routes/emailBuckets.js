const router = require('express').Router();
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/email-buckets
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('email_buckets')
    .select('*, emails(count)')
    .eq('user_id', req.user.id)
    .order('created_at');

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/email-buckets
router.post('/', requireAuth, async (req, res) => {
  const { name, icon, keywords, color } = req.body;
  if (!name || !keywords?.length) {
    return res.status(400).json({ error: 'name and keywords are required' });
  }

  // Prevent duplicate buckets (case-insensitive name match)
  const { data: existing } = await supabase
    .from('email_buckets')
    .select('id')
    .eq('user_id', req.user.id)
    .ilike('name', name.trim())
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: `A bucket named "${name.trim()}" already exists.` });
  }

  const { data, error } = await supabase
    .from('email_buckets')
    .insert({ user_id: req.user.id, name: name.trim(), icon, keywords, color })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/email-buckets/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { name, icon, keywords, color } = req.body;
  const { data, error } = await supabase
    .from('email_buckets')
    .update({ name, icon, keywords, color })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/email-buckets/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('email_buckets')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
