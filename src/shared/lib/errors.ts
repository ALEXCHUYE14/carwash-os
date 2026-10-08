import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Los RAISE EXCEPTION del esquema SQL ya vienen en español y son legibles para el usuario
 * (códigos P0001 = regla de negocio, 42501 = no autorizado, 22023 = dato inválido).
 * Aquí solo se traducen los errores técnicos de Postgres / PostgREST.
 */
const PG_MESSAGES: Record<string, string> = {
  "23505": "Ya existe un registro con esos datos (duplicado).",
  "23503": "No se puede completar: hay registros relacionados.",
  "23514": "Algún dato no cumple las reglas de validación.",
  "23502": "Falta un dato obligatorio.",
  "22P02": "Formato de dato inválido.",
  PGRST301: "Tu sesión expiró. Vuelve a ingresar.",
  "42501": "No tienes permiso para realizar esta acción.",
};

export function isPostgrestError(e: unknown): e is PostgrestError {
  return typeof e === "object" && e !== null && "code" in e && "message" in e;
}

export function errorMessage(e: unknown): string {
  if (isPostgrestError(e)) {
    if (e.code === "P0001" || e.code === "22023") return e.message;
    if (e.code === "42501") {
      return e.message.startsWith("new row violates") || e.message.startsWith("permission denied")
        ? PG_MESSAGES["42501"]!
        : e.message;
    }
    if (e.message.includes("row-level security")) return PG_MESSAGES["42501"]!;
    return PG_MESSAGES[e.code] ?? e.message;
  }
  if (e instanceof Error) return e.message;
  return "Ocurrió un error inesperado.";
}

/** Lanza el error de Supabase como excepción para que TanStack Query lo capture. */
export function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
