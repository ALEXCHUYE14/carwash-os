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
import { useEffect, useRef, useState, type ReactNode } from "react";
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

  const [signingOut, setSigningOut] = useState(false);
  const currentLabel = items.find((i) => isActive(i.href))?.label ?? "";

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await getSupabase().auth.signOut();
    } finally {
      // Aunque falle la red, se sale al login: el middleware no deja entrar sin sesión válida.
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    // overflow-x-clip: ningún elemento ancho puede crear scroll horizontal (y no rompe el sticky)
    <div className="min-h-dvh overflow-x-clip lg:pl-64">
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

      {/* ---------- Top bar ----------
          Fondo sólido (no translúcido) y ancho completo; respeta el notch/barra de estado del iPhone
          (viewportFit: "cover") con safe-area-inset-top. */}
      <header className="sticky top-0 z-30 w-full border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] shadow-[0_1px_2px_rgb(30_36_34/0.04)] backdrop-blur-md supports-[backdrop-filter]:bg-surface/85">
        <div className="flex h-14 items-center justify-between gap-2 px-3 sm:h-16 sm:px-6">
          {/* Marca + sección actual (móvil / tablet vertical) */}
          <Link href={items[0]?.href ?? "/"} className="flex min-w-0 items-center gap-2.5 lg:hidden" aria-label="Inicio">
            <BrandLogo priority className="h-9 w-12 rounded-lg sm:h-10 sm:w-[54px] sm:rounded-xl" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[15px] font-bold tracking-tight">CarWash OS</span>
              {currentLabel && <span className="truncate text-xs font-medium text-fg-subtle">{currentLabel}</span>}
            </span>
          </Link>
          {/* Desktop: título de la sección */}
          <p className="hidden truncate text-sm font-semibold text-fg-muted lg:block">{currentLabel}</p>

          <div className="flex shrink-0 items-center gap-0.5">
            <NotificationBell />
            <UserMenu name={profile.full_name || profile.email || ""} role={ROLE_LABEL[profile.role]} onSignOut={signOut} signingOut={signingOut} />
          </div>
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

/** Menú del usuario (móvil / tablet vertical): evita cerrar sesión por un toque accidental. */
function UserMenu({
  name,
  role,
  onSignOut,
  signingOut,
}: {
  name: string;
  role: string;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menú de usuario"
        className="grid size-11 place-items-center rounded-xl hover:bg-surface-2"
      >
        <span className="grid size-8 place-items-center rounded-full bg-cyan text-xs font-bold text-white">
          {initials(name)}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-40 mt-2 w-64 max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold">{name || "Usuario"}</p>
            <p className="text-xs text-fg-subtle">{role}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={onSignOut}
            disabled={signingOut}
            className="flex h-12 w-full items-center gap-3 px-4 text-sm font-medium text-rose hover:bg-rose-soft disabled:opacity-50"
          >
            <LogOut className="size-4" />
            {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </div>
      )}
    </div>
  );
}
