/**
 * Browser-side regulator export builders: CSV and PDF.
 *
 * Both carry only measured values. Where a figure was never metered the export
 * writes an explicit "not metered" rather than a zero, so a grid operator can
 * tell missing telemetry apart from a genuine zero.
 */
import { TIMEZONE } from "@/config/policy";
import { toCsv } from "@/lib/export";
import type { RegulatorReport } from "@/lib/reporting.functions";

const KIGALI_OFFSET_MIN = 120;

/** ISO-like local stamp in the operating timezone, e.g. `2026-09-07 14:05`. */
export function localStamp(ms: number, withSeconds = false): string {
  const d = new Date(ms + KIGALI_OFFSET_MIN * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const time = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}${withSeconds ? `:${p(d.getUTCSeconds())}` : ""}`;
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${time}`;
}

export function localDay(ms: number): string {
  return localStamp(ms).slice(0, 10);
}

/** `0` → `00:00–00:30`. */
export function segmentLabel(segment: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const from = segment * 30;
  const to = from + 30;
  return `${p(Math.floor(from / 60))}:${p(from % 60)}–${p(Math.floor(to / 60) % 24)}:${p(to % 60)}`;
}

const NOT_METERED = "not metered";

export function energyPerSiteCsv(report: RegulatorReport): string {
  return toCsv(
    [
      "Site",
      "Sessions",
      "Energy kWh",
      `Gross revenue ${"RWF"}`,
      "Peak coincident kW (30 min)",
      "Peak interval start",
      "Meter samples",
    ],
    report.sites.map((s) => [
      s.siteName,
      s.sessions,
      s.kwh,
      Math.round(s.revenueMinor / 100),
      s.peakKw ?? NOT_METERED,
      s.peakAtMs ? localStamp(s.peakAtMs) : NOT_METERED,
      s.samples,
    ]),
  );
}

export function peakDemandCsv(report: RegulatorReport): string {
  return toCsv(
    ["Site", "Interval minutes", "Peak coincident kW", "Peak interval start", "Meter samples"],
    report.peaks.map((p) => [
      p.siteName,
      p.intervalMinutes,
      p.peakKw,
      localStamp(p.peakIntervalStartMs),
      p.samples,
    ]),
  );
}

export function loadProfileCsv(report: RegulatorReport): string {
  return toCsv(
    ["Half hour (Africa/Kigali)", "Mean coincident kW", "Max coincident kW", "Metered minutes"],
    report.profile.map((p) => [segmentLabel(p.segment), p.meanKw, p.maxKw, p.samples]),
  );
}

export function sessionProfilesCsv(report: RegulatorReport): string {
  return toCsv(
    [
      "Session",
      "Site",
      "Station",
      "Connector",
      "Standard",
      "Started",
      "Ended",
      "Duration minutes",
      "Energy kWh",
      "Mean kW",
      "SOC start %",
      "SOC end %",
      "Start method",
      "Status",
      "Total RWF",
    ],
    report.sessions.map((s) => [
      s.serialNo,
      s.siteName,
      s.stationName,
      s.connector,
      s.connectorType,
      localStamp(s.startedAtMs, true),
      s.endedAtMs ? localStamp(s.endedAtMs, true) : "in progress",
      s.durationMinutes ?? "in progress",
      s.kwh,
      s.meanKw ?? NOT_METERED,
      s.socStart ?? "not reported",
      s.socEnd ?? "not reported",
      s.startMethod,
      s.status,
      Math.round(s.totalMinor / 100),
    ]),
  );
}


export function chargePointsCsv(report: RegulatorReport): string {
  return toCsv(
    [
      "Owner",
      "Site",
      "Station",
      "Charge point serial",
      "OCPP identity",
      "Vendor",
      "Model",
      "Power type",
      "Rated kW",
      "Connectors",
      "Status",
      "Last seen",
      "Sessions",
      "Energy kWh",
      "Gross revenue RWF",
      "Peak kW",
      "Meter samples",
    ],
    report.chargePoints.map((c) => [
      c.ownerName ?? "unassigned",
      c.siteName,
      c.stationName,
      c.serial,
      c.ocppIdentity,
      c.vendor ?? "not reported",
      c.model ?? "not reported",
      c.powerType,
      c.ratedKw ?? "not registered",
      c.connectors,
      c.status,
      c.lastSeenAtMs ? localStamp(c.lastSeenAtMs, true) : "never connected",
      c.sessions,
      c.kwh,
      Math.round(c.revenueMinor / 100),
      c.peakKw ?? NOT_METERED,
      c.samples,
    ]),
  );
}

