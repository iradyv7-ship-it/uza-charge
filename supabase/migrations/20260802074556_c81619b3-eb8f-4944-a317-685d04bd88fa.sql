REVOKE ALL ON FUNCTION public.compute_session_cost(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.session_tariff_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tier_for_ts(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.compute_session_cost(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.session_tariff_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.tier_for_ts(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;