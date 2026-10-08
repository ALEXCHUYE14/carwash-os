"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import { getSupabase } from "@/shared/lib/supabase/client";
import type { OrderStatus } from "@/shared/types/domain";

export interface StatusBroadcast {
  order_number: string;
  status: OrderStatus;
  status_label: string;
  sla_due_at: string | null;
  ready_at: string | null;
}

type Listener = (s: StatusBroadcast) => void;

/**
 * Un solo canal por token, compartido entre componentes. El nombre debe coincidir con el que
 * emite la BD, así que no se le puede añadir sufijo; Supabase reutiliza canales con el mismo
 * nombre y los elimina de forma asíncrona, por eso se cuenta cuántos lo usan y se libera
 * en el siguiente tick (StrictMode desmonta y vuelve a montar al instante).
 */
const shared = new Map<string, { channel: RealtimeChannel; listeners: Set<Listener> }>();

function subscribe(token: string, listener: Listener): () => void {
  let entry = shared.get(token);
  if (!entry) {
    const listeners = new Set<Listener>();
    const channel = getSupabase()
      .channel(`order:${token}`)
      .on("broadcast", { event: "status_changed" }, ({ payload }) =>
        listeners.forEach((l) => l(payload as StatusBroadcast)),
      )
      .subscribe();
    entry = { channel, listeners };
    shared.set(token, entry);
  }
  entry.listeners.add(listener);
  const current = entry;
  return () => {
    current.listeners.delete(listener);
    setTimeout(() => {
      if (current.listeners.size === 0 && shared.get(token) === current) {
        shared.delete(token);
        void getSupabase().removeChannel(current.channel);
      }
    }, 0);
  };
}

/**
 * Canal Realtime Broadcast "order:<token>" emitido por la BD (private.broadcast_order).
 * No requiere login ni expone tablas: solo quien tiene el token recibe el estado.
 */
export function useOrderBroadcast(token: string | null | undefined, onStatus: Listener) {
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  });

  useEffect(() => {
    if (!token) return;
    return subscribe(token, (s) => onStatusRef.current(s));
  }, [token]);
}
