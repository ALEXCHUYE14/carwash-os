"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/shared/lib/utils";

interface Option<T extends string> {
  value: T;
  label: string;
}

/** Selector tipo "pastillas" con indicador animado. Tap targets ≥ 44px. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly Option<T>[];
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div
      role="tablist"
      className={cn("inline-flex rounded-xl border border-line bg-surface-2 p-1", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex-1 rounded-lg px-3 font-semibold whitespace-nowrap transition-colors",
              size === "sm" ? "h-8 text-xs" : "h-10 text-sm",
              active ? "text-fg" : "text-fg-subtle hover:text-fg-muted",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-lg bg-surface shadow-sm ring-1 ring-line"
                transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
