import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components/login-form";
import loginBg from "../../../../public/img/logo.webp";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      {/* Fondo: import estático → Next lo optimiza (AVIF/WebP por tamaño) y genera un blur mientras carga */}
      <Image
        src={loginBg}
        alt=""
        fill
        priority
        placeholder="blur"
        sizes="100vw"
        className="-z-20 object-cover object-center"
      />
      {/* Velo para que el formulario sea legible sobre cualquier zona de la foto */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0d1b2a]/55 via-[#0d1b2a]/45 to-[#0d1b2a]/75" />
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
