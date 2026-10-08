import type { Metadata } from "next";
import { KardexScreen } from "@/features/inventory/components/inventory-screen";

export const metadata: Metadata = { title: "Kardex" };

export default async function KardexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KardexScreen itemId={id} />;
}
