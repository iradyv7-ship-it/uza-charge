export const RWF = (v: number | null | undefined, opts?: { compact?: boolean }) => {
  const n = Number(v ?? 0);
  if (opts?.compact && n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (opts?.compact && n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
};

export const KWH = (v: number | null | undefined, dp = 2) => Number(v ?? 0).toFixed(dp);
export const KW = (v: number | null | undefined) => Number(v ?? 0).toFixed(1);

export function elapsed(from: string | Date, to?: string | Date | null) {
  const a = new Date(from).getTime();
  const b = to ? new Date(to).getTime() : Date.now();
  const s = Math.max(0, Math.floor((b - a) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Great-circle distance in km. */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Kigali city centre — the driver app's reference point for "nearby". */
export const KIGALI = { lat: -1.9441, lng: 30.0619 };

export type ConnectorStatus =
  | "available"
  | "preparing"
  | "charging"
  | "finishing"
  | "faulted"
  | "offline";

export const CONNECTOR_TONE: Record<ConnectorStatus, string> = {
  available: "text-live border-live/40 bg-live/10",
  preparing: "text-primary border-primary/40 bg-primary/10",
  charging: "text-live border-live/50 bg-live/15",
  finishing: "text-primary border-primary/40 bg-primary/10",
  faulted: "text-fault border-fault/40 bg-fault/10",
  offline: "text-muted-foreground border-border bg-muted/40",
};

export const CHARGER_TONE: Record<string, string> = {
  online: "text-live border-live/40 bg-live/10",
  offline: "text-muted-foreground border-border bg-muted/40",
  faulted: "text-fault border-fault/40 bg-fault/10",
};

export const TIER_LABEL: Record<string, string> = {
  sharp: "Sharp",
  peak: "Peak",
  standard: "Standard",
  valley: "Valley",
};

export const TIER_BG: Record<string, string> = {
  sharp: "bg-tier-sharp",
  peak: "bg-tier-peak",
  standard: "bg-tier-standard",
  valley: "bg-tier-valley",
};

export const TIER_TEXT: Record<string, string> = {
  sharp: "text-tier-sharp",
  peak: "text-tier-peak",
  standard: "text-tier-standard",
  valley: "text-tier-valley",
};

export function currentHalfHourIndex(d = new Date()) {
  return d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0);
}

export const PAY_LABEL: Record<string, string> = {
  momo: "MTN MoMo",
  airtel: "Airtel Money",
  wallet: "UZA Wallet",
};
