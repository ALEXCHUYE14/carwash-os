import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SessionProvider } from "@/features/auth/hooks/use-session";
import { homeFor, isStaff } from "@/features/auth/lib/rbac";
import { AppShell } from "@/features/shell/components/app-shell";
import { getCurrentProfile } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) redirect("/login?error=inactive");
  if (!isStaff(profile.role)) redirect(homeFor(profile.role));

  return (
    <SessionProvider profile={profile}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
