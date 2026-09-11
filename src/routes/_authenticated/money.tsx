import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { MoneyPanel } from "@/components/uza/MoneyPanel";
import { I18nProvider, useI18n } from "@/i18n";
import { UzaMark } from "@/components/uza/ConsoleShell";

export const Route = createFileRoute("/_authenticated/money")({
  head: () => ({
    meta: [
      { title: "Loan & savings — daily target in RWF | UZA Charge" },
      {
        name: "description",
        content:
          "Track your bank-financed vehicle loan, your daily saving target, what you actually put aside and the weekly record your bank reads — all in RWF.",
      },
      { property: "og:title", content: "UZA Charge loan & savings companion" },
      {
        property: "og:description",
        content: "Daily targets, savings pots and a weekly record a bank can read.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <I18nProvider>
      <MoneyScreen />
    </I18nProvider>
  ),
});

function MoneyScreen() {
  const { t } = useI18n();
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-16 pt-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UzaMark />
          <h1 className="text-lg font-semibold tracking-tight">{t("money.title")}</h1>
        </div>
        <Link
          to="/driver"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> {t("money.back")}
        </Link>
      </header>
      <MoneyPanel />
    </main>
  );
}
