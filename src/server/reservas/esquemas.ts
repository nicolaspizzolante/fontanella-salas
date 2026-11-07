import { z } from "zod";

/** Fecha y hora ISO 8601 con zona explícita: evita ambigüedades de huso horario. */
const instante = z.iso.datetime({ offset: true }).transform((valor) => new Date(valor));
const fechaLocal = z.iso.date();

export const esquemaCrearReserva = z.strictObject({
  salaId: z.uuid(),
  inicio: instante,
  fin: instante,
  asistentes: z.number().int().min(1).max(1000),
  motivo: z.string().trim().max(200).optional(),
});
export type DatosCrearReserva = z.infer<typeof esquemaCrearReserva>;

export const esquemaListarReservas = z.strictObject({
  desde: fechaLocal.optional(),
  hasta: fechaLocal.optional(),
  estado: z.enum(["CONFIRMADA", "CANCELADA"]).optional(),
  salaId: z.uuid().optional(),
});
export type FiltrosReservas = z.infer<typeof esquemaListarReservas>;

export const esquemaDisponibilidad = z.strictObject({
  fecha: fechaLocal,
});

export const esquemaIdReserva = z.uuid();
