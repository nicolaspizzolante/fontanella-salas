import { prisma } from "@/server/db";
import { REGLAS } from "@/server/config/reglas";
import { hoyLocal, instanteLocal, partesLocales } from "@/server/reservas/horario";

/** Deja la base de tests vacía. */
export async function limpiarBase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "reservas", "salas", "sedes", "empresas" RESTART IDENTITY CASCADE',
  );
}

/** Escenario mínimo: una sede, dos salas y dos empresas clientes. */
export async function crearEscenario() {
  await limpiarBase();
  const sede = await prisma.sede.create({ data: { nombre: "Sede Test" } });
  const salaChica = await prisma.sala.create({ data: { sedeId: sede.id, nombre: "Sala Chica", capacidad: 4 } });
  const salaGrande = await prisma.sala.create({ data: { sedeId: sede.id, nombre: "Sala Grande", capacidad: 20 } });
  const empresaA = await prisma.empresa.create({ data: { nombre: "Empresa A" } });
  const empresaB = await prisma.empresa.create({ data: { nombre: "Empresa B" } });
  return { sede, salaChica, salaGrande, empresaA, empresaB };
}

const MS_DIA = 24 * 60 * 60_000;

/** Fecha local (AAAA-MM-DD) del n-ésimo día hábil a partir de mañana. */
export function diaHabil(n = 1): string {
  let instante = instanteLocal(hoyLocal());
  let encontrados = 0;
  while (true) {
    instante = new Date(instante.getTime() + MS_DIA + 2 * 60 * 60_000); // +2 h por seguridad ante cambios de huso
    const p = partesLocales(instante);
    instante = instanteLocal(p.fecha);
    if (REGLAS.diasHabiles.includes(p.diaSemana) && ++encontrados === n) return p.fecha;
  }
}

/** Franja en hora local: `franja("2026-11-10", "10:00", "11:00")`. */
export function franja(fecha: string, desde: string, hasta: string) {
  const minutos = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  return {
    inicio: instanteLocal(fecha, minutos(desde)).toISOString(),
    fin: instanteLocal(fecha, minutos(hasta)).toISOString(),
  };
}
