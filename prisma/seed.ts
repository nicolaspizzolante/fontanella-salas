/**
 * Datos de ejemplo: 2 sedes, 3 salas, 5 empresas y ~10 semanas de reservas
 * (8 hacia atrás y 2 hacia adelante, relativas a hoy) con patrones realistas
 * para que las métricas tengan algo que mostrar:
 *  - mañanas de martes a jueves muy demandadas, viernes a la tarde casi vacío;
 *  - el auditorio se usa poco y muchas veces para reuniones chicas;
 *  - una empresa cancela mucho y tarde; otra dejó de reservar hace más de 30 días.
 *
 * Es determinístico (PRNG con semilla fija) e idempotente: borra y vuelve a cargar.
 * Con `--si-vacia` no hace nada si ya hay datos: así el arranque con Docker no
 * pisa las reservas creadas por los usuarios.
 */
import "dotenv/config";
import { crearPrismaClient } from "../src/server/db";
import { REGLAS } from "../src/server/config/reglas";
import type { Prisma } from "../src/generated/prisma/client";

const prisma = crearPrismaClient();

// IDs fijos: permiten referenciarlos desde el README y probar la API con curl.
const IDS = {
  sedes: {
    centro: "5e0e0000-0000-4000-8000-000000000001",
    norte: "5e0e0000-0000-4000-8000-000000000002",
  },
  salas: {
    rioDeLaPlata: "5a1a0000-0000-4000-8000-000000000001",
    delta: "5a1a0000-0000-4000-8000-000000000002",
    auditorio: "5a1a0000-0000-4000-8000-000000000003",
  },
  empresas: {
    andes: "e3e00000-0000-4000-8000-000000000001",
    pampa: "e3e00000-0000-4000-8000-000000000002",
    litoral: "e3e00000-0000-4000-8000-000000000003",
    patagonia: "e3e00000-0000-4000-8000-000000000004",
    cuyo: "e3e00000-0000-4000-8000-000000000005",
  },
} as const;

// --- utilidades -------------------------------------------------------------

