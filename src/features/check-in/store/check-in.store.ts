"use client";

import { create } from "zustand";
import type { DamageType, InspectionMarkInput, VehicleSearchResult, VehicleView } from "@/shared/types/domain";

export interface CustomerDraft {
  full_name: string;
  phone: string;
  document_type: "DNI" | "RUC" | "CE" | "PASAPORTE";
  document_number: string;
  email: string;
  whatsapp_opt_in: boolean;
}

export interface VehicleDraft {
  plate: string;
  vehicle_type_id: string;
  brand: string;
  model: string;
  color: string;
}

export interface CheckInState {
  match: VehicleSearchResult | null;
  customer: CustomerDraft;
  vehicle: VehicleDraft;
  serviceIds: string[];
  useReward: boolean;
  employeeId: string;
  bayId: string;
  notes: string;
  inspectionNotes: string;
  marks: InspectionMarkInput[];
  activeView: VehicleView;
  activeDamage: DamageType;

  setMatch: (m: VehicleSearchResult | null) => void;
  setCustomer: (patch: Partial<CustomerDraft>) => void;
  setVehicle: (patch: Partial<VehicleDraft>) => void;
  toggleService: (id: string, exclusiveGroup?: string[]) => void;
  set: (patch: Partial<Pick<CheckInState, "useReward" | "employeeId" | "bayId" | "notes" | "inspectionNotes" | "activeView" | "activeDamage">>) => void;
  addMark: (m: InspectionMarkInput) => void;
  removeMark: (index: number) => void;
  reset: () => void;
}

const emptyCustomer: CustomerDraft = {
  full_name: "",
  phone: "",
  document_type: "DNI",
  document_number: "",
  email: "",
  whatsapp_opt_in: true,
};
const emptyVehicle: VehicleDraft = { plate: "", vehicle_type_id: "", brand: "", model: "", color: "" };

const initial = {
  match: null,
  customer: emptyCustomer,
  vehicle: emptyVehicle,
  serviceIds: [] as string[],
  useReward: false,
  employeeId: "",
  bayId: "",
  notes: "",
  inspectionNotes: "",
  marks: [] as InspectionMarkInput[],
  activeView: "top" as VehicleView,
  activeDamage: "scratch" as DamageType,
};

/** Borrador del check-in (estado local de la pantalla de recepción). */
export const useCheckIn = create<CheckInState>((set) => ({
  ...initial,
  setMatch: (m) =>
    set((s) => ({
      match: m,
      useReward: false,
      vehicle: m ? { ...s.vehicle, plate: m.plate, vehicle_type_id: m.vehicle_type_id } : s.vehicle,
      customer: m ? { ...s.customer, full_name: m.customer_name, phone: m.customer_phone ?? "" } : emptyCustomer,
    })),
  setCustomer: (patch) => set((s) => ({ customer: { ...s.customer, ...patch } })),
  setVehicle: (patch) => set((s) => ({ vehicle: { ...s.vehicle, ...patch } })),
  toggleService: (id, exclusiveGroup) =>
    set((s) => {
      if (s.serviceIds.includes(id)) return { serviceIds: s.serviceIds.filter((x) => x !== id) };
      // Los servicios principales son excluyentes entre sí; los add-ons se acumulan.
      const base = exclusiveGroup ? s.serviceIds.filter((x) => !exclusiveGroup.includes(x)) : s.serviceIds;
      return { serviceIds: [...base, id] };
    }),
  set: (patch) => set(patch),
  addMark: (m) => set((s) => ({ marks: [...s.marks, m] })),
  removeMark: (i) => set((s) => ({ marks: s.marks.filter((_, idx) => idx !== i) })),
  reset: () => set(initial),
}));
