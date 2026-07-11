const router = require('express').Router();
const { google } = require('googleapis');
const sanitizeHtmlLib = require('sanitize-html');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

// Create a fresh OAuth client for a single authenticated request.
// Using a per-request client avoids cross-user credential bleed and prevents
// the "MaxListenersExceededWarning" from stacking 'tokens' listeners on a shared client.
function createUserOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
}

// Classify a batch of fetched messages into buckets.
//   1. Sender hard-rule: if the sender matches a bucket's sender_emails, that
//      bucket wins immediately — no AI needed, and it always overrides.
//   2. Everything else goes to Gemini in ONE batched call: given each bucket's
//      name + keyword hints and each email's subject/snippet, the model picks
//      the single best-fit bucket using meaning, not literal word overlap.
//      This is what correctly reads "HackerRank OA" or "Round 2 shortlisted"
//      as an internship/interview signal even though it doesn't contain the
//      word "internship", and even though it might contain "test".
//   3. If Gemini is unavailable/fails, falls back to simple keyword matching
//      so sync still works without AI.
async function classifyMessages(messages, buckets) {
  const results = [];
  const needsAI = [];

  // Step 1: sender hard rules
  const senderToBucket = new Map();
  const excludedBySender = new Map(); // sender → set of bucket ids that exclude it

  for (const b of buckets) {
    for (const s of b.sender_emails || []) senderToBucket.set(s.toLowerCase(), b.id);
    for (const s of b.excluded_senders || []) {
      const key = s.toLowerCase();
      if (!excludedBySender.has(key)) excludedBySender.set(key, new Set());
      excludedBySender.get(key).add(b.id);
    }
  }

  for (const msg of messages) {
    const bucketId = senderToBucket.get(msg.from_email);
    if (bucketId) {
      results.push({ message: msg, bucket_id: bucketId });
    } else {
      needsAI.push(msg);
    }
  }

  if (!needsAI.length) return results;

  const keywordBuckets = buckets.filter(b => (b.keywords || []).length);
  if (!keywordBuckets.length) {
    // No keyword-based buckets to consider — nothing else to classify into
    for (const msg of needsAI) results.push({ message: msg, bucket_id: null });
    return results;
  }

  // Step 2: batched AI classification
  const labelToId = {};
  const bucketDescriptions = keywordBuckets.map((b, i) => {
    const label = `B${i}`;
    labelToId[label] = b.id;
    return `${label}: "${b.name}" — related keywords: ${(b.keywords || []).join(', ')}`;
  }).join('\n');

  const emailList = needsAI.map((m, i) =>
    `${i}. Subject: "${m.subject || ''}" | From: ${m.from_email} | Preview: "${(m.snippet || '').slice(0, 200)}"`
  ).join('\n');

  // Build exclusion note for the prompt so the AI skips them directly
  const exclusionLines = [];
  for (const [sender, bucketIds] of excludedBySender) {
    const names = [...bucketIds].map(id => buckets.find(b => b.id === id)?.name).filter(Boolean);
    if (names.length) exclusionLines.push(`- Emails from ${sender} must NOT go to: ${names.join(', ')}`);
  }

  const prompt = `You are sorting a student's college-related emails into categories based on MEANING, not just literal keyword matches.

Categories:
${bucketDescriptions}

Rules for judgment:
- An email about an online assessment (OA), coding test, technical round, "Round 2", "shortlisted", "moved to next round" for a job/internship process belongs to the internship/interview-related category, even if it uses words like "test" or "exam" that also appear in an academic quiz category.
- An email about a college class quiz, exam schedule, or academic marks belongs to the academic quiz/test category.
- Match by what the email is actually about, not by shared words.
- If an email doesn't clearly fit any category, assign it to null.${exclusionLines.length ? `
- Sender exclusions (assign null for these, do not place them in the listed bucket even if keywords match):
${exclusionLines.join('\n')}` : ''}

Emails to classify (0-indexed):
${emailList}

Return ONLY a JSON object like: {"0": "B1", "1": null, "2": "B0"}
Keys are the email index (as a string), values are the category label (e.g. "B0") or null.`;

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(prompt);
    const assignments = JSON.parse(result.response.text());

    needsAI.forEach((msg, i) => {
      const label = assignments[String(i)];
      const bucketId = label ? labelToId[label] || null : null;
      // Respect excluded_senders: if this sender is excluded from the assigned bucket, drop it
      const excluded = bucketId && excludedBySender.get(msg.from_email)?.has(bucketId);
      results.push({ message: msg, bucket_id: excluded ? null : bucketId });
    });
  } catch (err) {
    console.error('[gmail sync] AI classification failed, falling back to keyword match:', err.message);
    // Fallback: simple keyword substring match, first bucket wins
    for (const msg of needsAI) {
      const haystack = `${msg.subject || ''} ${msg.snippet || ''}`.toLowerCase();
      const match = keywordBuckets.find(b => {
        const excluded = excludedBySender.get(msg.from_email)?.has(b.id);
        return !excluded && (b.keywords || []).some(k => haystack.includes(k.toLowerCase()));
      });
      results.push({ message: msg, bucket_id: match?.id || null });
    }
  }

  return results;
}

