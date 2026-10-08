"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-cyan text-white hover:bg-cyan-hover shadow-sm",
        success: "bg-emerald text-white hover:bg-emerald-hover shadow-sm",
        warning: "bg-amber text-white hover:bg-amber-hover shadow-sm",
        danger: "bg-rose text-white hover:bg-rose-hover shadow-sm",
        secondary: "bg-surface text-fg hover:bg-surface-2 border border-line-strong shadow-sm",
        ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
        outline: "border border-line-strong bg-surface text-fg hover:bg-surface-2",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-5 text-base",
        xl: "h-14 px-6 text-base [&_svg]:size-5",
        icon: "size-11",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
