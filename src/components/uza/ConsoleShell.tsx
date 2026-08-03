import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useAccount, useSignOut } from "@/hooks/useUza";
import { LiveDot } from "@/components/uza/ui";
import { cn } from "@/lib/utils";

export function UzaMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-md border border-primary/60 bg-primary/10">
        <svg viewBox="0 0 24 24" className="size-4 text-primary" fill="currentColor">
          <path d="M13 2 4.5 13.5H10L9 22l8.5-11.5H12z" />
        </svg>
      </span>
      {!compact ? (
        <span className="leading-none">
          <span className="block text-sm font-semibold tracking-tight">UZA CHARGE</span>
          <span className="channel">East Africa · OCPP 1.6</span>
        </span>
      ) : null}
    </Link>
  );
}

const NAV = [
  { to: "/", label: "Network" },
  { to: "/ops", label: "Operator" },
  { to: "/admin", label: "Admin" },
  { to: "/driver", label: "Driver app" },
] as const;

export function ConsoleShell({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
  actions?: ReactNode | undefined;
}) {
  const { data: account } = useAccount();
  const signOut = useSignOut();

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-4 py-3 sm:px-6">
          <UzaMark />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ className: "bg-panel-raised text-foreground" }}
                inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
                className="rounded-md px-3 py-1.5 text-sm transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="metric hidden items-center gap-2 rounded-full border border-live/40 bg-live/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-live sm:inline-flex">
              <LiveDot /> live
            </span>
            {account ? (
              <button
                onClick={() => void signOut()}
                className="channel hover:text-foreground"
                type="button"
              >
                Sign out
              </button>
            ) : (
              <Link to="/auth" className="channel hover:text-foreground">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="channel mt-1">{subtitle}</p> : null}
          </div>
          {actions}
        </header>
        {children}
      </main>
    </div>
  );
}

export function SubNav({
  items,
}: {
  items: Array<{ to: string; label: string }>;
}) {
  return (
    <nav className="mb-5 flex flex-wrap gap-1 border-b border-border pb-2">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: true }}
          activeProps={{ className: "border-primary text-primary" }}
          inactiveProps={{ className: "border-transparent text-muted-foreground" }}
          className={cn(
            "rounded-md border-b-2 px-3 py-1.5 text-sm transition-colors hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
