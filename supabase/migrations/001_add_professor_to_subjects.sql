-- Migration: add professor column to subjects
-- Run this in Supabase SQL Editor if your DB was created before this change.

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS professor TEXT;
