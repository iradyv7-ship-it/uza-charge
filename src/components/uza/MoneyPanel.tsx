/**
 * The driver's money companion: loan position, the daily target that makes a
 * monthly instalment survivable for a taxi driver, the record of what was
 * actually put aside, and the weekly view a bank reads.
 *
 * Nothing here is invented. With no records the panel says there is no record.
 * Every figure is minor units of RWF, computed by src/lib/empower.ts.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BanknoteArrowUp } from "lucide-react";
import {
  fetchEmpowerHome,
  openDefaultPots,
  recordSaving,
} from "@/lib/empower.functions";
import {
  discipline,
  loanPosition,
  monthlyInstalmentMinor,
  targetPerPeriodMinor,
  weeklyReport,
  type Cadence,
  type Entry,
} from "@/lib/empower";
import { EMPOWER } from "@/config/policy";
import { formatRwf } from "@/lib/money";
import { Btn, Channel, EmptyState, Field, Panel, PanelHeader, StatTile, inputClass } from "@/components/uza/ui";
import { useI18n } from "@/i18n";

type Source = "momo_recorded" | "airtel_recorded" | "cash_manual" | "bank_statement";

const CADENCES: Cadence[] = ["daily", "weekly", "monthly", "per_contract"];

export function MoneyPanel() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const load = useServerFn(fetchEmpowerHome);
  const home = useQuery({ queryKey: ["empower-home"], queryFn: () => load({ data: undefined as never }) });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["empower-home"] });
  const save = useMutation({ mutationFn: useServerFn(recordSaving), onSuccess: invalidate });
  const openPots = useMutation({ mutationFn: useServerFn(openDefaultPots), onSuccess: invalidate });

  const [cadence, setCadence] = useState<Cadence>("daily");
  const [potId, setPotId] = useState("");
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState<Source>("momo_recorded");

  const data = home.data;
  const pots = data?.pots ?? [];
  const today = data?.today ?? new Date().toISOString().slice(0, 10);

  const entries: Entry[] = useMemo(
    () =>
      (data?.entries ?? []).map((e) => ({
        occurredOn: e.occurred_on,
        amountMinor: Number(e.amount_minor),
        kind: e.kind as "credit" | "reversal",
        potId: e.pot_id,
      })),
    [data?.entries],
  );

  const loan = data?.loan ?? null;
  const monthlyMinor = loan
    ? Number(loan.instalment_minor)
    : monthlyInstalmentMinor(EMPOWER.vehiclePriceMinor.value - EMPOWER.minClientContributionMinor.value);
  const periodTargetMinor = targetPerPeriodMinor(monthlyMinor, cadence);
  const dailyTargetMinor = targetPerPeriodMinor(monthlyMinor, "daily");

  const record = useMemo(
    () => discipline({ entries, dailyTargetMinor, today, windowDays: 30 }),
    [entries, dailyTargetMinor, today],
  );
  const weeks = useMemo(
    () => weeklyReport({ entries, dailyTargetMinor, today, weeks: 8 }),
    [entries, dailyTargetMinor, today],
  );
  const position = loan
    ? loanPosition({
        principalMinor: Number(loan.principal_minor),
        instalmentMinor: Number(loan.instalment_minor),
        paidToDateMinor: Number(loan.paid_to_date_minor),
        startOn: loan.start_on,
        today,
      })
    : null;

  const potBalance = (id: string) =>
    entries
      .filter((e) => e.potId === id)
      .reduce((sum, e) => sum + (e.kind === "reversal" ? -e.amountMinor : e.amountMinor), 0);

  if (home.isPending) return <Panel><p className="channel p-4">{t("money.loading")}</p></Panel>;
  if (!data?.driver)
    return (
      <Panel>
        <div className="p-4">
          <EmptyState>{t("money.noDriver")}</EmptyState>
        </div>
      </Panel>
    );

  return (
    <div className="space-y-4">
      {/* Loan ---------------------------------------------------------- */}
      <Panel>
        <PanelHeader title={t("money.loanTitle")} />
        {position && loan ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <StatTile label={t("money.instalment")} value={formatRwf(Number(loan.instalment_minor))} />
            <StatTile label={t("money.paidToDate")} value={formatRwf(position.paidToDateMinor)} />
            <StatTile label={t("money.outstanding")} value={formatRwf(position.outstandingMinor)} />
            <StatTile
              label={t("money.collateral")}
              value={
                position.collateralReleased
                  ? t("money.collateralReleased")
                  : t("money.collateralIn", { months: String(position.monthsToCollateralRelease) })
              }
            />
          </div>
        ) : data.application ? (
          <p className="p-4 text-sm">
            {t("money.applicationStatus", { status: data.application.status })}
          </p>
        ) : (
          <div className="p-4">
            <EmptyState>{t("money.noLoan")}</EmptyState>
          </div>
        )}
      </Panel>

      {/* Target and discipline ----------------------------------------- */}
      <Panel>
        <PanelHeader title={t("money.targetTitle")} />
        <div className="flex flex-wrap gap-2 p-4 pb-0">
          {CADENCES.map((c) => (
            <Btn key={c} size="sm" variant={c === cadence ? "gold" : "default"} onClick={() => setCadence(c)}>
              {t(`money.cadence.${c}` as never)}
            </Btn>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 px-4 sm:grid-cols-4">
          <StatTile label={t("money.target")} value={formatRwf(periodTargetMinor)} />
          <StatTile label={t("money.saved30")} value={formatRwf(record.savedMinor)} />
          <StatTile
            label={record.daysAhead >= 0 ? t("money.daysAhead") : t("money.daysBehind")}
            value={String(Math.abs(record.daysAhead))}
            tone={record.daysAhead >= 0 ? "live" : "fault"}
          />
          <StatTile label={t("money.streak")} value={String(record.streakDays)} />
        </div>
        <p className="channel px-4 pb-4 pt-2">
          {record.measurable
            ? t("money.disciplineLine", {
                pct: String(record.disciplinePct),
                days: String(record.daysRecorded),
              })
            : t("money.noRecord")}
        </p>
      </Panel>

      {/* Pots and recording ------------------------------------------- */}
      <Panel>
        <PanelHeader title={t("money.potsTitle")} />
        {pots.length === 0 ? (
          <div className="space-y-3 p-4">
            <EmptyState>{t("money.noPots")}</EmptyState>
            <Btn
              variant="gold"
              disabled={openPots.isPending}
              onClick={() =>
                openPots.mutate({ data: { dailyTargetRwf: Math.round(dailyTargetMinor / 100) } })
              }
            >
              {t("money.openPots")}
            </Btn>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border px-4">
              {pots.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <Channel>{t("money.potTarget", { amount: formatRwf(Number(p.target_minor)) })}</Channel>
                  </div>
                  <span className="tabular-nums text-sm font-semibold">{formatRwf(potBalance(p.id))}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 grid gap-3 px-4 sm:grid-cols-3">
              <Field label={t("money.pot")}>
                <select className={inputClass} value={potId} onChange={(e) => setPotId(e.target.value)}>
                  <option value="">{t("money.choosePot")}</option>
                  {pots.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("money.amount")}>
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="40000"
                />
              </Field>
              <Field label={t("money.source")}>
                <select
                  className={inputClass}
                  value={source}
                  onChange={(e) => setSource(e.target.value as Source)}
                >
                  {(["momo_recorded", "airtel_recorded", "cash_manual", "bank_statement"] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`money.source.${s}` as never)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Btn
              className="mx-4 mb-4 mt-3"
              variant="gold"
              disabled={!potId || Number(amount) < 100 || save.isPending}
              onClick={() =>
                save.mutate(
                  { data: { potId, amountRwf: Number(amount), source } },
                  { onSuccess: () => setAmount("") },
                )
              }
            >
              <BanknoteArrowUp className="size-4" /> {t("money.record")}
            </Btn>
            {save.isError ? (
              <p className="px-4 pb-4 text-sm text-destructive">{(save.error as Error).message}</p>
            ) : null}
          </>
        )}
      </Panel>

      {/* Weekly report the bank reads ---------------------------------- */}
      <Panel>
        <PanelHeader title={t("money.weeklyTitle")} />
        {weeks.every((w) => w.savedMinor === 0) ? (
          <div className="p-4">
            <EmptyState>{t("money.noRecord")}</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-1 font-medium">{t("money.week")}</th>
                  <th className="py-1 text-right font-medium">{t("money.saved")}</th>
                  <th className="py-1 text-right font-medium">{t("money.target")}</th>
                  <th className="py-1 text-right font-medium">{t("money.daysRecorded")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {weeks.map((w) => (
                  <tr key={w.weekStart}>
                    <td className="py-1.5 tabular-nums">{w.weekStart}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatRwf(w.savedMinor)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatRwf(w.targetMinor)}</td>
                    <td
                      className={`py-1.5 text-right tabular-nums ${w.metTarget ? "text-live" : "text-muted-foreground"}`}
                    >
                      {w.daysRecorded}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="channel px-4 pb-4">{t("money.bankNote")}</p>
      </Panel>
    </div>
  );
}
