import type { Metadata } from "next";
import { SetPasswordForm } from "@/features/auth/components/set-password-form";

export const metadata: Metadata = { title: "Crear contraseña" };

export default function SetPasswordPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <SetPasswordForm />
    </main>
  );
}
