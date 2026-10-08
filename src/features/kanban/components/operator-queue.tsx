"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCheck, Droplets } from "lucide-react";
import { animate, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { useMemo, useState } from "react";
import { useSession } from "@/features/auth/hooks/use-session";
import { haptic } from "@/shared/hooks/use-now";
import { getSupabase } from "@/shared/lib/supabase/client";
import { STATUS_META } from "@/shared/lib/labels";
import { cn } from "@/shared/lib/utils";
import type { KanbanCard } from "@/shared/types/domain";
import { Button } from "@/shared/ui/button";
import { EmptyState, Skeleton } from "@/shared/ui/card";
import { Segmented } from "@/shared/ui/segmented";
import { useBoard, useBoardRealtime, useMoveOrder } from "../hooks/use-board";
import { nextStatus, prevStatus } from "../lib/status-flow";
import { OrderCard } from "./order-card";

const SWIPE_THRESHOLD = 110;

function SwipeCard({ card }: { card: KanbanCard }) {
  const move = useMoveOrder();
  const x = useMotionValue(0);
  const next = nextStatus(card.status);
  const prev = prevStatus(card.status);
  const canNext = !!next && next !== "delivered";
  const nextOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1]);
  const prevOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0]);

  const go = (dir: 1 | -1) => {
    const to = dir === 1 ? next : prev;
    if (!to || (dir === 1 && !canNext)) return;
    haptic([12, 30, 12]);
    move.mutate({ id: card.id, status: to, note: dir === -1 ? "Reproceso" : undefined });
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE_THRESHOLD && canNext) go(1);
    else if (info.offset.x < -SWIPE_THRESHOLD && prev) go(-1);
    void animate(x, 0, { type: "spring", bounce: 0.25, duration: 0.4 });
  };

  return (
    <div>
      <div className="relative">
      {/* Fondo revelado al deslizar (solo detrás de la tarjeta, no de los botones) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between rounded-xl px-5">
        <motion.span style={{ opacity: prevOpacity }} className="flex items-center gap-2 text-sm font-bold text-amber">
          <ArrowLeft className="size-5" /> {prev ? STATUS_META[prev].short : ""}
        </motion.span>
        <motion.span style={{ opacity: nextOpacity }} className="flex items-center gap-2 text-sm font-bold text-emerald">
          {next ? STATUS_META[next].short : ""} <ArrowRight className="size-5" />
        </motion.span>
      </div>
      <motion.div
        drag="x"
        style={{ x }}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        onDragEnd={onDragEnd}
        className="relative touch-pan-y"
      >
        <OrderCard card={card} className="bg-surface-2 p-4" />
      </motion.div>
      </div>
      <div className="mt-2 grid grid-cols-[56px_1fr] gap-2">
        <Button
          variant="secondary"
          size="xl"
          disabled={!prev || move.isPending}
          onClick={() => go(-1)}
          aria-label="Retroceder etapa"
          className="px-0"
        >
          <ArrowLeft />
        </Button>
        <Button
          size="xl"
          variant={next === "ready" ? "success" : "primary"}
          disabled={!canNext}
          loading={move.isPending}
          onClick={() => go(1)}
        >
          {canNext && next ? (
            <>
              {STATUS_META[next].label} <ArrowRight />
            </>
          ) : (
            <>
              <CheckCheck /> Esperando entrega
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function OperatorQueue() {
  useBoardRealtime();
  const { profile } = useSession();
  const { data: cards = [], isLoading } = useBoard();
  const [scope, setScope] = useState<"mine" | "all">("mine");

  const { data: me } = useQuery({
    queryKey: ["me-employee", profile.id],
    queryFn: async () => {
      const { data } = await getSupabase().from("employees").select("id").eq("profile_id", profile.id).maybeSingle();
      return (data as { id: string } | null)?.id ?? null;
    },
  });

  const list = useMemo(
    () =>
      cards
        .filter((c) => !["delivered", "cancelled"].includes(c.status))
        .filter((c) => scope === "all" || !me || c.employee_id === me || c.employee_id === null)
        .sort((a, b) => (a.sla_due_at ?? "").localeCompare(b.sla_due_at ?? "")),
    [cards, scope, me],
  );

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Mis autos</h1>
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: "mine", label: "Míos" },
            { value: "all", label: "Todos" },
          ]}
        />
      </div>
      <p className="mb-5 text-[13px] text-fg-subtle">Desliza a la derecha para avanzar, a la izquierda para reprocesar.</p>

      {isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={<Droplets />} title="Sin autos pendientes" description="Cuando recepción registre un ingreso aparecerá aquí." />
      ) : (
        <ul className="space-y-6">
          {list.map((c) => (
            <li key={c.id} className={cn(c.status === "ready" && "opacity-70")}>
              <SwipeCard card={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
