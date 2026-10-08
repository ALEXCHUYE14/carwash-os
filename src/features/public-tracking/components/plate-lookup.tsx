"use client";

import { Clock, Droplets, MapPin, Search, Ticket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatTime } from "@/shared/lib/format";
import { getSupabase } from "@/shared/lib/supabase/client";
import { normalizePlate } from "@/shared/lib/utils";
import type { PlateTrackingResult } from "@/shared/types/domain";
import { Button, buttonVariants } from "@/shared/ui/button";
import { Card, CardBody } from "@/shared/ui/card";
import { useOrderBroadcast } from "../hooks/use-order-broadcast";
import { StatusStepper } from "./status-stepper";

export function PlateLookup() {
  const [plate, setPlate] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlateTrackingResult | null>(null);
  const [notFound, setNotFound] = useState(false);

  useOrderBroadcast(result?.public_token, (s) =>
    setResult((r) => (r ? { ...r, status: s.status, status_label: s.status_label, eta: s.sla_due_at, ready_at: s.ready_at } : r)),
  );

  const search = async () => {
    const p = normalizePlate(plate);
    if (p.length < 5) return;
    setLoading(true);
    setNotFound(false);
    const { data } = await getSupabase().rpc("portal_track_by_plate", { p_plate: p });
    const row = (data as PlateTrackingResult[] | null)?.[0] ?? null;
    setResult(row);
    setNotFound(!row);
    setLoading(false);
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-cyan-soft text-cyan ring-1 ring-cyan/30">
          <Droplets className="size-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">¿Cómo va mi auto?</h1>
        <p className="mt-1 text-sm text-fg-muted">Ingresa tu placa y sigue el avance en tiempo real.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        className="flex gap-2"
      >
        <input
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          placeholder="ABC-123"
          autoCapitalize="characters"
          className="h-14 min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-4 text-center font-mono text-2xl font-bold tracking-[0.2em] placeholder:text-fg-subtle focus:border-cyan focus:ring-2 focus:ring-cyan/25 focus:outline-none"
        />
        <Button type="submit" size="xl" loading={loading} aria-label="Buscar">
          <Search />
        </Button>
      </form>

      {notFound && (
        <p className="mt-6 rounded-xl border border-line bg-surface px-4 py-3 text-center text-sm text-fg-muted">
          No encontramos un servicio en curso para esa placa.
        </p>
      )}

      {result && (
        <Card className="mt-6">
          <CardBody className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-fg-subtle">{result.business_name}</p>
                <p className="text-lg font-bold">{result.order_number}</p>
              </div>
              {result.bay_name && (
                <span className="flex items-center gap-1 text-sm text-fg-muted">
                  <MapPin className="size-4" /> {result.bay_name}
                </span>
              )}
            </div>
            <StatusStepper status={result.status} />
            {result.status !== "ready" && result.status !== "delivered" && result.eta && (
              <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm">
                <Clock className="size-4 text-cyan" /> Hora estimada de entrega: <b>{formatTime(result.eta)}</b>
              </p>
            )}
            <Link href={`/t/${result.public_token}`} className={buttonVariants({ variant: "secondary", size: "lg", className: "w-full" })}>
              <Ticket /> Ver ticket digital
            </Link>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
