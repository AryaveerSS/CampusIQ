const router = require('express').Router();
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const XLSX = require('xlsx');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const DAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const DAY_ABBR = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };

// Normalize a day value (number or name/abbreviation) to 0-6, or null if invalid
function normalizeDay(day) {
  if (day == null) return null;
  if (typeof day === 'number') return day >= 0 && day <= 6 ? day : null;
  const s = String(day).toLowerCase().trim();
  if (DAYS[s] != null) return DAYS[s];
  // Match by prefix so "mon", "monday", "mon." all work
  const key3 = s.slice(0, 3);
  if (DAY_ABBR[s] != null) return DAY_ABBR[s];
  if (DAY_ABBR[key3] != null) return DAY_ABBR[key3];
  const n = parseInt(s, 10);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
}

// Normalize a time string to "HH:MM" (24h), or null
function normalizeTime(t) {
  if (!t) return null;
  const s = String(t).trim();
  // Match "9:00", "09:00", "9:00 AM", "14:30", etc.
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const period = m[3]?.toLowerCase();
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  if (hour > 23 || min > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const VALID_SLOT_TYPES = ['lecture', 'lab', 'tutorial'];

// ── GET /api/timetable ───────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('timetable_slots')
    .select('*, subjects(name, color, professor)')
    .eq('user_id', req.user.id)
    .order('day_of_week')
    .order('start_time');

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── POST /api/timetable — add single slot ────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { subject_id, day_of_week, start_time, end_time, room, slot_type } = req.body;
  if (!subject_id || day_of_week == null || !start_time || !end_time) {
    return res.status(400).json({ error: 'subject_id, day_of_week, start_time, end_time required' });
  }

  const { data, error } = await supabase
    .from('timetable_slots')
    .insert({ user_id: req.user.id, subject_id, day_of_week, start_time, end_time, room, slot_type })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// ── Gemini-based timetable extraction ────────────────────────
const EXTRACTION_INSTRUCTIONS = `You are a timetable parser. Extract a college class timetable into structured JSON.

The input may be a grid (time slots as rows, days as columns) and may include a separate legend/key
that maps subject abbreviations to full names, professors, room numbers, and credits. Use the legend to
resolve abbreviations into full subject names and to fill in the professor and room for each class.

Return ONLY a JSON object (no markdown, no commentary) with this exact shape:
{
  "slots": [
    {
      "day": "Monday",              // full day name (Sunday..Saturday)
      "subject_name": "string",     // full name if resolvable from legend, else the text shown
      "start_time": "HH:MM",        // 24-hour format
      "end_time": "HH:MM",          // 24-hour format
      "room": "string or null",
      "professor": "string or null",
      "slot_type": "lecture" | "lab" | "tutorial"
    }
  ]
}

Rules:
- One object per class occurrence. If a class spans multiple time rows, merge into one slot with the full time range.
- If a subject appears on multiple days, output one slot per day.
- Infer slot_type: anything labeled "Lab" => "lab", "Tutorial"/"Tut" => "tutorial", otherwise "lecture".
- Use 24-hour times. If only a single hour like "8 - 8:50" is shown, start_time "08:00", end_time "08:50".
- Ignore empty cells, breaks, and lunch.

LEGEND / VENUE TABLE — read this carefully:
- The legend usually has rows like: <subject or abbreviation> , <room> , <professor name> , <credits>.
- A professor is a PERSON'S NAME (e.g. "Debasis Das", "Dr. Mehta"). Rooms look like "LHC 308", "PH 101". Credits are small numbers.
- For EVERY class, look up its subject (matching by abbreviation OR full name) in the legend and copy BOTH the room AND the professor name into that slot.
- The professor field should almost always be filled when a legend is present. Only use null if there is genuinely no name for that subject anywhere in the input.
- Do NOT put room values in the professor field or vice versa. Do not invent names that are not in the input.

Example: if the grid shows "DSA" on Monday and the legend row is "DSA, LHC 308, Debasis Das, 4", then output:
{ "day": "Monday", "subject_name": "DSA", "room": "LHC 308", "professor": "Debasis Das", ... }`;

async function extractWithGemini(parts) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  });
  const result = await model.generateContent([EXTRACTION_INSTRUCTIONS, ...parts]);
  const text = result.response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Fallback: strip code fences / extract first JSON object
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI did not return valid JSON');
    parsed = JSON.parse(match[0]);
  }
  return Array.isArray(parsed?.slots) ? parsed.slots : [];
}

