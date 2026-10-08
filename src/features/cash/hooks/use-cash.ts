"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth/hooks/use-session";
import { unwrap } from "@/shared/lib/errors";
import { qk } from "@/shared/lib/query-keys";
import { getSupabase } from "@/shared/lib/supabase/client";
import type { CashCut, Payment, PaymentMethod } from "@/shared/types/domain";

export function useOpenCut() {
  return useQuery({
    queryKey: qk.cash.open,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("cash_cuts")
        .select("*")
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as CashCut | null) ?? null;
    },
  });
}

export function useCutPayments(cutId: string | undefined) {
  return useQuery({
    queryKey: ["cash", "cut-payments", cutId],
    enabled: !!cutId,
    queryFn: async () =>
      unwrap(
        await getSupabase().from("payments").select("*").eq("cash_cut_id", cutId!).order("created_at", { ascending: false }),
      ) as Payment[],
  });
}

export function useCutCashExpenses(cutId: string | undefined) {
  return useQuery({
    queryKey: ["cash", "cut-expenses", cutId],
    enabled: !!cutId,
    queryFn: async () => {
      const rows = unwrap(
        await getSupabase().from("operational_expenses").select("amount").eq("cash_cut_id", cutId!).eq("paid_from_cash", true),
      ) as { amount: number }[];
      return rows.reduce((a, r) => a + Number(r.amount), 0);
    },
  });
}

export function useCutHistory() {
  return useQuery({
    queryKey: qk.cash.history,
    queryFn: async () =>
      unwrap(
        await getSupabase().from("cash_cuts").select("*").eq("status", "closed").order("closed_at", { ascending: false }).limit(10),
      ) as CashCut[],
  });
}

export function useOpenCashCut() {
  const qc = useQueryClient();
  const { profile } = useSession();
  return useMutation({
    mutationFn: async (v: { opening_amount: number; register_name: string }) =>
      unwrap(
        await getSupabase()
          .from("cash_cuts")
          .insert({ ...v, opened_by: profile.id, status: "open" })
          .select()
          .single(),
      ) as CashCut,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["cash"] }),
  });
}

export function useCloseCashCut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; counted: number; notes?: string }) =>
      unwrap(
        await getSupabase().rpc("close_cash_cut", {
          p_cash_cut_id: v.id,
          p_counted_cash: v.counted,
          p_notes: v.notes ?? null,
        }),
      ) as CashCut,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["cash"] }),
  });
}

export function useRegisterPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { work_order_id: string; method: PaymentMethod; amount: number; reference?: string }) =>
      unwrap(await getSupabase().from("payments").insert(v).select().single()) as Payment,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.board });
      void qc.invalidateQueries({ queryKey: ["cash"] });
    },
  });
}
