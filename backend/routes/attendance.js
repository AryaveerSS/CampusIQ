const router = require('express').Router();
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/attendance?subject_id=&month=2026-06
router.get('/', requireAuth, async (req, res) => {
  const { subject_id, month } = req.query;

  let query = supabase
    .from('attendance')
    .select('*, subjects(name, color)')
    .eq('user_id', req.user.id)
    .order('date', { ascending: false });

  if (subject_id) query = query.eq('subject_id', subject_id);
  if (month) {
    // month format: "2026-06" → filter from first to last day of that month
    const [year, mon] = month.split('-').map(Number);
    if (year && mon) {
      const lastDay = new Date(year, mon, 0).getDate(); // day 0 of next month = last day of this month
      const pad = (n) => String(n).padStart(2, '0');
      query = query
        .gte('date', `${year}-${pad(mon)}-01`)
        .lte('date', `${year}-${pad(mon)}-${pad(lastDay)}`);
    }
  }

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GET /api/attendance/stats — attendance % per subject
router.get('/stats', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('attendance')
    .select('subject_id, status, subjects(name, color)')
    .eq('user_id', req.user.id)
    .neq('status', 'cancelled');

  if (error) return res.status(400).json({ error: error.message });

  // Aggregate by subject
  const stats = {};
  for (const record of data) {
    const sid = record.subject_id;
    if (!stats[sid]) {
      stats[sid] = {
        subject_id: sid,
        subject_name: record.subjects?.name,
        color: record.subjects?.color,
        total: 0,
        present: 0,
      };
    }
    stats[sid].total++;
    if (record.status === 'present') stats[sid].present++;
  }

  const result = Object.values(stats).map(s => ({
    ...s,
    percentage: s.total > 0 ? ((s.present / s.total) * 100).toFixed(1) : '0.0',
  }));

  res.json(result);
});

// POST /api/attendance — mark attendance
router.post('/', requireAuth, async (req, res) => {
  const { subject_id, date, status, marked_via } = req.body;
  if (!subject_id || !date || !status) {
    return res.status(400).json({ error: 'subject_id, date, status required' });
  }

  const { data, error } = await supabase
    .from('attendance')
    .upsert({
      user_id: req.user.id,
      subject_id,
      date,
      status,
      marked_via: marked_via || 'manual',
    }, { onConflict: 'user_id,subject_id,date' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// POST /api/attendance/respond-notification — respond to push notification
router.post('/respond-notification', requireAuth, async (req, res) => {
  const { notification_id, slot_id, status } = req.body;
  // status: 'present' | 'absent'

  // Get the timetable slot to find subject
  const { data: slot } = await supabase
    .from('timetable_slots')
    .select('subject_id')
    .eq('id', slot_id)
    .single();

  if (!slot) return res.status(404).json({ error: 'Slot not found' });

  const today = new Date().toISOString().split('T')[0];

  // Mark attendance
  await supabase.from('attendance').upsert({
    user_id: req.user.id,
    subject_id: slot.subject_id,
    date: today,
    status,
    marked_via: 'notification',
  }, { onConflict: 'user_id,subject_id,date' });

  // Update notification response
  if (notification_id) {
    await supabase.from('notifications')
      .update({ responded_at: new Date(), response: status })
      .eq('id', notification_id);
  }

  res.json({ success: true });
});

// DELETE /api/attendance/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('attendance')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
