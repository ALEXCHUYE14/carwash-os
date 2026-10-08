"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, Boxes, MessageCircleWarning, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { unwrap } from "@/shared/lib/errors";
import { relativeTime } from "@/shared/lib/format";
import { qk } from "@/shared/lib/query-keys";
import { getSupabase } from "@/shared/lib/supabase/client";
import { uniqueTopic } from "@/shared/lib/realtime";
import { cn } from "@/shared/lib/utils";
import type { AppNotification } from "@/shared/types/domain";
import { Button } from "@/shared/ui/button";

const ICONS: Record<string, typeof Bell> = {
  stock_critical: Boxes,
  cash_difference: Wallet,
  wa_failed: MessageCircleWarning,
};

export function NotificationBell() {
  const supabase = getSupabase();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data = [] } = useQuery({
    queryKey: qk.notifications,
    queryFn: async () =>
      unwrap(
        await supabase
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30),
      ) as AppNotification[],
  });

  // Realtime: RLS filtra qué notificaciones llegan a cada rol
  useEffect(() => {
    const channel = supabase
      .channel(uniqueTopic("notifications-feed"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        const n = payload.new as AppNotification;
        toast.warning(n.title, { description: n.body ?? undefined });
        void qc.invalidateQueries({ queryKey: qk.notifications });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, qc]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = data.filter((n) => !n.read_at);

  const markAllRead = async () => {
    if (!unread.length) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in(
        "id",
        unread.map((n) => n.id),
      );
    void qc.invalidateQueries({ queryKey: qk.notifications });
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label="Notificaciones">
        <Bell />
        {unread.length > 0 && (
          <span className="absolute top-2 right-2 grid min-w-4 place-items-center rounded-full bg-rose px-1 text-[10px] leading-4 font-bold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-line-strong bg-surface-2 shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Alertas</p>
            <button className="text-xs font-semibold text-cyan hover:underline" onClick={markAllRead}>
              Marcar todo como leído
            </button>
          </div>
          <ul className="scrollbar-thin max-h-[60dvh] overflow-y-auto">
            {data.length === 0 && <li className="px-4 py-10 text-center text-sm text-fg-subtle">Sin alertas</li>}
            {data.map((n) => {
              const Icon = ICONS[n.type] ?? AlertTriangle;
              return (
                <li key={n.id} className={cn("flex gap-3 border-b border-line px-4 py-3 last:border-0", !n.read_at && "bg-amber-soft/40")}>
                  <Icon className="mt-0.5 size-4 shrink-0 text-amber" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-fg-muted">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-fg-subtle">{relativeTime(n.created_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
