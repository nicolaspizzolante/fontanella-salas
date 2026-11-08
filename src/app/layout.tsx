import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Marco } from "@/front/componentes/marco";
import "./globals.css";

// IBM Plex: una sans de oficio, precisa y tranquila, con su mono hermana para
// horas, ejes y cifras chicas. Dos pesos de trabajo (400 y 500) y 600 para énfasis.
const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--fuente-plex",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--fuente-plex-mono",
});

export const metadata: Metadata = {
  title: "Salas · Reservas de salas de reuniones",
  description: "Reservá salas de reuniones y consultá su disponibilidad.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes agrega la clase .dark antes de pintar: evita el aviso de hidratación.
    <html lang="es-AR" className={`${plex.variable} ${plexMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-suelo text-tinta">
        <Marco>{children}</Marco>
      </body>
    </html>
  );
}
