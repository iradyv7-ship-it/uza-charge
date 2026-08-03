-- 1. Column-scoped public access instead of full-table reads for anon

REVOKE SELECT ON public.operators FROM anon;
GRANT SELECT (id, name) ON public.operators TO anon;

REVOKE SELECT ON public.chargers FROM anon;
GRANT SELECT (id, station_id, status, connector_count) ON public.chargers TO anon;

REVOKE SELECT ON public.connectors FROM anon;
GRANT SELECT (id, charger_id, label, type, power_kw, status) ON public.connectors TO anon;

-- faults: public page only needs open-fault counts
REVOKE SELECT ON public.faults FROM anon;
GRANT SELECT (id, cleared_at) ON public.faults TO anon;

-- ensure signed-in users keep full read access
GRANT SELECT ON public.operators, public.chargers, public.connectors, public.faults TO authenticated;

-- 2. Pricing structures require authentication
REVOKE ALL ON public.tariffs FROM anon;
REVOKE ALL ON public.tariff_rates FROM anon;
REVOKE ALL ON public.tariff_segments FROM anon;

DROP POLICY IF EXISTS tariffs_public_read ON public.tariffs;
DROP POLICY IF EXISTS tariff_rates_public_read ON public.tariff_rates;
DROP POLICY IF EXISTS tariff_segments_public_read ON public.tariff_segments;

CREATE POLICY tariffs_auth_read ON public.tariffs FOR SELECT TO authenticated USING (true);
CREATE POLICY tariff_rates_auth_read ON public.tariff_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY tariff_segments_auth_read ON public.tariff_segments FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.tariffs, public.tariff_rates, public.tariff_segments TO authenticated;

-- 3. drivers: allow a user to create only their own driver record
CREATE POLICY drivers_insert_own ON public.drivers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
GRANT INSERT ON public.drivers TO authenticated;

-- 4. SECURITY DEFINER helpers must not be callable through the API.
-- has_role/is_staff stay executable by authenticated because RLS policies evaluate them as the caller.
REVOKE ALL ON FUNCTION public.compute_session_cost(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.session_tariff_id(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.tier_for_ts(uuid, timestamptz) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.compute_session_cost(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.session_tariff_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.tier_for_ts(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;