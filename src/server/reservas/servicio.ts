/**
 * Casos de uso de reservas. Reciben un `Actor` ya resuelto y aplican las reglas
 * de negocio y de aislamiento entre empresas. No saben nada de HTTP.
 */
import { prisma } from "../db";
import { REGLAS } from "../config/reglas";
import {
  ErrorConflicto,
  ErrorNoEncontrado,
  ErrorReglaNegocio,
} from "../errores";
import { exigirEmpresa, type Actor } from "../identidad";
import type { Prisma } from "@/generated/prisma/client";
import type { DatosCrearReserva, FiltrosReservas } from "./esquemas";
import { hoyLocal, instanteLocal, problemasDeFranja } from "./horario";

const MS_DIA = 24 * 60 * 60_000;
const LIMITE_LISTADO = 500;

const seleccionReserva = {
  id: true,
  inicio: true,
  fin: true,
  asistentes: true,
  motivo: true,
  estado: true,
  creadaEn: true,
  canceladaEn: true,
  origenCancelacion: true,
  sala: { select: { id: true, nombre: true, capacidad: true, sede: { select: { id: true, nombre: true } } } },
  empresa: { select: { id: true, nombre: true } },
} satisfies Prisma.ReservaSelect;

type ReservaConRelaciones = Prisma.ReservaGetPayload<{ select: typeof seleccionReserva }>;

function aDto(reserva: ReservaConRelaciones) {
  return {
    id: reserva.id,
    inicio: reserva.inicio.toISOString(),
    fin: reserva.fin.toISOString(),
    asistentes: reserva.asistentes,
    motivo: reserva.motivo,
    estado: reserva.estado,
    creadaEn: reserva.creadaEn.toISOString(),
    canceladaEn: reserva.canceladaEn?.toISOString() ?? null,
    origenCancelacion: reserva.origenCancelacion,
    sala: reserva.sala,
    empresa: reserva.empresa,
  };
}
export type ReservaDto = ReturnType<typeof aDto>;

/** Filtro de aislamiento: una empresa solo ve lo suyo; el admin, todo. */
function alcanceDe(actor: Actor): Prisma.ReservaWhereInput {
  return actor.tipo === "empresa" ? { empresaId: actor.empresaId } : {};
}

/** Detecta la violación de la exclusion constraint, venga como venga envuelta por Prisma/pg. */
function esViolacionDeSuperposicion(error: unknown): boolean {
  const vistos = new Set<unknown>();
  let actual: unknown = error;
  while (actual && typeof actual === "object" && !vistos.has(actual)) {
    vistos.add(actual);
    const texto = JSON.stringify(actual, Object.getOwnPropertyNames(actual)) ?? "";
    if (texto.includes("reservas_sin_superposicion") || texto.includes("23P01")) return true;
    actual = (actual as { cause?: unknown }).cause;
  }
  return false;
}

export async function crearReserva(actor: Actor, datos: DatosCrearReserva, ahora = new Date()) {
  exigirEmpresa(actor);

  const problemas = problemasDeFranja(datos.inicio, datos.fin, ahora);
  if (problemas.length > 0) {
    throw new ErrorReglaNegocio("HORARIO_INVALIDO", "El horario elegido no cumple las reglas de reserva.", problemas);
  }

  const sala = await prisma.sala.findUnique({ where: { id: datos.salaId } });
  if (!sala || !sala.activa) {
    throw new ErrorNoEncontrado("SALA_NO_ENCONTRADA", "La sala indicada no existe o no está disponible.");
  }
  if (datos.asistentes > sala.capacidad) {
    throw new ErrorReglaNegocio(
      "CAPACIDAD_EXCEDIDA",
      `La sala ${sala.nombre} admite hasta ${sala.capacidad} personas.`,
    );
  }

  try {
    // Sin "consultar y después insertar": la base rechaza atómicamente la superposición,
    // así que dos pedidos simultáneos nunca pueden confirmarse los dos.
    const reserva = await prisma.reserva.create({
      data: {
        salaId: sala.id,
        empresaId: actor.empresaId,
        inicio: datos.inicio,
        fin: datos.fin,
        asistentes: datos.asistentes,
        motivo: datos.motivo || null,
      },
      select: seleccionReserva,
    });
    return aDto(reserva);
  } catch (error) {
    if (!esViolacionDeSuperposicion(error)) throw error;

    // Informamos con qué franjas choca, sin revelar a qué empresa pertenecen.
    const conflictos = await prisma.reserva.findMany({
      where: {
        salaId: sala.id,
        estado: "CONFIRMADA",
        inicio: { lt: datos.fin },
        fin: { gt: datos.inicio },
      },
      select: { inicio: true, fin: true },
      orderBy: { inicio: "asc" },
    });
    throw new ErrorConflicto(
      "SALA_OCUPADA",
      "La sala ya está reservada en parte de ese horario. Elegí otra franja u otra sala.",
      { conflictos: conflictos.map((c) => ({ inicio: c.inicio.toISOString(), fin: c.fin.toISOString() })) },
    );
  }
}

