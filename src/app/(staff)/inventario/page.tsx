import type { Metadata } from "next";
import { InventoryScreen } from "@/features/inventory/components/inventory-screen";

export const metadata: Metadata = { title: "Inventario" };

export default function InventarioPage() {
  return <InventoryScreen />;
}
