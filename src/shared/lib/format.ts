export const TZ = "America/Lima";
export const CURRENCY_SYMBOL = "S/";

const moneyFmt = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const qtyFmt = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 });

export function money(value: number | string | null | undefined, symbol = CURRENCY_SYMBOL): string {
  const n = Number(value ?? 0);
  return `${n < 0 ? "−" : ""}${symbol} ${moneyFmt.format(Math.abs(n))}`;
}

export function int(value: number | null | undefined): string {
  return intFmt.format(Number(value ?? 0));
}

export function qty(value: number | null | undefined): string {
  return qtyFmt.format(Number(value ?? 0));
}

export function pct(value: number | null | undefined): string {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-PE", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-PE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

/** Fecha local (Lima) en formato YYYY-MM-DD */
export function todayISO(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

export function firstDayOfMonthISO(): string {
  return `${todayISO().slice(0, 8)}01`;
}

/** 75 → "1 h 15 min" */
export function duration(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(Math.abs(Number(minutes ?? 0))));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function minutesBetween(fromIso: string, to: number = Date.now()): number {
  return Math.floor((to - new Date(fromIso).getTime()) / 60_000);
}

export function relativeTime(iso: string): string {
  const m = minutesBetween(iso);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  if (m < 1440) return `hace ${Math.floor(m / 60)} h`;
  return formatDate(iso);
}