// GET /api/gmail/auth-url — get Google OAuth URL
router.get('/auth-url', requireAuth, (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ],
    state: req.user.id,   // pass user ID through OAuth flow
    prompt: 'consent',    // force refresh token
  });
  res.json({ url });
});

// GET /api/gmail/callback — OAuth callback
router.get('/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code || !userId) return res.status(400).json({ error: 'Invalid callback' });

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('[gmail callback] got tokens: access?', !!tokens.access_token, 'refresh?', !!tokens.refresh_token);

    if (!tokens.refresh_token) {
      // Google only issues a refresh_token when the user actually grants consent
      // (prompt=consent forces this on our side, but log it in case it's ever missing)
      console.warn('[gmail callback] no refresh_token returned — old one (if any) is kept');
    }

    // Save tokens to user profile. Only overwrite refresh_token if we got a new one.
    const update = { gmail_access_token: tokens.access_token };
    if (tokens.refresh_token) update.gmail_refresh_token = tokens.refresh_token;

    const { error: updateError } = await supabase.from('profiles')
      .update(update)
      .eq('id', userId);

    if (updateError) {
      console.error('[gmail callback] failed to save tokens:', updateError.message);
      return res.redirect(`${process.env.FRONTEND_URL}/dashboard?gmail=error`);
    }

    console.log('[gmail callback] tokens saved for user', userId);

    // Redirect to frontend success page
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?gmail=connected`);
  } catch (err) {
    console.error('[gmail callback] OAuth exchange failed:', err.response?.data || err.message);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?gmail=error`);
  }
});

