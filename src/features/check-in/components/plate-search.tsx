"use client";

import { Award, Car, Search, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn, displayPlate, normalizePlate } from "@/shared/lib/utils";
import { relativeTime } from "@/shared/lib/format";
import { useVehicleSearch } from "../hooks/use-check-in";
import { useCheckIn } from "../store/check-in.store";

/** Búsqueda por placa con autocompletado de clientes recurrentes. */
export function PlateSearch({ error }: { error?: string }) {
  const { match, vehicle, setVehicle, setMatch } = useCheckIn();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: results = [], isFetching } = useVehicleSearch(match ? "" : vehicle.plate);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (match) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-cyan/40 bg-cyan-soft p-4">
        <div className="rounded-xl border-2 border-fg/80 bg-fg px-3 py-1.5 font-mono text-xl font-extrabold tracking-[0.15em] text-bg">
          {displayPlate(match.plate)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{match.customer_name}</p>
          <p className="truncate text-[13px] text-fg-muted">
            {[match.vehicle_label, match.vehicle_type].filter(Boolean).join(" · ")}
            {match.last_visit && ` · última visita ${relativeTime(match.last_visit)}`}
          </p>
          {match.open_order_number && (
            <p className="mt-1 text-xs font-semibold text-amber">⚠ Ya tiene la orden {match.open_order_number} en curso</p>
          )}
        </div>
        {match.rewards_available > 0 && (
          <span className="hidden items-center gap-1 rounded-full bg-emerald-soft px-2.5 py-1 text-xs font-bold text-emerald sm:flex">
            <Award className="size-3.5" /> Premio disponible
          </span>
        )}
        <button
          onClick={() => {
            setMatch(null);
            setVehicle({ plate: "", vehicle_type_id: "" });
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="grid size-10 place-items-center rounded-xl text-fg-muted hover:bg-surface-2 hover:text-fg"
          aria-label="Cambiar vehículo"
        >
          <X className="size-5" />
        </button>
      </div>
    );
  }

  const showList = focused && vehicle.plate.trim().length >= 2;

  return (
    <div className="relative">
      <div
        className={cn(
          "flex h-16 items-center gap-3 rounded-2xl border bg-surface-2 px-4 transition-colors focus-within:border-cyan focus-within:ring-2 focus-within:ring-cyan/25",
          error ? "border-rose" : "border-line",
        )}
      >
        <Search className="size-5 text-fg-subtle" />
        <input
          ref={inputRef}
          value={vehicle.plate}
          onChange={(e) => setVehicle({ plate: e.target.value.toUpperCase() })}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Placa, nombre o celular"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="h-full flex-1 bg-transparent font-mono text-2xl font-bold tracking-[0.12em] placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-fg-subtle focus:outline-none"
        />
        {isFetching && <span className="size-4 animate-spin rounded-full border-2 border-cyan border-t-transparent" />}
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-rose">{error}</p>}

      {showList && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-line-strong bg-surface-2 shadow-2xl">
          {results.map((r) => (
            <button
              key={r.vehicle_id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMatch(r)}
              className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface-3"
            >
              <span className="rounded-md bg-fg px-2 py-0.5 font-mono text-sm font-extrabold tracking-wider text-bg">
                {displayPlate(r.plate)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                  <UserRound className="size-3.5 text-fg-subtle" /> {r.customer_name}
                </span>
                <span className="flex items-center gap-1.5 truncate text-xs text-fg-subtle">
                  <Car className="size-3.5" /> {r.vehicle_label ?? r.vehicle_type}
                </span>
              </span>
              <span className="text-xs text-fg-subtle tabular">
                {r.stamps_current} sello{r.stamps_current === 1 ? "" : "s"}
              </span>
            </button>
          ))}
          <div className="flex items-center gap-2 bg-surface px-4 py-3 text-[13px] text-fg-muted">
            <span className="size-1.5 rounded-full bg-cyan" />
            {results.length === 0 && !isFetching ? "Sin coincidencias. " : ""}
            Registrar como vehículo nuevo:{" "}
            <span className="font-mono font-bold text-fg">{displayPlate(normalizePlate(vehicle.plate))}</span>
          </div>
        </div>
      )}
    </div>
  );
}
