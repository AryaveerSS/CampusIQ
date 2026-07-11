-- Migration: add excluded_senders to email_buckets.
-- Emails from these addresses will never be placed in this bucket.
-- Run this in Supabase SQL Editor.

ALTER TABLE public.email_buckets
  ADD COLUMN IF NOT EXISTS excluded_senders TEXT[] DEFAULT '{}';

UPDATE public.email_buckets SET excluded_senders = '{}' WHERE excluded_senders IS NULL;