// Convert AI/raw rows into clean, validated slots for the preview
function cleanSlots(rawSlots) {
  const cleaned = [];
  for (const r of rawSlots || []) {
    const day_of_week = normalizeDay(r.day ?? r.day_of_week);
    const start_time = normalizeTime(r.start_time);
    const end_time = normalizeTime(r.end_time);
    const subject_name = (r.subject_name || r.subject || '').toString().trim();
    if (day_of_week == null || !start_time || !end_time || !subject_name) continue;

    let slot_type = (r.slot_type || r.type || 'lecture').toString().toLowerCase().trim();
    if (!VALID_SLOT_TYPES.includes(slot_type)) slot_type = 'lecture';

    cleaned.push({
      day_of_week,
      subject_name,
      start_time,
      end_time,
      room: r.room ? String(r.room).trim() : null,
      professor: r.professor ? String(r.professor).trim() : null,
      slot_type,
    });
  }
  // Sort by day then start time for a tidy preview
  cleaned.sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
  return cleaned;
}

// ── POST /api/timetable/parse — extract slots WITHOUT saving ──
// Accepts image / pdf / xlsx / csv. Returns { slots: [...] } for preview.
router.post('/parse', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const mime = req.file.mimetype || '';
  const name = (req.file.originalname || '').toLowerCase();

  try {
    let rawSlots = [];

    if (mime === 'text/csv' || name.endsWith('.csv')) {
      // Fast path: CSV, no AI. Columns: day,subject_name,start_time,end_time,room,type[,professor]
      const rows = [];
      const stream = Readable.from(req.file.buffer.toString());
      await new Promise((resolve, reject) => {
        stream.pipe(csv())
          .on('data', row => rows.push(row))
          .on('end', resolve)
          .on('error', reject);
      });
      rawSlots = rows.map(row => ({
        day: row.day,
        subject_name: row.subject_name,
        start_time: row.start_time,
        end_time: row.end_time,
        room: row.room,
        professor: row.professor,
        slot_type: row.type,
      }));
    } else if (
      name.endsWith('.xlsx') || name.endsWith('.xls') ||
      mime.includes('spreadsheet') || mime.includes('excel')
    ) {
      // Excel: convert sheet to CSV text, then let Gemini understand the layout
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const csvText = XLSX.utils.sheet_to_csv(sheet);
      rawSlots = await extractWithGemini([
        'Here is the timetable as CSV-style text extracted from a spreadsheet:\n\n' + csvText,
      ]);
    } else if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      rawSlots = await extractWithGemini([
        { inlineData: { mimeType: 'application/pdf', data: req.file.buffer.toString('base64') } },
      ]);
    } else if (mime.startsWith('image/')) {
      rawSlots = await extractWithGemini([
        { inlineData: { mimeType: mime, data: req.file.buffer.toString('base64') } },
      ]);
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Use image, PDF, Excel, or CSV.' });
    }

    const slots = cleanSlots(rawSlots);
    if (!slots.length) {
      return res.status(422).json({ error: 'Could not extract any classes. Try a clearer file.', slots: [] });
    }
    res.json({ slots });
  } catch (err) {
    console.error('Timetable parse error:', err);
    res.status(500).json({ error: 'Failed to parse timetable: ' + err.message });
  }
});