// POST /api/gmail/sync — fetch and categorize emails
// body: { mode: 'new' | 'old' }
//   'new' = only emails received since the last sync (default)
//   'old' = backfill up to a year of history
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const mode = req.body?.mode === 'old' ? 'old' : 'new';

    // Get user's tokens + last sync marker
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('gmail_access_token, gmail_refresh_token, email_synced_at')
      .eq('id', req.user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error during sync:', profileError);
      return res.status(500).json({ error: 'Could not read profile: ' + profileError.message });
    }

    if (!profile?.gmail_access_token) {
      return res.status(400).json({ error: 'Gmail not connected' });
    }

    const userClient = createUserOAuthClient();
    userClient.setCredentials({
      access_token: profile.gmail_access_token,
      refresh_token: profile.gmail_refresh_token,
    });

    // Persist a refreshed access token. One listener on a per-request client
    // (garbage-collected when the request ends) — does not accumulate.
    userClient.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await supabase.from('profiles')
          .update({ gmail_access_token: tokens.access_token })
          .eq('id', req.user.id);
      }
    });

    const gmail = google.gmail({ version: 'v1', auth: userClient });

    // Get user's email buckets
    const { data: buckets } = await supabase
      .from('email_buckets')
      .select('*')
      .eq('user_id', req.user.id);

    if (!buckets?.length) {
      return res.json({ synced: 0, message: 'No email buckets configured' });
    }

    // Build the date portion of the Gmail query based on mode
    let dateClause;
    if (mode === 'old') {
      dateClause = 'newer_than:1y';   // backfill history (up to a year)
    } else if (profile.email_synced_at) {
      // Overlap one day back so timezone differences / indexing lag don't drop
      // a just-arrived email. Dedup logic prevents re-saving anything.
      const d = new Date(profile.email_synced_at);
      d.setDate(d.getDate() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dateClause = `after:${y}/${m}/${day}`;   // emails since (last sync - 1 day)
    } else {
      dateClause = 'newer_than:30d';   // first-ever "new" sync: last 30 days
    }

    const maxResults = mode === 'old' ? 100 : 40;

    // Helper: run async fn over items with limited concurrency
    async function mapLimit(items, limit, fn) {
      const out = [];
      for (let i = 0; i < items.length; i += limit) {
        const chunk = items.slice(i, i + limit);
        out.push(...await Promise.all(chunk.map(fn)));
      }
      return out;
    }

    // Build ONE combined Gmail query across all buckets (keywords + senders),
    // so each message is only ever classified once instead of once per bucket
    // (that per-bucket looping is what let an OA/interview email leak into
    // "Quizzes & Tests" just because it shared the word "test").
    const allKeywords = [...new Set(buckets.flatMap(b => b.keywords || []))];
    const allSenders = [...new Set(buckets.flatMap(b => b.sender_emails || []))];

    const clauses = [];
    if (allKeywords.length) clauses.push(`(${allKeywords.map(k => `"${k}"`).join(' OR ')})`);
    for (const s of allSenders) clauses.push(`from:${s}`);
    if (!clauses.length) return res.json({ synced: 0, message: 'Buckets have no keywords or senders configured' });

    const query = `(${clauses.join(' OR ')}) ${dateClause}`;

    const listRes = await gmail.users.messages.list({ userId: 'me', q: query, maxResults });
    const messages = listRes.data.messages || [];

    if (!messages.length) {
      if (mode === 'new') {
        await supabase.from('profiles').update({ email_synced_at: new Date() }).eq('id', req.user.id);
      }
      return res.json({ synced: 0, mode });
    }

    // Skip messages we've already cached
    const ids = messages.map(m => m.id);
    const { data: already } = await supabase
      .from('emails')
      .select('gmail_message_id')
      .eq('user_id', req.user.id)
      .in('gmail_message_id', ids);
    const knownIds = new Set((already || []).map(e => e.gmail_message_id));
    const toFetch = messages.filter(m => !knownIds.has(m.id));

    // Fetch message details in parallel (batches of 10)
    const fetched = await mapLimit(toFetch, 10, async (msg) => {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });
        const headers = msgRes.data.payload?.headers || [];
        const getHeader = (name) => headers.find(h => h.name === name)?.value || '';
        const from = getHeader('From');
        const fromMatch = from.match(/^(?:"?(.+?)"?\s)?<?(.+@.+)>?$/);
        return {
          gmail_message_id: msg.id,
          from_name: fromMatch?.[1] || from,
          from_email: (fromMatch?.[2] || from || '').toLowerCase(),
          subject: getHeader('Subject'),
          snippet: msgRes.data.snippet,
          received_at: new Date(parseInt(msgRes.data.internalDate)),
        };
      } catch (e) {
        console.error(`[gmail sync] failed to fetch ${msg.id}: ${e.message}`);
        return null;
      }
    });

    const validMsgs = fetched.filter(Boolean);
    const classified = await classifyMessages(validMsgs, buckets);

    const rows = classified
      .filter(c => c.bucket_id)   // drop anything that matched no bucket
      .map(c => ({ user_id: req.user.id, ...c.message, bucket_id: c.bucket_id }));

    let totalSynced = 0;
    if (rows.length) {
      const { error } = await supabase
        .from('emails')
        .upsert(rows, { onConflict: 'user_id,gmail_message_id' });
      if (error) console.error(`[gmail sync] upsert error: ${error.message}`);
      else totalSynced = rows.length;
    }

    // Advance the sync marker only for 'new' syncs
    if (mode === 'new') {
      await supabase.from('profiles')
        .update({ email_synced_at: new Date() })
        .eq('id', req.user.id);
    }

    res.json({ synced: totalSynced, mode });
  } catch (err) {
    console.error('Gmail sync error:', err);

    // Google rejected our stored refresh token — the stored connection is dead.
    // Clear it so the frontend can prompt the user to reconnect instead of
    // failing silently on every future sync.
    const isInvalidGrant = err?.response?.data?.error === 'invalid_grant' || /invalid_grant/i.test(err.message || '');
    if (isInvalidGrant) {
      await supabase.from('profiles')
        .update({ gmail_access_token: null, gmail_refresh_token: null })
        .eq('id', req.user.id);
      return res.status(401).json({
        error: 'Your Gmail connection expired. Please reconnect Gmail.',
        needs_reconnect: true,
      });
    }

    res.status(500).json({ error: err.message });
  }
});

