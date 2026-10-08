"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Receipt, ShoppingBag, Star, TrendingUp, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { unwrap } from "@/shared/lib/errors";
import { firstDayOfMonthISO, int, money, pct, todayISO } from "@/shared/lib/format";
import { EXPENSE_CATEGORY_LABEL, PAYMENT_METHOD_LABEL } from "@/shared/lib/labels";
import { qk } from "@/shared/lib/query-keys";
import { getSupabase } from "@/shared/lib/supabase/client";
import { cn } from "@/shared/lib/utils";
import type { DailySalesRow, EmployeePerformanceRow, ExpenseCategory, FinancialSummary, PaymentMethod } from "@/shared/types/domain";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton, StatTile } from "@/shared/ui/card";
import { Field, Input } from "@/shared/ui/input";
import { Segmented } from "@/shared/ui/segmented";
import { Table, TBody, Td, Th, THead, Tr } from "@/shared/ui/table";

type Preset = "today" | "7d" | "month" | "custom";

function rangeFor(p: Preset): [string, string] {
  switch (p) {
    case "today":
      return [todayISO(), todayISO()];
    case "7d":
      return [todayISO(-6), todayISO()];
    default:
      return [firstDayOfMonthISO(), todayISO()];
  }
}

function PnlRow({ label, value, strong, negative, sub }: { label: string; value: number; strong?: boolean; negative?: boolean; sub?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between py-1.5", sub && "pl-4 text-[13px] text-fg-muted", strong && "border-t border-line pt-2.5")}>
      <span className={cn(strong && "font-semibold")}>{label}</span>
      <span className={cn("tabular", strong && "text-lg font-bold", negative && "text-fg-muted")}>
        {negative ? `(${money(value)})` : money(value)}
      </span>
    </div>
  );
}