// ── POST /api/timetable/save-parsed — save confirmed slots ────
// Body: { slots: [{ day_of_week, subject_name, start_time, end_time, room, professor, slot_type }], replace_existing }
router.post('/save-parsed', requireAuth, async (req, res) => {
  const { slots, replace_existing } = req.body;
  if (!Array.isArray(slots) || !slots.length) {
    return res.status(400).json({ error: 'slots array is required' });
  }

  try {
    // Optionally clear existing timetable first
    if (replace_existing) {
      await supabase.from('timetable_slots').delete().eq('user_id', req.user.id);
    }

    // Load existing subjects once to match by name (case-insensitive)
    const { data: existingSubjects } = await supabase
      .from('subjects')
      .select('id, name, professor')
      .eq('user_id', req.user.id);

    const subjectMap = new Map(
      (existingSubjects || []).map(s => [s.name.toLowerCase(), s])
    );

    const results = { inserted: 0, subjects_created: 0, errors: [] };

    for (const raw of slots) {
      const day_of_week = normalizeDay(raw.day_of_week ?? raw.day);
      const start_time = normalizeTime(raw.start_time);
      const end_time = normalizeTime(raw.end_time);
      const subjectName = (raw.subject_name || '').trim();
      let slot_type = (raw.slot_type || 'lecture').toLowerCase();
      if (!VALID_SLOT_TYPES.includes(slot_type)) slot_type = 'lecture';

      if (day_of_week == null || !start_time || !end_time || !subjectName) {
        results.errors.push(`Skipped invalid slot: ${JSON.stringify(raw)}`);
        continue;
      }

      // Find or create the subject
      let subject = subjectMap.get(subjectName.toLowerCase());
      if (!subject) {
        const { data: created, error: subErr } = await supabase
          .from('subjects')
          .insert({ user_id: req.user.id, name: subjectName, professor: raw.professor || null })
          .select('id, name, professor')
          .single();
        if (subErr || !created) {
          results.errors.push(`Failed to create subject "${subjectName}": ${subErr?.message}`);
          continue;
        }
        subject = created;
        subjectMap.set(subjectName.toLowerCase(), subject);
        results.subjects_created++;
      } else if (raw.professor && !subject.professor) {
        // Backfill professor if we learned it and it was missing
        await supabase.from('subjects')
          .update({ professor: raw.professor })
          .eq('id', subject.id);
        subject.professor = raw.professor;
      }

      const { error: slotErr } = await supabase.from('timetable_slots').insert({
        user_id: req.user.id,
        subject_id: subject.id,
        day_of_week,
        start_time,
        end_time,
        room: raw.room || null,
        slot_type,
      });

      if (slotErr) results.errors.push(`Slot error (${subjectName}): ${slotErr.message}`);
      else results.inserted++;
    }

    res.json(results);
  } catch (err) {
    console.error('Save parsed timetable error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/timetable/upload-csv — legacy direct CSV save ───
// Kept for backward compatibility. CSV format: day,subject_name,start_time,end_time,room,type
router.post('/upload-csv', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const rows = [];
  const stream = Readable.from(req.file.buffer.toString());

  await new Promise((resolve, reject) => {
    stream.pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });

  const results = { inserted: 0, errors: [] };

  for (const row of rows) {
    try {
      const dayNum = normalizeDay(row.day);
      if (dayNum == null) {
        results.errors.push(`Unknown day: ${row.day}`);
        continue;
      }

      // Find or create subject
      let { data: subject } = await supabase
        .from('subjects')
        .select('id')
        .eq('user_id', req.user.id)
        .ilike('name', row.subject_name?.trim())
        .single();

      if (!subject) {
        const { data: newSubject } = await supabase
          .from('subjects')
          .insert({ user_id: req.user.id, name: row.subject_name?.trim() })
          .select()
          .single();
        subject = newSubject;
      }

      await supabase.from('timetable_slots').insert({
        user_id: req.user.id,
        subject_id: subject.id,
        day_of_week: dayNum,
        start_time: normalizeTime(row.start_time) || row.start_time?.trim(),
        end_time: normalizeTime(row.end_time) || row.end_time?.trim(),
        room: row.room?.trim(),
        slot_type: row.type?.trim() || 'lecture',
      });

      results.inserted++;
    } catch (err) {
      results.errors.push(`Row error: ${err.message}`);
    }
  }

  res.json(results);
});

// ── DELETE /api/timetable/:id ────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('timetable_slots')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
