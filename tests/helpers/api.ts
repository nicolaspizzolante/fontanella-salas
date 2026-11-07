/**
 * Llama a los route handlers reales como lo haría Next.js: con un `Request` web
 * estándar. Así testeamos validación, identidad, reglas y base de datos juntos,
 * sin levantar un servidor HTTP.
 */
import * as rutaReservas from "@/app/api/reservas/route";
import * as rutaCancelar from "@/app/api/reservas/[id]/cancelar/route";
import * as rutaDisponibilidad from "@/app/api/disponibilidad/route";
import * as rutaSalas from "@/app/api/salas/route";

export type Como = { empresaId: string } | "admin" | "anonimo" | Record<string, string>;

function headersDe(como: Como): Record<string, string> {
  if (como === "admin") return { "x-rol": "admin" };
  if (como === "anonimo") return {};
  if ("empresaId" in como) return { "x-empresa-id": como.empresaId };
  return como;
}

function pedido(metodo: string, ruta: string, como: Como, cuerpo?: unknown) {
  const headers: Record<string, string> = { ...headersDe(como) };
  let body: string | undefined;
  if (cuerpo !== undefined) {
    headers["content-type"] = "application/json";
    body = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  }
  return new Request(`http://localhost${ruta}`, { method: metodo, headers, body });
}

async function aRespuesta(respuesta: Response) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as any };
}

export const api = {
  crearReserva: async (como: Como, cuerpo: unknown) =>
    aRespuesta(await rutaReservas.POST(pedido("POST", "/api/reservas", como, cuerpo))),

  listarReservas: async (como: Como, consulta = "") =>
    aRespuesta(await rutaReservas.GET(pedido("GET", `/api/reservas${consulta}`, como))),

  cancelarReserva: async (como: Como, id: string) =>
    aRespuesta(
      await rutaCancelar.POST(pedido("POST", `/api/reservas/${id}/cancelar`, como), {
        params: Promise.resolve({ id }),
      }),
    ),

  disponibilidad: async (como: Como, fecha: string) =>
    aRespuesta(await rutaDisponibilidad.GET(pedido("GET", `/api/disponibilidad?fecha=${fecha}`, como))),

  salas: async (como: Como) => aRespuesta(await rutaSalas.GET(pedido("GET", "/api/salas", como))),
};
