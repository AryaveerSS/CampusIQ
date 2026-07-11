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
// A bucket needs at least one classification signal: keywords and/or sender_emails.
// - keywords: used as a hint for AI-based semantic classification (not literal-only matching)
// - sender_emails: hard rule — any email from these addresses always goes to this bucket
router.post('/', requireAuth, async (req, res) => {
  const { name, icon, keywords, sender_emails, excluded_senders, color } = req.body;
  const cleanKeywords = (keywords || []).map(k => k.trim()).filter(Boolean);
  const cleanSenders = (sender_emails || []).map(e => e.trim().toLowerCase()).filter(Boolean);
  const cleanExcluded = (excluded_senders || []).map(e => e.trim().toLowerCase()).filter(Boolean);

  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!cleanKeywords.length && !cleanSenders.length) {
    return res.status(400).json({ error: 'Add at least one keyword or sender email.' });
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
    .insert({
      user_id: req.user.id,
      name: name.trim(),
      icon,
      keywords: cleanKeywords,
      sender_emails: cleanSenders,
      excluded_senders: cleanExcluded,
      color,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/email-buckets/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { name, icon, keywords, sender_emails, excluded_senders, color } = req.body;
  const update = { name, icon, color };
  if (keywords !== undefined) update.keywords = keywords.map(k => k.trim()).filter(Boolean);
  if (sender_emails !== undefined) update.sender_emails = sender_emails.map(e => e.trim().toLowerCase()).filter(Boolean);
  if (excluded_senders !== undefined) update.excluded_senders = excluded_senders.map(e => e.trim().toLowerCase()).filter(Boolean);

  const { data, error } = await supabase
    .from('email_buckets')
    .update(update)
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
