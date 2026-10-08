import type { OrderStatus } from "@/shared/types/domain";
import { ORDER_FLOW } from "@/shared/types/domain";

/** Columnas visibles del tablero (el orden = flujo de trabajo). */
export const BOARD_COLUMNS = ORDER_FLOW;

export const COLUMN_ACCENT: Record<OrderStatus, string> = {
  received: "bg-fg-subtle",
  washing: "bg-cyan",
  drying_detailing: "bg-cyan",
  quality_check: "bg-violet",
  ready: "bg-emerald",
  delivered: "bg-line-strong",
  cancelled: "bg-rose",
};

export function nextStatus(s: OrderStatus): OrderStatus | null {
  const i = ORDER_FLOW.indexOf(s as (typeof ORDER_FLOW)[number]);
  if (i < 0 || i >= ORDER_FLOW.length - 1) return null;
  return ORDER_FLOW[i + 1] ?? null;
}

export function prevStatus(s: OrderStatus): OrderStatus | null {
  const i = ORDER_FLOW.indexOf(s as (typeof ORDER_FLOW)[number]);
  if (i <= 0 || s === "delivered") return null;
  return ORDER_FLOW[i - 1] ?? null;
}
