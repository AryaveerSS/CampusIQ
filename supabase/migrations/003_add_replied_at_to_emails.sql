-- Migration: track when an email was replied to from within CampusIQ.
-- Run this in Supabase SQL Editor.

ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