export function pricingCsv(report: RegulatorReport): string {
  const rows: (string | number)[][] = [
    ["Revenue component", "Amount RWF"],
    ["Energy", Math.round(report.revenue.energyMinor / 100)],
    ["Time", Math.round(report.revenue.timeMinor / 100)],
    ["Session fee", Math.round(report.revenue.sessionFeeMinor / 100)],
    ["Idle fee", Math.round(report.revenue.idleMinor / 100)],
    ["Not attributed to a component", Math.round(report.revenue.unattributedMinor / 100)],
    ["Billed total", Math.round(report.revenue.totalMinor / 100)],
    [],
    [
      "Tariff version",
      "Applies to",
      "Energy RWF/kWh",
      "Time RWF/min",
      "Session fee RWF",
      "Idle RWF/min",
      "Idle grace min",
      "Currency",
      "Published",
      "Effective from",
      "Effective to",
      "Sessions priced",
      "Energy kWh",
      "Revenue RWF",
    ],
  ];
  for (const t of report.tariffs) {
    rows.push([
      t.name,
      t.siteScope,
      Math.round(t.energyMinorPerKwh / 100),
      Math.round(t.timeMinorPerMinute / 100),
      Math.round(t.sessionFeeMinor / 100),
      Math.round(t.idleFeeMinorPerMinute / 100),
      t.idleGraceMinutes,
      t.currency,
      t.published ? "yes" : "draft",
      localDay(t.effectiveFromMs),
      t.effectiveToMs ? localDay(t.effectiveToMs) : "open",
      t.sessionsPriced,
      t.kwh,
      Math.round(t.revenueMinor / 100),
    ]);
  }
  return toCsv([`Pricing and tariffs — ${localDay(report.fromMs)} to ${localDay(report.toMs)}`], rows);
}

/**
 * Regulator PDF: a plain, printable statement of the measured figures with the
 * generation stamp and the row counts it was built from.
 */
