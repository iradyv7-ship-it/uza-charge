import { supabase } from "@/integrations/supabase/client";

export type StationRow = {
  id: string;
  name: string;
  area: string | null;
  kind: string;
  gps_lat: number | null;
  gps_lng: number | null;
  operator_id: string;
  operators: { name: string; revenue_share_pct: number; momo_merchant_id: string | null } | null;
  chargers: Array<{
    id: string;
    serial: string;
    vendor: string | null;
    model: string | null;
    status: string;
    firmware_version: string | null;
    last_heartbeat: string | null;
    max_output_pct: number;
    connectors: Array<{
      id: string;
      label: string;
      type: string;
      power_kw: number;
      status: string;
    }>;
  }>;
};

export async function fetchStations(): Promise<StationRow[]> {
  const { data, error } = await supabase
    .from("stations")
    .select(
      "id, name, area, kind, gps_lat, gps_lng, operator_id, operators(name, revenue_share_pct, momo_merchant_id), chargers(id, serial, vendor, model, status, firmware_version, last_heartbeat, max_output_pct, connectors(id, label, type, power_kw, status))",
    )
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as StationRow[];
}

/** Public (unauthenticated) station map: no hardware serials, firmware or operator financials. */
export type PublicStationRow = {
  id: string;
  name: string;
  area: string | null;
  kind: string;
  gps_lat: number | null;
  gps_lng: number | null;
  operators: { name: string } | null;
  chargers: Array<{
    id: string;
    status: string;
    connector_count: number;
    connectors: Array<{
      id: string;
      label: string;
      type: string;
      power_kw: number;
      status: string;
    }>;
  }>;
};

export async function fetchPublicStations(): Promise<PublicStationRow[]> {
  const { data, error } = await supabase
    .from("stations")
    .select(
      "id, name, area, kind, gps_lat, gps_lng, operators(name), chargers(id, status, connector_count, connectors(id, label, type, power_kw, status))",
    )
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as PublicStationRow[];
}


export type LiveSession = {
  id: string;
  serial_no: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  kwh: number;
  cost_rwf: number;
  soc_start: number | null;
  soc_end: number | null;
  start_method: string;
  vin: string | null;
  stop_reason_code: string | null;
  driver_id: string | null;
  drivers: { full_name: string | null; phone: string | null } | null;
  connectors: {
    label: string;
    type: string;
    power_kw: number;
    chargers: { serial: string; stations: { name: string; area: string | null } | null } | null;
  } | null;
};

const SESSION_SELECT =
  "id, serial_no, status, started_at, ended_at, kwh, cost_rwf, soc_start, soc_end, start_method, vin, stop_reason_code, driver_id, drivers(full_name, phone), connectors(label, type, power_kw, chargers(serial, stations(name, area)))";

export async function fetchLiveSessions(): Promise<LiveSession[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .in("status", ["preparing", "charging", "finishing"])
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as LiveSession[];
}

export async function fetchSession(id: string): Promise<LiveSession | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as LiveSession | null;
}

export async function fetchDriverSessions(driverId: string): Promise<LiveSession[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("driver_id", driverId)
    .order("started_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data ?? []) as unknown as LiveSession[];
}

export async function fetchMeterValues(sessionId: string) {
  const { data, error } = await supabase
    .from("meter_values")
    .select("ts, power_kw, kwh, soc, voltage, current, temp_c")
    .eq("session_id", sessionId)
    .order("ts", { ascending: true })
    .limit(400);
  if (error) throw error;
  return data ?? [];
}

export async function fetchFleetKpis() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [chargers, live, today, faults] = await Promise.all([
    supabase.from("chargers").select("id, status"),
    supabase.from("sessions").select("id, kwh, cost_rwf").in("status", ["charging", "preparing", "finishing"]),
    supabase.from("sessions").select("kwh, cost_rwf").gte("started_at", startOfDay.toISOString()),
    supabase.from("faults").select("id").is("cleared_at", null),
  ]);

  const chargerRows = chargers.data ?? [];
  const todayRows = today.data ?? [];
  return {
    chargersTotal: chargerRows.length,
    chargersOnline: chargerRows.filter((c) => c.status === "online").length,
    chargersFaulted: chargerRows.filter((c) => c.status === "faulted").length,
    liveSessions: (live.data ?? []).length,
    liveKwh: (live.data ?? []).reduce((a, s) => a + Number(s.kwh ?? 0), 0),
    energyToday: todayRows.reduce((a, s) => a + Number(s.kwh ?? 0), 0),
    revenueToday: todayRows.reduce((a, s) => a + Number(s.cost_rwf ?? 0), 0),
    openFaults: (faults.data ?? []).length,
  };
}

export async function fetchTariffs() {
  const { data, error } = await supabase
    .from("tariffs")
    .select(
      "id, name, operator_id, operators(name), tariff_rates(tier, energy_rwf_per_kwh, service_rwf_per_kwh), tariff_segments(half_hour_index, tier)",
    )
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchPayments() {
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, method, amount_rwf, status, provider_ref, created_at, driver_id, session_id, drivers(full_name), sessions(serial_no, connectors(chargers(stations(name, operators(name, revenue_share_pct)))))",
    )
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  return data ?? [];
}

export async function fetchDriverPayments(driverId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("id, method, amount_rwf, status, provider_ref, created_at, session_id")
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return data ?? [];
}

export async function fetchFaults() {
  const { data, error } = await supabase
    .from("faults")
    .select("id, code, label, severity, raised_at, cleared_at, charger_id, chargers(serial, stations(name))")
    .order("raised_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return data ?? [];
}

export async function fetchOperators() {
  const { data, error } = await supabase
    .from("operators")
    .select("id, name, momo_merchant_id, revenue_share_pct")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchDrivers() {
  const { data, error } = await supabase
    .from("drivers")
    .select("id, full_name, phone, wallet_balance_rwf, default_pay_method, user_id")
    .order("full_name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchCommandLog() {
  const { data, error } = await supabase
    .from("charger_commands")
    .select("id, type, status, created_at, payload, charger_id, chargers(serial)")
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  return data ?? [];
}

export async function fetchDriverByUser(userId: string) {
  const { data, error } = await supabase
    .from("drivers")
    .select("id, full_name, phone, wallet_balance_rwf, default_pay_method")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
