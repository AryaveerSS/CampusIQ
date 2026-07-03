const router = require('express').Router();
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/grades?subject_id=
router.get('/', requireAuth, async (req, res) => {
  const { subject_id } = req.query;

  let query = supabase
    .from('grade_components')
    .select('*, subjects(name, color)')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });

  if (subject_id) query = query.eq('subject_id', subject_id);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });

  // Compute weighted scores
  const enriched = data.map(c => ({
    ...c,
    weighted_score: c.scored_marks != null
      ? ((c.scored_marks / c.max_marks) * c.weight_percent).toFixed(2)
      : null,
  }));

  res.json(enriched);
});

// GET /api/grades/summary — overall % per subject
router.get('/summary', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('grade_components')
    .select('subject_id, weight_percent, scored_marks, max_marks, subjects(name, color)')
    .eq('user_id', req.user.id);

  if (error) return res.status(400).json({ error: error.message });

  const subjects = {};
  for (const c of data) {
    const sid = c.subject_id;
    if (!subjects[sid]) {
      subjects[sid] = {
        subject_id: sid,
        name: c.subjects?.name,
        color: c.subjects?.color,
        total_weight: 0,
        earned_weight: 0,
        raw_scored: 0,
        raw_max: 0,
      };
    }
    subjects[sid].total_weight += parseFloat(c.weight_percent);
    subjects[sid].raw_max += parseFloat(c.max_marks);
    if (c.scored_marks != null) {
      const ws = (c.scored_marks / c.max_marks) * c.weight_percent;
      subjects[sid].earned_weight += ws;
      subjects[sid].raw_scored += parseFloat(c.scored_marks);
    }
  }

  res.json(Object.values(subjects).map(s => ({
    ...s,
    overall_percent: s.total_weight > 0
      ? ((s.earned_weight / s.total_weight) * 100).toFixed(2)
      : '0.00',
  })));
});

// POST /api/grades — add component
router.post('/', requireAuth, async (req, res) => {
  const { subject_id, name, weight_percent, scored_marks, max_marks } = req.body;
  if (!subject_id || !name || !weight_percent || !max_marks) {
    return res.status(400).json({ error: 'subject_id, name, weight_percent, max_marks required' });
  }

  const { data, error } = await supabase
    .from('grade_components')
    .insert({ user_id: req.user.id, subject_id, name, weight_percent, scored_marks, max_marks })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/grades/:id — update component
router.put('/:id', requireAuth, async (req, res) => {
  const { name, weight_percent, scored_marks, max_marks } = req.body;
  const { data, error } = await supabase
    .from('grade_components')
    .update({ name, weight_percent, scored_marks, max_marks })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/grades/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('grade_components')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
