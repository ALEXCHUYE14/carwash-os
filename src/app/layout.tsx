import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "@/styles/globals.css";

// Auto-hospedada por Next: sin petición bloqueante a Google Fonts ni salto de texto al cargar.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: { default: "CarWash OS", template: "%s · CarWash OS" },
  description: "Gestión integral para Car Wash & Auto Detailing",
  applicationName: "CarWash OS",
  appleWebApp: { capable: true, title: "CarWash OS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f5f4f0",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-PE" className={jakarta.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
