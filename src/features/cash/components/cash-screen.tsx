"use client";

import { ArrowRightLeft, Banknote, CheckCircle2, Lock, LockOpen, PackageCheck, Receipt } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useBoard, useBoardRealtime, useMoveOrder } from "@/features/kanban/hooks/use-board";
import { formatDateTime, formatTime, money } from "@/shared/lib/format";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_META, STATUS_META } from "@/shared/lib/labels";
import { cn, displayPlate } from "@/shared/lib/utils";
import type { CashCut, KanbanCard, PaymentMethod } from "@/shared/types/domain";
import { Button, buttonVariants } from "@/shared/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton, StatTile } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";
import { Field, Input, Textarea } from "@/shared/ui/input";
import { useCloseCashCut, useCutCashExpenses, useCutHistory, useCutPayments, useOpenCashCut, useOpenCut } from "../hooks/use-cash";
import { PaymentDialog } from "./payment-dialog";

/** Convierte el texto de un input de dinero; devuelve null si no es un número válido ≥ 0. */
function parseAmount(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

const isZero = (n: number | null | undefined) => Math.abs(Number(n ?? 0)) < 0.005;

function OpenCutCard() {
  const open = useOpenCashCut();
  const [amount, setAmount] = useState("100.00");
  const [register, setRegister] = useState("Caja principal");
  const opening = parseAmount(amount);
  return (
    <Card className="mx-auto max-w-md">
      <CardBody className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-amber-soft text-amber">
            <Lock className="size-5" />
          </div>
          <div>
            <p className="font-semibold">Caja cerrada</p>
            <p className="text-[13px] text-fg-subtle">Abre la caja del turno para cobrar en efectivo.</p>
          </div>
        </div>
        <Field label="Caja">
          <Input value={register} onChange={(e) => setRegister(e.target.value)} />
        </Field>
        <Field label="Monto de apertura (sencillo)">
          <Input
            inputMode="decimal"
            value={amount}
            aria-invalid={opening === null}
            onChange={(e) => setAmount(e.target.value.replace(",", "."))}
            className="text-lg font-bold"
          />
        </Field>
        <Button
          size="lg"
          className="w-full"
          disabled={opening === null}
          loading={open.isPending}
          onClick={() => opening !== null && open.mutate({ opening_amount: opening, register_name: register.trim() || "Caja principal" })}
        >
          <LockOpen /> Abrir caja
        </Button>
      </CardBody>
    </Card>
  );
}

function CloseCutDialog({ cut, expected, open, onClose }: { cut: CashCut; expected: number; open: boolean; onClose: () => void }) {
  const close = useCloseCashCut();
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<CashCut | null>(null);
  const countedValue = parseAmount(counted);
  const diff = (countedValue ?? 0) - expected;

  const dismiss = () => {
    setResult(null);
    setCounted("");
    setNotes("");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !close.isPending) dismiss();
      }}
      title={result ? "Arqueo completado" : "Cierre y arqueo de caja"}
      description={cut.register_name}
      footer={
        result ? (
          <Button className="w-full" onClick={dismiss}>
            Listo
          </Button>
        ) : (
          <Button
            size="lg"
            className="w-full"
            disabled={countedValue === null}
            loading={close.isPending}
            onClick={() =>
              countedValue !== null &&
              close.mutate(
                { id: cut.id, counted: countedValue, notes: notes.trim() || undefined },
                { onSuccess: (r) => setResult(r) },
              )
            }
          >
            <Lock /> Cerrar caja
          </Button>
        )
      }
    >
      {result ? (
        <div className="space-y-3 text-sm">
          <Row label="Efectivo esperado" value={money(result.expected_cash)} />
          <Row label="Efectivo contado" value={money(result.counted_cash)} />
          <Row
            label="Diferencia"
            value={money(result.difference)}
            className={cn("text-lg font-bold", isZero(result.difference) ? "text-emerald" : (result.difference ?? 0) > 0 ? "text-amber" : "text-rose")}
          />
          <div className="border-t border-line pt-3">
            {Object.entries(result.totals_by_method ?? {}).map(([m, v]) => (
              <Row key={m} label={PAYMENT_METHOD_LABEL[m as PaymentMethod]} value={money(v)} />
            ))}
            <Row label="Egresos en efectivo" value={money(result.cash_expenses)} />
            <Row label="Órdenes cobradas" value={String(result.orders_count ?? 0)} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Cuenta el efectivo físico de la caja (incluye el sencillo de apertura). El sistema calculará la diferencia.
          </p>
          <Field label="Efectivo contado">
            <Input inputMode="decimal" autoFocus aria-invalid={counted !== "" && countedValue === null} value={counted} onChange={(e) => setCounted(e.target.value.replace(",", "."))} className="h-14 text-2xl font-bold" />
          </Field>
          {countedValue !== null && (
            <p className={cn("text-sm font-semibold", Math.abs(diff) < 0.005 ? "text-emerald" : diff > 0 ? "text-amber" : "text-rose")}>
              {Math.abs(diff) < 0.005 ? "Cuadra exacto ✓" : diff > 0 ? `Sobrante de ${money(diff)}` : `Faltante de ${money(-diff)}`}
            </p>
          )}
          <Field label="Observaciones">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[64px]" />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-fg-muted">{label}</span>
      <span className={cn("tabular", className)}>{value}</span>
    </div>
  );
}