export function ReportsScreen() {
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState<[string, string]>(rangeFor("month"));
  const [from, to] = preset === "custom" ? custom : rangeFor(preset);

  const summary = useQuery({
    queryKey: qk.reports.summary(from, to),
    queryFn: async () =>
      unwrap(await getSupabase().rpc("get_financial_summary", { p_from: from, p_to: to })) as FinancialSummary,
  });

  const daily = useQuery({
    queryKey: qk.reports.daily(from, to),
    queryFn: async () =>
      unwrap(await getSupabase().from("v_daily_sales").select("*").gte("day", from).lte("day", to).order("day")) as DailySalesRow[],
  });

  const employees = useQuery({
    queryKey: qk.reports.employees,
    queryFn: async () =>
      unwrap(
        await getSupabase()
          .from("v_employee_performance")
          .select("*")
          .gte("month", `${firstDayOfMonthISO()}T00:00:00`)
          .order("sales_attributed", { ascending: false }),
      ) as EmployeePerformanceRow[],
  });

  const s = summary.data;
  const chartData = useMemo(
    () =>
      (daily.data ?? []).map((d) => ({
        day: new Date(`${d.day}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }),
        ingresos: Number(d.revenue_gross),
        ordenes: d.orders,
      })),
    [daily.data],
  );
  const avgNps = useMemo(() => {
    const rows = (daily.data ?? []).filter((d) => d.avg_nps !== null);
    return rows.length ? rows.reduce((a, d) => a + Number(d.avg_nps), 0) / rows.length : null;
  }, [daily.data]);

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Utilidad real: Ingresos − Costos directos − Gastos operativos = EBITDA"
        actions={
          <Segmented
            value={preset}
            onChange={setPreset}
            options={[
              { value: "today", label: "Hoy" },
              { value: "7d", label: "7 días" },
              { value: "month", label: "Mes" },
              { value: "custom", label: "Rango" },
            ]}
          />
        }
      />
      {preset === "custom" && (
        <div className="mb-5 flex flex-wrap gap-3">
          <Field label="Desde">
            <Input type="date" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} />
          </Field>
        </div>
      )}

      {!s ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Ingresos (con IGV)" value={money(s.revenue_gross)} tone="cyan" icon={<TrendingUp />} hint={`Neto ${money(s.revenue_net)}`} />
            <StatTile
              label="EBITDA"
              value={money(s.ebitda)}
              tone={s.ebitda >= 0 ? "emerald" : "rose"}
              icon={<Wallet />}
              hint={`Margen ${pct(s.ebitda_margin_pct)}`}
            />
            <StatTile label="Autos atendidos" value={int(s.orders_count)} icon={<ShoppingBag />} hint={`Ticket promedio ${money(s.avg_ticket)}`} />
            <StatTile label="NPS promedio" value={avgNps !== null ? avgNps.toFixed(1) : "—"} tone="amber" icon={<Star />} hint="Escala 0–10" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
            <Card>
              <CardHeader title="Ingresos por día" description="Órdenes entregadas" />
              <CardBody className="h-80">
                {chartData.length === 0 ? (
                  <EmptyState icon={<BarChart3 />} title="Sin ventas en el periodo" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ left: -8, right: 8, top: 8 }}>
                      <CartesianGrid vertical={false} stroke="#e5e2db" />
                      <XAxis dataKey="day" tick={{ fill: "#6a716d", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6a716d", fontSize: 12 }} axisLine={false} tickLine={false} width={56} />
                      <Tooltip
                        cursor={{ fill: "rgb(29 107 116 / 0.06)" }}
                        contentStyle={{ background: "#ffffff", border: "1px solid #e5e2db", boxShadow: "0 4px 16px -6px rgb(30 36 34 / 0.15)", borderRadius: 12, fontSize: 13 }}
                        labelStyle={{ color: "#4f5753" }}
                        formatter={(v, name) => (name === "ingresos" ? [money(Number(v)), "Ingresos"] : [String(v), "Órdenes"])}
                      />
                      <Bar dataKey="ingresos" fill="#1d6b74" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Estado de resultados" description={`${from} → ${to}`} />
              <CardBody className="text-sm">
                <PnlRow label="Ingresos operativos (neto de IGV)" value={s.revenue_net} />
                <PnlRow label="Costos directos" value={s.direct_costs.total} negative />
                <PnlRow label="Comisiones a lavadores" value={s.direct_costs.commissions} sub />
                <PnlRow label="Insumos consumidos" value={s.direct_costs.supplies} sub />
                <PnlRow label={`Utilidad bruta · ${pct(s.gross_margin_pct)}`} value={s.gross_profit} strong />
                <PnlRow label="Gastos operativos" value={s.operating_expenses.total} negative />
                {(Object.entries(s.operating_expenses.by_category) as [ExpenseCategory, number][]).map(([k, v]) => (
                  <PnlRow key={k} label={EXPENSE_CATEGORY_LABEL[k]} value={v} sub />
                ))}
                <div
                  className={cn(
                    "mt-3 flex items-baseline justify-between rounded-xl px-4 py-3",
                    s.ebitda >= 0 ? "bg-emerald-soft text-emerald" : "bg-rose-soft text-rose",
                  )}
                >
                  <span className="font-bold">EBITDA / Ganancia neta</span>
                  <span className="text-xl font-extrabold tabular">{money(s.ebitda)}</span>
                </div>
                <p className="mt-3 text-xs text-fg-subtle">
                  IGV del periodo: {money(s.tax)} · Descuentos/premios: {money(s.discounts)}
                </p>
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Cobranza por medio de pago" />
              <CardBody className="space-y-3">
                {(() => {
                  const entries = Object.entries(s.cash_collected) as [PaymentMethod, number][];
                  const total = entries.reduce((a, [, v]) => a + Number(v), 0);
                  if (!entries.length) return <p className="text-sm text-fg-subtle">Sin cobros</p>;
                  return entries
                    .sort((a, b) => b[1] - a[1])
                    .map(([m, v]) => (
                      <div key={m}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span>{PAYMENT_METHOD_LABEL[m]}</span>
                          <span className="tabular">{money(v)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full bg-cyan" style={{ width: `${(Number(v) / total) * 100}%` }} />
                        </div>
                      </div>
                    ));
                })()}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Desempeño del equipo" description="Mes en curso" />
              {employees.data?.length ? (
                <Table>
                  <THead>
                    <tr>
                      <Th>Colaborador</Th>
                      <Th className="text-right">Autos</Th>
                      <Th className="text-right">Ventas</Th>
                      <Th className="text-right">Comisión</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {employees.data.map((e) => (
                      <Tr key={e.employee_id + e.month}>
                        <Td className="font-medium">{e.full_name}</Td>
                        <Td className="text-right tabular">{e.orders}</Td>
                        <Td className="text-right tabular">{money(e.sales_attributed)}</Td>
                        <Td className="text-right tabular">
                          {money(e.commissions)}
                          {e.commissions_pending > 0 && <span className="block text-[11px] text-amber">pend. {money(e.commissions_pending)}</span>}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <EmptyState icon={<Receipt />} title="Sin comisiones generadas" />
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
