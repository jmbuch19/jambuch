-- Move internal helper functions out of the public API (Supabase advisor 0028/0029).
-- Policies and the trigger keep working: they reference functions by id, not name.

create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_admin() set schema private;
alter function public.handle_new_user() set schema private;

revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

revoke all on function private.handle_new_user() from public, anon, authenticated;
