"use client";

import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** "center" para modales, "sheet" para panel lateral (tablet/desktop) que en móvil sube desde abajo */
  variant?: "center" | "sheet";
  className?: string;
}

export function Dialog({ open, onOpenChange, title, description, children, footer, variant = "center", className }: DialogProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-fg/35 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <RD.Content
          className={cn(
            "fixed z-50 flex max-h-[92dvh] flex-col border border-line bg-surface shadow-2xl focus:outline-none",
            variant === "center"
              ? "inset-x-3 bottom-3 rounded-2xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2"
              : "inset-x-0 bottom-0 rounded-t-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md sm:rounded-none sm:rounded-l-2xl",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <RD.Title className="text-base font-semibold">{title}</RD.Title>
              {description ? (
                <RD.Description className="mt-0.5 text-[13px] text-fg-subtle">{description}</RD.Description>
              ) : (
                <RD.Description className="sr-only">{title}</RD.Description>
              )}
            </div>
            <RD.Close className="grid size-9 place-items-center rounded-lg text-fg-subtle hover:bg-surface-2 hover:text-fg">
              <X className="size-4" />
              <span className="sr-only">Cerrar</span>
            </RD.Close>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="safe-bottom flex gap-2 border-t border-line px-5 pt-3">{footer}</div>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
