"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, CheckCircle2, Clock, Droplets, Star } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { formatDateTime, formatTime, money } from "@/shared/lib/format";
import { getSupabase } from "@/shared/lib/supabase/client";
import { cn, displayPlate } from "@/shared/lib/utils";
import type { PublicTicket } from "@/shared/types/domain";
import { Button } from "@/shared/ui/button";
import { Card, CardBody, EmptyState, Skeleton } from "@/shared/ui/card";
import { Textarea } from "@/shared/ui/input";
import { useOrderBroadcast } from "../hooks/use-order-broadcast";
import { StatusStepper } from "./status-stepper";

function NpsForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CheckCircle2 className="size-8 text-emerald" />
        <p className="font-semibold">¡Gracias por tu opinión!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-semibold">¿Qué tan probable es que nos recomiendes?</p>
        <p className="text-xs text-fg-subtle">0 = nada probable · 10 = muy probable</p>
      </div>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }).map((_, i) => (
          <button
            key={i}
            onClick={() => setScore(i)}
            className={cn(
              "h-11 rounded-lg border text-sm font-bold tabular transition-colors",
              score === i
                ? i >= 9
                  ? "border-emerald bg-emerald text-bg"
                  : i >= 7
                    ? "border-amber bg-amber text-bg"
                    : "border-rose bg-rose text-white"
                : "border-line bg-surface-2 text-fg-muted",
            )}
          >
            {i}
          </button>
        ))}
      </div>
      <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="¿Algo que podamos mejorar? (opcional)" className="min-h-[72px]" />
      <Button
        className="w-full"
        size="lg"
        disabled={score === null}
        loading={sending}
        onClick={async () => {
          setSending(true);
          await getSupabase().rpc("portal_submit_nps", { p_token: token, p_score: score, p_comment: comment || null });
          setSending(false);
          setSent(true);
          onDone();
        }}
      >
        <Star /> Enviar calificación
      </Button>
    </div>
  );
}

export function TicketView({ token }: { token: string }) {
  const qc = useQueryClient();
  const params = useSearchParams();
  const key = ["ticket", token];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: t, error } = await getSupabase().rpc("portal_get_ticket", { p_token: token });
      if (error) throw error;
      return (t as PublicTicket | null) ?? null;
    },
  });

  // Estado en vivo vía Broadcast
  useOrderBroadcast(data ? token : null, () => void qc.invalidateQueries({ queryKey: key }));

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (!data) return <EmptyState icon={<Droplets />} title="Ticket no encontrado" description="Verifica el enlace que recibiste por WhatsApp." />;

  const { business, order, vehicle, items, totals, loyalty, nps, customer } = data;
  const showNps = nps.can_submit || params.get("nps") === "1";

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="text-center">
        <p className="text-sm font-semibold text-cyan">{business.name}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Hola, {customer.first_name} 👋</h1>
      </div>

      <Card>
        <CardBody className="space-y-5">
          <div className="flex items-center justify-between">
            <span className="rounded-lg border-2 border-fg bg-fg px-3 py-1 font-mono text-xl font-extrabold tracking-[0.15em] text-bg">
              {displayPlate(vehicle.plate)}
            </span>
            <span className="text-right text-sm">
              <span className="block font-semibold">{order.number}</span>
              <span className="text-xs text-fg-subtle">{vehicle.label}</span>
            </span>
          </div>
          {order.status === "cancelled" ? (
            <p className="rounded-xl bg-rose-soft px-4 py-3 text-sm text-rose">Esta orden fue anulada.</p>
          ) : (
            <StatusStepper status={order.status} />
          )}
          {order.status === "ready" && (
            <p className="rounded-xl bg-emerald-soft px-4 py-3 text-sm font-semibold text-emerald">
              Tu vehículo está listo. ¡Te esperamos{order.bay ? ` en ${order.bay}` : ""}!
            </p>
          )}
          {!["ready", "delivered", "cancelled"].includes(order.status) && order.eta && (
            <p className="flex items-center gap-2 text-sm text-fg-muted">
              <Clock className="size-4 text-cyan" /> Entrega estimada: <b className="text-fg">{formatTime(order.eta)}</b>
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <p className="mb-3 text-xs font-semibold tracking-wide text-fg-subtle uppercase">Detalle del servicio</p>
          <ul className="space-y-2 text-sm">
            {items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-3">
                <span className={i.is_addon ? "text-fg-muted" : ""}>
                  {i.quantity > 1 ? `${i.quantity} × ` : ""}
                  {i.description}
                </span>
                <span className="tabular">{money(i.line_total, totals.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1 border-t border-dashed border-line-strong pt-3 text-sm">
            {totals.discount > 0 && (
              <div className="flex justify-between text-emerald">
                <span>{totals.loyalty_reward ? "Premio de fidelización" : "Descuento"}</span>
                <span className="tabular">−{money(totals.discount, totals.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-fg-subtle">
              <span>
                {totals.tax_name} {totals.prices_include_tax ? "incluido" : ""}
              </span>
              <span className="tabular">{money(totals.tax, totals.currency)}</span>
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="font-semibold">Total</span>
              <span className="text-2xl font-extrabold tabular">{money(totals.total, totals.currency)}</span>
            </div>
            {totals.balance > 0 ? (
              <p className="text-right text-xs font-semibold text-amber">Saldo por pagar: {money(totals.balance, totals.currency)}</p>
            ) : (
              <p className="text-right text-xs font-semibold text-emerald">Pagado ✓</p>
            )}
          </div>
          <p className="mt-4 text-[11px] text-fg-subtle">
            Ingreso {formatDateTime(order.received_at)}
            {order.delivered_at && ` · Entregado ${formatDateTime(order.delivered_at)}`}
          </p>
          {order.notes && <p className="mt-2 text-xs text-fg-muted">Nota: {order.notes}</p>}
        </CardBody>
      </Card>

      {loyalty.enabled && (
        <Card className="border-emerald/25 bg-[linear-gradient(135deg,rgb(46_122_77/0.08),transparent_60%)]">
          <CardBody>
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 font-semibold">
                <Award className="size-4 text-emerald" /> Tu tarjeta de sellos
              </p>
              {loyalty.rewards_available > 0 && <span className="text-xs font-bold text-emerald">{loyalty.rewards_available} lavado(s) gratis 🎉</span>}
            </div>
            <div className="flex gap-2">
              {Array.from({ length: loyalty.required }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "grid size-9 place-items-center rounded-full border-2 text-xs font-bold",
                    i < loyalty.stamps ? "border-emerald bg-emerald text-bg" : "border-line-strong text-fg-subtle",
                  )}
                >
                  {i < loyalty.stamps ? "✓" : i + 1}
                </span>
              ))}
              <span className="grid size-9 place-items-center rounded-full border-2 border-dashed border-emerald text-emerald">
                <Award className="size-4" />
              </span>
            </div>
            <p className="mt-3 text-xs text-fg-muted">
              Te faltan {Math.max(0, loyalty.required - loyalty.stamps)} servicio(s) para tu próximo lavado gratis.
            </p>
          </CardBody>
        </Card>
      )}

      {showNps && order.status === "delivered" && nps.score === null && (
        <Card>
          <CardBody>
            <NpsForm token={token} onDone={() => void qc.invalidateQueries({ queryKey: key })} />
          </CardBody>
        </Card>
      )}

      <p className="pb-6 text-center text-[11px] text-fg-subtle">
        {[business.legal_name, business.ruc && `RUC ${business.ruc}`, business.address].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}
