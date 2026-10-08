"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/shared/lib/utils";
import type { OrderStatus } from "@/shared/types/domain";

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: "received", label: "Recibido" },
  { key: "washing", label: "Lavando" },
  { key: "drying_detailing", label: "Secado y detalle" },
  { key: "quality_check", label: "Control de calidad" },
  { key: "ready", label: "¡Listo para recoger!" },
];

export function StatusStepper({ status }: { status: OrderStatus }) {
  const idx = status === "delivered" ? STEPS.length : STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="space-y-0">
      {STEPS.map((s, i) => {
        const done = i < idx || status === "delivered";
        const current = i === idx;
        return (
          <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
            {i < STEPS.length - 1 && (
              <span className={cn("absolute top-8 left-[15px] h-[calc(100%-24px)] w-0.5", done ? "bg-emerald" : "bg-line")} />
            )}
            <span
              className={cn(
                "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold",
                done && "border-emerald bg-emerald text-bg",
                current && (s.key === "ready" ? "border-emerald bg-emerald-soft text-emerald" : "border-cyan bg-cyan-soft text-cyan"),
                !done && !current && "border-line-strong text-fg-subtle",
              )}
            >
              {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              {current && s.key !== "ready" && (
                <motion.span
                  className="absolute inset-0 rounded-full border-2 border-cyan"
                  animate={{ scale: [1, 1.6], opacity: [0.7, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
              )}
            </span>
            <div className="pt-1">
              <p className={cn("font-semibold", !done && !current && "text-fg-subtle", current && "text-fg")}>{s.label}</p>
              {current && s.key !== "ready" && <p className="text-xs text-cyan">En proceso ahora</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