/** PRNG mulberry32: misma semilla, mismos datos en cada ejecución. */
function crearRandom(semilla: number) {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = crearRandom(42);
const entre = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

function elegirPonderado<T>(opciones: readonly (readonly [T, number])[]): T {
  const total = opciones.reduce((s, [, peso]) => s + peso, 0);
  let r = random() * total;
  for (const [valor, peso] of opciones) {
    r -= peso;
    if (r <= 0) return valor;
  }
  return opciones[opciones.length - 1][0];
}

// Argentina no tiene horario de verano desde 2009: UTC-3 fijo.
const OFFSET_AR_MINUTOS = 3 * 60;
const MS_MINUTO = 60_000;
const MS_DIA = 24 * 60 * MS_MINUTO;

/** Fecha (medianoche local AR) expresada en UTC. */
function hoyLocal(): Date {
  const ahoraAr = new Date(Date.now() - OFFSET_AR_MINUTOS * MS_MINUTO);
  return new Date(
    Date.UTC(ahoraAr.getUTCFullYear(), ahoraAr.getUTCMonth(), ahoraAr.getUTCDate()) +
      OFFSET_AR_MINUTOS * MS_MINUTO,
  );
}
const enMinutos = (dia: Date, minutosLocales: number) =>
  new Date(dia.getTime() + minutosLocales * MS_MINUTO);
/** Día de la semana en hora local AR (0 = domingo). */
const diaSemanaLocal = (dia: Date) =>
  new Date(dia.getTime() - OFFSET_AR_MINUTOS * MS_MINUTO).getUTCDay();

// --- patrones de demanda ----------------------------------------------------

/** Probabilidad de que una franja libre se reserve, según día, hora y sala. */
function probabilidadReserva(diaSemana: number, minutoLocal: number, salaId: string) {
  const hora = minutoLocal / 60;
  let p = 0.35;
  if (hora >= 9 && hora < 12) p = 0.6; // pico de la mañana
  if (hora >= 12 && hora < 14) p = 0.2; // almuerzo
  if (hora >= 17) p = 0.15; // fin del día
  if (diaSemana >= 2 && diaSemana <= 4) p *= 1.25; // martes a jueves
  if (diaSemana === 5 && hora >= 13) p *= 0.25; // viernes a la tarde: valle
  if (salaId === IDS.salas.auditorio) p *= 0.35; // sala grande, poco usada
  return Math.min(p, 0.9);
}

const PESO_EMPRESAS = [
  [IDS.empresas.andes, 5],
  [IDS.empresas.pampa, 3],
  [IDS.empresas.litoral, 2],
  [IDS.empresas.patagonia, 2],
  [IDS.empresas.cuyo, 1],
] as const;

const MOTIVOS = [
  "Reunión de equipo",
  "Capacitación",
  "Entrevistas",
  "Reunión con cliente",
  "Planificación trimestral",
  "Workshop",
  null,
];

// --- generación -------------------------------------------------------------

function generarReservas(
  salas: { id: string; capacidad: number }[],
): Prisma.ReservaCreateManyInput[] {
  const ahora = new Date();
  const hoy = hoyLocal();
  const reservas: Prisma.ReservaCreateManyInput[] = [];

  for (let offsetDias = -56; offsetDias <= 14; offsetDias++) {
    const dia = new Date(hoy.getTime() + offsetDias * MS_DIA);
    const diaSemana = diaSemanaLocal(dia);
    if (!REGLAS.diasHabiles.includes(diaSemana)) continue;
    const esFuturo = offsetDias > 0;

    for (const sala of salas) {
      let minuto = REGLAS.apertura;
      while (minuto < REGLAS.cierre) {
        let p = probabilidadReserva(diaSemana, minuto, sala.id);
        if (esFuturo) p *= 0.5; // el futuro todavía se está llenando
        if (random() >= p) {
          minuto += REGLAS.bloqueMinutos;
          continue;
        }

        const bloques = entre(2, 6); // 1 a 3 horas
        const fin = Math.min(minuto + bloques * REGLAS.bloqueMinutos, REGLAS.cierre);

        // Cuyo Alimentos dejó de reservar hace más de 30 días (cliente a reactivar).
        let empresaId: string = elegirPonderado(PESO_EMPRESAS);
        if (empresaId === IDS.empresas.cuyo && offsetDias > -35) empresaId = IDS.empresas.andes;

        const capacidad = sala.capacidad;
        const asistentes =
          sala.id === IDS.salas.auditorio && random() < 0.5
            ? entre(3, 8) // auditorio usado para reuniones chicas
            : entre(Math.max(2, Math.floor(capacidad / 3)), capacidad);

        const inicio = enMinutos(dia, minuto);
        const finDate = enMinutos(dia, fin);
        const antelacionReservaMs = entre(1, 14) * MS_DIA + entre(0, 600) * MS_MINUTO;
        const creadaEn = new Date(
          Math.min(ahora.getTime() - entre(1, 72) * 60 * MS_MINUTO, inicio.getTime() - antelacionReservaMs),
        );

        // Patagonia Seguros cancela mucho y a último momento.
        const probCancelacion = empresaId === IDS.empresas.patagonia ? 0.35 : 0.07;
        let cancelacion: Pick<
          Prisma.ReservaCreateManyInput,
          "estado" | "canceladaEn" | "origenCancelacion"
        > = {};
        if (random() < probCancelacion) {
          const tardia = empresaId === IDS.empresas.patagonia ? random() < 0.7 : random() < 0.2;
          const anticipacionMs = tardia
            ? entre(30, 20 * 60) * MS_MINUTO
            : entre(1, 5) * MS_DIA;
          const canceladaEn = new Date(
            Math.min(
              ahora.getTime() - MS_MINUTO,
              Math.max(creadaEn.getTime() + MS_MINUTO, inicio.getTime() - anticipacionMs),
            ),
          );
          if (canceladaEn < inicio) {
            cancelacion = {
              estado: "CANCELADA",
              canceladaEn,
              origenCancelacion: random() < 0.9 ? "EMPRESA" : "ADMIN",
            };
          }
        }

        reservas.push({
          salaId: sala.id,
          empresaId,
          inicio,
          fin: finDate,
          asistentes,
          motivo: MOTIVOS[entre(0, MOTIVOS.length - 1)],
          creadaEn,
          ...cancelacion,
        });

        minuto = fin + (random() < 0.5 ? 0 : REGLAS.bloqueMinutos);
      }
    }
  }
  return reservas;
}

async function main() {
  if (process.argv.includes("--si-vacia") && (await prisma.empresa.count()) > 0) {
    console.log("Seed omitido: la base ya tiene datos.");
    return;
  }

  await prisma.$transaction([
    prisma.reserva.deleteMany(),
    prisma.sala.deleteMany(),
    prisma.sede.deleteMany(),
    prisma.empresa.deleteMany(),
  ]);

  await prisma.sede.createMany({
    data: [
      { id: IDS.sedes.centro, nombre: "Sede Centro" },
      { id: IDS.sedes.norte, nombre: "Sede Norte" },
    ],
  });

  const salas = [
    { id: IDS.salas.rioDeLaPlata, sedeId: IDS.sedes.centro, nombre: "Sala Río de la Plata", capacidad: 12 },
    { id: IDS.salas.delta, sedeId: IDS.sedes.centro, nombre: "Sala Delta", capacidad: 6 },
    { id: IDS.salas.auditorio, sedeId: IDS.sedes.norte, nombre: "Auditorio Norte", capacidad: 30 },
  ];
  await prisma.sala.createMany({ data: salas });

  await prisma.empresa.createMany({
    data: [
      { id: IDS.empresas.andes, nombre: "Andes Logística" },
      { id: IDS.empresas.pampa, nombre: "Pampa Software" },
      { id: IDS.empresas.litoral, nombre: "Litoral Consultores" },
      { id: IDS.empresas.patagonia, nombre: "Patagonia Seguros" },
      { id: IDS.empresas.cuyo, nombre: "Cuyo Alimentos" },
    ],
  });

  const reservas = generarReservas(salas);
  await prisma.reserva.createMany({ data: reservas });

  const canceladas = reservas.filter((r) => r.estado === "CANCELADA").length;
  console.log(
    `Seed listo: 2 sedes, ${salas.length} salas, 5 empresas, ${reservas.length} reservas (${canceladas} canceladas).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
