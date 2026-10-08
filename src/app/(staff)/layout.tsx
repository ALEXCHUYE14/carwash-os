import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SessionProvider } from "@/features/auth/hooks/use-session";
import { isStaff } from "@/features/auth/lib/rbac";
import { AppShell } from "@/features/shell/components/app-shell";
import { getCurrentProfile } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentProfile();
  // Nunca redirigir a una ruta que el middleware pueda devolver aquí (bucle):
  // "/login?error=…" muestra el login sin rebotar y "/" recalcula el rol desde la BD.
  if (!profile) redirect("/login?error=session");
  if (!profile.is_active) redirect("/login?error=inactive");
  if (!isStaff(profile.role)) redirect("/");

  return (
    <SessionProvider profile={profile}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
