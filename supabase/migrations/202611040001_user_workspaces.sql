-- Run once in the project's Supabase SQL Editor before enabling accounts.
-- The browser uses the publishable key and the signed-in user's access token.
begin;

create table if not exists public.user_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_workspaces_object check (jsonb_typeof(workspace) = 'object'),
  constraint user_workspaces_size check (octet_length(workspace::text) <= 102400)
);

comment on table public.user_workspaces is
  'One private course-planning workspace per authenticated user.';

create or replace function public.set_user_workspace_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_user_workspace_updated_at() from public;

drop trigger if exists user_workspaces_updated_at on public.user_workspaces;
create trigger user_workspaces_updated_at
before insert or update on public.user_workspaces
for each row execute function public.set_user_workspace_updated_at();

alter table public.user_workspaces enable row level security;
alter table public.user_workspaces force row level security;

-- Column grants allow PostgREST upserts but not client-authored timestamps.
-- The update policy prevents changing a row to another user's ID.
revoke all on table public.user_workspaces from public, anon, authenticated;
grant select, delete on table public.user_workspaces to authenticated;
grant insert (user_id, workspace), update (user_id, workspace)
  on public.user_workspaces to authenticated;

drop policy if exists user_workspaces_select_own on public.user_workspaces;
create policy user_workspaces_select_own on public.user_workspaces
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists user_workspaces_insert_own on public.user_workspaces;
create policy user_workspaces_insert_own on public.user_workspaces
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists user_workspaces_update_own on public.user_workspaces;
create policy user_workspaces_update_own on public.user_workspaces
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists user_workspaces_delete_own on public.user_workspaces;
create policy user_workspaces_delete_own on public.user_workspaces
for delete to authenticated
using ((select auth.uid()) = user_id);

commit;
