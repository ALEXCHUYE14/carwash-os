"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { homeFor } from "@/features/auth/lib/rbac";
import { getSupabase } from "@/shared/lib/supabase/client";
import type { UserRole } from "@/shared/types/domain";
import { SUPPORT_WHATSAPP_DISPLAY, supportWhatsappUrl } from "@/shared/lib/support";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { Button } from "@/shared/ui/button";
import { Field, Input } from "@/shared/ui/input";

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
    <div className="w-full max-w-[400px]">
      <div className="rounded-2xl border border-white/40 bg-surface/95 p-7 shadow-2xl backdrop-blur-md sm:p-8">
        <div className="mb-7 flex items-center gap-3">
          <BrandLogo priority className="h-14 w-[76px] rounded-2xl shadow-sm" />
          <div>
            <h1 className="text-lg font-bold tracking-tight">CarWash OS</h1>
            <p className="text-[13px] text-fg-subtle">Ingresa con tu cuenta de personal</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="Correo" error={formState.errors.email?.message} htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoFocus
              aria-invalid={!!formState.errors.email}
              {...register("email")}
            />
          </Field>
          <Field label="Contraseña" error={formState.errors.password?.message} htmlFor="password">
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="pr-11"
                aria-invalid={!!formState.errors.password}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-fg-subtle hover:text-fg"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>
          <button
            type="button"
            onClick={forgotPassword}
            disabled={sendingReset}
            className="-mt-1 self-end text-xs font-semibold text-cyan hover:underline disabled:opacity-50"
          >
            {sendingReset ? "Enviando enlace…" : "¿Olvidaste tu contraseña?"}
          </button>
          {error && (
            <p role="alert" className="rounded-xl border border-rose/30 bg-rose-soft px-3 py-2 text-sm text-rose">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-xl border border-emerald/30 bg-emerald-soft px-3 py-2 text-sm text-emerald">
              {notice}
            </p>
          )}
          <Button type="submit" size="lg" loading={busy} className="mt-1">
            {redirecting ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2.5 text-center">
          <p className="inline-flex items-center gap-1.5 text-[13px] text-[#5b7c99]">
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            Acceso exclusivo del personal autorizado
          </p>
          <a
            href={supportWhatsappUrl()}
            target="_blank"
            rel="noopener noreferrer"
            title={`WhatsApp ${SUPPORT_WHATSAPP_DISPLAY}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-[15px] font-medium text-[#14805e] underline-offset-4 transition-colors hover:text-[#0f6b4e] hover:underline"
          >
            ¿Problemas para acceder? Contactar soporte
          </a>
        </div>
      </div>

      <p className="mt-5 text-center text-[13px] text-white/85">
        ¿Eres cliente?{" "}
        <a href="/seguimiento" className="font-semibold text-white underline-offset-2 hover:underline">
          Sigue tu vehículo por placa
        </a>
      </p>
    </div>
  );
}
