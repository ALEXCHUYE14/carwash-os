"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, History, Plus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/features/auth/hooks/use-session";
import { unwrap } from "@/shared/lib/errors";
import { money, qty, relativeTime } from "@/shared/lib/format";
import { STOCK_META } from "@/shared/lib/labels";
import { qk } from "@/shared/lib/query-keys";
import { getSupabase } from "@/shared/lib/supabase/client";
import { uniqueTopic } from "@/shared/lib/realtime";
import { cn } from "@/shared/lib/utils";
import type { InventoryItem, InventoryStatusRow, InventoryTransaction, InventoryTxType } from "@/shared/types/domain";
import { Button } from "@/shared/ui/button";
import { Badge, Card, EmptyState, PageHeader, StatTile } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";
import { Field, Input, Select } from "@/shared/ui/input";
import { Segmented } from "@/shared/ui/segmented";
import { Table, TBody, Td, Th, THead, Tr } from "@/shared/ui/table";

export function useInventoryStatus() {
  const qc = useQueryClient();
  useEffect(() => {
    const sb = getSupabase();
    const ch = sb
      .channel(uniqueTopic("inventory-items"))
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items" }, () =>
        qc.invalidateQueries({ queryKey: ["inventory"] }),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [qc]);
  return useQuery({
    queryKey: qk.inventory.status,
    queryFn: async () => unwrap(await getSupabase().from("v_inventory_status").select("*").order("name")) as InventoryStatusRow[],
  });
}

function MovementDialog({ item, onClose }: { item: InventoryStatusRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<Exclude<InventoryTxType, "consumption">>("in");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (item) {
      setType("in");
      setQuantity(item.suggested_order_qty ? String(item.suggested_order_qty) : "");
      setCost(String(item.unit_cost));
      setNotes("");
      setReference("");
    }
  }, [item]);

  const save = useMutation({
    mutationFn: async () => {
      const q = Math.round(Number(quantity) * 1000) / 1000;
      if (!Number.isFinite(q) || q === 0) throw new Error("Cantidad inválida");
      return unwrap(
        await getSupabase()
          .from("inventory_transactions")
          .insert({
            item_id: item!.id,
            tx_type: type,
            quantity: q,
            unit_cost: type === "in" && cost !== "" ? Number(cost) : null,
            reference: reference || null,
            notes: notes || null,
          })
          .select()
          .single(),
      );
    },
    onSuccess: () => {
      toast.success("Movimiento registrado en Kardex");
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      onClose();
    },
  });

  if (!item) return null;
  const q = Number(quantity) || 0;
  const stock = Number(item.current_stock);
  const result = type === "out" ? stock - q : stock + q;
  const costValue = cost.trim() === "" ? null : Number(cost);
  const costInvalid = type === "in" && costValue !== null && (!Number.isFinite(costValue) || costValue < 0);
  const invalid = q === 0 || (type !== "adjustment" && q < 0) || (type === "out" && result < 0) || costInvalid;

  return (
    <Dialog
      open={!!item}
      onOpenChange={(o) => !o && onClose()}
      title={`Movimiento · ${item.name}`}
      description={`Stock actual: ${qty(item.current_stock)} ${item.unit}`}
      footer={
        <Button size="lg" className="w-full" disabled={invalid} loading={save.isPending} onClick={() => save.mutate()}>
          Registrar movimiento
        </Button>
      }
    >
      <div className="space-y-4">
        <Segmented
          className="w-full"
          value={type}
          onChange={setType}
          options={[
            { value: "in", label: "Entrada" },
            { value: "out", label: "Salida" },
            { value: "adjustment", label: "Ajuste ±" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Cantidad (${item.unit})`} hint={type === "adjustment" ? "Usa negativo para restar" : undefined}>
            <Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(",", "."))} className="font-bold" />
          </Field>
          {type === "in" && (
            <Field label={`Costo por ${item.unit}`} hint="Recalcula el costo promedio">
              <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(",", "."))} />
            </Field>
          )}
        </div>
        <Field label="Referencia" hint="N.º de factura, guía, etc.">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Notas">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <span className="text-fg-muted">Stock resultante</span>
          <span className={cn("font-bold tabular", result < 0 && "text-rose")}>
            {qty(result)} {item.unit}
          </span>
        </div>
      </div>
    </Dialog>
  );
}

function NewItemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ sku: "", name: "", category: "Químicos", unit: "ml" as InventoryItem["unit"], min_stock: "", reorder_qty: "" });
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await getSupabase()
          .from("inventory_items")
          .insert({
            sku: form.sku || null,
            name: form.name.trim(),
            category: form.category || null,
            unit: form.unit,
            min_stock: Number(form.min_stock) || 0,
            reorder_qty: Number(form.reorder_qty) || 0,
          })
          .select()
          .single(),
      ),
    onSuccess: () => {
      toast.success("Insumo creado. Registra su stock inicial con una entrada.");
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      onClose();
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Nuevo insumo"
      footer={
        <Button size="lg" className="w-full" disabled={form.name.trim().length < 2} loading={save.isPending} onClick={() => save.mutate()}>
          Crear insumo
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" className="col-span-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="SKU">
          <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Unidad">
          <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as InventoryItem["unit"] })}>
            {(["ml", "l", "g", "kg", "gal", "unit"] as const).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Stock mínimo">
          <Input inputMode="decimal" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
        </Field>
        <Field label="Cantidad de reorden">
          <Input inputMode="decimal" value={form.reorder_qty} onChange={(e) => setForm({ ...form, reorder_qty: e.target.value })} />
        </Field>
        <Field label="Categoría" className="col-span-2">
          <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  );
}

export function InventoryScreen() {
  const { isManager } = useSession();
  const { data: rows = [], isLoading } = useInventoryStatus();
  const [moving, setMoving] = useState<InventoryStatusRow | null>(null);
  const [creating, setCreating] = useState(false);

  const value = rows.reduce((a, r) => a + Number(r.stock_value), 0);
  const critical = rows.filter((r) => r.stock_status !== "ok");

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Stock de insumos con descuento automático por servicio"
        actions={
          isManager && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Nuevo insumo
            </Button>
          )
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Insumos activos" value={rows.length} icon={<Boxes />} />
        <StatTile label="Valor del inventario" value={money(value)} tone="cyan" />
        <StatTile label="En nivel crítico" value={critical.length} tone={critical.length ? "amber" : "emerald"} hint={critical.map((c) => c.name).join(", ") || "Todo en orden"} />
        <StatTile label="Agotados" value={rows.filter((r) => r.stock_status === "out").length} tone="rose" />
      </div>

      <Card>
        {!isLoading && rows.length === 0 ? (
          <EmptyState icon={<Boxes />} title="Sin insumos registrados" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Insumo</Th>
                <Th>Estado</Th>
                <Th className="text-right">Stock</Th>
                <Th className="hidden text-right md:table-cell">Mínimo</Th>
                <Th className="hidden text-right lg:table-cell">Costo prom.</Th>
                <Th className="hidden text-right lg:table-cell">Valor</Th>
                <Th className="hidden md:table-cell">Último mov.</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const pctFill = r.min_stock > 0 ? Math.min(100, (r.current_stock / (r.min_stock * 3)) * 100) : 100;
                return (
                  <Tr key={r.id}>
                    <Td>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-fg-subtle">{[r.sku, r.category].filter(Boolean).join(" · ")}</p>
                    </Td>
                    <Td>
                      <Badge tone={STOCK_META[r.stock_status].tone} dot>
                        {STOCK_META[r.stock_status].label}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <span className="font-semibold tabular">
                        {qty(r.current_stock)} <span className="text-xs text-fg-subtle">{r.unit}</span>
                      </span>
                      <div className="mt-1 ml-auto h-1 w-20 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className={cn("h-full rounded-full", r.stock_status === "ok" ? "bg-emerald" : r.stock_status === "critical" ? "bg-amber" : "bg-rose")}
                          style={{ width: `${Math.max(3, pctFill)}%` }}
                        />
                      </div>
                    </Td>
                    <Td className="hidden text-right text-fg-muted tabular md:table-cell">{qty(r.min_stock)}</Td>
                    <Td className="hidden text-right text-fg-muted tabular lg:table-cell">{money(r.unit_cost)}</Td>
                    <Td className="hidden text-right tabular lg:table-cell">{money(r.stock_value)}</Td>
                    <Td className="hidden text-xs text-fg-subtle md:table-cell">{r.last_movement_at ? relativeTime(r.last_movement_at) : "—"}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        {isManager && (
                          <Button size="sm" variant={r.stock_status === "ok" ? "secondary" : "warning"} onClick={() => setMoving(r)}>
                            {r.stock_status === "ok" ? <SlidersHorizontal /> : <ArrowDownToLine />}
                            <span className="hidden sm:inline">{r.stock_status === "ok" ? "Mover" : "Reponer"}</span>
                          </Button>
                        )}
                        <Link
                          href={`/inventario/${r.id}`}
                          className="grid size-9 place-items-center rounded-xl text-fg-subtle hover:bg-surface-2 hover:text-fg"
                          aria-label="Ver Kardex"
                        >
                          <History className="size-4" />
                        </Link>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <MovementDialog item={moving} onClose={() => setMoving(null)} />
      <NewItemDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

const TX_META: Record<InventoryTxType, { label: string; tone: "emerald" | "rose" | "cyan" | "amber"; icon: typeof ArrowDownToLine }> = {
  in: { label: "Entrada", tone: "emerald", icon: ArrowDownToLine },
  out: { label: "Salida", tone: "rose", icon: ArrowUpFromLine },
  consumption: { label: "Consumo", tone: "cyan", icon: ArrowUpFromLine },
  adjustment: { label: "Ajuste", tone: "amber", icon: SlidersHorizontal },
};

export function KardexScreen({ itemId }: { itemId: string }) {
  const { data } = useQuery({
    queryKey: qk.inventory.kardex(itemId),
    queryFn: async () => {
      const sb = getSupabase();
      const [item, txs] = await Promise.all([
        sb.from("inventory_items").select("*").eq("id", itemId).single(),
        sb.from("inventory_transactions").select("*, work_orders(order_number)").eq("item_id", itemId).order("id", { ascending: false }).limit(300),
      ]);
      return {
        item: unwrap(item) as InventoryItem,
        txs: unwrap(txs) as (InventoryTransaction & { work_orders: { order_number: string } | null })[],
      };
    },
  });

  if (!data) return null;
  const { item, txs } = data;

  return (
    <>
      <PageHeader
        title={`Kardex · ${item.name}`}
        description={`Stock actual ${qty(item.current_stock)} ${item.unit} · costo promedio ${money(item.unit_cost)}`}
        actions={
          <Link href="/inventario" className="text-sm font-semibold text-cyan hover:underline">
            ← Volver al inventario
          </Link>
        }
      />
      <Card>
        <Table>
          <THead>
            <tr>
              <Th>Fecha</Th>
              <Th>Tipo</Th>
              <Th>Referencia</Th>
              <Th className="text-right">Cantidad</Th>
              <Th className="text-right">Costo</Th>
              <Th className="text-right">Saldo</Th>
            </tr>
          </THead>
          <TBody>
            {txs.map((t) => {
              const meta = TX_META[t.tx_type];
              const signed = t.tx_type === "in" || t.tx_type === "adjustment" ? t.quantity : -t.quantity;
              return (
                <Tr key={t.id}>
                  <Td className="whitespace-nowrap text-fg-muted">{new Date(t.created_at).toLocaleString("es-PE", { timeZone: "America/Lima" })}</Td>
                  <Td>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </Td>
                  <Td>
                    <p>{t.work_orders?.order_number ?? t.reference ?? "—"}</p>
                    {t.notes && <p className="text-xs text-fg-subtle">{t.notes}</p>}
                  </Td>
                  <Td className={cn("text-right font-semibold tabular", signed >= 0 ? "text-emerald" : "text-rose")}>
                    {signed >= 0 ? "+" : ""}
                    {qty(signed)}
                  </Td>
                  <Td className="text-right text-fg-muted tabular">{money(t.total_cost)}</Td>
                  <Td className="text-right font-semibold tabular">{qty(t.balance_after)}</Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
