"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Paperclip, Plus, Receipt } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useSession } from "@/features/auth/hooks/use-session";
import { unwrap } from "@/shared/lib/errors";
import { firstDayOfMonthISO, formatDate, money, todayISO } from "@/shared/lib/format";
import { EXPENSE_CATEGORY_LABEL, PAYMENT_METHOD_LABEL } from "@/shared/lib/labels";
import { qk } from "@/shared/lib/query-keys";
import { getSupabase } from "@/shared/lib/supabase/client";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type ExpenseCategory, type OperationalExpense } from "@/shared/types/domain";
import { Button } from "@/shared/ui/button";
import { Badge, Card, EmptyState, PageHeader, StatTile } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/shared/ui/input";
import { Table, TBody, Td, Th, THead, Tr } from "@/shared/ui/table";

const CASHIER_CATEGORIES: ExpenseCategory[] = ["utilities", "supplies", "machinery_maintenance", "misc"];

const schema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().min(3, "Describe el gasto"),
  amount: z.coerce.number<string>().positive("Monto inválido"),
  expense_date: z.string().min(10),
  payment_method: z.enum(PAYMENT_METHODS),
  paid_from_cash: z.boolean(),
  supplier: z.string().trim().optional(),
  document_type: z.enum(["boleta", "factura", "recibo", "ticket", "ninguno"]),
  document_number: z.string().trim().optional(),
});
type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

async function uploadReceipt(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${todayISO().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await getSupabase().storage.from("expense-receipts").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

function ExpenseDialog({ open, onClose, cashMode }: { open: boolean; onClose: () => void; cashMode: boolean }) {
  const { isManager } = useSession();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const categories = isManager ? EXPENSE_CATEGORIES : CASHIER_CATEGORIES;

  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: "misc",
      description: "",
      amount: "",
      expense_date: todayISO(),
      payment_method: "cash",
      paid_from_cash: cashMode || !isManager,
      supplier: "",
      document_type: "boleta",
      document_number: "",
    },
  });

  const save = useMutation({
    mutationFn: async (v: FormOut) => {
      const receipt_path = file ? await uploadReceipt(file) : null;
      return unwrap(
        await getSupabase()
          .from("operational_expenses")
          .insert({
            ...v,
            supplier: v.supplier || null,
            document_number: v.document_number || null,
            receipt_path,
          })
          .select()
          .single(),
      ) as OperationalExpense;
    },
    onSuccess: () => {
      toast.success("Gasto registrado");
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      void qc.invalidateQueries({ queryKey: ["cash"] });
      form.reset();
      setFile(null);
      onClose();
    },
  });

  const { errors } = form.formState;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Registrar gasto"
      variant="sheet"
      footer={
        <Button size="lg" className="w-full" loading={save.isPending} onClick={form.handleSubmit((v) => save.mutate(v))}>
          Guardar gasto
        </Button>
      }
    >
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <Field label="Categoría" error={errors.category?.message}>
          <Select {...form.register("category")}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Descripción" error={errors.description?.message}>
          <Input {...form.register("description")} placeholder="Ej. Recibo de agua de setiembre" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto" error={errors.amount?.message}>
            <Input
              inputMode="decimal"
              {...form.register("amount", { setValueAs: (v) => String(v ?? "").replace(",", ".").trim() })}
              className="font-bold"
            />
          </Field>
          <Field label="Fecha">
            <Input type="date" {...form.register("expense_date")} />
          </Field>
        </div>
        {isManager && <Controller
          control={form.control}
          name="paid_from_cash"
          render={({ field }) => (
            <Checkbox
              checked={field.value}
              onChange={(v) => {
                field.onChange(v);
                if (v) form.setValue("payment_method", "cash");
              }}
              label="Pagado con efectivo de la caja del turno"
              description="Se descuenta del efectivo esperado en el arqueo."
            />
          )}
        />}
        {!form.watch("paid_from_cash") && (
          <Field label="Medio de pago">
            <Select {...form.register("payment_method")}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Proveedor">
          <Input {...form.register("supplier")} placeholder="Opcional" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Comprobante">
            <Select {...form.register("document_type")}>
              <option value="boleta">Boleta</option>
              <option value="factura">Factura</option>
              <option value="recibo">Recibo</option>
              <option value="ticket">Ticket</option>
              <option value="ninguno">Ninguno</option>
            </Select>
          </Field>
          <Field label="N.º">
            <Input {...form.register("document_number")} placeholder="F001-123" />
          </Field>
        </div>
        <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 text-sm text-fg-muted hover:border-cyan hover:text-fg">
          <Paperclip className="size-4" />
          <span className="truncate">{file ? file.name : "Adjuntar foto o PDF del comprobante"}</span>
          <input
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </form>
    </Dialog>
  );
}

