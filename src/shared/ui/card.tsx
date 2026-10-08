import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-fg-subtle">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

type Tone = "neutral" | "cyan" | "emerald" | "amber" | "rose" | "violet";

const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-3 text-fg-muted border-line",
  cyan: "bg-cyan-soft text-cyan border-cyan/25",
  emerald: "bg-emerald-soft text-emerald border-emerald/25",
  amber: "bg-amber-soft text-amber border-amber/25",
  rose: "bg-rose-soft text-rose border-rose/25",
  violet: "bg-violet-soft text-violet border-violet/25",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export type { Tone };

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const accent: Record<Tone, string> = {
    neutral: "text-fg",
    cyan: "text-cyan",
    emerald: "text-emerald",
    amber: "text-amber",
    rose: "text-rose",
    violet: "text-violet",
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-[13px] font-medium text-fg-muted">
        {label}
        {icon && <span className={cn("opacity-80 [&_svg]:size-4", accent[tone])}>{icon}</span>}
      </div>
      <div className={cn("mt-2 text-2xl font-bold tracking-tight tabular", accent[tone])}>{value}</div>
      {hint && <div className="mt-1 text-xs text-fg-subtle">{hint}</div>}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-3", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-line bg-surface-2 text-fg-subtle [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-subtle">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
