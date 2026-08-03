import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  className,
  children,
}: {
  className?: string | undefined;
  children: ReactNode;
}) {
  return <section className={cn("panel-surface", className)}>{children}</section>;
}

export function PanelHeader({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string | undefined;
  right?: ReactNode | undefined;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="channel mt-0.5 truncate">{hint}</p> : null}
      </div>
      {right}
    </header>
  );
}

export function Channel({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return <span className={cn("channel block", className)}>{children}</span>;
}

export function Metric({
  value,
  unit,
  className,
  tone = "default",
  size = "md",
}: {
  value: ReactNode;
  unit?: string | undefined;
  className?: string | undefined;
  tone?: "default" | "live" | "gold" | "fault" | "muted" | undefined;
  size?: "sm" | "md" | "lg" | "xl" | undefined;
}) {
  const tones = {
    default: "text-foreground",
    live: "text-live",
    gold: "text-primary",
    fault: "text-fault",
    muted: "text-muted-foreground",
  } as const;
  const sizes = {
    sm: "text-sm",
    md: "text-lg",
    lg: "text-2xl",
    xl: "text-4xl",
  } as const;
  return (
    <span className={cn("metric font-medium", tones[tone], sizes[size], className)}>
      {value}
      {unit ? (
        <span className="ml-1 text-[0.62em] font-normal text-muted-foreground">{unit}</span>
      ) : null}
    </span>
  );
}

export function StatTile({
  label,
  value,
  unit,
  tone = "default",
  foot,
}: {
  label: string;
  value: ReactNode;
  unit?: string | undefined;
  tone?: "default" | "live" | "gold" | "fault" | "muted" | undefined;
  foot?: ReactNode | undefined;
}) {
  return (
    <div className="panel-surface flex flex-col justify-between gap-2 p-4">
      <Channel>{label}</Channel>
      <Metric value={value} unit={unit} tone={tone} size="lg" />
      {foot ? <div className="channel truncate">{foot}</div> : null}
    </div>
  );
}

export function LiveDot({ tone = "live" }: { tone?: "live" | "fault" | "idle" | "gold" | undefined }) {
  const map = {
    live: "bg-live pulse-dot",
    fault: "bg-fault pulse-dot",
    gold: "bg-primary",
    idle: "bg-muted-foreground",
  } as const;
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", map[tone])} />;
}

export function StatusPill({
  status,
  toneMap,
}: {
  status: string;
  toneMap: Record<string, string>;
}) {
  return (
    <span
      className={cn(
        "metric inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
        toneMap[status] ?? "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <LiveDot
        tone={
          status === "charging" || status === "online" || status === "available"
            ? "live"
            : status === "faulted"
              ? "fault"
              : status === "preparing" || status === "finishing"
                ? "gold"
                : "idle"
        }
      />
      {status}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  variant = "default",
  size = "md",
  disabled,
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: (() => void) | undefined;
  variant?: "default" | "gold" | "live" | "danger" | "ghost" | undefined;
  size?: "sm" | "md" | "lg" | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  type?: "button" | "submit" | undefined;
}) {
  const variants = {
    default:
      "border border-border bg-panel-raised text-foreground hover:border-primary/50 hover:text-primary",
    gold: "border border-primary bg-primary text-primary-foreground hover:opacity-90 glow-gold",
    live: "border border-live bg-live text-live-foreground hover:opacity-90",
    danger: "border border-fault/60 bg-fault/15 text-fault hover:bg-fault/25",
    ghost: "border border-transparent text-muted-foreground hover:text-foreground",
  } as const;
  const sizes = {
    sm: "px-2.5 py-1 text-[11px]",
    md: "px-3.5 py-2 text-sm",
    lg: "px-5 py-3 text-base",
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <Channel>{label}</Channel>
      {children}
    </label>
  );
}

export const inputClass =
  "metric w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function SocRing({
  soc,
  kw,
  size = 220,
}: {
  soc: number;
  kw?: number | undefined;
  size?: number | undefined;
}) {
  const clamped = Math.max(0, Math.min(100, soc));
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--panel-raised)"
          strokeWidth={12}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--live)"
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * clamped) / 100}
          style={{ transition: "stroke-dashoffset 900ms linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Channel>State of charge</Channel>
        <span className="metric text-5xl font-semibold text-live">{Math.round(clamped)}</span>
        <span className="channel">percent</span>
        {kw !== undefined ? (
          <span className="metric mt-2 text-sm text-primary">{kw.toFixed(1)} kW</span>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return (
    <th className={cn("channel whitespace-nowrap px-3 py-2 text-left font-normal", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return (
    <td className={cn("whitespace-nowrap px-3 py-2.5 text-sm", className)}>{children}</td>
  );
}
