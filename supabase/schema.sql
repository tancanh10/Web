-- Shared workspace data is accessible only to authenticated team members.
create table if not exists public.workspace_state (
    id integer primary key check (id = 1),
    state jsonb not null default '{"initialized": false, "storage": {}}'::jsonb,
    updated_by uuid references auth.users (id),
    updated_at timestamptz not null default now()
);

alter table public.workspace_state enable row level security;

revoke all on public.workspace_state from anon;
grant select, insert, update on public.workspace_state to authenticated;

drop policy if exists "Team members can read workspace state" on public.workspace_state;
create policy "Team members can read workspace state"
    on public.workspace_state for select
    to authenticated
    using (true);

drop policy if exists "Team members can initialize workspace state" on public.workspace_state;
create policy "Team members can initialize workspace state"
    on public.workspace_state for insert
    to authenticated
    with check (auth.uid() = updated_by);

drop policy if exists "Team members can update workspace state" on public.workspace_state;
create policy "Team members can update workspace state"
    on public.workspace_state for update
    to authenticated
    using (true)
    with check (auth.uid() = updated_by);

create or replace function public.save_workspace_state(p_patch jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
    if p_patch is null or jsonb_typeof(p_patch) is distinct from 'object' then
        raise exception 'Workspace updates must be a JSON object.';
    end if;

    update public.workspace_state
    set state = jsonb_set(
            state,
            '{storage}',
            coalesce(state -> 'storage', '{}'::jsonb) || p_patch,
            true
        ),
        updated_by = auth.uid(),
        updated_at = now()
    where id = 1;

    if not found then
        raise exception 'The shared workspace has not been initialized.';
    end if;
end;
$$;

revoke all on function public.save_workspace_state(jsonb) from public, anon;
grant execute on function public.save_workspace_state(jsonb) to authenticated;

create or replace function public.initialize_workspace_state(p_initial jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    current_state jsonb;
begin
    if p_initial is null
        or jsonb_typeof(p_initial) is distinct from 'object'
        or p_initial ->> 'initialized' is distinct from 'true'
        or jsonb_typeof(p_initial -> 'storage') is distinct from 'object' then
        raise exception 'Initial workspace data has an invalid format.';
    end if;

    insert into public.workspace_state (id, state, updated_by)
    values (1, p_initial, auth.uid())
    on conflict (id) do update
    set state = excluded.state,
        updated_by = excluded.updated_by,
        updated_at = now()
    where public.workspace_state.state ->> 'initialized' is distinct from 'true';

    select state
    into current_state
    from public.workspace_state
    where id = 1;

    return current_state;
end;
$$;

revoke all on function public.initialize_workspace_state(jsonb) from public, anon;
grant execute on function public.initialize_workspace_state(jsonb) to authenticated;

-- Enable realtime updates so signed-in team members see one another's changes.
do $$
begin
    alter publication supabase_realtime add table public.workspace_state;
exception
    when duplicate_object then null;
end;
$$;
