"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Pencil, RotateCw, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/features/auth/hooks/use-session";
import { useVehicleSearch } from "@/features/check-in/hooks/use-check-in";
import { unwrap } from "@/shared/lib/errors";
import { formatDateTime, relativeTime } from "@/shared/lib/format";
import { WA_STATUS_META } from "@/shared/lib/labels";
import { qk } from "@/shared/lib/query-keys";
import { getSupabase } from "@/shared/lib/supabase/client";
import { uniqueTopic } from "@/shared/lib/realtime";
import { cn, displayPlate } from "@/shared/lib/utils";
import type { VehicleSearchResult, WaEvent, WaStatus, WhatsappLog, WhatsappTemplate } from "@/shared/types/domain";
import { Button } from "@/shared/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/shared/ui/input";
import { Segmented } from "@/shared/ui/segmented";
import { Table, TBody, Td, Th, THead, Tr } from "@/shared/ui/table";

const EVENT_LABEL: Record<WaEvent, string> = {
  check_in: "Confirmación de ingreso",
  ready_for_pickup: "Listo para retiro",
  appointment_reminder: "Recordatorio de cita",
  nps_survey: "Encuesta NPS",
  custom: "Manual",
};

export const TEMPLATE_VARIABLES = [
  "nombre",
  "cliente",
  "vehiculo",
  "placa",
  "numero_orden",
  "monto",
  "saldo",
  "link_ticket",
  "link_encuesta",
  "negocio",
  "fecha_cita",
  "hora_cita",
] as const;

const SAMPLE: Record<string, string> = {
  nombre: "María",
  cliente: "María López",
  vehiculo: "Toyota RAV4",
  placa: "ABC123",
  numero_orden: "OT-000128",
  monto: "S/ 91.00",
  saldo: "S/ 0.00",
  link_ticket: "https://tu-dominio.com/t/9f2c…",
  link_encuesta: "https://tu-dominio.com/t/9f2c…?nps=1",
  negocio: "Car Wash Piura",
  fecha_cita: "15/10/2026",
  hora_cita: "10:30",
};

export function renderPreview(body: string): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => SAMPLE[k] ?? "");
}