export function ExpensesScreen() {
  const params = useSearchParams();
  const cashMode = params.get("caja") === "1";
  const [open, setOpen] = useState(cashMode);
  const [from, setFrom] = useState(firstDayOfMonthISO());
  const [to, setTo] = useState(todayISO());

  useEffect(() => setOpen(cashMode), [cashMode]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.expenses(from, to),
    queryFn: async () =>
      unwrap(
        await getSupabase()
          .from("operational_expenses")
          .select("*")
          .gte("expense_date", from)
          .lte("expense_date", to)
          .order("expense_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ) as OperationalExpense[],
  });

  const byCat = useMemo(() => {
    const m = new Map<ExpenseCategory, number>();
    rows.forEach((r) => m.set(r.category, (m.get(r.category) ?? 0) + Number(r.amount)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);

  const openReceipt = async (path: string) => {
    const { data, error } = await getSupabase().storage.from("expense-receipts").createSignedUrl(path, 120);
    if (error || !data) return toast.error("No se pudo abrir el comprobante");
    window.open(data.signedUrl, "_blank");
  };

  return (
    <>
      <PageHeader
        title="Gastos operativos"
        description="Servicios, nómina, comisiones, insumos y mantenimiento"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> Nuevo gasto
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Desde">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total del periodo" value={money(total)} tone="amber" icon={<Receipt />} hint={`${rows.length} registros`} />
        {byCat.slice(0, 3).map(([c, v]) => (
          <StatTile key={c} label={EXPENSE_CATEGORY_LABEL[c]} value={money(v)} hint={total ? `${((v / total) * 100).toFixed(0)}% del total` : undefined} />
        ))}
      </div>

      <Card>
        {!isLoading && rows.length === 0 ? (
          <EmptyState icon={<Receipt />} title="Sin gastos en el periodo" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Fecha</Th>
                <Th>Categoría</Th>
                <Th>Descripción</Th>
                <Th>Pago</Th>
                <Th>Comprobante</Th>
                <Th className="text-right">Monto</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap text-fg-muted">{formatDate(r.expense_date + "T12:00:00")}</Td>
                  <Td>
                    <Badge tone={r.category === "payroll" || r.category === "washer_commissions" ? "violet" : "neutral"}>
                      {EXPENSE_CATEGORY_LABEL[r.category]}
                    </Badge>
                  </Td>
                  <Td>
                    <p className="font-medium">{r.description}</p>
                    {r.supplier && <p className="text-xs text-fg-subtle">{r.supplier}</p>}
                  </Td>
                  <Td className="text-fg-muted">{r.paid_from_cash ? "Caja chica" : PAYMENT_METHOD_LABEL[r.payment_method]}</Td>
                  <Td>
                    {r.receipt_path ? (
                      <button onClick={() => openReceipt(r.receipt_path!)} className="flex items-center gap-1 text-cyan hover:underline">
                        <FileText className="size-3.5" /> {r.document_number ?? "Ver"}
                      </button>
                    ) : (
                      <span className="text-fg-subtle">{r.document_number ?? "—"}</span>
                    )}
                  </Td>
                  <Td className="text-right font-semibold tabular">{money(r.amount)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <ExpenseDialog open={open} onClose={() => setOpen(false)} cashMode={cashMode} />
    </>
  );
}
