import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/shared/types/domain";

/** Cliente para Server Components, Server Actions y Route Handlers. */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el middleware ya refresca la sesión.
        }
      },
    },
  });
}

/** Memoizado por request: layouts y páginas que lo llamen comparten una sola consulta. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await getServerSupabase();
  // getClaims() verifica la firma del JWT. Con claves asimétricas (JWT Signing Keys) lo hace
  // localmente, sin ir al servidor de Auth; con la clave antigua equivale a getUser().
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, role, customer_id, is_active")
    .eq("id", userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
});
