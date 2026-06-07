-- ============================================
-- CampusIQ - Supabase Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS (extends Supabase auth.users)
-- ============================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  college_name TEXT,
  gmail_access_token TEXT,       -- encrypted Gmail OAuth token
  gmail_refresh_token TEXT,
  fcm_token TEXT,                -- Firebase push notification token
  email_synced_at TIMESTAMPTZ,   -- last "new emails" sync time
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SUBJECTS
-- ============================================
CREATE TABLE public.subjects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,              -- e.g. "Mathematics", "Data Structures"
  code TEXT,                       -- e.g. "CS301"
  professor TEXT,                  -- e.g. "Debasis Das"
  color TEXT DEFAULT '#3b82f6',   -- for UI differentiation
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ATTENDANCE
-- ============================================
CREATE TABLE public.attendance (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  status TEXT CHECK (status IN ('present', 'absent', 'cancelled')) NOT NULL,
  marked_via TEXT CHECK (marked_via IN ('manual', 'notification', 'auto')) DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, subject_id, date)   -- one record per subject per day
);

-- ============================================
-- GRADE COMPONENTS
-- ============================================
CREATE TABLE public.grade_components (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,              -- e.g. "Quiz 1", "Major Exam", "Assignment 2"
  weight_percent NUMERIC(5,2) NOT NULL CHECK (weight_percent > 0 AND weight_percent <= 100),
  scored_marks NUMERIC(7,2),       -- marks obtained (null = not yet scored)
  max_marks NUMERIC(7,2) NOT NULL, -- total marks for this component
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TIMETABLE
-- ============================================
CREATE TABLE public.timetable_slots (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun, 1=Mon...
  start_time TIME NOT NULL,        -- e.g. '10:00'
  end_time TIME NOT NULL,          -- e.g. '11:00'
  room TEXT,                       -- optional room/lab number
  slot_type TEXT CHECK (slot_type IN ('lecture', 'lab', 'tutorial')) DEFAULT 'lecture',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EMAIL BUCKETS (user-defined categories)
-- ============================================
CREATE TABLE public.email_buckets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,              -- e.g. "Internships", "Assignments"
  icon TEXT DEFAULT '📧',
  keywords TEXT[] NOT NULL,        -- e.g. ['internship', 'intern', 'hiring']
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CACHED EMAILS (fetched from Gmail)
-- ============================================
CREATE TABLE public.emails (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  bucket_id UUID REFERENCES public.email_buckets(id) ON DELETE SET NULL,
  gmail_message_id TEXT NOT NULL,  -- Gmail's message ID for deduplication
  from_email TEXT,
  from_name TEXT,
  subject TEXT,
  snippet TEXT,                    -- short preview
  body_text TEXT,                  -- plain text body
  body_html TEXT,                  -- rendered HTML body (cached)
  received_at TIMESTAMPTZ,
  is_read BOOLEAN DEFAULT FALSE,
  replied_at TIMESTAMPTZ,          -- set when replied via CampusIQ
  ai_reply_draft TEXT,             -- Gemini-generated draft reply
  UNIQUE(user_id, gmail_message_id)
);

-- ============================================
-- NOTIFICATION LOG
-- ============================================
CREATE TABLE public.notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('attendance_prompt', 'reminder', 'email_alert')) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  related_id UUID,                 -- could be timetable_slot_id or email_id
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  response TEXT                    -- 'present', 'absent', 'dismissed'
);

-- ============================================
-- ROW LEVEL SECURITY (users only see own data)
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles policy
CREATE POLICY "Users can manage own profile"
  ON public.profiles FOR ALL
  USING (auth.uid() = id);

-- Subjects policy
CREATE POLICY "Users can manage own subjects"
  ON public.subjects FOR ALL
  USING (auth.uid() = user_id);

-- Attendance policy
CREATE POLICY "Users can manage own attendance"
  ON public.attendance FOR ALL
  USING (auth.uid() = user_id);

-- Grade components policy
CREATE POLICY "Users can manage own grades"
  ON public.grade_components FOR ALL
  USING (auth.uid() = user_id);

-- Timetable policy
CREATE POLICY "Users can manage own timetable"
  ON public.timetable_slots FOR ALL
  USING (auth.uid() = user_id);

-- Email buckets policy
CREATE POLICY "Users can manage own email buckets"
  ON public.email_buckets FOR ALL
  USING (auth.uid() = user_id);

-- Emails policy
CREATE POLICY "Users can manage own emails"
  ON public.emails FOR ALL
  USING (auth.uid() = user_id);

-- Notifications policy
CREATE POLICY "Users can manage own notifications"
  ON public.notifications FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- TRIGGER: auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- SEED: default email buckets for new users
-- (optional — run manually or via app logic)
-- ============================================
-- Example default buckets:
-- INSERT INTO email_buckets (user_id, name, icon, keywords, color) VALUES
--   ('<user_id>', 'Internships', '💼', ARRAY['internship','intern','hiring','opportunity'], '#8b5cf6'),
--   ('<user_id>', 'Assignments', '📝', ARRAY['assignment','submission','deadline','due'], '#f59e0b'),
--   ('<user_id>', 'Quizzes & Tests', '📊', ARRAY['quiz','test','exam','announcement'], '#ef4444'),
--   ('<user_id>', 'Interviews', '🎯', ARRAY['interview','shortlisted','selected','round'], '#10b981');
