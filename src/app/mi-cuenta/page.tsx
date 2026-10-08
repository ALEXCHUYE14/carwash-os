import { Award, Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDateTime, money } from "@/shared/lib/format";
import { STATUS_META } from "@/shared/lib/labels";
import { getCurrentProfile, getServerSupabase } from "@/shared/lib/supabase/server";
import { displayPlate } from "@/shared/lib/utils";
import type { LoyaltyCard, OrderStatus } from "@/shared/types/domain";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/shared/ui/card";

export const metadata: Metadata = { title: "Mi cuenta" };
export const dynamic = "force-dynamic";

/** Portal del cliente con login: RLS limita todo a su propio customer_id. */
export default async function MiCuentaPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "customer") redirect("/login");

  const sb = await getServerSupabase();
  const [{ data: orders }, { data: card }] = await Promise.all([
    sb
      .from("work_orders")
      .select("id, order_number, public_token, status, total, received_at, vehicles(plate)")
      .order("received_at", { ascending: false })
      .limit(30),
    sb.from("loyalty_cards").select("*").maybeSingle(),
  ]);
  const rows = (orders ?? []) as unknown as {
    id: string;
    order_number: string;
    public_token: string;
    status: OrderStatus;
    total: number;
    received_at: string;
    vehicles: { plate: string } | null;
  }[];
  const loyalty = card as LoyaltyCard | null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">Hola, {profile.full_name.split(" ")[0]}</h1>

      {!profile.customer_id && (
        <p className="rounded-xl border border-amber/30 bg-amber-soft px-4 py-3 text-sm text-amber">
          Tu cuenta aún no está vinculada a un cliente. Pide en recepción que registren tu correo.
        </p>
      )}

      <Card>
        <CardBody className="flex items-center gap-4">
          <div className="grid size-12 place-items-center rounded-2xl bg-emerald-soft text-emerald">
            <Award className="size-6" />
          </div>
          <div>
            <p className="font-semibold">{loyalty?.stamps_current ?? 0} sellos acumulados</p>
            <p className="text-sm text-fg-muted">{loyalty?.rewards_available ?? 0} lavado(s) gratis disponibles</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Mis servicios" />
        {rows.length === 0 ? (
          <EmptyState title="Aún no tienes servicios" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="rounded bg-fg px-1.5 font-mono text-sm font-bold text-bg">{o.vehicles ? displayPlate(o.vehicles.plate) : "—"}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{o.order_number}</p>
                  <p className="text-xs text-fg-subtle">{formatDateTime(o.received_at)}</p>
                </div>
                <Badge tone={STATUS_META[o.status].tone}>{STATUS_META[o.status].short}</Badge>
                <span className="w-20 text-right text-sm tabular">{money(o.total)}</span>
                <Link href={`/t/${o.public_token}`} className="text-cyan" aria-label="Ver ticket">
                  <Ticket className="size-4" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
