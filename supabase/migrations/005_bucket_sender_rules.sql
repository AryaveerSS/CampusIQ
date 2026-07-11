-- Migration: allow email buckets to target specific sender addresses,
-- and make keywords optional (a bucket can be sender-only).
-- Run this in Supabase SQL Editor.

ALTER TABLE public.email_buckets
  ADD COLUMN IF NOT EXISTS sender_emails TEXT[] DEFAULT '{}';

ALTER TABLE public.email_buckets
  ALTER COLUMN keywords DROP NOT NULL;

ALTER TABLE public.email_buckets
  ALTER COLUMN keywords SET DEFAULT '{}';

UPDATE public.email_buckets SET keywords = '{}' WHERE keywords IS NULL;
