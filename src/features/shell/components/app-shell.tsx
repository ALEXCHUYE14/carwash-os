"use client";

import {
  BarChart3,
  Boxes,
  CalendarClock,
  Car,
  ClipboardPlus,
  KanbanSquare,
  LogOut,
  MessageCircle,
  Receipt,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { NAV_ITEMS, ROLE_LABEL, type NavIcon } from "@/features/auth/lib/rbac";
import { useSession } from "@/features/auth/hooks/use-session";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { getSupabase } from "@/shared/lib/supabase/client";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { cn, initials } from "@/shared/lib/utils";

const ICONS: Record<NavIcon, LucideIcon> = {
  board: KanbanSquare,
  checkin: ClipboardPlus,
  car: Car,
  cash: Wallet,
  expenses: Receipt,
  inventory: Boxes,
  customers: Users,
  calendar: CalendarClock,
  whatsapp: MessageCircle,
  reports: BarChart3,
  settings: Settings,
};

export function AppShell({ children }: { children: ReactNode }) {
  const { profile } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV_ITEMS.filter((i) => i.roles.includes(profile.role));
  const mobileItems = items.filter((i) => i.mobile).slice(0, 5);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const signOut = async () => {
    await getSupabase().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* ---------- Sidebar (desktop / tablet horizontal) ---------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <BrandLogo className="h-10 w-[54px]" />
          <span className="font-bold tracking-tight">CarWash OS</span>
        </div>
        <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                  active ? "bg-cyan-soft text-cyan" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <Icon className="size-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="grid size-9 place-items-center rounded-full bg-surface-3 text-xs font-bold">
              {initials(profile.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{profile.full_name || profile.email}</p>
              <p className="text-xs text-fg-subtle">{ROLE_LABEL[profile.role]}</p>
            </div>
            <button
              onClick={signOut}
              className="grid size-9 place-items-center rounded-lg text-fg-subtle hover:bg-surface-2 hover:text-rose"
              aria-label="Cerrar sesión"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ---------- Top bar ---------- */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-2.5 lg:hidden">
          <BrandLogo className="h-10 w-[54px]" />
          <span className="font-bold tracking-tight">CarWash OS</span>
        </div>
        <div className="hidden text-sm text-fg-subtle lg:block">
          {items.find((i) => isActive(i.href))?.label ?? ""}
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            onClick={signOut}
            className="grid size-11 place-items-center rounded-xl text-fg-subtle hover:bg-surface-2 hover:text-rose lg:hidden"
            aria-label="Cerrar sesión"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-4 pt-5 pb-28 sm:px-6 lg:pb-10">{children}</main>

      {/* ---------- Bottom nav (móvil) ---------- */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pt-1.5 backdrop-blur-md lg:hidden">
        <ul className="mx-auto flex max-w-lg">
          {mobileItems.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                    active ? "text-cyan" : "text-fg-subtle",
                  )}
                >
                  <Icon className="size-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
