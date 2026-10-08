import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { canAccess, homeFor, ROUTE_ROLES, STAFF_ROLES } from "@/features/auth/lib/rbac";
import type { UserRole } from "@/shared/types/domain";

const PUBLIC_PREFIXES = ["/login", "/seguimiento", "/t/", "/auth"];

/** Cookie con el rol ya resuelto: evita consultar `profiles` en cada navegación. */
const ROLE_COOKIE = "cw_role";
const ROLE_COOKIE_MAX_AGE = 300; // 5 min: cambios de rol/estado se reflejan como máximo en este plazo
const KNOWN_ROLES: readonly UserRole[] = [...STAFF_ROLES, "customer"];

/**
 * 1) Refresca los tokens de sesión de Supabase (cookies).
 * 2) Protege las rutas según rol (RBAC). La seguridad real está en RLS y en el layout del staff;
 *    esto solo evita mostrar pantallas a quien no corresponde.
 *
 * Rendimiento: `getClaims()` valida el JWT localmente (sin ir al servidor de Auth cuando el proyecto
 * usa claves asimétricas) y el rol se cachea en una cookie httpOnly ligada al id del usuario.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return new NextResponse(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local. Agrégalas y reinicia `npm run dev`.",
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const isProtected =
    pathname === "/" ||
    pathname.startsWith("/mi-cuenta") ||
    ROUTE_ROLES.some((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));

  // Páginas públicas (seguimiento, ticket, /auth) y rutas desconocidas no consultan Supabase:
  // cada llamada evitada es una línea menos en los logs del proyecto.
  if (pathname !== "/login" && (isPublic || !isProtected)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = (claimsData?.claims?.sub as string | undefined) ?? null;

  // Redirecciones que conservan las cookies de sesión recién refrescadas.
  const redirectTo = (pathnameTo: string, search = "") => {
    const target = request.nextUrl.clone();
    target.pathname = pathnameTo;
    target.search = search;
    const res = NextResponse.redirect(target);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!userId) {
    if (request.cookies.has(ROLE_COOKIE)) response.cookies.delete(ROLE_COOKIE);
    if (pathname === "/login") return response;
    return redirectTo("/login", `?next=${encodeURIComponent(pathname)}`);
  }

  const role = await resolveRole(request, response, supabase, userId);

  if (pathname === "/login" || pathname === "/") {
    if (!role) return response;
    return redirectTo(homeFor(role));
  }

  if (pathname.startsWith("/mi-cuenta")) {
    if (role === "customer") return response;
    return redirectTo(role ? homeFor(role) : "/login");
  }

  if (isProtected && !canAccess(role, pathname)) {
    return role ? redirectTo(homeFor(role)) : redirectTo("/login", "?error=inactive");
  }

  return response;
}

async function resolveRole(
  request: NextRequest,
  response: NextResponse,
  supabase: SupabaseClient,
  userId: string,
): Promise<UserRole | null> {
  const cached = request.cookies.get(ROLE_COOKIE)?.value;
  if (cached) {
    const [cachedUser, cachedRole] = cached.split(":");
    if (cachedUser === userId && KNOWN_ROLES.includes(cachedRole as UserRole)) return cachedRole as UserRole;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle<{ role: UserRole; is_active: boolean }>();

  const role = profile?.is_active ? profile.role : null;
  if (role) {
    response.cookies.set(ROLE_COOKIE, `${userId}:${role}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ROLE_COOKIE_MAX_AGE,
    });
  } else if (request.cookies.has(ROLE_COOKIE)) {
    response.cookies.delete(ROLE_COOKIE);
  }
  return role;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)",
      // Las precargas automáticas de <Link> no necesitan pasar por aquí: la navegación real sí pasa.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
