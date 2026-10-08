import type { ExpenseCategory, OrderStatus, PaymentMethod, PaymentStatus, SlaState, StockStatus, WaStatus } from "@/shared/types/domain";
import type { Tone } from "@/shared/ui/card";

export const STATUS_META: Record<OrderStatus, { label: string; short: string; tone: Tone }> = {
  received: { label: "Ingresado / En espera", short: "En espera", tone: "neutral" },
  washing: { label: "En lavado", short: "Lavado", tone: "cyan" },
  drying_detailing: { label: "Secado / Detallado", short: "Secado", tone: "cyan" },
  quality_check: { label: "Control de calidad", short: "Calidad", tone: "violet" },
  ready: { label: "Listo para entrega", short: "Listo", tone: "emerald" },
  delivered: { label: "Entregado", short: "Entregado", tone: "neutral" },
  cancelled: { label: "Anulado", short: "Anulado", tone: "rose" },
};

export const SLA_META: Record<SlaState, { label: string; tone: Tone }> = {
  on_time: { label: "A tiempo", tone: "emerald" },
  due_soon: { label: "Por vencer", tone: "amber" },
  overdue: { label: "Retrasado", tone: "rose" },
  done: { label: "Terminado", tone: "neutral" },
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  yape: "Yape",
  plin: "Plin",
  transfer: "Transferencia",
  other: "Otro",
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; tone: Tone }> = {
  pending: { label: "Por cobrar", tone: "amber" },
  partial: { label: "Pago parcial", tone: "amber" },
  paid: { label: "Pagado", tone: "emerald" },
};

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  utilities: "Servicios básicos",
  payroll: "Sueldos / Nómina",
  washer_commissions: "Comisiones a lavadores",
  supplies: "Compra de insumos",
  machinery_maintenance: "Mantenimiento de maquinaria",
  misc: "Gastos varios",
};

export const STOCK_META: Record<StockStatus, { label: string; tone: Tone }> = {
  ok: { label: "OK", tone: "emerald" },
  critical: { label: "Crítico", tone: "amber" },
  out: { label: "Agotado", tone: "rose" },
};

export const WA_STATUS_META: Record<WaStatus, { label: string; tone: Tone }> = {
  queued: { label: "En cola", tone: "neutral" },
  sending: { label: "Enviando", tone: "cyan" },
  sent: { label: "Enviado", tone: "cyan" },
  delivered: { label: "Entregado", tone: "emerald" },
  read: { label: "Leído", tone: "emerald" },
  failed: { label: "Fallido", tone: "rose" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};
