-- The Bar Ledger — Supabase schema
-- Run this once in your Supabase project's SQL Editor (left sidebar ->
-- "SQL Editor" -> "New query"), then click "Run".

create table if not exists cocktails (
  id text primary key,
  name text not null,
  glass_type text default '',
  glass_custom text default '',
  ingredients jsonb not null default '[]',
  instructions text default '',
  garnish text default '',
  notes text default '',
  created_at timestamptz default now()
);

create table if not exists shelf (
  key text primary key,
  is_stocked boolean not null default false
);

-- Note on access: tables created this way are NOT protected by Row Level
-- Security by default (that's a Postgres/Supabase default, not something
-- this script is turning off). Combined with the anon key in config.js,
-- that means anyone who has your Supabase URL and anon key can read and
-- write this data. For a personal cocktail list that's a reasonable
-- trade-off for zero extra setup — nothing sensitive lives here.
--
-- If you'd rather lock it down later (e.g. require Supabase auth), you can
-- enable RLS and add policies scoped to a logged-in user:
--   alter table cocktails enable row level security;
--   alter table shelf enable row level security;
-- ...then add policies restricting access, and add a login step to the app.
-- Ask me if/when you want to do that — it's a bigger change than this file.
