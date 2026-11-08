"use client";

/** Cliente de la API: agrega la identidad elegida y traduce errores a un tipo único. */
export type Actor = { tipo: "empresa"; empresaId: string; nombre: string } | { tipo: "admin" };

export type DetalleError = { campo?: string; codigo?: string; mensaje: string };

export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensaje: string,
    readonly detalles?: unknown,
  ) {
    super(mensaje);
  }
}

export function headersDe(actor: Actor | null): Record<string, string> {
  if (!actor) return {};
  return actor.tipo === "admin" ? { "x-rol": "admin" } : { "x-empresa-id": actor.empresaId };
}

export async function pedirApi<T>(actor: Actor | null, ruta: string, opciones: RequestInit = {}): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      ...opciones,
      headers: {
        ...(opciones.body ? { "content-type": "application/json" } : {}),
        ...headersDe(actor),
        ...opciones.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new ErrorApi(0, "SIN_CONEXION", "No pudimos conectarnos con el servidor. Revisá tu conexión e intentá de nuevo.");
  }
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const error = cuerpo?.error;
    throw new ErrorApi(
      respuesta.status,
      error?.codigo ?? "ERROR",
      error?.mensaje ?? "Ocurrió un error inesperado.",
      error?.detalles,
    );
  }
  return cuerpo as T;
}

// --- Tipos de las respuestas -------------------------------------------------

export type Sede = { id: string; nombre: string };
export type Sala = { id: string; nombre: string; capacidad: number; sede: Sede };
export type Empresa = { id: string; nombre: string };

export type Reserva = {
  id: string;
  inicio: string;
  fin: string;
  asistentes: number;
  motivo: string | null;
  estado: "CONFIRMADA" | "CANCELADA";
  creadaEn: string;
  canceladaEn: string | null;
  origenCancelacion: "EMPRESA" | "ADMIN" | null;
  sala: Sala;
  empresa: Empresa;
};

export type FranjaOcupada = {
  inicio: string;
  fin: string;
  propia: boolean;
  reservaId?: string;
  empresa?: Empresa;
};

export type Disponibilidad = {
  fecha: string;
  horario: { apertura: string; cierre: string; bloqueMinutos: number };
  salas: (Sala & { ocupado: FranjaOcupada[] })[];
};