export async function listarReservas(actor: Actor, filtros: FiltrosReservas, ahora = new Date()) {
  const desde = instanteLocal(filtros.desde ?? hoyLocal(ahora));
  const hasta = filtros.hasta ? new Date(instanteLocal(filtros.hasta).getTime() + MS_DIA) : undefined;

  const reservas = await prisma.reserva.findMany({
    where: {
      ...alcanceDe(actor),
      ...(filtros.estado && { estado: filtros.estado }),
      ...(filtros.salaId && { salaId: filtros.salaId }),
      fin: { gt: desde },
      ...(hasta && { inicio: { lt: hasta } }),
    },
    select: seleccionReserva,
    orderBy: { inicio: "asc" },
    take: LIMITE_LISTADO,
  });
  return reservas.map(aDto);
}

export async function cancelarReserva(actor: Actor, reservaId: string, ahora = new Date()) {
  // Buscar dentro del alcance del actor: si la reserva es de otra empresa,
  // respondemos 404 igual que si no existiera (no confirmamos que exista).
  const reserva = await prisma.reserva.findFirst({
    where: { id: reservaId, ...alcanceDe(actor) },
    select: { id: true, estado: true, inicio: true },
  });
  if (!reserva) throw new ErrorNoEncontrado("RESERVA_NO_ENCONTRADA", "La reserva no existe.");

  if (reserva.estado === "CANCELADA") {
    throw new ErrorConflicto("YA_CANCELADA", "La reserva ya estaba cancelada.");
  }
  if (reserva.inicio.getTime() <= ahora.getTime()) {
    throw new ErrorReglaNegocio(
      "RESERVA_INICIADA",
      "No se puede cancelar una reserva que ya empezó o terminó.",
    );
  }

  // Actualización condicional: si dos pedidos cancelan a la vez, solo uno gana.
  const { count } = await prisma.reserva.updateMany({
    where: { id: reserva.id, estado: "CONFIRMADA" },
    data: {
      estado: "CANCELADA",
      canceladaEn: ahora,
      origenCancelacion: actor.tipo === "admin" ? "ADMIN" : "EMPRESA",
    },
  });
  if (count === 0) throw new ErrorConflicto("YA_CANCELADA", "La reserva ya estaba cancelada.");

  const actualizada = await prisma.reserva.findUniqueOrThrow({
    where: { id: reserva.id },
    select: seleccionReserva,
  });
  return aDto(actualizada);
}

/**
 * Ocupación de todas las salas activas en un día. Cada empresa ve qué franjas
 * están tomadas, pero solo el detalle de las propias; el admin ve todo.
 */
export async function disponibilidadDelDia(actor: Actor, fecha: string) {
  const inicioDia = instanteLocal(fecha);
  const finDia = new Date(inicioDia.getTime() + MS_DIA);

  const salas = await prisma.sala.findMany({
    where: { activa: true },
    orderBy: [{ sede: { nombre: "asc" } }, { nombre: "asc" }],
    select: {
      id: true,
      nombre: true,
      capacidad: true,
      sede: { select: { id: true, nombre: true } },
      reservas: {
        where: { estado: "CONFIRMADA", inicio: { lt: finDia }, fin: { gt: inicioDia } },
        orderBy: { inicio: "asc" },
        select: { id: true, inicio: true, fin: true, empresa: { select: { id: true, nombre: true } } },
      },
    },
  });

  return {
    fecha,
    horario: {
      apertura: instanteLocal(fecha, REGLAS.apertura).toISOString(),
      cierre: instanteLocal(fecha, REGLAS.cierre).toISOString(),
      bloqueMinutos: REGLAS.bloqueMinutos,
    },
    salas: salas.map(({ reservas, ...sala }) => ({
      ...sala,
      ocupado: reservas.map((r) => {
        const visible = actor.tipo === "admin" || r.empresa.id === actor.empresaId;
        return {
          inicio: r.inicio.toISOString(),
          fin: r.fin.toISOString(),
          propia: actor.tipo === "empresa" && r.empresa.id === actor.empresaId,
          ...(visible && { reservaId: r.id, empresa: r.empresa }),
        };
      }),
    })),
  };
}
