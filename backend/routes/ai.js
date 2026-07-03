const router = require('express').Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// POST /api/ai/draft-reply — generate email reply draft
router.post('/draft-reply', requireAuth, async (req, res) => {
  const { email_id } = req.body;
  if (!email_id) return res.status(400).json({ error: 'email_id required' });

  const { data: email } = await supabase
    .from('emails')
    .select('*')
    .eq('id', email_id)
    .eq('user_id', req.user.id)
    .single();

  if (!email) return res.status(404).json({ error: 'Email not found' });

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are a college student. Draft a professional and polite reply to this email.

From: ${email.from_name} <${email.from_email}>
Subject: ${email.subject}
Content: ${email.snippet}

Write a concise, professional reply. Keep it short (3-5 sentences). Do not include subject line.`;

    const result = await model.generateContent(prompt);
    const draft = result.response.text();

    // Save draft to DB
    await supabase.from('emails')
      .update({ ai_reply_draft: draft })
      .eq('id', email_id);

    res.json({ draft });
  } catch (err) {
    res.status(500).json({ error: 'AI generation failed: ' + err.message });
  }
});

// POST /api/ai/send-reply — send the reply via Gmail
router.post('/send-reply', requireAuth, async (req, res) => {
  const { email_id, reply_text } = req.body;
  if (!email_id || !reply_text) {
    return res.status(400).json({ error: 'email_id and reply_text required' });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('gmail_access_token, gmail_refresh_token, email')
    .eq('id', req.user.id)
    .single();

  if (!profile?.gmail_access_token) {
    return res.status(400).json({ error: 'Gmail not connected' });
  }

  const { data: email } = await supabase
    .from('emails')
    .select('*')
    .eq('id', email_id)
    .single();

  try {
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );
    oauth2Client.setCredentials({
      access_token: profile.gmail_access_token,
      refresh_token: profile.gmail_refresh_token,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Encode email as RFC 2822
    const rawEmail = [
      `To: ${email.from_email}`,
      `Subject: Re: ${email.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      reply_text,
    ].join('\n');

    const encodedEmail = Buffer.from(rawEmail).toString('base64url');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedEmail },
    });

    // Mark the email as replied
    await supabase.from('emails')
      .update({ replied_at: new Date() })
      .eq('id', email_id)
      .eq('user_id', req.user.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Send failed: ' + err.message });
  }
});

// POST /api/ai/smart-categorize — auto-suggest bucket for uncategorized email
router.post('/smart-categorize', requireAuth, async (req, res) => {
  const { subject, snippet } = req.body;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Categorize this college email into ONE of these categories: internship, assignment, quiz, interview, announcement, other.

Email subject: ${subject}
Email preview: ${snippet}

Reply with ONLY the category word, nothing else.`;

    const result = await model.generateContent(prompt);
    const category = result.response.text().trim().toLowerCase();
    res.json({ category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
