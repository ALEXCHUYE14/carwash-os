"use client";

import { Bike, Car, CarFront, Truck } from "lucide-react";
import { useVehicleTypes } from "@/features/catalog/hooks/use-catalog";
import { cn } from "@/shared/lib/utils";
import { Checkbox, Field, Input, Select } from "@/shared/ui/input";
import type { CheckInErrors } from "../schemas/check-in.schema";
import { useCheckIn } from "../store/check-in.store";

const TYPE_ICON = { small: Bike, medium: Car, large: CarFront, xl: Truck } as const;

export function VehicleTypePicker({ error }: { error?: string }) {
  const { data: types = [] } = useVehicleTypes();
  const { vehicle, setVehicle } = useCheckIn();
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {types.map((t) => {
          const Icon = TYPE_ICON[t.size];
          const active = vehicle.vehicle_type_id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setVehicle({ vehicle_type_id: t.id })}
              className={cn(
                "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-center text-[13px] leading-tight font-semibold transition-all",
                active
                  ? "border-cyan bg-cyan-soft text-cyan shadow-[var(--shadow-glow-cyan)]"
                  : "border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg",
              )}
            >
              <Icon className="size-6 shrink-0" />
              <span className="break-words">{t.name}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-rose">{error}</p>}
    </div>
  );
}

export function NewVehicleFields() {
  const { vehicle, setVehicle } = useCheckIn();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Field label="Marca">
        <Input value={vehicle.brand} onChange={(e) => setVehicle({ brand: e.target.value })} placeholder="Toyota" />
      </Field>
      <Field label="Modelo">
        <Input value={vehicle.model} onChange={(e) => setVehicle({ model: e.target.value })} placeholder="Yaris" />
      </Field>
      <Field label="Color" className="col-span-2 sm:col-span-1">
        <Input value={vehicle.color} onChange={(e) => setVehicle({ color: e.target.value })} placeholder="Gris" />
      </Field>
    </div>
  );
}

export function CustomerFields({ errors }: { errors: CheckInErrors }) {
  const { customer, setCustomer, match } = useCheckIn();

  if (match) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Celular (WhatsApp)" error={errors.phone}>
          <Input
            inputMode="tel"
            value={customer.phone}
            onChange={(e) => setCustomer({ phone: e.target.value })}
            placeholder="987 654 321"
          />
        </Field>
        <Checkbox
          className="self-end"
          checked={customer.whatsapp_opt_in}
          onChange={(v) => setCustomer({ whatsapp_opt_in: v })}
          label="Enviar avisos por WhatsApp"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Nombre completo *" error={errors.full_name} className="sm:col-span-2">
        <Input
          value={customer.full_name}
          onChange={(e) => setCustomer({ full_name: e.target.value })}
          placeholder="Nombre y apellido"
          autoComplete="off"
        />
      </Field>
      <Field label="Celular (WhatsApp)" error={errors.phone}>
        <Input
          inputMode="tel"
          value={customer.phone}
          onChange={(e) => setCustomer({ phone: e.target.value })}
          placeholder="987 654 321"
        />
      </Field>
      <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
        <Field label="Doc.">
          <Select
            value={customer.document_type}
            onChange={(e) => setCustomer({ document_type: e.target.value as typeof customer.document_type })}
          >
            <option value="DNI">DNI</option>
            <option value="RUC">RUC</option>
            <option value="CE">CE</option>
            <option value="PASAPORTE">Pas.</option>
          </Select>
        </Field>
        <Field label="Número" error={errors.document_number}>
          <Input
            inputMode="numeric"
            value={customer.document_number}
            onChange={(e) => setCustomer({ document_number: e.target.value })}
            placeholder="Opcional"
          />
        </Field>
      </div>
      <Checkbox
        className="sm:col-span-2"
        checked={customer.whatsapp_opt_in}
        onChange={(v) => setCustomer({ whatsapp_opt_in: v })}
        label="Enviar avisos por WhatsApp"
        description="Confirmación de ingreso, aviso de listo para retiro y encuesta de satisfacción."
      />
    </div>
  );
}
