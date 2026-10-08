import type { Metadata } from "next";
import { CashScreen } from "@/features/cash/components/cash-screen";

export const metadata: Metadata = { title: "Caja" };

export default function CajaPage() {
  return <CashScreen />;
}