export function CashScreen() {
  useBoardRealtime();
  const { data: cut, isLoading } = useOpenCut();
  const { data: payments = [] } = useCutPayments(cut?.id);
  const { data: cashOut = 0 } = useCutCashExpenses(cut?.id);
  const { data: history = [] } = useCutHistory();
  const { data: cards = [] } = useBoard();
  const move = useMoveOrder();
  const [paying, setPaying] = useState<KanbanCard | null>(null);
  // Se guarda el corte que se está cerrando: al cerrarse, `cut` pasa a null y el resumen
  // del arqueo debe seguir visible hasta que el usuario pulse "Listo".
  const [closingCut, setClosingCut] = useState<CashCut | null>(null);

  const byMethod = useMemo(() => {
    const m = new Map<PaymentMethod, number>();
    payments.forEach((p) => m.set(p.method, (m.get(p.method) ?? 0) + Number(p.amount)));
    return m;
  }, [payments]);
  const cashIn = byMethod.get("cash") ?? 0;
  const totalIn = payments.reduce((a, p) => a + Number(p.amount), 0);
  const expected = Number(cut?.opening_amount ?? 0) + cashIn - Number(cashOut);

  const pending = cards
    .filter((c) => c.status !== "delivered" && c.status !== "cancelled" && (c.balance > 0 || c.status === "ready"))
    .sort((a, b) => Number(b.status === "ready") - Number(a.status === "ready"));

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <>
      <PageHeader
        title="Caja"
        description={cut ? `${cut.register_name} · abierta desde ${formatTime(cut.opened_at)}` : "Apertura, cobros, entregas y arqueo del turno"}
        actions={
          cut && (
            <>
              <Link href="/gastos?caja=1" className={buttonVariants({ variant: "secondary" })}>
                <Receipt /> Egreso de caja chica
              </Link>
              <Button variant="warning" onClick={() => setClosingCut(cut)}>
                <Lock /> Cerrar caja
              </Button>
            </>
          )
        }
      />

      {!cut ? (
        <OpenCutCard />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Efectivo esperado" value={money(expected)} tone="emerald" icon={<Banknote />} hint={`Apertura ${money(cut.opening_amount)}`} />
            <StatTile label="Cobrado en el turno" value={money(totalIn)} tone="cyan" icon={<ArrowRightLeft />} hint={`${payments.length} pagos`} />
            <StatTile
              label="Digital"
              value={money(totalIn - cashIn)}
              hint={(["yape", "plin", "card", "transfer"] as PaymentMethod[])
                .filter((m) => byMethod.get(m))
                .map((m) => `${PAYMENT_METHOD_LABEL[m]} ${money(byMethod.get(m))}`)
                .join(" · ") || "—"}
            />
            <StatTile label="Egresos de caja" value={money(cashOut)} tone="amber" icon={<Receipt />} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader title="Por cobrar y entregar" description="Órdenes activas con saldo o listas para retiro" />
              {pending.length === 0 ? (
                <EmptyState icon={<CheckCircle2 />} title="Todo al día" description="No hay órdenes pendientes de cobro." />
              ) : (
                <ul className="divide-y divide-line">
                  {pending.map((c) => {
                    const pay = PAYMENT_STATUS_META[c.payment_status];
                    const canDeliver = c.status === "ready" && c.payment_status === "paid";
                    return (
                      <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                        <span className="rounded-md bg-fg px-1.5 py-0.5 font-mono text-sm font-extrabold tracking-wider text-bg">
                          {displayPlate(c.plate)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{c.customer_name}</p>
                          <p className="truncate text-xs text-fg-subtle">
                            {c.order_number} · {c.services}
                          </p>
                        </div>
                        <Badge tone={STATUS_META[c.status].tone}>{STATUS_META[c.status].short}</Badge>
                        <div className="w-28 text-right">
                          <p className="font-bold tabular">{money(c.balance > 0 ? c.balance : c.total)}</p>
                          <p className={cn("text-[11px] font-semibold", c.balance > 0 ? "text-amber" : "text-emerald")}>{pay.label}</p>
                        </div>
                        <div className="flex gap-2">
                          {c.balance > 0 && (
                            <Button size="md" onClick={() => setPaying(c)}>
                              Cobrar
                            </Button>
                          )}
                          {canDeliver && (
                            <Button size="md" variant="success" loading={move.isPending && move.variables?.id === c.id} onClick={() => move.mutate({ id: c.id, status: "delivered" })}>
                              <PackageCheck /> Entregar
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader title="Pagos del turno" />
                <ul className="scrollbar-thin max-h-80 divide-y divide-line overflow-y-auto">
                  {payments.length === 0 && <li className="px-5 py-6 text-center text-sm text-fg-subtle">Aún no hay pagos</li>}
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                      <span>
                        {PAYMENT_METHOD_LABEL[p.method]}
                        {p.reference && <span className="ml-1.5 text-xs text-fg-subtle">#{p.reference}</span>}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-fg-subtle">{formatTime(p.created_at)}</span>
                        <span className={cn("font-semibold tabular", p.amount < 0 && "text-rose")}>{money(p.amount)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Últimos cierres" />
                <ul className="divide-y divide-line">
                  {history.map((h) => (
                    <li key={h.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                      <span>
                        {h.register_name}
                        <span className="block text-xs text-fg-subtle">{formatDateTime(h.closed_at)}</span>
                      </span>
                      <span
                        className={cn(
                          "font-semibold tabular",
                          isZero(h.difference) ? "text-emerald" : (h.difference ?? 0) > 0 ? "text-amber" : "text-rose",
                        )}
                      >
                        {isZero(h.difference) ? "Cuadra" : money(h.difference)}
                      </span>
                    </li>
                  ))}
                  {history.length === 0 && <li className="px-5 py-6 text-center text-sm text-fg-subtle">Sin cierres previos</li>}
                </ul>
              </Card>
            </div>
          </div>

        </div>
      )}

      {closingCut && (
        <CloseCutDialog cut={closingCut} expected={expected} open onClose={() => setClosingCut(null)} />
      )}

      <PaymentDialog order={paying} onClose={() => setPaying(null)} />
    </>
  );
}
