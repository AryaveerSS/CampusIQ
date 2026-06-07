# CampusIQ — Student Productivity App

A full-stack web + mobile (PWA) app for college students to track attendance, grades, and smart email inbox.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (React) + Tailwind CSS |
| Backend | Node.js + Express.js |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + Google OAuth |
| Email | Gmail API (free) |
| Notifications | Firebase Cloud Messaging |
| Scheduling | node-cron |
| AI | Google Gemini API |
| Deploy | Vercel (frontend) + Render (backend) |

## Project Structure

```
campusiq/
├── backend/               # Node.js + Express API
│   ├── config/            # DB, Firebase, Gmail config
│   ├── controllers/       # Business logic
│   ├── middleware/        # Auth, error handling
│   ├── routes/            # API routes
│   └── server.js
├── frontend/              # Next.js app
│   └── src/
│       ├── components/    # UI components
│       ├── pages/         # Next.js pages
│       ├── hooks/         # Custom React hooks
│       └── lib/           # API client, utils
└── supabase/
    └── schema.sql         # Database schema
```

## Setup Instructions

### 1. Clone & Install

```bash
git clone <your-repo>

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Environment Variables

**backend/.env**
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
GMAIL_CLIENT_ID=your_google_client_id
GMAIL_CLIENT_SECRET=your_google_client_secret
GMAIL_REDIRECT_URI=http://localhost:5000/api/gmail/callback
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_PRIVATE_KEY=your_firebase_private_key
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
GEMINI_API_KEY=your_gemini_api_key
JWT_SECRET=your_jwt_secret
PORT=5000
```

**frontend/.env.local**
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_web_api_key
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
```

### 3. Free API Keys Setup

#### Supabase (Database + Auth)
1. Go to https://supabase.com → Create project (free)
2. Copy URL and anon key from Settings → API
3. Run `supabase/schema.sql` in Supabase SQL editor

#### Google Gmail API
1. Go to https://console.cloud.google.com
2. Create project → Enable Gmail API
3. OAuth 2.0 Credentials → Web Application
4. Add redirect URI: `http://localhost:5000/api/gmail/callback`
5. Copy Client ID and Secret

#### Firebase (Notifications)
1. Go to https://console.firebase.google.com
2. Create project → Project Settings → Service Accounts
3. Generate new private key (download JSON)
4. Copy values to .env

#### Gemini AI
1. Go to https://aistudio.google.com/app/apikey
2. Create API key (free, 15 req/min)

### 4. Run

```bash
# Backend
cd backend && npm run dev

# Frontend (new terminal)
cd frontend && npm run dev
```

## Deployment

### Frontend → Vercel
```bash
cd frontend
npx vercel --prod
```

### Backend → Render
1. Push backend/ to GitHub
2. New Web Service on render.com
3. Build: `npm install`, Start: `node server.js`
4. Add environment variables in Render dashboard

## Features Roadmap

- [x] Project scaffold
- [ ] Auth (Supabase + Google OAuth)
- [ ] Attendance tracking + calendar
- [ ] Grade calculator
- [ ] Timetable upload + cron notifications
- [ ] Gmail smart inbox
- [ ] AI auto-reply
