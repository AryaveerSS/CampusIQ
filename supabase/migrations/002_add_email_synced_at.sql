-- Migration: track the last "new emails" sync time per user.
-- Run this in Supabase SQL Editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_synced_at TIMESTAMPTZ;
