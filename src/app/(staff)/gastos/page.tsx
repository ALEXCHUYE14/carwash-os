import type { Metadata } from "next";
import { Suspense } from "react";
import { ExpensesScreen } from "@/features/expenses/components/expenses-screen";

export const metadata: Metadata = { title: "Gastos" };

export default function GastosPage() {
  return (
    <Suspense>
      <ExpensesScreen />
    </Suspense>
  );
}
