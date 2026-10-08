import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Formato visual de placa peruana: ABC123 → ABC-123 */
export function displayPlate(plate: string): string {
  const p = normalizePlate(plate);
  return p.length === 6 ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Copia texto al portapapeles. `navigator.clipboard` solo existe en contextos seguros
 * (https o localhost); al entrar por IP de red (http://192.168…) se usa el método clásico.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* se intenta el método clásico */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
