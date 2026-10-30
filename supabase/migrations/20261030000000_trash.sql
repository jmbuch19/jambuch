-- Trash: deleting an item in /admin sets deleted_at instead of removing the
-- row. Visitors never see trashed rows; a daily job removes them for good
-- after 30 days. Every permanent delete is written to delete_log.

do $$
declare
  t text;
begin
  foreach t in array array['desk_now','projects','books','reading','workshop','recordings','notebook','works','chapters','ideas']
  loop
    execute format(
      'alter table public.%I
         add column deleted_at timestamptz,
         add column deleted_by uuid references auth.users (id) on delete set null', t);
    execute format(
      'create index %1$s_deleted_at_idx on public.%1$I (deleted_at) where deleted_at is not null', t);
  end loop;

  -- Published content stays public only while it is not in the Trash.
  foreach t in array array['desk_now','projects','books','reading','workshop','recordings','notebook','works']
  loop
    execute format('drop policy "public reads published %1$s" on public.%1$I', t);
    execute format(
      'create policy "public reads published %1$s" on public.%1$I
         for select to anon, authenticated
         using (published and deleted_at is null)', t);
  end loop;
end;
$$;

drop policy "public reads readable chapters" on public.chapters;
create policy "public reads readable chapters" on public.chapters
  for select to anon, authenticated
  using (
    published
    and deleted_at is null
    and (status = 'ready' or coalesce(body, '') = '')
    and exists (
      select 1 from public.works w
      where w.id = work_id and w.published and w.readable and w.deleted_at is null
    )
  );

-- Append-only record of permanent deletes (manual or by the 30-day cleanup).
create table public.delete_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_id     text not null,
  title      text,
  files      text[] not null default '{}',
  reason     text not null check (reason in ('manual', 'expired')),
  deleted_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz not null default now()
);

alter table public.delete_log enable row level security;

create policy "admin reads delete_log" on public.delete_log
  for select to authenticated
  using ((select private.is_admin()));

create policy "admin writes delete_log" on public.delete_log
  for insert to authenticated
  with check ((select private.is_admin()));
