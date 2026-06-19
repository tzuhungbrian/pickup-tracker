create table if not exists public.sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  review jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.runs (
  id text primary key,
  session_id text not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists sessions_user_id_updated_at_idx
  on public.sessions (user_id, updated_at desc);

create index if not exists runs_user_id_updated_at_idx
  on public.runs (user_id, updated_at desc);

create index if not exists runs_session_id_idx
  on public.runs (session_id);

alter table public.sessions enable row level security;
alter table public.runs enable row level security;

drop policy if exists "Users can read their own sessions." on public.sessions;
create policy "Users can read their own sessions."
  on public.sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own sessions." on public.sessions;
create policy "Users can insert their own sessions."
  on public.sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own sessions." on public.sessions;
create policy "Users can update their own sessions."
  on public.sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own sessions." on public.sessions;
create policy "Users can delete their own sessions."
  on public.sessions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own runs." on public.runs;
create policy "Users can read their own runs."
  on public.runs for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own runs." on public.runs;
create policy "Users can insert their own runs."
  on public.runs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own runs." on public.runs;
create policy "Users can update their own runs."
  on public.runs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own runs." on public.runs;
create policy "Users can delete their own runs."
  on public.runs for delete
  to authenticated
  using ((select auth.uid()) = user_id);
