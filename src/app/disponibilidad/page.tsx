import { VistaDisponibilidad } from "@/front/disponibilidad/vista";

// Depende de la identidad elegida en el navegador: ver src/app/page.tsx.
export const instant = false;

export default function PaginaDisponibilidad() {
  return <VistaDisponibilidad />;
}
