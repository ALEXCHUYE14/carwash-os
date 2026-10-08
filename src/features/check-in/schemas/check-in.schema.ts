import { z } from "zod";
import type { CreateWorkOrderPayload } from "@/shared/types/domain";
import type { CheckInState } from "../store/check-in.store";
import { normalizePlate } from "@/shared/lib/utils";

/** Validación del borrador antes de llamar al RPC create_work_order. */
export const checkInSchema = z
  .object({
    hasMatch: z.boolean(),
    plate: z.string().transform(normalizePlate),
    vehicle_type_id: z.string(),
    full_name: z.string().trim(),
    phone: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v === "" || v.length === 9 || v.length === 11, "El celular debe tener 9 dígitos"),
    document_number: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{8}$|^\d{11}$|^[A-Z0-9]{6,12}$/i.test(v), "Documento inválido"),
    serviceIds: z.array(z.string()).min(1, "Selecciona al menos un servicio"),
  })
  .superRefine((v, ctx) => {
    if (!v.hasMatch) {
      if (v.plate.length < 5) ctx.addIssue({ code: "custom", path: ["plate"], message: "Ingresa una placa válida" });
      if (!v.vehicle_type_id) ctx.addIssue({ code: "custom", path: ["vehicle_type_id"], message: "Elige el tipo de vehículo" });
      if (v.full_name.length < 2) ctx.addIssue({ code: "custom", path: ["full_name"], message: "Ingresa el nombre del cliente" });
    }
  });

export type CheckInErrors = Partial<Record<"plate" | "vehicle_type_id" | "full_name" | "phone" | "document_number" | "serviceIds", string>>;

export function validateCheckIn(s: CheckInState): { ok: true } | { ok: false; errors: CheckInErrors } {
  const r = checkInSchema.safeParse({
    hasMatch: !!s.match,
    plate: s.vehicle.plate,
    vehicle_type_id: s.vehicle.vehicle_type_id,
    full_name: s.customer.full_name,
    phone: s.customer.phone,
    document_number: s.customer.document_number,
    serviceIds: s.serviceIds,
  });
  if (r.success) return { ok: true };
  const errors: CheckInErrors = {};
  for (const issue of r.error.issues) {
    const key = issue.path[0] as keyof CheckInErrors;
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

export function toPayload(s: CheckInState): CreateWorkOrderPayload {
  const opt = (v: string) => (v.trim() === "" ? undefined : v.trim());
  return {
    customer: s.match
      ? { id: s.match.customer_id, phone: opt(s.customer.phone), whatsapp_opt_in: s.customer.whatsapp_opt_in }
      : {
          full_name: s.customer.full_name.trim(),
          phone: opt(s.customer.phone),
          document_type: s.customer.document_number ? s.customer.document_type : undefined,
          document_number: opt(s.customer.document_number),
          email: opt(s.customer.email),
          whatsapp_opt_in: s.customer.whatsapp_opt_in,
        },
    vehicle: s.match
      ? { id: s.match.vehicle_id, vehicle_type_id: s.vehicle.vehicle_type_id || undefined }
      : {
          plate: normalizePlate(s.vehicle.plate),
          vehicle_type_id: s.vehicle.vehicle_type_id,
          brand: opt(s.vehicle.brand),
          model: opt(s.vehicle.model),
          color: opt(s.vehicle.color),
        },
    services: s.serviceIds.map((service_id) => ({ service_id })),
    assigned_employee_id: opt(s.employeeId),
    bay_id: opt(s.bayId),
    notes: opt(s.notes),
    use_loyalty_reward: s.useReward,
    inspection:
      s.marks.length || s.inspectionNotes.trim()
        ? { general_notes: opt(s.inspectionNotes), marks: s.marks }
        : undefined,
  };
}
