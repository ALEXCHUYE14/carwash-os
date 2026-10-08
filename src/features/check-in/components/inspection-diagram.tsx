"use client";

import { AnimatePresence, motion } from "motion/react";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { haptic } from "@/shared/hooks/use-now";
import { DAMAGE_TYPES, VEHICLE_VIEWS, type DamageType, type InspectionMarkInput, type VehicleView } from "@/shared/types/domain";

export const DAMAGE_META: Record<DamageType, { label: string; short: string; color: string }> = {
  scratch: { label: "Rayón", short: "R", color: "#c98a12" },
  dent: { label: "Abolladura", short: "A", color: "#c2453a" },
  crack: { label: "Rajadura", short: "J", color: "#d4682a" },
  chip: { label: "Desportillado", short: "D", color: "#7a63b0" },
  stain: { label: "Mancha", short: "M", color: "#2f7fb0" },
  missing_part: { label: "Pieza faltante", short: "F", color: "#b0509a" },
  other: { label: "Otro", short: "O", color: "#7d8580" },
};

const VIEW_LABEL: Record<VehicleView, string> = {
  top: "Superior",
  left: "Izquierda",
  right: "Derecha",
  front: "Frontal",
  rear: "Posterior",
};

/* Siluetas 2D genéricas. Las coordenadas de las marcas se guardan en % (0–100),
   así el diagrama puede re-dibujarse a cualquier tamaño o con otra silueta. */
const VIEWBOX: Record<VehicleView, [number, number]> = {
  top: [200, 380],
  left: [400, 180],
  right: [400, 180],
  front: [260, 200],
  rear: [260, 200],
};

function Silhouette({ view }: { view: VehicleView }): ReactNode {
  const body = "fill-surface-3 stroke-line-strong";
  const glass = "fill-[#d6e6ea] stroke-[#9fbcc3]";
  const wheel = "fill-[#3a403d] stroke-[#2a2f2d]";
  switch (view) {
    case "top":
      return (
        <g strokeWidth={2}>
          <rect x={26} y={20} width={22} height={58} rx={8} className={wheel} />
          <rect x={152} y={20} width={22} height={58} rx={8} className={wheel} />
          <rect x={26} y={290} width={22} height={58} rx={8} className={wheel} />
          <rect x={152} y={290} width={22} height={58} rx={8} className={wheel} />
          <rect x={38} y={8} width={124} height={364} rx={46} className={body} />
          <path d="M52 112 Q100 88 148 112 L140 150 Q100 140 60 150 Z" className={glass} />
          <rect x={58} y={154} width={84} height={118} rx={12} className="fill-surface-2 stroke-line-strong" />
          <path d="M60 280 Q100 290 140 280 L146 314 Q100 330 54 314 Z" className={glass} />
          <text x={100} y={44} textAnchor="middle" className="fill-fg-subtle text-[11px] font-semibold">FRENTE</text>
        </g>
      );
    case "left":
    case "right": {
      const flip = view === "right" ? "translate(400 0) scale(-1 1)" : undefined;
      return (
        <g strokeWidth={2} transform={flip}>
          <path
            d="M18 120 L22 92 Q30 80 70 76 L118 72 Q150 36 196 32 L262 32 Q300 34 330 72 L370 82 Q388 88 384 120 L382 132 L18 132 Z"
            className={body}
          />
          <path d="M126 72 Q154 42 196 40 L222 40 L222 72 Z" className={glass} />
          <path d="M230 40 L262 40 Q292 42 318 72 L230 72 Z" className={glass} />
          <line x1={226} y1={74} x2={226} y2={128} className="stroke-line-strong" />
          <circle cx={92} cy={132} r={30} className={wheel} />
          <circle cx={92} cy={132} r={13} className="fill-surface-3" />
          <circle cx={312} cy={132} r={30} className={wheel} />
          <circle cx={312} cy={132} r={13} className="fill-surface-3" />
        </g>
      );
    }
    case "front":
    case "rear":
      return (
        <g strokeWidth={2}>
          <rect x={30} y={150} width={36} height={42} rx={8} className={wheel} />
          <rect x={194} y={150} width={36} height={42} rx={8} className={wheel} />
          <path d="M26 112 Q30 70 70 58 L190 58 Q230 70 234 112 L238 168 L22 168 Z" className={body} />
          <path d="M66 66 L194 66 L212 108 L48 108 Z" className={glass} />
          <rect x={34} y={122} width={46} height={18} rx={6} className={view === "front" ? "fill-[#f3e7b5]" : "fill-rose/60"} />
          <rect x={180} y={122} width={46} height={18} rx={6} className={view === "front" ? "fill-[#f3e7b5]" : "fill-rose/60"} />
          <rect x={98} y={140} width={64} height={18} rx={3} className="fill-fg/80" />
        </g>
      );
  }
}

