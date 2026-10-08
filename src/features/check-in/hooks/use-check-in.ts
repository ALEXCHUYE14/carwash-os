"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebounced } from "@/shared/hooks/use-now";
import { unwrap } from "@/shared/lib/errors";
import { qk } from "@/shared/lib/query-keys";
import { getSupabase } from "@/shared/lib/supabase/client";
import type { CreateWorkOrderPayload, VehicleSearchResult, WorkOrder } from "@/shared/types/domain";

export function useVehicleSearch(query: string) {
  const q = useDebounced(query.trim(), 200);
  return useQuery({
    queryKey: qk.vehicleSearch(q),
    enabled: q.length >= 2,
    staleTime: 10_000,
    queryFn: async () =>
      unwrap(await getSupabase().rpc("search_vehicles", { p_query: q, p_limit: 6 })) as VehicleSearchResult[],
  });
}

/** Check-in atómico en 1 round-trip (cliente + vehículo + servicios + inspección + bahía). */
export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateWorkOrderPayload) =>
      unwrap(await getSupabase().rpc("create_work_order", { p: payload })) as WorkOrder,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.board });
      void qc.invalidateQueries({ queryKey: ["vehicle-search"] });
    },
  });
}
