const router = require('express').Router();
const { google } = require('googleapis');
const sanitizeHtmlLib = require('sanitize-html');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

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

    // Save tokens to user profile
    await supabase.from('profiles')
      .update({
        gmail_access_token: tokens.access_token,
        gmail_refresh_token: tokens.refresh_token,
      })
      .eq('id', userId);

    // Redirect to frontend success page
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?gmail=connected`);
  } catch (err) {
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

    const maxResults = mode === 'old' ? 50 : 25;
    let totalSynced = 0;

    // Helper: run async fn over items with limited concurrency
    async function mapLimit(items, limit, fn) {
      const out = [];
      for (let i = 0; i < items.length; i += limit) {
        const chunk = items.slice(i, i + limit);
        out.push(...await Promise.all(chunk.map(fn)));
      }
      return out;
    }

    for (const bucket of buckets) {
      // Build Gmail search query from keywords
      const keywordQuery = bucket.keywords.map(k => `"${k}"`).join(' OR ');
      const query = `(${keywordQuery}) ${dateClause}`;

      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
      });

      const messages = listRes.data.messages || [];
      if (!messages.length) continue;

      // Skip messages we've already cached (avoids re-fetching every sync)
      const ids = messages.map(m => m.id);
      const { data: already } = await supabase
        .from('emails')
        .select('gmail_message_id')
        .eq('user_id', req.user.id)
        .in('gmail_message_id', ids);
      const knownIds = new Set((already || []).map(e => e.gmail_message_id));
      const toFetch = messages.filter(m => !knownIds.has(m.id));

      // Fetch message details in parallel (batches of 10)
      const rows = await mapLimit(toFetch, 10, async (msg) => {
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
            user_id: req.user.id,
            bucket_id: bucket.id,
            gmail_message_id: msg.id,
            from_name: fromMatch?.[1] || from,
            from_email: fromMatch?.[2] || from,
            subject: getHeader('Subject'),
            snippet: msgRes.data.snippet,
            received_at: new Date(parseInt(msgRes.data.internalDate)),
          };
        } catch (e) {
          console.error(`[gmail sync] failed to fetch ${msg.id}: ${e.message}`);
          return null;
        }
      });

      const validRows = rows.filter(Boolean);
      if (validRows.length) {
        const { error } = await supabase
          .from('emails')
          .upsert(validRows, { onConflict: 'user_id,gmail_message_id' });
        if (error) console.error(`[gmail sync] upsert error: ${error.message}`);
        else totalSynced += validRows.length;
      }
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
