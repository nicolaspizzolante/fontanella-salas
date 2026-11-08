import { VistaMetricas } from "@/front/metricas/vista";

// Depende de la identidad elegida en el navegador: ver src/app/page.tsx.
export const instant = false;

export default function PaginaMetricas() {
  return <VistaMetricas />;
}
