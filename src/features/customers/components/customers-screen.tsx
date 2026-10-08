"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Car, MessageCircle, Phone, Search, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/features/auth/hooks/use-session";
import { useSettings } from "@/features/catalog/hooks/use-catalog";
import { useDebounced } from "@/shared/hooks/use-now";
import { unwrap } from "@/shared/lib/errors";
import { formatDate, formatDateTime, money } from "@/shared/lib/format";
import { STATUS_META } from "@/shared/lib/labels";
import { qk } from "@/shared/lib/query-keys";
import { getSupabase } from "@/shared/lib/supabase/client";
import { cn, displayPlate, initials } from "@/shared/lib/utils";
import type { Customer, LoyaltyCard, LoyaltyLog, OrderStatus, Vehicle } from "@/shared/types/domain";
import { Button } from "@/shared/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";
import { Field, Input } from "@/shared/ui/input";
import { Table, TBody, Td, Th, THead, Tr } from "@/shared/ui/table";

type CustomerRow = Customer & {
  vehicles: { plate: string }[];
  loyalty_cards: { stamps_current: number; rewards_available: number } | null;
};

export function CustomersScreen() {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 250);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.customers.list(query),
    queryFn: async () => {
      let req = getSupabase()
        .from("customers")
        .select("*, vehicles(plate), loyalty_cards(stamps_current, rewards_available)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (query) {
        const digits = query.replace(/\D/g, "");
        const safe = query.replace(/[,()]/g, " ");
        req = req.or(
          [`full_name.ilike.%${safe}%`, digits.length >= 4 ? `phone.ilike.%${digits}%` : null, `document_number.ilike.${safe}%`]
            .filter(Boolean)
            .join(","),
        );
      }
      return unwrap(await req) as CustomerRow[];
    },
  });

  return (
    <>
      <PageHeader title="Clientes" description="CRM, vehículos e historial de visitas" />
      <div className="relative mb-5 max-w-md">
        <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, celular o documento" className="pl-10" />
      </div>
      <Card>
        {isLoading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Users />} title="Sin resultados" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Cliente</Th>
                <Th>Contacto</Th>
                <Th>Vehículos</Th>
                <Th>Fidelización</Th>
                <Th className="hidden md:table-cell">Desde</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <Link href={`/clientes/${c.id}`} className="flex items-center gap-3 hover:text-cyan">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-bold">{initials(c.full_name)}</span>
                      <span>
                        <span className="block font-semibold">{c.full_name}</span>
                        <span className="text-xs text-fg-subtle">{c.document_number ? `${c.document_type} ${c.document_number}` : "Sin documento"}</span>
                      </span>
                    </Link>
                  </Td>
                  <Td className="text-fg-muted">{c.phone ? `+${c.phone}` : "—"}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {c.vehicles.map((v) => (
                        <span key={v.plate} className="rounded bg-fg px-1.5 font-mono text-xs font-bold text-bg">
                          {displayPlate(v.plate)}
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    {c.loyalty_cards?.rewards_available ? (
                      <Badge tone="emerald">
                        <Award className="size-3" /> {c.loyalty_cards.rewards_available} premio(s)
                      </Badge>
                    ) : (
                      <span className="text-xs text-fg-subtle tabular">{c.loyalty_cards?.stamps_current ?? 0} sellos</span>
                    )}
                  </Td>
                  <Td className="hidden text-fg-subtle md:table-cell">{formatDate(c.created_at)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}

interface CustomerDetail {
  customer: Customer;
  vehicles: (Vehicle & { vehicle_types: { name: string } | null })[];
  orders: { id: string; order_number: string; status: OrderStatus; total: number; received_at: string; nps_score: number | null; vehicles: { plate: string } | null }[];
  card: LoyaltyCard | null;
  logs: LoyaltyLog[];
}

function StampCard({ card, required }: { card: LoyaltyCard | null; required: number }) {
  const stamps = card?.stamps_current ?? 0;
  return (
    <div className="rounded-2xl border border-emerald/25 bg-[linear-gradient(135deg,rgb(46_122_77/0.08),transparent_60%)] p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Tarjeta de sellos</p>
        {card?.rewards_available ? <Badge tone="emerald">{card.rewards_available} lavado(s) gratis</Badge> : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {Array.from({ length: required + 1 }).map((_, i) => {
          const isReward = i === required;
          const filled = i < stamps;
          return (
            <span
              key={i}
              className={cn(
                "grid size-10 place-items-center rounded-full border-2 text-xs font-bold",
                isReward ? "border-dashed border-emerald text-emerald" : filled ? "border-emerald bg-emerald text-bg" : "border-line-strong text-fg-subtle",
              )}
            >
              {isReward ? <Award className="size-4" /> : i + 1}
            </span>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-fg-muted">
        {card?.stamps_total ?? 0} servicios pagados en total · {card?.rewards_redeemed ?? 0} premios canjeados
      </p>
    </div>
  );
}

export function CustomerDetailScreen({ id }: { id: string }) {
  const { isManager } = useSession();
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const [adjusting, setAdjusting] = useState(false);
  const [stamps, setStamps] = useState("1");
  const [reason, setReason] = useState("");

  const { data } = useQuery({
    queryKey: qk.customers.detail(id),
    queryFn: async (): Promise<CustomerDetail> => {
      const sb = getSupabase();
      const [c, v, o, card, logs] = await Promise.all([
        sb.from("customers").select("*").eq("id", id).single(),
        sb.from("vehicles").select("*, vehicle_types(name)").eq("customer_id", id),
        sb
          .from("work_orders")
          .select("id, order_number, status, total, received_at, nps_score, vehicles(plate)")
          .eq("customer_id", id)
          .order("received_at", { ascending: false })
          .limit(50),
        sb.from("loyalty_cards").select("*").eq("customer_id", id).maybeSingle(),
        sb.from("loyalty_logs").select("*").eq("customer_id", id).order("id", { ascending: false }).limit(30),
      ]);
      return {
        customer: unwrap(c) as Customer,
        vehicles: unwrap(v) as CustomerDetail["vehicles"],
        orders: unwrap(o) as unknown as CustomerDetail["orders"],
        card: unwrap(card) as LoyaltyCard | null,
        logs: unwrap(logs) as LoyaltyLog[],
      };
    },
  });

  const adjust = useMutation({
    mutationFn: async () =>
      unwrap(
        await getSupabase().rpc("adjust_loyalty", {
          p_customer_id: id,
          p_stamps: Number(stamps) || 0,
          p_rewards: 0,
          p_reason: reason || "Ajuste manual",
        }),
      ),
    onSuccess: () => {
      toast.success("Tarjeta actualizada");
      setAdjusting(false);
      void qc.invalidateQueries({ queryKey: qk.customers.detail(id) });
    },
  });

  if (!data) return <Skeleton className="h-80" />;
  const { customer, vehicles, orders, card, logs } = data;
  const spent = orders.filter((o) => o.status === "delivered").reduce((a, o) => a + Number(o.total), 0);
  const nps = orders.filter((o) => o.nps_score !== null);

  return (
    <>
      <PageHeader
        title={customer.full_name}
        description={[customer.document_number && `${customer.document_type} ${customer.document_number}`, customer.email].filter(Boolean).join(" · ") || "Cliente"}
        actions={
          customer.phone && (
            <>
              <a href={`tel:+${customer.phone}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:bg-surface-2">
                <Phone className="size-4" /> Llamar
              </a>
              <a
                href={`https://wa.me/${customer.phone}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald px-4 text-sm font-semibold text-bg"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </>
          )
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="text-[13px] text-fg-muted">Visitas</p>
              <p className="mt-1 text-2xl font-bold tabular">{orders.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] text-fg-muted">Consumo total</p>
              <p className="mt-1 text-2xl font-bold tabular">{money(spent)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] text-fg-muted">NPS promedio</p>
              <p className="mt-1 text-2xl font-bold tabular">
                {nps.length ? (nps.reduce((a, o) => a + (o.nps_score ?? 0), 0) / nps.length).toFixed(1) : "—"}
              </p>
            </Card>
          </div>
          <Card>
            <CardHeader title="Historial de órdenes" />
            {orders.length === 0 ? (
              <EmptyState title="Sin órdenes" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Orden</Th>
                    <Th>Placa</Th>
                    <Th>Fecha</Th>
                    <Th>Estado</Th>
                    <Th className="text-right">Total</Th>
                  </tr>
                </THead>
                <TBody>
                  {orders.map((o) => (
                    <Tr key={o.id}>
                      <Td className="font-semibold">{o.order_number}</Td>
                      <Td className="font-mono">{o.vehicles ? displayPlate(o.vehicles.plate) : "—"}</Td>
                      <Td className="text-fg-muted">{formatDateTime(o.received_at)}</Td>
                      <Td>
                        <Badge tone={STATUS_META[o.status].tone}>{STATUS_META[o.status].short}</Badge>
                      </Td>
                      <Td className="text-right tabular">{money(o.total)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <StampCard card={card} required={settings?.loyalty_stamps_required ?? 5} />
          {isManager && (
            <Button variant="secondary" size="sm" onClick={() => setAdjusting(true)}>
              Ajustar sellos
            </Button>
          )}
          <Card>
            <CardHeader title="Vehículos" />
            <CardBody className="space-y-2">
              {vehicles.map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
                  <Car className="size-4 text-fg-subtle" />
                  <span className="rounded bg-fg px-1.5 font-mono text-sm font-bold text-bg">{displayPlate(v.plate)}</span>
                  <span className="truncate text-sm text-fg-muted">
                    {[v.brand, v.model, v.color].filter(Boolean).join(" ") || v.vehicle_types?.name}
                  </span>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Movimientos de fidelización" />
            <ul className="divide-y divide-line text-sm">
              {logs.map((l) => (
                <li key={l.id} className="flex items-center justify-between px-5 py-2.5">
                  <span>
                    {
                      {
                        stamp_earned: "Sello ganado",
                        reward_redeemed: "Premio canjeado",
                        reward_refunded: "Premio devuelto",
                        adjustment: "Ajuste manual",
                      }[l.log_type]
                    }
                    <span className="block text-xs text-fg-subtle">{l.notes}</span>
                  </span>
                  <span className="text-xs text-fg-subtle">{formatDate(l.created_at)}</span>
                </li>
              ))}
              {logs.length === 0 && <li className="px-5 py-6 text-center text-fg-subtle">Sin movimientos</li>}
            </ul>
          </Card>
        </div>
      </div>

      <Dialog
        open={adjusting}
        onOpenChange={setAdjusting}
        title="Ajuste manual de sellos"
        footer={
          <Button className="w-full" loading={adjust.isPending} onClick={() => adjust.mutate()}>
            Aplicar ajuste
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Sellos (+/−)">
            <Input inputMode="numeric" value={stamps} onChange={(e) => setStamps(e.target.value)} />
          </Field>
          <Field label="Motivo">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Migración de tarjeta física" />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
