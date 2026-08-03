import { createFileRoute } from "@tanstack/react-router";

/**
 * Simulator tick — the stand-in OCPP 1.6J gateway.
 * Called by the live consoles every few seconds and by a scheduled job.
 */
export const Route = createFileRoute("/api/public/hooks/simulator-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { runSimulatorTick } = await import("@/lib/simulator.server");
        try {
          const result = await runSimulatorTick();
          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error("[simulator] tick failed", error);
          return Response.json({ ok: false, error: "tick failed" }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST to advance the network" }),
    },
  },
});
