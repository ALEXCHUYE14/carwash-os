"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { getSupabase } from "@/shared/lib/supabase/client";
import { supportWhatsappUrl } from "@/shared/lib/support";
import { Button } from "@/shared/ui/button";
import { Field, Input } from "@/shared/ui/input";

/** Primer ingreso (invitación) o recuperación: el usuario ya tiene sesión gracias al enlace del correo. */
export function SetPasswordForm() {
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    const init = async () => {
      // Enlaces con tokens en el fragmento (plantilla de correo por defecto de Supabase)
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        await sb.auth.setSession({ access_token, refresh_token });
        window.history.replaceState(null, "", window.location.pathname);
      }
      const { data } = await sb.auth.getUser();
      setHasSession(!!data.user);
    };
    void init();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    setSaving(true);
    const { error: err } = await getSupabase().auth.updateUser({ password });
    setSaving(false);
    if (err) return setError(err.message);
    toast.success("Contraseña guardada");
    router.replace("/");
    router.refresh();
  };

  return (
    <div className="w-full max-w-[400px] rounded-2xl border border-line bg-surface p-7 shadow-lg sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-cyan text-white">
          <KeyRound className="size-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight">Crea tu contraseña</h1>
          <p className="text-[13px] text-fg-subtle">La usarás para ingresar a CarWash OS</p>
        </div>
      </div>

      {hasSession === false ? (
        <div className="space-y-4 text-sm">
          <p className="rounded-xl border border-amber/30 bg-amber-soft px-3 py-2 text-amber">
            El enlace expiró o ya fue usado. Pide una nueva invitación o usa “¿Olvidaste tu contraseña?” en el login.
          </p>
          <Link href="/login" className="block text-center font-semibold text-cyan hover:underline">
            Volver al login
          </Link>
          <a
            href={supportWhatsappUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-fg-muted hover:text-fg"
          >
            Contactar con soporte
          </a>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label="Nueva contraseña" hint="Mínimo 8 caracteres" htmlFor="pw">
            <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Repite la contraseña" htmlFor="pw2">
            <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && (
            <p role="alert" className="rounded-xl border border-rose/30 bg-rose-soft px-3 py-2 text-sm text-rose">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" loading={saving} disabled={hasSession === null}>
            Guardar y entrar
          </Button>
        </form>
      )}
    </div>
  );
}