export async function regulatorPdf(report: RegulatorReport): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 40;
  const width = doc.internal.pageSize.getWidth();
  const bottom = doc.internal.pageSize.getHeight() - 48;
  let y = 56;

  const line = (text: string, size = 9, bold = false) => {
    if (y > bottom) {
      doc.addPage();
      y = 56;
    }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(text, left, y);
    y += size + 5;
  };
  const row = (cells: string[], widths: number[], bold = false) => {
    if (y > bottom) {
      doc.addPage();
      y = 56;
    }
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.setFontSize(8);
    let x = left;
    cells.forEach((cell, i) => {
      doc.text(cell, x, y);
      x += widths[i] ?? 60;
    });
    y += 13;
  };
  const rule = () => {
    doc.setDrawColor(180);
    doc.line(left, y - 9, width - left, y - 9);
  };

  line("UZA Charge Network", 16, true);
  line(
    report.scope.ownerName
      ? `Utility report — ${report.scope.ownerName}`
      : "Utility report — full managed network",
    11,
    true,
  );
  line(`Period ${localDay(report.fromMs)} to ${localDay(report.toMs)} (${TIMEZONE.value})`);
  line(`Generated ${localStamp(report.generatedAtMs, true)}`);
  line(
    `Built from ${report.counts.sessions} recorded sessions and ${report.counts.meterSamples} reported meter samples. ` +
      "Figures are measured only; nothing is interpolated.",
  );
  if (report.scope.siteIds.length)
    line(`Filtered to ${report.scope.siteIds.length} of ${report.scope.sites.length} sites in scope.`);
  if (report.counts.truncated) line("Note: the row limit was reached — narrow the period for a complete extract.");
  y += 6;

  line("1. Totals", 11, true);
  line(`Sites reporting: ${report.totals.sites}`);
  line(`Sessions: ${report.totals.sessions}`);
  line(`Energy delivered: ${report.totals.kwh.toFixed(3)} kWh`);
  line(`Gross revenue: RWF ${Math.round(report.totals.revenueMinor / 100).toLocaleString("en-US")}`);
  line(
    `Highest coincident demand: ${
      report.totals.peakKw === null ? NOT_METERED : `${report.totals.peakKw.toFixed(1)} kW`
    }`,
  );
  line(
    `Mean completed session: ${
      report.totals.meanSessionMinutes === null ? "no completed session" : `${report.totals.meanSessionMinutes} min`
    }`,
  );
  y += 8;

  line("2. Energy and peak demand per site", 11, true);
  const siteWidths = [170, 60, 90, 100, 90];
  row(["Site", "Sessions", "kWh", "Peak kW", "Peak at"], siteWidths, true);
  rule();
  for (const s of report.sites) {
    row(
      [
        clip(s.siteName, 28),
        String(s.sessions),
        s.kwh.toFixed(2),
        s.peakKw === null ? NOT_METERED : s.peakKw.toFixed(1),
        s.peakAtMs ? localStamp(s.peakAtMs) : "—",
      ],
      siteWidths,
    );
  }
  if (!report.sites.length) line("No site reported energy in this period.");
  y += 8;

  // Charts are drawn from the same measured arrays as the tables below them.
  const space = (h: number) => {
    if (y + h > bottom) {
      doc.addPage();
      y = 56;
    }
  };

  const axes = (x: number, top: number, w: number, h: number) => {
    doc.setDrawColor(150);
    doc.setLineWidth(0.6);
    doc.line(x, top + h, x + w, top + h);
    doc.line(x, top, x, top + h);
  };

  line("3. Peak coincident demand per site", 11, true);
  if (report.peaks.length) {
    const w = width - left * 2;
    const h = 120;
    space(h + 24);
    const top = y;
    axes(left, top, w, h);
    const peaks = report.peaks.slice(0, 12);
    const max = Math.max(...peaks.map((p) => p.peakKw), 1);
    const slot = w / peaks.length;
    const barW = Math.min(slot * 0.6, 54);
    peaks.forEach((p, i) => {
      const bh = Math.max(1, (p.peakKw / max) * (h - 12));
      const bx = left + i * slot + (slot - barW) / 2;
      const bw = barW;
      doc.setFillColor(31, 87, 168);
      doc.rect(bx, top + h - bh, bw, bh, "F");
      doc.setFont("courier", "normal");
      doc.setFontSize(6.5);
      doc.text(p.peakKw.toFixed(0), bx, top + h - bh - 3);
      doc.text(clip(p.siteName, 12), bx, top + h + 8, { angle: 0 });
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`kW, 30-minute coincident maximum (peak ${max.toFixed(1)} kW)`, left, top - 4);
    y = top + h + 20;
  } else {
    line("No site reported metered demand in this period.");
  }
  const peakWidths = [170, 90, 120, 80];
  row(["Site", "Peak kW", "Peak interval start", "Samples"], peakWidths, true);
  rule();
  for (const p of report.peaks) {
    row(
      [clip(p.siteName, 28), p.peakKw.toFixed(1), localStamp(p.peakIntervalStartMs), String(p.samples)],
      peakWidths,
    );
  }
  y += 8;

  line("4. Half-hourly demand profile (mean coincident kW)", 11, true);
  if (report.profile.length) {
    const w = width - left * 2;
    const h = 120;
    space(h + 24);
    const top = y;
    axes(left, top, w, h);
    const max = Math.max(...report.profile.map((p) => p.maxKw), 1);
    const slot = w / 48;
    const bySegment = new Map(report.profile.map((p) => [p.segment, p]));
    // Mean as bars; the metered maximum as a line over the top.
    for (let seg = 0; seg < 48; seg += 1) {
      const p = bySegment.get(seg);
      if (!p) continue;
      const bh = Math.max(0.5, (p.meanKw / max) * (h - 10));
      doc.setFillColor(31, 87, 168);
      doc.rect(left + seg * slot + slot * 0.15, top + h - bh, slot * 0.7, bh, "F");
    }
    doc.setDrawColor(214, 158, 46);
    doc.setLineWidth(0.9);
    let prev: [number, number] | null = null;
    for (let seg = 0; seg < 48; seg += 1) {
      const p = bySegment.get(seg);
      if (!p) {
        prev = null;
        continue;
      }
      const px = left + seg * slot + slot / 2;
      const py = top + h - Math.max(0.5, (p.maxKw / max) * (h - 10));
      if (prev) doc.line(prev[0], prev[1], px, py);
      doc.setFillColor(214, 158, 46);
      doc.circle(px, py, 1.1, "F");
      prev = [px, py];
    }
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    for (const seg of [0, 12, 24, 36, 47]) doc.text(segmentLabel(seg).slice(0, 5), left + seg * slot, top + h + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`kW by local half hour (${TIMEZONE.value}); bars mean, line metered maximum`, left, top - 4);
    y = top + h + 20;
  }
  const profWidths = [110, 90, 90, 90];
  row(["Half hour", "Mean kW", "Max kW", "Minutes"], profWidths, true);
  rule();
  for (const p of report.profile) {
    row([segmentLabel(p.segment), p.meanKw.toFixed(1), p.maxKw.toFixed(1), String(p.samples)], profWidths);
  }
  if (!report.profile.length) line("No meter samples were reported in this period.");
  y += 8;

  line("5. Session profiles", 11, true);
  const metered = report.sessions.filter((s) => s.durationMinutes !== null && s.meanKw !== null);
  if (metered.length) {
    const w = width - left * 2;
    const h = 120;
    space(h + 24);
    const top = y;
    axes(left, top, w, h);
    const maxMin = Math.max(...metered.map((s) => s.durationMinutes ?? 0), 1);
    const maxKw = Math.max(...metered.map((s) => s.meanKw ?? 0), 1);
    doc.setFillColor(16, 122, 87);
    for (const s of metered) {
      const px = left + ((s.durationMinutes ?? 0) / maxMin) * (w - 6);
      const py = top + h - ((s.meanKw ?? 0) / maxKw) * (h - 8);
      doc.circle(px, py, 1.6, "F");
    }
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.text("0", left, top + h + 8);
    doc.text(`${Math.round(maxMin)} min`, left + w - 30, top + h + 8);
    doc.text(`${maxKw.toFixed(0)} kW`, left + 2, top + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(
      `Each dot is one completed session: duration 0–${Math.round(maxMin)} min (x) against mean power 0–${maxKw.toFixed(0)} kW (y)`,
      left,
      top - 4,
    );
    y = top + h + 20;
  }
  const sesWidths = [110, 120, 70, 60, 60, 70];
  row(["Started", "Site", "Connector", "kWh", "Min", "Mean kW"], sesWidths, true);
  rule();
  for (const s of report.sessions.slice(0, 60)) {
    row(
      [
        localStamp(s.startedAtMs),
        clip(s.siteName, 20),
        clip(s.connector, 10),
        s.kwh.toFixed(2),
        s.durationMinutes === null ? "open" : String(Math.round(s.durationMinutes)),
        s.meanKw === null ? "—" : s.meanKw.toFixed(1),
      ],
      sesWidths,
    );
  }
  if (!report.sessions.length) line("No session was recorded in this period.");

  y += 10;

  line("6. Charge points", 11, true);
  const cpWidths = [120, 110, 60, 55, 60, 90];
  row(["Charge point", "Site", "Sessions", "kWh", "Peak kW", "Last seen"], cpWidths, true);
  rule();
  for (const c of report.chargePoints) {
    row(
      [
        clip(`${c.serial} · ${c.powerType}`, 20),
        clip(c.siteName, 18),
        String(c.sessions),
        c.kwh.toFixed(2),
        c.peakKw === null ? NOT_METERED : c.peakKw.toFixed(1),
        c.lastSeenAtMs ? localStamp(c.lastSeenAtMs) : "never connected",
      ],
      cpWidths,
    );
  }
  if (!report.chargePoints.length) line("No charge point is registered in this scope.");
  y += 10;

  line("7. Pricing applied", 11, true);
  const rev = report.revenue;
  const money = (minor: number) => `RWF ${Math.round(minor / 100).toLocaleString("en-US")}`;
  line(`Energy: ${money(rev.energyMinor)}`);
  line(`Time: ${money(rev.timeMinor)}`);
  line(`Session fees: ${money(rev.sessionFeeMinor)}`);
  line(`Idle fees: ${money(rev.idleMinor)} over ${rev.idleMinutes} charged idle minutes`);
  if (rev.unattributedMinor !== 0)
    line(`Not attributed to a component: ${money(rev.unattributedMinor)} (settled before component pricing)`);
  line(`Billed total: ${money(rev.totalMinor)}`, 9, true);
  if (rev.unpricedSessions)
    line(`${rev.unpricedSessions} closed session(s) carry no priced total and are excluded from revenue.`);
  y += 6;

  const tWidths = [130, 70, 60, 60, 60, 70];
  row(["Tariff version", "RWF/kWh", "RWF/min", "Session", "Idle/min", "From"], tWidths, true);
  rule();
  for (const t of report.tariffs) {
    row(
      [
        clip(`${t.name}${t.published ? "" : " (draft)"}`, 22),
        String(Math.round(t.energyMinorPerKwh / 100)),
        String(Math.round(t.timeMinorPerMinute / 100)),
        String(Math.round(t.sessionFeeMinor / 100)),
        String(Math.round(t.idleFeeMinorPerMinute / 100)),
        localDay(t.effectiveFromMs),
      ],
      tWidths,
    );
  }
  if (!report.tariffs.length) line("No tariff version was in force in this period.");

  return doc.output("blob");
}

export function downloadBlob(filename: string, blob: Blob): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
