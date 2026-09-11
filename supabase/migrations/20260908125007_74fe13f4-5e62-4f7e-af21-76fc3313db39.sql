revoke all on function public.log_finance_change() from public, anon, authenticated;
grant execute on function public.log_finance_change() to service_role;
revoke all on function public.savings_entries_append_only() from public, anon, authenticated;
grant execute on function public.savings_entries_append_only() to service_role;
revoke all on function public.finance_audit_append_only() from public, anon, authenticated;
grant execute on function public.finance_audit_append_only() to service_role;
revoke all on function public.current_driver_id() from public, anon;
revoke all on function public.has_bank_access(uuid) from public, anon;
