
revoke execute on function public.compute_session_cost(uuid) from anon, authenticated;
revoke execute on function public.tier_for_ts(uuid, timestamptz) from anon, authenticated;
revoke execute on function public.session_tariff_id(uuid) from anon, authenticated;