// GET /api/gmail/emails?bucket_id=
router.get('/emails', requireAuth, async (req, res) => {
  const { bucket_id } = req.query;

  let query = supabase
    .from('emails')
    .select('*, email_buckets(name, icon, color)')
    .eq('user_id', req.user.id)
    .order('received_at', { ascending: false })
    .limit(50);

  if (bucket_id) query = query.eq('bucket_id', bucket_id);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GET /api/gmail/status
router.get('/status', requireAuth, async (req, res) => {
  const { data } = await supabase
    .from('profiles')
    .select('gmail_access_token')
    .eq('id', req.user.id)
    .single();

  res.json({ connected: !!data?.gmail_access_token });
});

// Recursively pull the best text content out of a Gmail payload tree
function extractBody(payload) {
  if (!payload) return { text: '', html: '' };
  let text = '';
  let html = '';

  const decode = (data) => Buffer.from(data, 'base64').toString('utf-8');

  const walk = (part) => {
    if (!part) return;
    const mime = part.mimeType || '';
    if (part.body?.data) {
      if (mime === 'text/plain') text += decode(part.body.data);
      else if (mime === 'text/html') html += decode(part.body.data);
    }
    if (part.parts) part.parts.forEach(walk);
  };

  walk(payload);
  return { text: text.trim(), html: html.trim() };
}

// Sanitize untrusted email HTML so it's safe to render in the app.
// Strips scripts/styles/event-handlers; keeps formatting, links, and images.
function sanitizeHtml(dirty) {
  return sanitizeHtmlLib(dirty, {
    allowedTags: sanitizeHtmlLib.defaults.allowedTags.concat(['img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'span', 'center', 'font']),
    allowedAttributes: {
      '*': ['style', 'align', 'width', 'height', 'bgcolor', 'color', 'class'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      font: ['color', 'face', 'size'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data', 'cid'],
    // Strip these tags AND their contents (this was leaking CSS into the view)
    nonTextTags: ['script', 'noscript', 'style', 'textarea', 'title', 'head'],
    transformTags: {
      // Force links to open in a new tab safely
      a: (tagName, attribs) => ({
        tagName: 'a',
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
      }),
    },
  });
}

// Convert HTML to readable plain text (used as a fallback / for snippet-like text)
function htmlToText(html) {
  const noStyle = sanitizeHtmlLib(html, { allowedTags: [], allowedAttributes: {}, nonTextTags: ['script', 'noscript', 'style', 'textarea'] });
  return noStyle.replace(/\s+/g, ' ').trim();
}

// GET /api/gmail/emails/:id/body — fetch full message body on demand (cached)
router.get('/emails/:id/body', requireAuth, async (req, res) => {
  try {
    const { data: email, error } = await supabase
      .from('emails')
      .select('id, gmail_message_id, body_text, body_html')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !email) return res.status(404).json({ error: 'Email not found' });

    const gmailLink = `https://mail.google.com/mail/u/0/#all/${email.gmail_message_id}`;

    // Serve cached body if we already fetched it
    if (email.body_text || email.body_html) {
      return res.json({
        body_text: email.body_text || '',
        body_html: email.body_html || null,
        gmail_link: gmailLink,
        cached: true,
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('gmail_access_token, gmail_refresh_token')
      .eq('id', req.user.id)
      .single();

    if (!profile?.gmail_access_token) {
      return res.status(400).json({ error: 'Gmail not connected' });
    }

    const userClient = createUserOAuthClient();
    userClient.setCredentials({
      access_token: profile.gmail_access_token,
      refresh_token: profile.gmail_refresh_token,
    });
    userClient.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await supabase.from('profiles')
          .update({ gmail_access_token: tokens.access_token })
          .eq('id', req.user.id);
      }
    });

    const gmail = google.gmail({ version: 'v1', auth: userClient });
    const msgRes = await gmail.users.messages.get({
      userId: 'me',
      id: email.gmail_message_id,
      format: 'full',
    });

    const { text, html } = extractBody(msgRes.data.payload);
    const cleanHtml = html ? sanitizeHtml(html) : null;
    const body_text = text || (html ? htmlToText(html) : '');

    // Cache both
    await supabase.from('emails')
      .update({ body_text, body_html: cleanHtml })
      .eq('id', email.id);

    res.json({ body_text, body_html: cleanHtml, gmail_link: gmailLink, cached: false });
  } catch (err) {
    console.error('Fetch body error:', err);
    res.status(500).json({ error: 'Could not load email: ' + err.message });
  }
});

module.exports = router;
