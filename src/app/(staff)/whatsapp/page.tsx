import type { Metadata } from "next";
import { WhatsappScreen } from "@/features/whatsapp/components/whatsapp-screen";

export const metadata: Metadata = { title: "WhatsApp" };

export default function WhatsappPage() {
  return <WhatsappScreen />;
}
