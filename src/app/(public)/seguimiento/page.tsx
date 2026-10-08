import type { Metadata } from "next";
import { PlateLookup } from "@/features/public-tracking/components/plate-lookup";

export const metadata: Metadata = { title: "Seguimiento de tu vehículo" };

export default function SeguimientoPage() {
  return (
    <main className="min-h-dvh px-5 py-12">
      <PlateLookup />
    </main>
  );
}
