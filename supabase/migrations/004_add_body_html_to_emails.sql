-- Migration: cache the rendered HTML body of emails for rich viewing.
-- Run this in Supabase SQL Editor.

ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS body_html TEXT;
