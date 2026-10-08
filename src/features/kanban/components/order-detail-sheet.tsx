"use client";

import { ArrowLeft, ArrowRight, Ban, ExternalLink } from "lucide-react";
import { useState } from "react";
import { InspectionDiagram } from "@/features/check-in/components/inspection-diagram";
import { useBays, useEmployees } from "@/features/catalog/hooks/use-catalog";
import { useSession } from "@/features/auth/hooks/use-session";
import { duration, formatDateTime, formatTime, money } from "@/shared/lib/format";
import { STATUS_META } from "@/shared/lib/labels";
import { displayPlate } from "@/shared/lib/utils";
import type { InspectionMarkInput, KanbanCard, VehicleView } from "@/shared/types/domain";
import { Button } from "@/shared/ui/button";
import { Badge, Skeleton } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";
import { Field, Input, Select } from "@/shared/ui/input";
import { useAssignOrder, useMoveOrder, useOrderDetail } from "../hooks/use-board";
import { nextStatus, prevStatus } from "../lib/status-flow";

export function OrderDetailSheet({ card, onClose }: { card: KanbanCard | null; onClose: () => void }) {
  const { data, isLoading } = useOrderDetail(card?.id ?? null);
  const { data: bays = [] } = useBays();
  const { data: employees = [] } = useEmployees();
  const { isCashierUp, isOperator } = useSession();
  const move = useMoveOrder();
  const assign = useAssignOrder();
  const [view, setView] = useState<VehicleView>("top");
  const [cancelReason, setCancelReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!card) return null;
  const next = nextStatus(card.status);
  const prev = prevStatus(card.status);
  const canGoNext = next && !(isOperator && next === "delivered");
  const marks = (data?.inspection?.car_inspection_marks ?? []) as InspectionMarkInput[];

  return (
    <Dialog
      open={!!card}
      onOpenChange={(o) => !o && onClose()}
      variant="sheet"
      title={`${card.order_number} · ${displayPlate(card.plate)}`}
      description={`${card.customer_name} · ${card.vehicle_label ?? card.vehicle_type}`}
      footer={
        <>
          {prev && card.status !== "ready" && (
            <Button
              variant="secondary"
              size="lg"
              onClick={() => move.mutate({ id: card.id, status: prev, note: "Reproceso" }, { onSuccess: onClose })}
            >
              <ArrowLeft />
            </Button>
          )}
          {canGoNext && next && (
            <Button
              size="lg"
              className="flex-1"
              variant={next === "ready" || next === "delivered" ? "success" : "primary"}
              loading={move.isPending}
              onClick={() => move.mutate({ id: card.id, status: next }, { onSuccess: onClose })}
            >
              {STATUS_META[next].label} <ArrowRight />
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_META[card.status].tone} dot>
            {STATUS_META[card.status].label}
          </Badge>
          <Badge>Ingresó {formatTime(card.received_at)}</Badge>
          {card.sla_due_at && <Badge>Compromiso {formatTime(card.sla_due_at)}</Badge>}
          <Badge>{duration(card.estimated_duration_min)}</Badge>
        </div>

        <section>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase">Servicios</h4>
          {isLoading ? (
            <Skeleton className="h-16" />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {data?.items.map((i) => (
                <li key={i.id} className="flex justify-between">
                  <span className={i.is_addon ? "text-fg-muted" : ""}>{i.is_addon ? `+ ${i.description}` : i.description}</span>
                  <span className="tabular">{money(i.line_total)}</span>
                </li>
              ))}
              <li className="flex justify-between border-t border-line pt-1.5 font-semibold">
                <span>Total</span>
                <span className="tabular">
                  {money(card.total)} {card.balance > 0 && <span className="text-amber">(saldo {money(card.balance)})</span>}
                </span>
              </li>
            </ul>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3">
          <Field label="Bahía">
            <Select
              value={card.bay_id ?? ""}
              onChange={(e) => assign.mutate({ id: card.id, bayId: e.target.value || null })}
            >
              <option value="">—</option>
              {bays.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsable">
            <Select
              value={card.employee_id ?? ""}
              onChange={(e) => assign.mutate({ id: card.id, employeeId: e.target.value || null })}
            >
              <option value="">—</option>
              {employees
                .filter((e) => e.is_active)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
            </Select>
          </Field>
        </section>

        {(marks.length > 0 || data?.inspection?.general_notes) && (
          <section>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase">Daños previos</h4>
            {data?.inspection?.general_notes && <p className="mb-3 text-sm text-fg-muted">{data.inspection.general_notes}</p>}
            {marks.length > 0 && <InspectionDiagram marks={marks} view={view} onViewChange={setView} readOnly />}
          </section>
        )}

        <section>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase">Historial</h4>
          <ol className="space-y-2 border-l border-line pl-4">
            {data?.history.map((h) => (
              <li key={h.id} className="relative text-sm">
                <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-bg bg-cyan" />
                <span className="font-medium">{STATUS_META[h.to_status].label}</span>
                <span className="ml-2 text-xs text-fg-subtle">{formatDateTime(h.changed_at)}</span>
                {h.note && <p className="text-xs text-amber">{h.note}</p>}
              </li>
            ))}
          </ol>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => window.open(`/t/${card.public_token}`, "_blank")}>
            <ExternalLink /> Ticket del cliente
          </Button>
          {isCashierUp && card.status !== "delivered" && (
            <Button variant="ghost" size="sm" className="text-rose" onClick={() => setConfirmCancel((v) => !v)}>
              <Ban /> Anular orden
            </Button>
          )}
        </div>
        {confirmCancel && (
          <div className="space-y-2 rounded-xl border border-rose/30 bg-rose-soft p-3">
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Motivo de anulación" />
            <Button
              variant="danger"
              size="sm"
              disabled={cancelReason.trim().length < 3}
              loading={move.isPending}
              onClick={() => move.mutate({ id: card.id, status: "cancelled", note: cancelReason }, { onSuccess: onClose })}
            >
              Confirmar anulación
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
