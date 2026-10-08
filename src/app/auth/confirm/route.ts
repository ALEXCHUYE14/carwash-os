import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/shared/lib/supabase/server";

/** Solo rutas internas como destino. */
function safeNext(value: string | null, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

/**
 * Destino de los enlaces de correo de Supabase (invitación de personal y recuperación de contraseña).
 * Acepta los dos formatos: `?token_hash=…&type=…` (plantilla de correo recomendada) y `?code=…` (PKCE).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const needsPassword = type === "invite" || type === "recovery";
  const next = safeNext(searchParams.get("next"), needsPassword ? "/auth/set-password" : "/");

  // Plantilla de correo por defecto: los tokens llegan en el fragmento (#access_token=…), que el
  // servidor no ve. El navegador conserva el fragmento al redirigir y la página lo procesa.
  if (!tokenHash && !code) {
    return NextResponse.redirect(new URL(safeNext(searchParams.get("next"), "/auth/set-password"), origin));
  }

  const supabase = await getServerSupabase();
  let ok = false;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  return NextResponse.redirect(new URL(ok ? next : "/login?error=link", origin));
}
