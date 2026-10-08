"use client";

import { useQuery } from "@tanstack/react-query";
import { unwrap } from "@/shared/lib/errors";
import { qk } from "@/shared/lib/query-keys";
import { getSupabase } from "@/shared/lib/supabase/client";
import type { Bay, BusinessSettings, Employee, Service, ServicePrice, VehicleType } from "@/shared/types/domain";

const STALE = 5 * 60_000;

export function useServices() {
  return useQuery({
    queryKey: qk.catalog.services,
    staleTime: STALE,
    queryFn: async () => {
      const sb = getSupabase();
      const [services, prices] = await Promise.all([
        sb.from("services").select("*").order("is_addon").order("sort_order"),
        sb.from("service_prices").select("*"),
      ]);
      return {
        services: unwrap(services) as Service[],
        prices: unwrap(prices) as ServicePrice[],
      };
    },
  });
}

export function useVehicleTypes() {
  return useQuery({
    queryKey: qk.catalog.vehicleTypes,
    staleTime: STALE,
    queryFn: async () =>
      unwrap(await getSupabase().from("vehicle_types").select("*").eq("is_active", true).order("sort_order")) as VehicleType[],
  });
}

export function useBays() {
  return useQuery({
    queryKey: qk.catalog.bays,
    staleTime: STALE,
    queryFn: async () => unwrap(await getSupabase().from("bays").select("*").order("sort_order")) as Bay[],
  });
}

export function useEmployees() {
  return useQuery({
    queryKey: qk.catalog.employees,
    staleTime: STALE,
    queryFn: async () => unwrap(await getSupabase().from("employees").select("*").order("full_name")) as Employee[],
  });
}

export function useSettings() {
  return useQuery({
    queryKey: qk.settings,
    staleTime: STALE,
    queryFn: async () =>
      unwrap(await getSupabase().from("business_settings").select("*").eq("id", 1).single()) as BusinessSettings,
  });
}

/** Mismo cálculo que el trigger SQL: precio por tamaño, o base × multiplicador del tipo. */
export function estimateLine(
  service: Service,
  vehicleType: VehicleType | undefined,
  prices: ServicePrice[],
): { price: number; minutes: number } {
  if (!vehicleType) return { price: service.base_price, minutes: service.base_duration_min };
  const override = prices.find((p) => p.service_id === service.id && p.vehicle_size === vehicleType.size);
  return {
    price: override?.price ?? Math.round(service.base_price * vehicleType.price_multiplier * 100) / 100,
    minutes: override?.duration_min ?? Math.ceil(service.base_duration_min * vehicleType.time_multiplier),
  };
}
