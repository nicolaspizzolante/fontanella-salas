import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { Marco } from "@/front/componentes/marco";
import "./globals.css";

// Archivo, de la fundidora argentina Omnibus-Type. El eje de ancho permite la
// voz angosta de cartel sin sumar una segunda familia.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--fuente-archivo",
});

export const metadata: Metadata = {
  title: "Salas · Reservas de salas de reuniones",
  description: "Reservá salas de reuniones y consultá su disponibilidad.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full bg-suelo text-tinta">
        <Marco>{children}</Marco>
      </body>
    </html>
  );
}
