import type { Metadata } from "next";
import { AppointmentsScreen } from "@/features/appointments/components/appointments-screen";

export const metadata: Metadata = { title: "Citas" };

export default function CitasPage() {
  return <AppointmentsScreen />;
}