function TemplateDialog({ tpl, onClose }: { tpl: WhatsappTemplate | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<WhatsappTemplate | null>(tpl);
  useEffect(() => setDraft(tpl), [tpl]);

  const save = useMutation({
    mutationFn: async (t: WhatsappTemplate) =>
      unwrap(
        await getSupabase()
          .from("whatsapp_templates")
          .update({
            name: t.name,
            body: t.body,
            is_active: t.is_active,
            auto_send: t.auto_send,
            meta_template_name: t.meta_template_name || null,
            meta_param_order: t.meta_param_order,
          })
          .eq("id", t.id)
          .select()
          .single(),
      ),
    onSuccess: () => {
      toast.success("Plantilla guardada");
      void qc.invalidateQueries({ queryKey: qk.whatsapp.templates });
      onClose();
    },
  });

  if (!draft) return null;
  const insertVar = (v: string) => setDraft({ ...draft, body: `${draft.body}{{${v}}}` });

  return (
    <Dialog
      open={!!tpl}
      onOpenChange={(o) => !o && onClose()}
      variant="sheet"
      title={EVENT_LABEL[draft.event]}
      description={draft.code}
      footer={
        <Button size="lg" className="w-full" loading={save.isPending} onClick={() => save.mutate(draft)}>
          Guardar plantilla
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Mensaje">
          <Textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className="min-h-[140px] font-mono text-base sm:text-[13px]" />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insertVar(v)}
              className="h-8 rounded-lg border border-line bg-surface-2 px-2 font-mono text-[11px] text-cyan hover:border-cyan"
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase">Vista previa</p>
          <div className="rounded-2xl bg-[#efeae2] p-4">
            <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-[#d9fdd3] shadow-sm px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-[#111b21]">
              {renderPreview(draft.body)}
            </div>
          </div>
        </div>
        <Checkbox checked={draft.is_active} onChange={(v) => setDraft({ ...draft, is_active: v })} label="Plantilla activa" />
        <Checkbox
          checked={draft.auto_send}
          onChange={(v) => setDraft({ ...draft, auto_send: v })}
          label="Envío automático"
          description="Se encola sola cuando ocurre el evento."
        />
        <Field label="Nombre de plantilla aprobada (Meta / Twilio)" hint="Solo para la API oficial. Déjalo vacío con Evolution / Baileys.">
          <Input value={draft.meta_template_name ?? ""} onChange={(e) => setDraft({ ...draft, meta_template_name: e.target.value })} />
        </Field>
        <Field label="Orden de parámetros {{1}}, {{2}}…" hint="Separados por coma, ej: nombre,placa,link_ticket">
          <Input
            value={draft.meta_param_order.join(",")}
            onChange={(e) => setDraft({ ...draft, meta_param_order: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          />
        </Field>
      </div>
    </Dialog>
  );
}

function ComposeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [to, setTo] = useState<VehicleSearchResult | null>(null);
  const [body, setBody] = useState("Hola {{nombre}}, ");
  const { data: results = [] } = useVehicleSearch(to ? "" : q);

  const send = useMutation({
    mutationFn: async () =>
      unwrap(await getSupabase().rpc("wa_send_custom", { p_customer_id: to!.customer_id, p_body: body, p_work_order_id: null })),
    onSuccess: () => {
      toast.success("Mensaje en cola");
      void qc.invalidateQueries({ queryKey: ["whatsapp", "outbox"] });
      setTo(null);
      setQ("");
      onClose();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Enviar mensaje"
      footer={
        <Button className="w-full" disabled={!to || body.trim().length < 3} loading={send.isPending} onClick={() => send.mutate()}>
          <Send /> Encolar mensaje
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Para">
          {to ? (
            <div className="flex items-center justify-between rounded-xl border border-cyan/40 bg-cyan-soft px-3 py-2.5 text-sm">
              <span>
                {to.customer_name} · +{to.customer_phone ?? "sin celular"}
              </span>
              <button className="text-xs font-semibold text-cyan" onClick={() => setTo(null)}>
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Placa, nombre o celular" />
              {results.length > 0 && (
                <ul className="mt-1 overflow-hidden rounded-xl border border-line">
                  {results.map((r) => (
                    <li key={r.vehicle_id}>
                      <button className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-2" onClick={() => setTo(r)}>
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
        <Field label="Mensaje" hint="Puedes usar variables como {{nombre}} o {{placa}}">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[120px]" />
        </Field>
      </div>
    </Dialog>
  );
}

export function WhatsappScreen() {
  const { isManager } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"outbox" | "templates">("outbox");
  const [status, setStatus] = useState<WaStatus | "all">("all");
  const [editing, setEditing] = useState<WhatsappTemplate | null>(null);
  const [composing, setComposing] = useState(false);

  // La cola se actualiza por Realtime (whatsapp_logs está en la publicación). Antes se consultaba
  // cada 15 s, lo que generaba miles de peticiones diarias en los logs de Supabase.
  useEffect(() => {
    if (tab !== "outbox") return;
    const sb = getSupabase();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = sb
      .channel(uniqueTopic("whatsapp-outbox"))
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_logs" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void qc.invalidateQueries({ queryKey: ["whatsapp", "outbox"] }), 500);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void sb.removeChannel(channel);
    };
  }, [tab, qc]);

  const outbox = useQuery({
    queryKey: qk.whatsapp.outbox(status),
    enabled: tab === "outbox",
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      let req = getSupabase().from("whatsapp_logs").select("*").order("created_at", { ascending: false }).limit(150);
      if (status !== "all") req = req.eq("status", status);
      return unwrap(await req) as WhatsappLog[];
    },
  });

  const templates = useQuery({
    queryKey: qk.whatsapp.templates,
    enabled: tab === "templates",
    queryFn: async () => unwrap(await getSupabase().from("whatsapp_templates").select("*").order("event")) as WhatsappTemplate[],
  });

  const retry = useMutation({
    mutationFn: async (id: string) => unwrap(await getSupabase().rpc("wa_retry", { p_id: id })),
    onSuccess: () => {
      toast.success("Reintento programado");
      void qc.invalidateQueries({ queryKey: ["whatsapp", "outbox"] });
    },
  });

  return (
    <>
      <PageHeader
        title="WhatsApp"
        description="Cola de envíos con reintentos automáticos y plantillas con variables"
        actions={
          <Button onClick={() => setComposing(true)}>
            <MessageCircle /> Enviar mensaje
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "outbox", label: "Bandeja de salida" },
            { value: "templates", label: "Plantillas" },
          ]}
        />
        {tab === "outbox" && (
          <Select value={status} onChange={(e) => setStatus(e.target.value as WaStatus | "all")} className="w-48">
            <option value="all">Todos los estados</option>
            {(Object.keys(WA_STATUS_META) as WaStatus[]).map((s) => (
              <option key={s} value={s}>
                {WA_STATUS_META[s].label}
              </option>
            ))}
          </Select>
        )}
      </div>

      {tab === "outbox" ? (
        <Card>
          {outbox.data?.length === 0 ? (
            <EmptyState icon={<MessageCircle />} title="Sin mensajes" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Evento</Th>
                  <Th>Para</Th>
                  <Th className="hidden lg:table-cell">Mensaje</Th>
                  <Th>Estado</Th>
                  <Th className="hidden md:table-cell">Creado</Th>
                  <Th />
                </tr>
              </THead>
              <TBody>
                {outbox.data?.map((m) => (
                  <Tr key={m.id}>
                    <Td className="whitespace-nowrap">{EVENT_LABEL[m.event]}</Td>
                    <Td className="font-mono text-xs">+{m.to_phone}</Td>
                    <Td className="hidden max-w-md lg:table-cell">
                      <p className="line-clamp-2 text-xs text-fg-muted">{m.body_rendered ?? m.body_template ?? "Se generará al enviar"}</p>
                      {m.last_error && <p className="mt-1 text-xs text-rose">{m.last_error}</p>}
                    </Td>
                    <Td>
                      <Badge tone={WA_STATUS_META[m.status].tone}>{WA_STATUS_META[m.status].label}</Badge>
                      {m.attempts > 0 && <p className="mt-1 text-[11px] text-fg-subtle">intento {m.attempts}/{m.max_attempts}</p>}
                      {m.status === "queued" && new Date(m.next_attempt_at) > new Date() && (
                        <p className="mt-1 text-[11px] text-fg-subtle">programado {formatDateTime(m.next_attempt_at)}</p>
                      )}
                    </Td>
                    <Td className="hidden text-xs text-fg-subtle md:table-cell">{relativeTime(m.created_at)}</Td>
                    <Td>
                      {m.status === "failed" && (
                        <Button size="sm" variant="secondary" loading={retry.isPending && retry.variables === m.id} onClick={() => retry.mutate(m.id)}>
                          <RotateCw /> Reintentar
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.data?.map((t) => (
            <Card key={t.id} className={cn(!t.is_active && "opacity-60")}>
              <CardHeader
                title={t.name}
                description={`${EVENT_LABEL[t.event]} · ${t.auto_send ? "automático" : "manual"}`}
                action={
                  isManager && (
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditing(t)} aria-label="Editar">
                      <Pencil />
                    </Button>
                  )
                }
              />
              <CardBody>
                <div className="rounded-xl bg-[#efeae2] p-3">
                  <div className="ml-auto max-w-[90%] rounded-xl rounded-tr-sm bg-[#d9fdd3] shadow-sm px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-[#111b21]">
                    {renderPreview(t.body)}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog tpl={editing} onClose={() => setEditing(null)} />
      <ComposeDialog open={composing} onClose={() => setComposing(false)} />
    </>
  );
}
