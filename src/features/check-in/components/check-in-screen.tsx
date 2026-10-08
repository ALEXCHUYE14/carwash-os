"use client";

import { Award, CheckCircle2, ClipboardCheck, Clock, Copy, ExternalLink, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { estimateLine, useBays, useEmployees, useServices, useSettings, useVehicleTypes } from "@/features/catalog/hooks/use-catalog";
import { duration, money } from "@/shared/lib/format";
import { cn, copyText, displayPlate } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";
import { Checkbox, Field, Select, Textarea } from "@/shared/ui/input";
import type { WorkOrder } from "@/shared/types/domain";
import { useCreateOrder } from "../hooks/use-check-in";
import { toPayload, validateCheckIn, type CheckInErrors } from "../schemas/check-in.schema";
import { useCheckIn } from "../store/check-in.store";
import { CustomerFields, NewVehicleFields, VehicleTypePicker } from "./customer-vehicle-fields";
import { InspectionDiagram } from "./inspection-diagram";
import { PlateSearch } from "./plate-search";
import { ServicePicker } from "./service-picker";

function Step({ n, title, children, aside }: { n: number; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="grid size-7 place-items-center rounded-lg bg-surface-3 text-[13px] font-bold text-fg-muted">{n}</span>
          <h2 className="font-semibold">{title}</h2>
        </div>
        {aside}
      </div>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

export function CheckInScreen() {
  const state = useCheckIn();
  const { data: catalog } = useServices();
  const { data: types = [] } = useVehicleTypes();
  const { data: bays = [] } = useBays();
  const { data: employees = [] } = useEmployees();
  const { data: settings } = useSettings();
  const create = useCreateOrder();
  const [errors, setErrors] = useState<CheckInErrors>({});
  const [created, setCreated] = useState<WorkOrder | null>(null);
  const [showInspection, setShowInspection] = useState(false);

  const vt = types.find((t) => t.id === state.vehicle.vehicle_type_id);

  const summary = useMemo(() => {
    if (!catalog) return { lines: [], subtotal: 0, minutes: 0, reward: 0 };
    const lines = state.serviceIds
      .map((id) => catalog.services.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => ({ service: s, ...estimateLine(s, vt, catalog.prices) }))
      .sort((a, b) => Number(a.service.is_addon) - Number(b.service.is_addon));
    const subtotal = lines.reduce((a, l) => a + l.price, 0);
    const minutes = lines.reduce((a, l) => a + l.minutes, 0);
    const reward = state.useReward ? Math.max(0, ...lines.filter((l) => !l.service.is_addon).map((l) => l.price)) : 0;
    return { lines, subtotal, minutes, reward };
  }, [catalog, state.serviceIds, vt, state.useReward]);

  const total = summary.subtotal - summary.reward;
  const tax = settings?.prices_include_tax ? total - total / (1 + settings.tax_rate) : total * (settings?.tax_rate ?? 0.18);

  const submit = () => {
    const v = validateCheckIn(useCheckIn.getState());
    if (!v.ok) {
      setErrors(v.errors);
      toast.error(Object.values(v.errors)[0]);
      return;
    }
    setErrors({});
    create.mutate(toPayload(useCheckIn.getState()), {
      onSuccess: (order) => setCreated(order),
    });
  };

  const operators = employees.filter((e) => e.is_active);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Step n={1} title="Vehículo">
          <div className="space-y-4">
            <PlateSearch error={errors.plate} />
            {(!state.match || !state.vehicle.vehicle_type_id) && <VehicleTypePicker error={errors.vehicle_type_id} />}
            {!state.match && state.vehicle.plate.length >= 3 && <NewVehicleFields />}
          </div>
        </Step>

        <Step n={2} title={state.match ? "Cliente" : "Cliente nuevo"}>
          <CustomerFields errors={errors} />
        </Step>

        <Step n={3} title="Servicios">
          <ServicePicker error={errors.serviceIds} />
        </Step>

        <Step
          n={4}
          title="Inspección visual"
          aside={
            <Button size="sm" variant={showInspection ? "secondary" : "outline"} onClick={() => setShowInspection((s) => !s)}>
              <ClipboardCheck />
              {showInspection ? "Ocultar" : state.marks.length ? `${state.marks.length} daño(s)` : "Registrar daños"}
            </Button>
          }
        >
          {showInspection ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
              <InspectionDiagram
                marks={state.marks}
                view={state.activeView}
                onViewChange={(activeView) => state.set({ activeView })}
                activeDamage={state.activeDamage}
                onDamageChange={(activeDamage) => state.set({ activeDamage })}
                onAdd={state.addMark}
                onRemove={state.removeMark}
              />
              <Field label="Observaciones de la inspección">
                <Textarea
                  value={state.inspectionNotes}
                  onChange={(e) => state.set({ inspectionNotes: e.target.value })}
                  placeholder="Objetos de valor, nivel de suciedad, estado de llantas…"
                  className="min-h-[140px]"
                />
              </Field>
            </div>
          ) : (
            <p className="text-sm text-fg-subtle">
              {state.marks.length
                ? `${state.marks.length} daño(s) previo(s) registrado(s).`
                : "Opcional pero recomendado: deja constancia de rayones o abolladuras antes de empezar."}
            </p>
          )}
        </Step>
      </div>

      {/* ---------------- Resumen (sticky en tablet horizontal / desktop) ---------------- */}
      <div className="xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader
            title="Resumen de la orden"
            description={state.vehicle.plate ? displayPlate(state.vehicle.plate) : "Sin vehículo"}
          />
          <CardBody className="space-y-4">
            {summary.lines.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-subtle">Selecciona los servicios</p>
            ) : (
              <ul className="space-y-2">
                {summary.lines.map((l) => (
                  <li key={l.service.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={cn(l.service.is_addon && "text-fg-muted")}>
                      {l.service.is_addon ? "+ " : ""}
                      {l.service.name}
                    </span>
                    <span className="tabular">{money(l.price)}</span>
                  </li>
                ))}
                {summary.reward > 0 && (
                  <li className="flex items-baseline justify-between text-sm text-emerald">
                    <span>Premio de fidelización</span>
                    <span className="tabular">−{money(summary.reward)}</span>
                  </li>
                )}
              </ul>
            )}

            <div className="space-y-1 border-t border-line pt-3">
              <div className="flex justify-between text-xs text-fg-subtle">
                <span>{settings?.tax_name ?? "IGV"} {settings?.prices_include_tax ? "incluido" : ""}</span>
                <span className="tabular">{money(tax)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">Total</span>
                <span className="text-3xl font-extrabold tracking-tight tabular">{money(settings?.prices_include_tax === false ? total + tax : total)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
                <Clock className="size-3.5" /> Tiempo estimado: {duration(summary.minutes)}
              </div>
            </div>

            {state.match && state.match.rewards_available > 0 && (
              <Checkbox
                checked={state.useReward}
                onChange={(v) => state.set({ useReward: v })}
                label="Canjear lavado gratis"
                description={`Tiene ${state.match.rewards_available} premio(s) disponible(s).`}
              />
            )}
            {state.match && state.match.rewards_available === 0 && settings?.loyalty_enabled && (
              <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-xs text-fg-muted">
                <Award className="size-4 text-amber" />
                {state.match.stamps_current}/{settings.loyalty_stamps_required} sellos para el próximo lavado gratis
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Responsable">
                <Select value={state.employeeId} onChange={(e) => state.set({ employeeId: e.target.value })}>
                  <option value="">Sin asignar</option>
                  {operators.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Bahía">
                <Select value={state.bayId} onChange={(e) => state.set({ bayId: e.target.value })}>
                  <option value="">Automática</option>
                  {bays
                    .filter((b) => b.is_active)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
            <Field label="Nota para el cliente (sale en el ticket)">
              <Textarea
                value={state.notes}
                onChange={(e) => state.set({ notes: e.target.value })}
                className="min-h-[64px]"
                placeholder="Opcional"
              />
            </Field>

            <Button size="xl" className="w-full" onClick={submit} loading={create.isPending} disabled={!!state.match?.open_order_number}>
              <CheckCircle2 /> Registrar ingreso
            </Button>
            <button
              className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-fg-subtle hover:text-fg"
              onClick={() => {
                state.reset();
                setErrors({});
              }}
            >
              <RotateCcw className="size-3.5" /> Limpiar formulario
            </button>
          </CardBody>
        </Card>
      </div>

      <SuccessDialog
        order={created}
        onClose={() => {
          setCreated(null);
          state.reset();
          setShowInspection(false);
        }}
      />
    </div>
  );
}

function SuccessDialog({ order, onClose }: { order: WorkOrder | null; onClose: () => void }) {
  const url = order ? `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/t/${order.public_token}` : "";
  return (
    <Dialog
      open={!!order}
      onOpenChange={(o) => !o && onClose()}
      title="Ingreso registrado"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={() => window.open(url, "_blank")}>
            <ExternalLink /> Ver ticket
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Nueva recepción
          </Button>
        </>
      }
    >
      {order && (
        <div className="space-y-4 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-soft text-emerald">
            <CheckCircle2 className="size-8" />
          </div>
          <div>
            <p className="text-3xl font-extrabold tracking-tight">{order.order_number}</p>
            <p className="mt-1 text-sm text-fg-muted">
              Total {money(order.total)} · estimado {duration(order.estimated_duration_min)}
            </p>
          </div>
          <p className="text-sm text-fg-subtle">
            El cliente recibirá la confirmación por WhatsApp con el link de seguimiento en tiempo real.
          </p>
          <button
            onClick={() => {
              void copyText(url).then((ok) =>
                ok ? toast.success("Link copiado") : toast.error("No se pudo copiar; selecciona el link manualmente"),
              );
            }}
            className="mx-auto flex max-w-full items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-fg-muted hover:text-fg"
          >
            <Copy className="size-3.5 shrink-0" />
            <span className="truncate">{url}</span>
          </button>
        </div>
      )}
    </Dialog>
  );
}
