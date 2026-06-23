-- Run this once in Supabase SQL Editor
-- Normalized schema: users, sessions, nohinsho records, annotations, edit history

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  username text not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  brush_color text not null default '#ff0000',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_user_sessions_token on public.user_sessions(token);
create index if not exists idx_user_sessions_active on public.user_sessions(user_id, expires_at, revoked_at);

create table if not exists public.nohinsho_records (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null,
  work_date date not null,
  status text not null default 'not_checked' check (status in ('not_checked', 'done')),
  rotation integer not null default 0,
  source_url text not null default '',
  source_storage_path text not null default '',
  source_file_type text not null default '',
  upload_status text not null default 'done' check (upload_status in ('uploading', 'done', 'failed', 'deleted')),
  editor_user_id uuid references public.users(id),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_storage_path text not null default '',
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_nohinsho_records_work_date on public.nohinsho_records(work_date);
create index if not exists idx_nohinsho_records_status on public.nohinsho_records(status);
create index if not exists idx_nohinsho_records_is_deleted on public.nohinsho_records(is_deleted);

drop trigger if exists trg_nohinsho_records_updated_at on public.nohinsho_records;
create trigger trg_nohinsho_records_updated_at
before update on public.nohinsho_records
for each row execute function public.set_updated_at();

create table if not exists public.nohinsho_annotations (
  id bigserial primary key,
  record_id uuid not null references public.nohinsho_records(id) on delete cascade,
  version integer not null,
  lines_history jsonb not null default '[]'::jsonb,
  comment text not null default '',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique(record_id, version)
);
create index if not exists idx_nohinsho_annotations_record on public.nohinsho_annotations(record_id, version desc);

create table if not exists public.nohinsho_record_history (
  id bigserial primary key,
  record_id uuid not null references public.nohinsho_records(id) on delete cascade,
  actor_user_id uuid references public.users(id),
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_nohinsho_record_history_record on public.nohinsho_record_history(record_id, created_at desc);

-- Keep legacy app_store table only as migration source (optional)
create table if not exists public.app_store (
  id smallint primary key check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS policies for service role backend
alter table public.users enable row level security;
alter table public.user_sessions enable row level security;
alter table public.nohinsho_records enable row level security;
alter table public.nohinsho_annotations enable row level security;
alter table public.nohinsho_record_history enable row level security;
alter table public.app_store enable row level security;

drop policy if exists "service role full access users" on public.users;
create policy "service role full access users"
on public.users for all to service_role using (true) with check (true);

drop policy if exists "service role full access user_sessions" on public.user_sessions;
create policy "service role full access user_sessions"
on public.user_sessions for all to service_role using (true) with check (true);

drop policy if exists "service role full access nohinsho_records" on public.nohinsho_records;
create policy "service role full access nohinsho_records"
on public.nohinsho_records for all to service_role using (true) with check (true);

drop policy if exists "service role full access nohinsho_annotations" on public.nohinsho_annotations;
create policy "service role full access nohinsho_annotations"
on public.nohinsho_annotations for all to service_role using (true) with check (true);

drop policy if exists "service role full access nohinsho_record_history" on public.nohinsho_record_history;
create policy "service role full access nohinsho_record_history"
on public.nohinsho_record_history for all to service_role using (true) with check (true);

drop policy if exists "service role full access app_store" on public.app_store;
create policy "service role full access app_store"
on public.app_store for all to service_role using (true) with check (true);
