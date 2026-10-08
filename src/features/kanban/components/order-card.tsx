"use client";

import { AlertTriangle, Award, Clock, MapPin, UserRound } from "lucide-react";
import { useNow } from "@/shared/hooks/use-now";
import { duration, money } from "@/shared/lib/format";
import { PAYMENT_STATUS_META, SLA_META } from "@/shared/lib/labels";
import { cn, displayPlate } from "@/shared/lib/utils";
import type { KanbanCard, SlaState } from "@/shared/types/domain";
import { Badge } from "@/shared/ui/card";

/** Recalcula el semáforo en el cliente para que el timer avance sin refetch. */
export function liveSla(card: KanbanCard, now: number, warnPct = 0.2): { state: SlaState; remaining: number | null } {
  if (card.status === "ready" || card.status === "delivered" || card.status === "cancelled") return { state: "done", remaining: null };
  if (!card.sla_due_at) return { state: "on_time", remaining: null };
  const remaining = Math.floor((new Date(card.sla_due_at).getTime() - now) / 60_000);
  const warn = Math.max(5, card.estimated_duration_min * warnPct);
  return { state: remaining < 0 ? "overdue" : remaining <= warn ? "due_soon" : "on_time", remaining };
}

export function SlaBadge({ card, now }: { card: KanbanCard; now: number }) {
  const { state, remaining } = liveSla(card, now);
  if (state === "done") return null;
  const meta = SLA_META[state];
  return (
    <Badge tone={meta.tone} className={cn(state === "overdue" && "animate-pulse-ring")}>
      <Clock className="size-3" />
      {remaining === null ? meta.label : remaining < 0 ? `+${duration(-remaining)}` : `${duration(remaining)}`}
    </Badge>
  );
}

export function OrderCard({
  card,
  onOpen,
  dragging,
  className,
}: {
  card: KanbanCard;
  onOpen?: () => void;
  dragging?: boolean;
  className?: string;
}) {
  const now = useNow(30_000);
  const { state } = liveSla(card, now);
  const elapsed = Math.floor((now - new Date(card.received_at).getTime()) / 60_000);
  const pay = PAYMENT_STATUS_META[card.payment_status];

  return (
    <article
      onClick={onOpen}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-xl border bg-surface-2 p-3 transition-[border-color,box-shadow,transform] select-none",
        state === "overdue" ? "border-rose/50" : state === "due_soon" ? "border-amber/40" : "border-line hover:border-line-strong",
        dragging && "rotate-[1.5deg] scale-[1.03] border-cyan shadow-[var(--shadow-glow-cyan)]",
        className,
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          state === "overdue" ? "bg-rose" : state === "due_soon" ? "bg-amber" : state === "done" ? "bg-emerald" : "bg-cyan/70",
        )}
      />
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <div className="min-w-0">
          <span className="inline-block whitespace-nowrap rounded-md bg-fg px-1.5 py-0.5 font-mono text-[15px] leading-none font-extrabold tracking-wider text-bg">
            {displayPlate(card.plate)}
          </span>
          <p className="mt-1.5 truncate text-[13px] text-fg-muted">{card.vehicle_label ?? card.vehicle_type}</p>
        </div>
        <SlaBadge card={card} now={now} />
      </div>

      <p className="mt-2 line-clamp-2 pl-1.5 text-sm font-semibold leading-snug">{card.services ?? "—"}</p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1.5 text-xs text-fg-subtle">
        <span className="flex items-center gap-1 truncate">
          <UserRound className="size-3" /> {card.customer_name.split(" ").slice(0, 2).join(" ")}
        </span>
        {card.bay_name && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3" /> {card.bay_name}
          </span>
        )}
        <span className="flex items-center gap-1 tabular">
          <Clock className="size-3" /> {duration(elapsed)}
        </span>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2 pl-1.5">
        <div className="flex items-center gap-1.5">
          {card.has_prior_damage && (
            <span title="Tiene daños previos registrados" className="text-amber">
              <AlertTriangle className="size-3.5" />
            </span>
          )}
          {card.is_loyalty_reward && (
            <span title="Lavado gratis por fidelización" className="text-emerald">
              <Award className="size-3.5" />
            </span>
          )}
          <span className="truncate text-xs text-fg-muted">{card.employee_name ?? "Sin asignar"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="whitespace-nowrap text-[13px] font-bold tabular">{money(card.total)}</span>
          {card.payment_status !== "paid" && (card.status === "ready" || card.status === "quality_check") && (
            <Badge tone={pay.tone} className="h-5 px-1.5 text-[10px]">
              {pay.label}
            </Badge>
          )}
        </div>
      </div>
    </article>
  );
}
