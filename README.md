# CampusIQ — Student Productivity App

A full-stack web app built for college students to stay on top of their academic life — all in one place.

## What is CampusIQ?

College gets messy ( too messy). You're juggling attendance across six subjects, tracking quiz scores, keeping up with assignment deadlines, and drowning in emails from professors, internship portals, and placement cells. CampusIQ is being built to solve exactly that — a single dashboard where a student can see everything that matters.

## Planned Features

- **Attendance Tracker** — Mark attendance subject-wise with a calendar view. Get warnings when you're about to fall below 75%.
- **Grade Calculator** — Track weighted scores for quizzes, assignments, and exams. See your running percentage per subject.
- **Timetable** — Upload your class schedule and get automatic push notifications after each class asking if you attended.
- **Smart Gmail Inbox** — Connect your college Gmail and have emails auto-sorted into buckets like Internships, Assignments, Quizzes, and Interviews.
- **AI Email Replies** — Generate a draft reply to any email using Gemini AI and send it directly from the app.
- **Push Notifications** — Firebase-powered notifications for attendance prompts and reminders.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 + Tailwind CSS |
| Backend | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + Google OAuth |
| Email | Gmail API |
| AI | Google Gemini |
| Notifications | Firebase Cloud Messaging |
| Deploy | Vercel (frontend) + Render (backend) |

## Status

🚧 Work in progress — setting up the project scaffold, authentication, and core dashboard structure.

## Setup

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

See `.env.example` files in both `backend/` and `frontend/` for required environment variables.
