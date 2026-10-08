"use client";

import { Check, Clock, Plus } from "lucide-react";
import { estimateLine, useServices, useVehicleTypes } from "@/features/catalog/hooks/use-catalog";
import { duration, money } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Skeleton } from "@/shared/ui/card";
import { useCheckIn } from "../store/check-in.store";

export function ServicePicker({ error }: { error?: string }) {
  const { data, isLoading } = useServices();
  const { data: types = [] } = useVehicleTypes();
  const { serviceIds, toggleService, vehicle } = useCheckIn();
  const vt = types.find((t) => t.id === vehicle.vehicle_type_id);

  if (isLoading || !data) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const active = data.services.filter((s) => s.is_active);
  const main = active.filter((s) => !s.is_addon);
  const addons = active.filter((s) => s.is_addon);
  const mainIds = main.map((s) => s.id);

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-2">
        {main.map((s) => {
          const selected = serviceIds.includes(s.id);
          const { price, minutes } = estimateLine(s, vt, data.prices);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleService(s.id, mainIds)}
              className={cn(
                "relative flex min-h-24 flex-col items-start rounded-xl border p-3.5 text-left transition-all",
                selected
                  ? "border-cyan bg-cyan-soft shadow-[var(--shadow-glow-cyan)]"
                  : "border-line bg-surface-2 hover:border-line-strong",
              )}
            >
              <span
                className={cn(
                  "absolute top-3 right-3 grid size-6 place-items-center rounded-full border",
                  selected ? "border-cyan bg-cyan text-bg" : "border-line-strong",
                )}
              >
                {selected && <Check className="size-3.5" strokeWidth={3} />}
              </span>
              <span className="pr-8 font-semibold">{s.name}</span>
              {s.description && <span className="mt-0.5 line-clamp-1 text-xs text-fg-subtle">{s.description}</span>}
              <span className="mt-auto flex w-full items-end justify-between pt-2">
                <span className="text-lg font-bold tabular">{money(price)}</span>
                <span className="flex items-center gap-1 text-xs text-fg-subtle">
                  <Clock className="size-3" /> {duration(minutes)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {addons.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase">Add-ons</p>
          <div className="flex flex-wrap gap-2">
            {addons.map((s) => {
              const selected = serviceIds.includes(s.id);
              const { price } = estimateLine(s, vt, data.prices);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s.id)}
                  className={cn(
                    "flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
                    selected
                      ? "border-violet/60 bg-violet-soft text-violet"
                      : "border-line bg-surface-2 text-fg-muted hover:text-fg",
                  )}
                >
                  {selected ? <Check className="size-4" /> : <Plus className="size-4" />}
                  {s.name}
                  <span className="tabular opacity-80">{money(price)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {error && <p className="text-xs font-medium text-rose">{error}</p>}
    </div>
  );
}
