import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ensureAccount } from "@/lib/account.functions";

/** Signed-in account: driver record + roles, provisioned on first use. */
export function useAccount() {
  const run = useServerFn(ensureAccount);
  return useQuery({
    queryKey: ["account"],
    queryFn: () => run(),
    staleTime: 60_000,
    retry: false,
  });
}

/** Ticks every `ms` so elapsed timers stay honest. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * Subscribe to Supabase realtime and invalidate the given query keys whenever
 * the watched tables change — no refresh, no polling.
 */
export function useLive(tables: string[], keys: string[][]) {
  const queryClient = useQueryClient();
  const signature = tables.join(",");
  const keySig = JSON.stringify(keys);

  useEffect(() => {
    const channel = supabase.channel(`uza-live-${signature}-${Math.random().toString(36).slice(2)}`);
    for (const table of signature.split(",")) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        for (const key of JSON.parse(keySig) as string[][]) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      });
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [signature, keySig, queryClient]);
}

/**
 * Drives the charger simulator (the stand-in OCPP gateway) while a console is
 * open, so telemetry keeps flowing.
 */
export function useSimulatorPulse(intervalMs = 6000) {
  const busy = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (busy.current || cancelled) return;
      busy.current = true;
      try {
        await fetch("/api/public/hooks/simulator-tick", { method: "POST" });
      } catch {
        /* transient — next pulse retries */
      } finally {
        busy.current = false;
      }
    };
    void tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
  };
}
