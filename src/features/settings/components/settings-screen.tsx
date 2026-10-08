"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, UserPlus, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/features/auth/hooks/use-session";
import { ROLE_LABEL } from "@/features/auth/lib/rbac";
import { useBays, useEmployees, useServices, useSettings } from "@/features/catalog/hooks/use-catalog";
import { unwrap } from "@/shared/lib/errors";
import { money, todayISO } from "@/shared/lib/format";
import { qk } from "@/shared/lib/query-keys";
import { getSupabase } from "@/shared/lib/supabase/client";
import { cn } from "@/shared/lib/utils";
import { USER_ROLES, type Bay, type BayType, type BusinessSettings, type CommissionType, type Employee, type Profile, type Service, type UserRole, type WaProvider } from "@/shared/types/domain";
import { Button } from "@/shared/ui/button";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";
import { Checkbox, Field, Input, NumberInput, Select } from "@/shared/ui/input";
import { Segmented } from "@/shared/ui/segmented";
import { Table, TBody, Td, Th, THead, Tr } from "@/shared/ui/table";

type Tab = "business" | "services" | "bays" | "team";

// ------------------------------------------------------------------ Negocio
function BusinessForm() {
  const { data } = useSettings();
  const qc = useQueryClient();
  const [s, setS] = useState<BusinessSettings | null>(null);
  useEffect(() => setS(data ?? null), [data]);

  const save = useMutation({
    mutationFn: async (v: BusinessSettings) => {
      const { id: _id, ...rest } = v;
      return unwrap(await getSupabase().from("business_settings").update(rest).eq("id", 1).select().single());
    },
    onSuccess: () => {
      toast.success("Configuración guardada");
      void qc.invalidateQueries({ queryKey: qk.settings });
    },
  });

  if (!s) return null;
  const set = <K extends keyof BusinessSettings>(k: K, v: BusinessSettings[K]) => setS({ ...s, [k]: v });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Datos del negocio" description="Aparecen en el ticket digital y en los mensajes" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre comercial" className="sm:col-span-2">
            <Input value={s.business_name} onChange={(e) => set("business_name", e.target.value)} />
          </Field>
          <Field label="Razón social">
            <Input value={s.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value || null)} />
          </Field>
          <Field label="RUC">
            <Input inputMode="numeric" maxLength={11} value={s.ruc ?? ""} onChange={(e) => set("ruc", e.target.value || null)} />
          </Field>
          <Field label="Dirección" className="sm:col-span-2">
            <Input value={s.address ?? ""} onChange={(e) => set("address", e.target.value || null)} />
          </Field>
          <Field label="Teléfono">
            <Input value={s.phone ?? ""} onChange={(e) => set("phone", e.target.value || null)} />
          </Field>
          <Field label="URL pública del portal" hint="Se usa en {{link_ticket}}">
            <Input value={s.public_portal_url} onChange={(e) => set("public_portal_url", e.target.value)} />
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Operación" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={`Tasa de ${s.tax_name}`} hint="0.18 = 18%">
            <NumberInput value={s.tax_rate} min={0} max={0.99} onValueChange={(v) => set("tax_rate", v)} />
          </Field>
          <Field label="Alerta SLA (fracción)" hint="0.20 = amarillo al 20% final">
            <NumberInput value={s.sla_warning_pct} min={0} max={1} onValueChange={(v) => set("sla_warning_pct", v)} />
          </Field>
          <Checkbox className="sm:col-span-2" checked={s.prices_include_tax} onChange={(v) => set("prices_include_tax", v)} label="Los precios incluyen IGV" />
          <Checkbox className="sm:col-span-2" checked={s.loyalty_enabled} onChange={(v) => set("loyalty_enabled", v)} label="Tarjeta de fidelización activa" />
          <Field label="Sellos para premio" hint="5 → el 6.º lavado es gratis">
            <NumberInput integer min={1} max={100} value={s.loyalty_stamps_required} onValueChange={(v) => set("loyalty_stamps_required", v)} />
          </Field>
          <Field label="Encuesta NPS (min. después)">
            <NumberInput integer min={0} value={s.nps_delay_minutes} onValueChange={(v) => set("nps_delay_minutes", v)} />
          </Field>
          <Field label="Proveedor de WhatsApp">
            <Select value={s.wa_provider} onChange={(e) => set("wa_provider", e.target.value as WaProvider)}>
              <option value="evolution">Evolution API (gateway local)</option>
              <option value="baileys">Baileys / REST propio</option>
              <option value="wwebjs">WhatsApp Web JS</option>
              <option value="meta">Meta Cloud API (oficial)</option>
              <option value="twilio">Twilio (oficial)</option>
            </Select>
          </Field>
          <Field label="Código de país">
            <Input value={s.wa_country_code} onChange={(e) => set("wa_country_code", e.target.value)} />
          </Field>
          <Button className="sm:col-span-2" loading={save.isPending} onClick={() => save.mutate(s)}>
            <Save /> Guardar cambios
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Servicios
function ServicesTable() {
  const { data } = useServices();
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, Partial<Service>>>({});
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ code: "", name: "", base_price: "", base_duration_min: "30", is_addon: false, required_bay: "wash" as BayType });

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase();
      for (const [id, patch] of Object.entries(edits)) {
        unwrap(await sb.from("services").update(patch).eq("id", id).select().single());
      }
    },
    onSuccess: () => {
      toast.success("Servicios actualizados");
      setEdits({});
      void qc.invalidateQueries({ queryKey: qk.catalog.services });
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const code = draft.code.trim().toUpperCase();
      const name = draft.name.trim();
      const price = Number(draft.base_price.replace(",", "."));
      const minutes = Number(draft.base_duration_min);
      if (!code || !name) throw new Error("Ingresa el código y el nombre del servicio");
      if (!Number.isFinite(price) || price < 0) throw new Error("Precio inválido");
      if (!Number.isInteger(minutes) || minutes <= 0) throw new Error("Los minutos deben ser un entero mayor a 0");
      return unwrap(
        await getSupabase()
          .from("services")
          .insert({
            code,
            name,
            base_price: price,
            base_duration_min: minutes,
            is_addon: draft.is_addon,
            required_bay: draft.required_bay,
            commission_type: draft.is_addon ? "fixed" : "percentage",
            commission_value: draft.is_addon ? 5 : 30,
          })
          .select()
          .single(),
      );
    },
    onSuccess: () => {
      toast.success("Servicio creado");
      setCreating(false);
      void qc.invalidateQueries({ queryKey: qk.catalog.services });
    },
  });

  const val = <K extends keyof Service>(s: Service, k: K): Service[K] => (edits[s.id]?.[k] ?? s[k]) as Service[K];
  const patch = (id: string, p: Partial<Service>) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...p } }));
  const dirty = Object.keys(edits).length > 0;

  return (
    <Card>
      <CardHeader
        title="Catálogo de servicios"
        description="Precio base para Auto/Sedán; se multiplica según el tipo de vehículo"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
              <Plus /> Nuevo
            </Button>
            <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
              <Save /> Guardar
            </Button>
          </div>
        }
      />
      <Table>
        <THead>
          <tr>
            <Th>Servicio</Th>
            <Th>Precio</Th>
            <Th>Minutos (SLA)</Th>
            <Th>Comisión</Th>
            <Th>Activo</Th>
          </tr>
        </THead>
        <TBody>
          {data?.services.map((s) => (
            <Tr key={s.id} className={cn(edits[s.id] && "bg-cyan-soft/30")}>
              <Td>
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-fg-subtle">
                  {s.code} · {s.is_addon ? "Add-on" : "Principal"} · bahía {s.required_bay === "detail" ? "detailing" : "lavado"}
                </p>
              </Td>
              <Td>
                <NumberInput className="h-9 w-24" min={0} value={Number(val(s, "base_price"))} onValueChange={(v) => patch(s.id, { base_price: v })} />
              </Td>
              <Td>
                <NumberInput className="h-9 w-20" integer min={1} value={Number(val(s, "base_duration_min"))} onValueChange={(v) => patch(s.id, { base_duration_min: v })} />
              </Td>
              <Td>
                <div className="flex gap-1.5">
                  <Select className="h-9 w-20 text-sm" value={val(s, "commission_type")} onChange={(e) => patch(s.id, { commission_type: e.target.value as CommissionType })}>
                    <option value="percentage">%</option>
                    <option value="fixed">S/</option>
                  </Select>
                  <NumberInput className="h-9 w-20" min={0} value={Number(val(s, "commission_value"))} onValueChange={(v) => patch(s.id, { commission_value: v })} />
                </div>
              </Td>
              <Td>
                <input type="checkbox" className="size-5 accent-[var(--color-cyan)]" checked={val(s, "is_active")} onChange={(e) => patch(s.id, { is_active: e.target.checked })} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="Nuevo servicio"
        footer={
          <Button className="w-full" disabled={!draft.code || !draft.name || !draft.base_price} loading={create.isPending} onClick={() => create.mutate()}>
            Crear
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código">
            <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="LAV-TAP" />
          </Field>
          <Field label="Precio base">
            <Input inputMode="decimal" value={draft.base_price} onChange={(e) => setDraft({ ...draft, base_price: e.target.value })} />
          </Field>
          <Field label="Nombre" className="col-span-2">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Minutos">
            <Input inputMode="numeric" value={draft.base_duration_min} onChange={(e) => setDraft({ ...draft, base_duration_min: e.target.value })} />
          </Field>
          <Field label="Bahía requerida">
            <Select value={draft.required_bay} onChange={(e) => setDraft({ ...draft, required_bay: e.target.value as BayType })}>
              <option value="wash">Lavado</option>
              <option value="detail">Detailing</option>
            </Select>
          </Field>
          <Checkbox className="col-span-2" checked={draft.is_addon} onChange={(v) => setDraft({ ...draft, is_addon: v })} label="Es un add-on (extra)" />
        </div>
      </Dialog>
    </Card>
  );
}

// ------------------------------------------------------------------ Bahías
function BaysCard() {
  const { data: bays = [] } = useBays();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<BayType>("wash");
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.catalog.bays });

  const add = useMutation({
    mutationFn: async () =>
      unwrap(
        await getSupabase()
          .from("bays")
          .insert({ name, code: `B${bays.length + 1}-${Date.now().toString(36).slice(-3).toUpperCase()}`, bay_type: type, sort_order: bays.length + 1 })
          .select()
          .single(),
      ),
    onSuccess: () => {
      setName("");
      refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: async (b: Bay) => unwrap(await getSupabase().from("bays").update({ is_active: !b.is_active }).eq("id", b.id).select().single()),
    onSuccess: refresh,
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader title="Bahías" description="La asignación automática elige la de menor carga compatible con el servicio" />
      <CardBody className="space-y-3">
        {bays.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
            <span className="font-medium">
              {b.name}{" "}
              <Badge className="ml-2" tone={b.bay_type === "detail" ? "violet" : b.bay_type === "multi" ? "cyan" : "neutral"}>
                {b.bay_type === "detail" ? "Detailing" : b.bay_type === "multi" ? "Mixta" : "Lavado"}
              </Badge>
            </span>
            <Button size="sm" variant={b.is_active ? "secondary" : "outline"} onClick={() => toggle.mutate(b)}>
              {b.is_active ? "Activa" : "Inactiva"}
            </Button>
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la bahía" />
          <Select className="w-36" value={type} onChange={(e) => setType(e.target.value as BayType)}>
            <option value="wash">Lavado</option>
            <option value="detail">Detailing</option>
            <option value="multi">Mixta</option>
          </Select>
          <Button disabled={name.trim().length < 2} loading={add.isPending} onClick={() => add.mutate()}>
            <Plus />
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------------ Equipo
function TeamSection() {
  const { profile } = useSession();
  const { data: employees = [] } = useEmployees();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [emp, setEmp] = useState({ full_name: "", document_number: "", phone: "", position: "Lavador" });
  const [invite, setInvite] = useState({ email: "", full_name: "", role: "operator" as UserRole });

  const { data: pending = [] } = useQuery({
    queryKey: ["commissions-pending"],
    queryFn: async () =>
      unwrap(await getSupabase().from("commissions").select("employee_id, amount").eq("status", "pending")) as { employee_id: string; amount: number }[],
  });
  const pendingBy = (id: string) => pending.filter((p) => p.employee_id === id).reduce((a, p) => a + Number(p.amount), 0);

  const { data: users = [] } = useQuery({
    queryKey: qk.staff,
    queryFn: async () => unwrap(await getSupabase().from("profiles").select("*").neq("role", "customer").order("full_name")) as Profile[],
  });

  const addEmployee = useMutation({
    mutationFn: async () =>
      unwrap(
        await getSupabase()
          .from("employees")
          .insert({ ...emp, document_number: emp.document_number || null, phone: emp.phone || null, hire_date: todayISO() })
          .select()
          .single(),
      ),
    onSuccess: () => {
      setAdding(false);
      setEmp({ full_name: "", document_number: "", phone: "", position: "Lavador" });
      void qc.invalidateQueries({ queryKey: qk.catalog.employees });
    },
  });

  const payCommissions = useMutation({
    mutationFn: async (e: Employee) =>
      unwrap(await getSupabase().rpc("pay_commissions", { p_employee_id: e.id, p_until: todayISO(), p_method: "cash", p_paid_from_cash: false })),
    onSuccess: () => {
      toast.success("Comisiones pagadas y registradas como gasto");
      void qc.invalidateQueries({ queryKey: ["commissions-pending"] });
    },
  });

  const setRole = useMutation({
    mutationFn: async (v: { id: string; role: UserRole }) =>
      unwrap(await getSupabase().from("profiles").update({ role: v.role }).eq("id", v.id).select().single()),
    onSuccess: () => {
      toast.success("Rol actualizado");
      void qc.invalidateQueries({ queryKey: qk.staff });
    },
  });

  const sendInvite = useMutation({
    mutationFn: async () => {
      const { data, error } = await getSupabase().functions.invoke("staff-invite", { body: invite });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`Invitación enviada a ${invite.email}`);
      setInviting(false);
      void qc.invalidateQueries({ queryKey: qk.staff });
      void qc.invalidateQueries({ queryKey: qk.catalog.employees });
    },
  });

  const assignableRoles = USER_ROLES.filter((r) => r !== "customer" && (profile.role === "superadmin" || (r !== "superadmin" && r !== "admin")));

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Colaboradores"
          description="Comisiones pendientes y pago"
          action={
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus /> Agregar
            </Button>
          }
        />
        <Table>
          <THead>
            <tr>
              <Th>Nombre</Th>
              <Th>Puesto</Th>
              <Th className="text-right">Pendiente</Th>
              <Th />
            </tr>
          </THead>
          <TBody>
            {employees.map((e) => {
              const amount = pendingBy(e.id);
              return (
                <Tr key={e.id}>
                  <Td className="font-medium">
                    {e.full_name}
                    {!e.profile_id && <span className="block text-xs text-fg-subtle">sin acceso al sistema</span>}
                  </Td>
                  <Td className="text-fg-muted">{e.position}</Td>
                  <Td className="text-right tabular">{money(amount)}</Td>
                  <Td className="text-right">
                    {amount > 0 && (
                      <Button size="sm" variant="secondary" loading={payCommissions.isPending && payCommissions.variables?.id === e.id} onClick={() => payCommissions.mutate(e)}>
                        <Wallet /> Pagar
                      </Button>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          title="Usuarios y roles"
          description="Control de acceso (RBAC)"
          action={
            <Button size="sm" onClick={() => setInviting(true)}>
              <UserPlus /> Invitar
            </Button>
          }
        />
        <Table>
          <THead>
            <tr>
              <Th>Usuario</Th>
              <Th>Rol</Th>
            </tr>
          </THead>
          <TBody>
            {users.map((u) => {
              const locked = u.id === profile.id || ((u.role === "superadmin" || u.role === "admin") && profile.role !== "superadmin");
              return (
                <Tr key={u.id}>
                  <Td>
                    <p className="font-medium">{u.full_name || "—"}</p>
                    <p className="text-xs text-fg-subtle">{u.email}</p>
                  </Td>
                  <Td>
                    {locked ? (
                      <Badge>{ROLE_LABEL[u.role]}</Badge>
                    ) : (
                      <Select className="h-9 w-44 text-sm" value={u.role} onChange={(e) => setRole.mutate({ id: u.id, role: e.target.value as UserRole })}>
                        {assignableRoles.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title="Nuevo colaborador"
        footer={
          <Button className="w-full" disabled={emp.full_name.trim().length < 3} loading={addEmployee.isPending} onClick={() => addEmployee.mutate()}>
            Guardar
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre completo" className="col-span-2">
            <Input value={emp.full_name} onChange={(e) => setEmp({ ...emp, full_name: e.target.value })} />
          </Field>
          <Field label="DNI">
            <Input value={emp.document_number} onChange={(e) => setEmp({ ...emp, document_number: e.target.value })} />
          </Field>
          <Field label="Celular">
            <Input value={emp.phone} onChange={(e) => setEmp({ ...emp, phone: e.target.value })} />
          </Field>
          <Field label="Puesto" className="col-span-2">
            <Select value={emp.position} onChange={(e) => setEmp({ ...emp, position: e.target.value })}>
              <option>Lavador</option>
              <option>Detailer</option>
              <option>Supervisor</option>
              <option>Cajero</option>
            </Select>
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={inviting}
        onOpenChange={setInviting}
        title="Invitar usuario"
        description="Recibirá un correo para crear su contraseña"
        footer={
          <Button className="w-full" disabled={!invite.email.includes("@") || invite.full_name.length < 3} loading={sendInvite.isPending} onClick={() => sendInvite.mutate()}>
            Enviar invitación
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Nombre completo">
            <Input value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} />
          </Field>
          <Field label="Correo">
            <Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          </Field>
          <Field label="Rol">
            <Select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as UserRole })}>
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

export function SettingsScreen() {
  const [tab, setTab] = useState<Tab>("business");
  return (
    <>
      <PageHeader title="Ajustes" description="Negocio, catálogo, bahías y equipo" />
      <Segmented
        className="mb-6"
        value={tab}
        onChange={setTab}
        options={[
          { value: "business", label: "Negocio" },
          { value: "services", label: "Servicios" },
          { value: "bays", label: "Bahías" },
          { value: "team", label: "Equipo" },
        ]}
      />
      {tab === "business" && <BusinessForm />}
      {tab === "services" && <ServicesTable />}
      {tab === "bays" && <BaysCard />}
      {tab === "team" && <TeamSection />}
    </>
  );
}
