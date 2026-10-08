import type { Metadata } from "next";
import { ReportsScreen } from "@/features/reports/components/reports-screen";

export const metadata: Metadata = { title: "Reportes" };

export default function ReportesPage() {
  return <ReportsScreen />;
}