interface DiagramProps {
  marks: InspectionMarkInput[];
  view: VehicleView;
  onViewChange: (v: VehicleView) => void;
  activeDamage?: DamageType;
  onDamageChange?: (d: DamageType) => void;
  onAdd?: (m: InspectionMarkInput) => void;
  onRemove?: (index: number) => void;
  readOnly?: boolean;
}

export function InspectionDiagram({
  marks,
  view,
  onViewChange,
  activeDamage = "scratch",
  onDamageChange,
  onAdd,
  onRemove,
  readOnly,
}: DiagramProps) {
  const [w, h] = VIEWBOX[view];

  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    if (readOnly || !onAdd) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
    haptic(15);
    onAdd({ view, x, y, damage_type: activeDamage, severity: 1 });
  };

  const counts = VEHICLE_VIEWS.map((v) => marks.filter((m) => m.view === v).length);

  return (
    <div className="space-y-3">
      <div className="scrollbar-thin flex gap-1.5 overflow-x-auto pb-1">
        {VEHICLE_VIEWS.map((v, i) => (
          <button
            key={v}
            type="button"
            onClick={() => onViewChange(v)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold whitespace-nowrap",
              v === view ? "border-cyan/50 bg-cyan-soft text-cyan" : "border-line bg-surface-2 text-fg-muted",
            )}
          >
            {VIEW_LABEL[v]}
            {counts[i] ? <span className="rounded-full bg-amber px-1.5 text-[10px] text-bg">{counts[i]}</span> : null}
          </button>
        ))}
      </div>

      <div className="grid place-items-center rounded-2xl border border-dashed border-line-strong bg-[radial-gradient(circle_at_center,var(--color-surface-2),var(--color-surface))] p-4">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          onClick={handleClick}
          className={cn("h-auto max-h-[340px] w-full touch-manipulation", !readOnly && "cursor-crosshair")}
          role="img"
          aria-label={`Vista ${VIEW_LABEL[view]} del vehículo`}
        >
          <Silhouette view={view} />
          <AnimatePresence>
            {marks.map((m, i) =>
              m.view !== view ? null : (
                <motion.g
                  key={`${m.view}-${m.x}-${m.y}-${i}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  style={{ originX: `${(m.x / 100) * w}px`, originY: `${(m.y / 100) * h}px` }}
                  onClick={(e) => {
                    if (readOnly || !onRemove) return;
                    e.stopPropagation();
                    onRemove(i);
                  }}
                  className={readOnly ? undefined : "cursor-pointer"}
                >
                  <circle
                    cx={(m.x / 100) * w}
                    cy={(m.y / 100) * h}
                    r={11}
                    fill={DAMAGE_META[m.damage_type].color}
                    fillOpacity={0.25}
                    stroke={DAMAGE_META[m.damage_type].color}
                    strokeWidth={2}
                  />
                  <text
                    x={(m.x / 100) * w}
                    y={(m.y / 100) * h + 4}
                    textAnchor="middle"
                    className="pointer-events-none text-[11px] font-bold"
                    fill={DAMAGE_META[m.damage_type].color}
                  >
                    {DAMAGE_META[m.damage_type].short}
                  </text>
                </motion.g>
              ),
            )}
          </AnimatePresence>
        </svg>
      </div>

      {!readOnly && onDamageChange && (
        <div className="flex flex-wrap gap-1.5">
          {DAMAGE_TYPES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDamageChange(d)}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold",
                d === activeDamage ? "border-fg/40 bg-surface-3 text-fg" : "border-line text-fg-muted",
              )}
            >
              <span className="size-2.5 rounded-full" style={{ background: DAMAGE_META[d].color }} />
              {DAMAGE_META[d].label}
            </button>
          ))}
        </div>
      )}
      {!readOnly && (
        <p className="text-xs text-fg-subtle">
          Toca el dibujo para marcar un daño previo. Toca una marca para quitarla.
        </p>
      )}
    </div>
  );
}
