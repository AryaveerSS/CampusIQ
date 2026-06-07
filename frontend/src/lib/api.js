import axios from 'axios';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// Axios instance
const api = axios.create({ baseURL: API_URL });

// Auto-attach Supabase JWT to every request
api.interceptors.request.use(async (config) => {
  const supabase = createClientComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// ── Subjects ─────────────────────────────────────────────────
export const subjectsApi = {
  list: () => api.get('/api/subjects').then(r => r.data),
  create: (body) => api.post('/api/subjects', body).then(r => r.data),
  update: (id, body) => api.put(`/api/subjects/${id}`, body).then(r => r.data),
  delete: (id) => api.delete(`/api/subjects/${id}`).then(r => r.data),
};

// ── Attendance ────────────────────────────────────────────────
export const attendanceApi = {
  list: (params) => api.get('/api/attendance', { params }).then(r => r.data),
  stats: () => api.get('/api/attendance/stats').then(r => r.data),
  mark: (body) => api.post('/api/attendance', body).then(r => r.data),
  respond: (body) => api.post('/api/attendance/respond-notification', body).then(r => r.data),
  delete: (id) => api.delete(`/api/attendance/${id}`).then(r => r.data),
};

// ── Grades ────────────────────────────────────────────────────
export const gradesApi = {
  list: (params) => api.get('/api/grades', { params }).then(r => r.data),
  summary: () => api.get('/api/grades/summary').then(r => r.data),
  create: (body) => api.post('/api/grades', body).then(r => r.data),
  update: (id, body) => api.put(`/api/grades/${id}`, body).then(r => r.data),
  delete: (id) => api.delete(`/api/grades/${id}`).then(r => r.data),
};

// ── Timetable ─────────────────────────────────────────────────
export const timetableApi = {
  list: () => api.get('/api/timetable').then(r => r.data),
  create: (body) => api.post('/api/timetable', body).then(r => r.data),
  uploadCSV: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/api/timetable/upload-csv', form).then(r => r.data);
  },
  parse: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/api/timetable/parse', form).then(r => r.data);
  },
  saveParsed: (slots, replace_existing = false) =>
    api.post('/api/timetable/save-parsed', { slots, replace_existing }).then(r => r.data),
  delete: (id) => api.delete(`/api/timetable/${id}`).then(r => r.data),
};

// ── Gmail ─────────────────────────────────────────────────────
export const gmailApi = {
  status: () => api.get('/api/gmail/status').then(r => r.data),
  authUrl: () => api.get('/api/gmail/auth-url').then(r => r.data),
  sync: (mode = 'new') => api.post('/api/gmail/sync', { mode }).then(r => r.data),
  emails: (params) => api.get('/api/gmail/emails', { params }).then(r => r.data),
  body: (id) => api.get(`/api/gmail/emails/${id}/body`).then(r => r.data),
};

// ── Email Buckets ─────────────────────────────────────────────
export const bucketsApi = {
  list: () => api.get('/api/email-buckets').then(r => r.data),
  create: (body) => api.post('/api/email-buckets', body).then(r => r.data),
  update: (id, body) => api.put(`/api/email-buckets/${id}`, body).then(r => r.data),
  delete: (id) => api.delete(`/api/email-buckets/${id}`).then(r => r.data),
};

// ── AI ────────────────────────────────────────────────────────
export const aiApi = {
  draftReply: (email_id) => api.post('/api/ai/draft-reply', { email_id }).then(r => r.data),
  sendReply: (email_id, reply_text) => api.post('/api/ai/send-reply', { email_id, reply_text }).then(r => r.data),
};

// ── Auth/Profile ──────────────────────────────────────────────
export const profileApi = {
  get: () => api.get('/api/auth/profile').then(r => r.data),
  update: (body) => api.put('/api/auth/profile', body).then(r => r.data),
  registerFCM: (fcm_token) => api.post('/api/auth/register-fcm', { fcm_token }).then(r => r.data),
};

export default api;
