import type { Metadata } from "next";
import { CheckInScreen } from "@/features/check-in/components/check-in-screen";
import { PageHeader } from "@/shared/ui/card";

export const metadata: Metadata = { title: "Recepción" };

export default function RecepcionPage() {
  return (
    <>
      <PageHeader title="Recepción express" description="Busca la placa, elige servicios y registra el ingreso en menos de 30 segundos." />
      <CheckInScreen />
    </>
  );
}
