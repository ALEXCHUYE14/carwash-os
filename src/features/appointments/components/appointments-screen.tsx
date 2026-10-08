"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CalendarPlus, Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useVehicleSearch } from "@/features/check-in/hooks/use-check-in";
import { useServices } from "@/features/catalog/hooks/use-catalog";
import { unwrap } from "@/shared/lib/errors";
import { duration, formatTime, TZ } from "@/shared/lib/format";
import { qk } from "@/shared/lib/query-keys";
import { getSupabase } from "@/shared/lib/supabase/client";
import { cn, displayPlate } from "@/shared/lib/utils";
import type { Appointment, AppointmentStatus, VehicleSearchResult } from "@/shared/types/domain";
import { Button } from "@/shared/ui/button";
import { Badge, Card, EmptyState, PageHeader, type Tone } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";
import { Field, Input, Textarea } from "@/shared/ui/input";

type Row = Appointment & {
  customers: { full_name: string; phone: string | null } | null;
  vehicles: { plate: string; brand: string | null; model: string | null } | null;
};

const STATUS: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "Agendada", tone: "neutral" },
  confirmed: { label: "Confirmada", tone: "cyan" },
  checked_in: { label: "Atendida", tone: "emerald" },
  no_show: { label: "No asistió", tone: "rose" },
  cancelled: { label: "Cancelada", tone: "rose" },
};

function NewAppointmentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<VehicleSearchResult | null>(null);
  const [when, setWhen] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const { data: results = [] } = useVehicleSearch(picked ? "" : q);
  const { data: catalog } = useServices();

  const save = useMutation({
    mutationFn: async () => {
      if (!picked) throw new Error("Selecciona un cliente / vehículo");
      // datetime-local está en hora de Lima (UTC−5, sin horario de verano); algunos navegadores incluyen segundos
      const local = when.length === 16 ? `${when}:00` : when.slice(0, 19);
      const date = new Date(`${local}-05:00`);
      if (Number.isNaN(date.getTime())) throw new Error("Fecha u hora inválida");
      if (date.getTime() < Date.now() - 60_000) throw new Error("La cita no puede quedar en el pasado");
      const iso = date.toISOString();
      const minutes = (catalog?.services ?? []).filter((s) => serviceIds.includes(s.id)).reduce((a, s) => a + s.base_duration_min, 0);
      return unwrap(
        await getSupabase()
          .from("appointments")
          .insert({
            customer_id: picked.customer_id,
            vehicle_id: picked.vehicle_id,
            scheduled_at: iso,
            duration_min: Math.max(30, minutes),
            service_ids: serviceIds,
            notes: notes || null,
          })
          .select()
          .single(),
      );
    },
    onSuccess: () => {
      toast.success("Cita agendada · se enviará recordatorio por WhatsApp 24 h antes");
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      setPicked(null);
      setQ("");
      setWhen("");
      setServiceIds([]);
      setNotes("");
      onClose();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Nueva cita"
      variant="sheet"
      footer={
        <Button size="lg" className="w-full" disabled={!picked || !when} loading={save.isPending} onClick={() => save.mutate()}>
          Agendar
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Cliente / vehículo" hint="Para clientes nuevos, regístralos primero en Recepción.">
          {picked ? (
            <div className="flex items-center justify-between rounded-xl border border-cyan/40 bg-cyan-soft px-3 py-2.5">
              <span className="text-sm">
                <span className="mr-2 rounded bg-fg px-1.5 font-mono font-bold text-bg">{displayPlate(picked.plate)}</span>
                {picked.customer_name}
              </span>
              <button onClick={() => setPicked(null)} className="text-fg-subtle hover:text-fg" aria-label="Cambiar">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Placa, nombre o celular" />
              {results.length > 0 && (
                <ul className="mt-1 overflow-hidden rounded-xl border border-line">
                  {results.map((r) => (
                    <li key={r.vehicle_id}>
                      <button className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-2" onClick={() => setPicked(r)}>
                        <span className="rounded bg-fg px-1.5 font-mono text-xs font-bold text-bg">{displayPlate(r.plate)}</span>
                        {r.customer_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Field>
        <Field label="Fecha y hora">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Servicios">
          <div className="flex flex-wrap gap-2">
            {catalog?.services
              .filter((s) => s.is_active)
              .map((s) => {
                const on = serviceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setServiceIds(on ? serviceIds.filter((x) => x !== s.id) : [...serviceIds, s.id])}
                    className={cn(
                      "h-10 rounded-full border px-3.5 text-xs font-semibold",
                      on ? "border-cyan bg-cyan-soft text-cyan" : "border-line text-fg-muted",
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
          </div>
        </Field>
        <Field label="Notas">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[64px]" />
        </Field>
      </div>
    </Dialog>
  );
}

export function AppointmentsScreen() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const fromIso = useMemo(() => new Date(Date.now() - 2 * 3_600_000).toISOString(), []);
  const { data: catalog } = useServices();

  const { data: rows = [] } = useQuery({
    queryKey: qk.appointments(fromIso),
    queryFn: async () =>
      unwrap(
        await getSupabase()
          .from("appointments")
          .select("*, customers(full_name, phone), vehicles(plate, brand, model)")
          .gte("scheduled_at", fromIso)
          .order("scheduled_at")
          .limit(200),
      ) as Row[],
  });

  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: AppointmentStatus }) =>
      unwrap(await getSupabase().from("appointments").update({ status: v.status }).eq("id", v.id).select().single()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["appointments"] }),
  });

  const groups = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("es-PE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
    const map = new Map<string, Row[]>();
    rows.forEach((r) => {
      const k = fmt.format(new Date(r.scheduled_at));
      map.set(k, [...(map.get(k) ?? []), r]);
    });
    return [...map.entries()];
  }, [rows]);

  const serviceName = (id: string) => catalog?.services.find((s) => s.id === id)?.name ?? "";

  return (
    <>
      <PageHeader
        title="Citas"
        description="Agenda y recordatorios automáticos por WhatsApp"
        actions={
          <Button onClick={() => setCreating(true)}>
            <CalendarPlus /> Nueva cita
          </Button>
        }
      />
      {groups.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarClock />} title="Sin citas próximas" />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 text-sm font-semibold text-fg-muted capitalize">{day}</h2>
              <Card className="divide-y divide-line">
                {items.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                    <div className="w-16 text-lg font-bold tabular">{formatTime(a.scheduled_at)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {a.vehicles && <span className="mr-2 rounded bg-fg px-1.5 font-mono text-sm text-bg">{displayPlate(a.vehicles.plate)}</span>}
                        {a.customers?.full_name}
                      </p>
                      <p className="truncate text-xs text-fg-subtle">
                        {a.service_ids.map(serviceName).filter(Boolean).join(" + ") || "Servicio por definir"} · {duration(a.duration_min)}
                        {a.notes && ` · ${a.notes}`}
                      </p>
                    </div>
                    <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                    {(a.status === "scheduled" || a.status === "confirmed") && (
                      <div className="flex gap-1.5">
                        {a.status === "scheduled" && (
                          <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: a.id, status: "confirmed" })}>
                            <Check /> Confirmar
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: a.id, status: "no_show" })}>
                          No vino
                        </Button>
                        <Button size="sm" variant="ghost" className="text-rose" onClick={() => setStatus.mutate({ id: a.id, status: "cancelled" })}>
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
      <NewAppointmentDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
