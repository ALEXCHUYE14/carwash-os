import { forwardRef, useEffect, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

// En móvil la letra es de 16 px: con menos, Safari (iOS) hace zoom automático al tocar el campo
// y la página queda ampliada y desalineada con el encabezado.
const fieldBase =
  "w-full rounded-xl border border-line-strong bg-surface px-3.5 text-base text-fg sm:text-[15px] placeholder:text-fg-subtle transition-colors hover:border-line-strong focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/25 disabled:opacity-50 aria-[invalid=true]:border-rose";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldBase, "h-11", className)} {...props} />,
);
Input.displayName = "Input";

/**
 * Campo numérico controlado. Conserva el texto mientras se escribe ("0.", "1,5", "") y solo
 * emite valores válidos, así no se pierden los decimales ni se fuerza un 0 al borrar.
 */
export function NumberInput({
  value,
  onValueChange,
  integer = false,
  min,
  max,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max" | "type"> & {
  value: number | null | undefined;
  onValueChange: (v: number) => void;
  integer?: boolean;
  min?: number;
  max?: number;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));

  // Sincroniza si el valor cambia desde fuera (p. ej. al recargar datos)
  useEffect(() => {
    setText((t) => (Number(t.replace(",", ".")) === value ? t : value == null ? "" : String(value)));
  }, [value]);

  const parsed = Number(text.replace(",", "."));
  const invalid =
    text.trim() === "" ||
    !Number.isFinite(parsed) ||
    (integer && !Number.isInteger(parsed)) ||
    (min !== undefined && parsed < min) ||
    (max !== undefined && parsed > max);

  return (
    <Input
      {...props}
      inputMode={integer ? "numeric" : "decimal"}
      value={text}
      aria-invalid={invalid || undefined}
      className={className}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = Number(t.replace(",", "."));
        if (
          t.trim() !== "" &&
          Number.isFinite(n) &&
          (!integer || Number.isInteger(n)) &&
          (min === undefined || n >= min) &&
          (max === undefined || n <= max)
        ) {
          onValueChange(n);
        }
      }}
    />
  );
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, "min-h-[88px] py-2.5 leading-relaxed", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        fieldBase,
        "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%236a716d%22 stroke-width=%222%22 viewBox=%220 0 24 24%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium text-fg-muted", className)} {...props} />;
}

export function Field({
  label,
  error,
  hint,
  htmlFor,
  className,
  children,
}: {
  label?: string;
  error?: string;
  hint?: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? (
        <p className="text-xs font-medium text-rose">{error}</p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 transition-colors hover:border-line-strong",
        checked && "border-cyan/50 bg-cyan-soft",
        className,
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-[var(--color-cyan)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="text-xs text-fg-subtle">{description}</span>}
      </span>
    </label>
  );
}
