"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, LifeBuoy, Lock, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type KeyboardEvent, useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { homeFor } from "@/features/auth/lib/rbac";
import { getSupabase } from "@/shared/lib/supabase/client";
import type { UserRole } from "@/shared/types/domain";
import { SUPPORT_WHATSAPP_DISPLAY, supportWhatsappUrl } from "@/shared/lib/support";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

const schema = z.object({
  // trim antes de validar: el autocompletado del celular suele añadir un espacio al final
  email: z.string().trim().toLowerCase().pipe(z.email("Correo inválido")),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});
type Values = z.infer<typeof schema>;

/** Solo rutas internas: evita que ?next=https://sitio-malicioso redirija fuera del sistema. */
function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value === "/" || value.startsWith("/login")) return null;
  return value;
}

function translateAuthError(message: string): string {
  if (message === "Invalid login credentials") return "Correo o contraseña incorrectos.";
  if (message === "Email not confirmed") return "Tu correo aún no está confirmado. Revisa tu bandeja de entrada.";
  if (/rate limit|too many/i.test(message)) return "Demasiados intentos. Espera un momento y vuelve a intentarlo.";
  if (/fetch|network/i.test(message)) return "Sin conexión con el servidor. Revisa tu internet.";
  return message;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const detectCapsLock = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "inactive"
      ? "Tu usuario no tiene un rol activo. Contacta a gerencia o a soporte."
      : params.get("error") === "link"
        ? "El enlace del correo expiró o ya fue usado. Solicita uno nuevo."
        : params.get("error") === "session"
          ? "Tu sesión expiró o se cerró en otro dispositivo. Vuelve a ingresar."
          : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
  // Mantiene el botón en "Ingresando…" hasta que la pantalla de destino termine de cargar
  // (antes se reactivaba al instante y parecía que no pasaba nada, invitando a un 2.º clic).
  const [navigating, startNavigation] = useTransition();
  const [redirecting, setRedirecting] = useState(false);
  const { register, handleSubmit, formState, getValues, trigger } = useForm<Values>({ resolver: zodResolver(schema) });

  const forgotPassword = async () => {
    setError(null);
    setNotice(null);
    if (!(await trigger("email"))) return;
    setSendingReset(true);
    try {
      const { error: err } = await getSupabase().auth.resetPasswordForEmail(getValues("email").trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/auth/confirm?next=/auth/set-password`,
      });
      if (err) return setError(translateAuthError(err.message));
      setNotice("Si el correo está registrado, recibirás un enlace para crear una nueva contraseña.");
    } catch (e) {
      setError(translateAuthError(e instanceof Error ? e.message : "No se pudo enviar el enlace."));
    } finally {
      setSendingReset(false);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    if (redirecting) return;
    setError(null);
    try {
      const sb = getSupabase();
      const { data, error: err } = await sb.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (err || !data.user) {
        setError(translateAuthError(err?.message ?? "No se pudo iniciar sesión."));
        return;
      }

      // Se va DIRECTO a la pantalla del rol (sin pasar por "/", que costaba una redirección más).
      // La consulta va del navegador a Supabase y la protege RLS (cada usuario solo lee su perfil).
      const { data: profile, error: profileError } = await sb
        .from("profiles")
        .select("role, is_active")
        .eq("id", data.user.id)
        .maybeSingle<{ role: UserRole; is_active: boolean }>();

      // Sin perfil o desactivado: el sistema lo devolvería al login; se informa y se cierra la sesión.
      // (Si la consulta falló por red, no se concluye nada: "/" deja que el servidor decida.)
      if (!profileError && (!profile || !profile.is_active)) {
        await sb.auth.signOut();
        setError(
          profile
            ? "Tu usuario está desactivado. Contacta a gerencia o a soporte."
            : "Tu usuario no tiene un perfil asignado. Contacta a soporte.",
        );
        return;
      }

      const destination = safeNext(params.get("next")) ?? (profile ? homeFor(profile.role) : "/");
      setRedirecting(true);
      // Sin router.refresh(): la ruta de destino es dinámica y se renderiza fresca una sola vez
      // (antes se pedía dos veces al servidor).
      startNavigation(() => router.replace(destination));
    } catch (e) {
      setRedirecting(false);
      setError(translateAuthError(e instanceof Error ? e.message : "Ocurrió un error inesperado."));
    }
  });

  // Red de seguridad: si la navegación terminó y seguimos en el login (p. ej. el servidor lo devolvió),
  // el botón se reactiva en vez de quedarse en "Ingresando…".
  useEffect(() => {
    if (navigating || !redirecting) return;
    const t = setTimeout(() => setRedirecting(false), 1500);
    return () => clearTimeout(t);
  }, [navigating, redirecting]);

  const busy = formState.isSubmitting || navigating || redirecting;

  return (
    <div className="w-full max-w-[380px]">
      <div className="flex items-center gap-3">
        <BrandLogo priority className="h-11 w-[60px] rounded-xl" />
        <div className="leading-tight">
          <p className="text-[15px] font-bold tracking-tight">CarWash OS</p>
          <p className="text-xs text-fg-subtle">Car Wash & Auto Detailing</p>
        </div>
      </div>

      <h1 className="mt-9 text-[1.75rem] font-bold leading-tight tracking-[-0.02em]">Inicia sesión</h1>
      <p className="mt-1.5 text-[15px] text-fg-muted">Usa el correo y la contraseña que te asignó gerencia.</p>

      {error && (
        <div role="alert" className="mt-6 flex gap-2.5 rounded-xl border border-rose/25 bg-rose-soft px-3.5 py-3 text-sm text-rose">
          <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="mt-6 flex gap-2.5 rounded-xl border border-emerald/25 bg-emerald-soft px-3.5 py-3 text-sm text-emerald">
          <CheckCircle2 className="mt-px size-4 shrink-0" aria-hidden />
          <span>{notice}</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-semibold text-fg">
            Correo electrónico
          </label>
          <div className="relative">
            <Mail aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              placeholder="nombre@empresa.com"
              className="h-12 pl-11"
              aria-invalid={!!formState.errors.email}
              aria-describedby={formState.errors.email ? "email-error" : undefined}
              {...register("email")}
            />
          </div>
          {formState.errors.email && (
            <p id="email-error" className="text-xs font-medium text-rose">
              {formState.errors.email.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="text-sm font-semibold text-fg">
              Contraseña
            </label>
            <button
              type="button"
              onClick={forgotPassword}
              disabled={sendingReset}
              className="text-[13px] font-semibold text-cyan underline-offset-4 hover:underline disabled:opacity-50"
            >
              {sendingReset ? "Enviando enlace…" : "¿La olvidaste?"}
            </button>
          </div>
          <div className="relative">
            <Lock aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              className="h-12 pl-11 pr-12"
              aria-invalid={!!formState.errors.password}
              aria-describedby={formState.errors.password ? "password-error" : capsLock ? "caps-warning" : undefined}
              onKeyDown={detectCapsLock}
              onKeyUp={detectCapsLock}
              {...register("password", { onBlur: () => setCapsLock(false) })}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-fg-subtle transition-colors hover:text-fg"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
            </button>
          </div>
          {formState.errors.password ? (
            <p id="password-error" className="text-xs font-medium text-rose">
              {formState.errors.password.message}
            </p>
          ) : capsLock ? (
            <p id="caps-warning" className="text-xs font-medium text-amber">
              Bloq Mayús está activado
            </p>
          ) : null}
        </div>

        <Button type="submit" size="lg" loading={busy} className="mt-2 h-12 w-full">
          {redirecting ? "Ingresando…" : (
            <>
              Ingresar
              <ArrowRight aria-hidden />
            </>
          )}
        </Button>
      </form>

      <div className="mt-8 flex items-center gap-3 border-t border-line pt-5 text-[13px] text-fg-muted">
        <LifeBuoy className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <span>
          ¿No puedes acceder?{" "}
          <a
            href={supportWhatsappUrl()}
            target="_blank"
            rel="noopener noreferrer"
            title={`WhatsApp ${SUPPORT_WHATSAPP_DISPLAY}`}
            className="font-semibold text-emerald underline-offset-4 hover:underline"
          >
            Escribe a soporte
          </a>
        </span>
      </div>
    </div>
  );
}
