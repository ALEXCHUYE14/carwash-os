import type { Metadata } from "next";
import { CustomersScreen } from "@/features/customers/components/customers-screen";

export const metadata: Metadata = { title: "Clientes" };

export default function ClientesPage() {
  return <CustomersScreen />;
}
