"use client";

import { Banknote, CreditCard, Landmark, Smartphone, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { money } from "@/shared/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/shared/lib/labels";
import { cn, displayPlate } from "@/shared/lib/utils";
import { PAYMENT_METHODS, type KanbanCard, type PaymentMethod } from "@/shared/types/domain";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { Field, Input } from "@/shared/ui/input";
import { useRegisterPayment } from "../hooks/use-cash";

const METHOD_ICON: Record<PaymentMethod, typeof Wallet> = {
  cash: Banknote,
  card: CreditCard,
  yape: Smartphone,
  plin: Smartphone,
  transfer: Landmark,
  other: Wallet,
};

export function PaymentDialog({ order, onClose }: { order: KanbanCard | null; onClose: () => void }) {
  const pay = useRegisterPayment();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (order) {
      setMethod("cash");
      setAmount(Number(order.balance).toFixed(2));
      setReceived("");
      setReference("");
    }
  }, [order]);

  if (!order) return null;
  const balance = Number(order.balance);
  const parsedAmt = Number(amount);
  const amt = Number.isFinite(parsedAmt) ? Math.round(parsedAmt * 100) / 100 : 0;
  const rec = Number(received) || 0;
  const change = method === "cash" && rec > amt ? rec - amt : 0;
  const needsRef = method === "yape" || method === "plin" || method === "transfer" || method === "card";
  const invalid = amt <= 0 || amt > balance + 0.001 || (method === "cash" && received !== "" && rec < amt);

  const submit = () => {
    if (invalid || pay.isPending) return;
    pay.mutate(
      { work_order_id: order.id, method, amount: amt, reference: reference.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(change > 0 ? `Pago registrado · vuelto ${money(change)}` : "Pago registrado");
          onClose();
        },
      },
    );
  };

  const quick = [balance, 20, 50, 100, 200].filter((v, i, a) => v >= balance && a.indexOf(v) === i).slice(0, 4);

  return (
    <Dialog
      open={!!order}
      onOpenChange={(o) => !o && !pay.isPending && onClose()}
      title={`Cobrar ${order.order_number}`}
      description={`${displayPlate(order.plate)} · ${order.customer_name}`}
      footer={
        <Button size="xl" className="w-full" disabled={invalid} loading={pay.isPending} onClick={submit}>
          Registrar {money(amt)}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex items-baseline justify-between rounded-xl bg-surface-2 px-4 py-3">
          <span className="text-sm text-fg-muted">Saldo por cobrar</span>
          <span className="text-2xl font-extrabold tabular">{money(balance)}</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((m) => {
            const Icon = METHOD_ICON[m];
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold",
                  m === method ? "border-cyan bg-cyan-soft text-cyan" : "border-line bg-surface-2 text-fg-muted",
                )}
              >
                <Icon className="size-5" />
                {PAYMENT_METHOD_LABEL[m]}
              </button>
            );
          })}
        </div>

        <Field label="Monto a aplicar" hint="Para pagos mixtos registra cada método por separado.">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} className="text-lg font-bold" />
        </Field>

        {method === "cash" && (
          <div className="space-y-2">
            <Field label="El cliente entrega">
              <Input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value.replace(",", "."))} placeholder="Opcional" />
            </Field>
            <div className="flex flex-wrap gap-2">
              {quick.map((v) => (
                <Button key={v} variant="secondary" size="sm" onClick={() => setReceived(v.toFixed(2))}>
                  {money(v)}
                </Button>
              ))}
            </div>
            {change > 0 && (
              <p className="rounded-xl bg-emerald-soft px-4 py-3 text-lg font-bold text-emerald tabular">Vuelto: {money(change)}</p>
            )}
          </div>
        )}

        {needsRef && (
          <Field label="N.º de operación" hint="Recomendado para conciliar Yape / POS">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
