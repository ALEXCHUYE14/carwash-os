"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { errorMessage, unwrap } from "@/shared/lib/errors";
import { qk } from "@/shared/lib/query-keys";
import { getSupabase } from "@/shared/lib/supabase/client";
import { uniqueTopic } from "@/shared/lib/realtime";
import type { KanbanCard, OrderStatus, WorkOrder } from "@/shared/types/domain";
import { STATUS_META } from "@/shared/lib/labels";

export function useBoard() {
  return useQuery({
    queryKey: qk.board,
    refetchInterval: 5 * 60_000, // red de seguridad si se cae el websocket (los cambios llegan por Realtime)
    queryFn: async () =>
      unwrap(await getSupabase().from("v_kanban_board").select("*").order("received_at")) as KanbanCard[],
  });
}

/** Suscripción Realtime: cualquier cambio en work_orders refresca el tablero (RLS aplica). */
export function useBoardRealtime() {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const sb = getSupabase();
    const channel = sb
      .channel(uniqueTopic("board-work-orders"))
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, () => {
        // agrupa ráfagas (un check-in dispara varios UPDATE seguidos)
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void qc.invalidateQueries({ queryKey: qk.board }), 250);
      })
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void sb.removeChannel(channel);
    };
  }, [qc]);
}

/** Mover tarjeta con actualización optimista; si la BD rechaza la transición, se revierte. */
export function useMoveOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: OrderStatus; note?: string }) =>
      unwrap(
        await getSupabase().rpc("move_work_order", { p_order_id: id, p_status: status, p_note: note ?? null }),
      ) as WorkOrder,
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: qk.board });
      const prev = qc.getQueryData<KanbanCard[]>(qk.board);
      qc.setQueryData<KanbanCard[]>(qk.board, (old) =>
        old?.map((c) =>
          c.id === id
            ? {
                ...c,
                status,
                status_label: STATUS_META[status].label,
                status_changed_at: new Date().toISOString(),
                sla_state: status === "ready" || status === "delivered" ? "done" : c.sla_state,
              }
            : c,
        ),
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.board, ctx.prev);
      toast.error(errorMessage(err));
    },
    onSuccess: (order) => {
      if (order.status === "ready") toast.success(`${order.order_number} listo · WhatsApp de retiro en cola`);
      if (order.status === "delivered") toast.success(`${order.order_number} entregado`);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.board }),
  });
}

export function useAssignOrder() {
  const qc = useQueryClient();
  return useMutation({
    // bayId / employeeId: undefined = no tocar · null = quitar la asignación · string = asignar
    mutationFn: async (v: { id: string; bayId?: string | null; employeeId?: string | null }) =>
      unwrap(
        await getSupabase().rpc("assign_work_order", {
          p_order_id: v.id,
          p_bay_id: v.bayId ?? null,
          p_employee_id: v.employeeId ?? null,
          p_clear_bay: v.bayId === null,
          p_clear_employee: v.employeeId === null,
        }),
      ) as WorkOrder,
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.board }),
  });
}

export interface OrderDetail {
  items: { id: string; description: string; is_addon: boolean; quantity: number; line_total: number }[];
  history: { id: number; from_status: OrderStatus | null; to_status: OrderStatus; note: string | null; changed_at: string }[];
  inspection: {
    general_notes: string | null;
    car_inspection_marks: { view: string; x: number; y: number; damage_type: string; severity: number; notes: string | null }[];
  } | null;
}

export function useOrderDetail(id: string | null) {
  return useQuery({
    queryKey: ["order-detail", id],
    enabled: !!id,
    queryFn: async (): Promise<OrderDetail> => {
      const sb = getSupabase();
      const [items, history, inspection] = await Promise.all([
        sb.from("work_order_items").select("id, description, is_addon, quantity, line_total").eq("work_order_id", id!).order("is_addon"),
        sb.from("work_order_status_history").select("id, from_status, to_status, note, changed_at").eq("work_order_id", id!).order("id"),
        sb
          .from("car_inspections")
          .select("general_notes, car_inspection_marks(view, x, y, damage_type, severity, notes)")
          .eq("work_order_id", id!)
          .maybeSingle(),
      ]);
      return {
        items: unwrap(items) as OrderDetail["items"],
        history: unwrap(history) as OrderDetail["history"],
        inspection: unwrap(inspection) as OrderDetail["inspection"],
      };
    },
  });
}
