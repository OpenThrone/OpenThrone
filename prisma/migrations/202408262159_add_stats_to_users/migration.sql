-- Add new columns to `users` table and modify existing column
ALTER TABLE public.users
ADD COLUMN defense INT NOT NULL DEFAULT 0,
ADD COLUMN defense_str INT NOT NULL DEFAULT 1,
ADD COLUMN killing_str INT NOT NULL DEFAULT 1,
ADD COLUMN offense INT NOT NULL DEFAULT 0,
ADD COLUMN sentry INT NOT NULL DEFAULT 0,
ADD COLUMN sentry_str INT NOT NULL DEFAULT 1,
ADD COLUMN spy INT NOT NULL DEFAULT 0,
ADD COLUMN spying_str INT NOT NULL DEFAULT 1;