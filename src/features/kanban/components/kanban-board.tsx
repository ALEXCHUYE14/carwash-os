"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useSession } from "@/features/auth/hooks/use-session";
import { haptic, useNow } from "@/shared/hooks/use-now";
import { STATUS_META } from "@/shared/lib/labels";
import { cn, normalizePlate } from "@/shared/lib/utils";
import type { KanbanCard, OrderStatus } from "@/shared/types/domain";
import { Badge, Skeleton } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { useBoard, useBoardRealtime, useMoveOrder } from "../hooks/use-board";
import { BOARD_COLUMNS, COLUMN_ACCENT } from "../lib/status-flow";
import { liveSla, OrderCard } from "./order-card";
import { OrderDetailSheet } from "./order-detail-sheet";

function DraggableCard({ card, onOpen }: { card: KanbanCard; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, data: { card } });
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.35 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="touch-manipulation"
    >
      <OrderCard card={card} onOpen={onOpen} />
    </motion.div>
  );
}

function Column({
  status,
  cards,
  onOpen,
  disabled,
}: {
  status: OrderStatus;
  cards: KanbanCard[];
  onOpen: (c: KanbanCard) => void;
  disabled?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled });
  const now = useNow(60_000);
  const late = cards.filter((c) => liveSla(c, now).state === "overdue").length;
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-[280px] shrink-0 flex-col rounded-2xl border bg-surface/60 transition-colors min-[1700px]:w-auto min-[1700px]:min-w-0 min-[1700px]:flex-1",
        isOver ? "border-cyan/60 bg-cyan-soft/40" : "border-line",
        disabled && "opacity-60",
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", COLUMN_ACCENT[status])} />
          <h2 className="text-[13px] font-semibold">{STATUS_META[status].short}</h2>
          <span className="rounded-md bg-surface-3 px-1.5 text-xs font-bold text-fg-muted tabular">{cards.length}</span>
        </div>
        {late > 0 && <Badge tone="rose">{late} tarde</Badge>}
      </header>
      <div className="scrollbar-thin flex min-h-32 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-3">
        <AnimatePresence initial={false}>
          {cards.map((c) => (
            <DraggableCard key={c.id} card={c} onOpen={() => onOpen(c)} />
          ))}
        </AnimatePresence>
        {cards.length === 0 && (
          <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-line py-8 text-xs text-fg-subtle">
            Arrastra aquí
          </div>
        )}
      </div>
    </section>
  );
}

export function KanbanBoard() {
  useBoardRealtime();
  const { data: cards = [], isLoading } = useBoard();
  const move = useMoveOrder();
  const { isOperator } = useSession();
  const [active, setActive] = useState<KanbanCard | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return cards;
    const plate = normalizePlate(q);
    return cards.filter(
      (c) =>
        (plate !== "" && c.plate.includes(plate)) ||
        (c.customer_name ?? "").toLowerCase().includes(q) ||
        c.order_number.toLowerCase().includes(q),
    );
  }, [cards, filter]);

  const byStatus = useMemo(() => {
    const map = new Map<OrderStatus, KanbanCard[]>();
    BOARD_COLUMNS.forEach((s) => map.set(s, []));
    filtered.forEach((c) => map.get(c.status)?.push(c));
    return map;
  }, [filtered]);

  const selected = cards.find((c) => c.id === selectedId) ?? null;

  const onDragStart = (e: DragStartEvent) => {
    haptic(10);
    setActive((e.active.data.current as { card: KanbanCard }).card);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const card = (e.active.data.current as { card: KanbanCard } | undefined)?.card;
    const to = e.over?.id as OrderStatus | undefined;
    if (!card || !to || to === card.status) return;
    haptic([10, 40, 10]);
    move.mutate({ id: card.id, status: to });
  };

  const now = useNow(30_000);
  const late = cards.filter((c) => liveSla(c, now).state === "overdue").length;
  const inProcess = cards.filter((c) => !["ready", "delivered", "cancelled"].includes(c.status)).length;
  const ready = byStatus.get("ready")?.length ?? 0;

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col gap-4 lg:h-[calc(100dvh-7rem)]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar placa, cliente u orden" className="pl-10" />
        </div>
        <div className="flex gap-2">
          <Badge tone="cyan" dot>
            {inProcess} en proceso
          </Badge>
          <Badge tone="emerald" dot>
            {ready} listos
          </Badge>
          {late > 0 && (
            <Badge tone="rose" dot>
              {late} retrasados
            </Badge>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {BOARD_COLUMNS.map((s) => (
            <Skeleton key={s} className="h-96 w-[280px] shrink-0 min-[1700px]:flex-1" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
          <div className="scrollbar-thin -mx-4 flex flex-1 snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            {BOARD_COLUMNS.map((s) => (
              <Column
                key={s}
                status={s}
                cards={byStatus.get(s) ?? []}
                onOpen={(c) => setSelectedId(c.id)}
                disabled={isOperator && s === "delivered"}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2,0,0,1)" }}>
            {active ? <OrderCard card={active} dragging className="w-[280px]" /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <OrderDetailSheet card={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
