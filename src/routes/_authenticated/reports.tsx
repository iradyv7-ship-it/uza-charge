/**
 * Regulator and grid-operator reporting page.
 *
 * Everything here is read live through the caller's own session, so RLS decides
 * the scope: a station owner sees their own sites, UZA staff see the managed
 * network. Figures are measured — sessions that were recorded and meter values
 * the hardware actually reported. Nothing is interpolated or filled in.
 */
import { createFileRoute } from "@tanstack/react-router";
import { FileBarChart, Gauge, ShieldCheck } from "lucide-react";

import { ConsoleShell } from "@/components/uza/ConsoleShell";
import { RegulatorExports } from "@/components/uza/RegulatorExports";
import { Channel, Panel, PanelHeader } from "@/components/uza/ui";
import { useAccount } from "@/hooks/useUza";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Monthly utility & regulator reports | UZA Charge" },
      {
        name: "description",
        content:
          "Build monthly utility reports from live data: energy per site, peak coincident demand, half-hourly load profile, charge-point detail, session profiles and the tariffs applied. CSV and PDF.",
      },
      { property: "og:title", content: "UZA Charge utility & regulator reports" },
      {
        property: "og:description",
        content: "Measured energy, peak demand, charge-point detail and applied tariffs, exportable as CSV or PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { data: account } = useAccount();
  const scopeLabel = account?.driver?.full_name ? "UZA Charge Network" : "UZA Charge Network";

  return (
    <ConsoleShell
      title="Utility &amp; regulator reports"
      subtitle="Monthly extracts built from recorded sessions and reported meter values — owner, site, charge point, session, meter readings and the pricing applied"
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Note
          icon={<Gauge className="size-4 text-primary" />}
          title="Measured, not modelled"
          body="Energy and demand come from OCPP MeterValues. A pile that never reported says “not metered”, never a plausible number."
        />
        <Note
          icon={<FileBarChart className="size-4 text-primary" />}
          title="Monthly ready"
          body="Pick a calendar month, or an exact date range in Africa/Kigali, then export the same dataset you see as CSV or a printable PDF."
        />
        <Note
          icon={<ShieldCheck className="size-4 text-primary" />}
          title="Scoped to you"
          body="An owner sees only their own sites. Row counts are printed on every extract so a regulator can audit the figures back to the tables."
        />
      </div>

      <RegulatorExports scopeLabel={scopeLabel} />
    </ConsoleShell>
  );
}

function Note({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Panel>
      <PanelHeader title={title} right={icon} />
      <p className="p-4 pt-3 text-sm text-muted-foreground">{body}</p>
      <Channel className="px-4 pb-3">Africa/Kigali · RWF</Channel>
    </Panel>
  );
}
