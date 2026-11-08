/**
 * Tests unitarios del cálculo de métricas con un escenario armado a mano,
 * donde cada número esperado se puede verificar con lápiz y papel.
 */
import { describe, expect, it } from "vitest";
import { calcularMetricas, diasHabilesDelRango, type ReservaParaMetricas } from "@/server/metricas/calculo";

// Semana del lunes 2 al domingo 8 de noviembre de 2026: 5 días hábiles.
// Cada sala tiene 5 días × 12 h = 60 h disponibles; entre las dos, 120 h.
const AHORA = new Date("2026-11-07T15:00:00Z");
const h = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`);
const DIA = 24 * 3_600_000;

const salaA = { id: "sala-a", nombre: "Sala A", capacidad: 10, sede: { id: "sede-1", nombre: "Sede 1" } };
const salaB = { id: "sala-b", nombre: "Sala B", capacidad: 4, sede: { id: "sede-2", nombre: "Sede 2" } };
const emp1 = { id: "emp-1", nombre: "Empresa 1" };
const emp2 = { id: "emp-2", nombre: "Empresa 2" };
const emp3 = { id: "emp-3", nombre: "Empresa 3" };

const reserva = (r: Partial<ReservaParaMetricas> & Pick<ReservaParaMetricas, "salaId" | "empresaId" | "inicio" | "fin">) =>
  ({ asistentes: 2, estado: "CONFIRMADA", canceladaEn: null, origenCancelacion: null, ...r }) as ReservaParaMetricas;

const reservas: ReservaParaMetricas[] = [
  // Confirmadas: 2 h + 1 h en la sala A (empresa 1) y 3 h en la sala B (empresa 2) = 6 h.
  reserva({ salaId: "sala-a", empresaId: "emp-1", inicio: h("2026-11-02", "10:00"), fin: h("2026-11-02", "12:00"), asistentes: 5 }),
  reserva({ salaId: "sala-a", empresaId: "emp-1", inicio: h("2026-11-03", "10:00"), fin: h("2026-11-03", "11:00"), asistentes: 10 }),
  reserva({ salaId: "sala-b", empresaId: "emp-2", inicio: h("2026-11-02", "10:00"), fin: h("2026-11-02", "13:00"), asistentes: 2 }),
  // Cancelada por la empresa 2 con 2 h de anticipación: tardía.
  reserva({
    salaId: "sala-b", empresaId: "emp-2", inicio: h("2026-11-04", "09:00"), fin: h("2026-11-04", "10:00"),
    estado: "CANCELADA", origenCancelacion: "EMPRESA", canceladaEn: h("2026-11-04", "07:00"),
  }),
  // Cancelada por la empresa 2 con 2 días de anticipación: no es tardía.
  reserva({
    salaId: "sala-b", empresaId: "emp-2", inicio: h("2026-11-05", "15:00"), fin: h("2026-11-05", "16:00"),
    estado: "CANCELADA", origenCancelacion: "EMPRESA", canceladaEn: h("2026-11-03", "15:00"),
  }),
  // Cancelada por el ADMIN: no cuenta como cancelación de la empresa 1.
  reserva({
    salaId: "sala-a", empresaId: "emp-1", inicio: h("2026-11-05", "09:00"), fin: h("2026-11-05", "10:00"),
    estado: "CANCELADA", origenCancelacion: "ADMIN", canceladaEn: h("2026-11-02", "09:00"),
  }),
];

const metricas = calcularMetricas({
  desde: "2026-11-02",
  hasta: "2026-11-08",
  ahora: AHORA,
  salas: [salaA, salaB],
  empresas: [emp1, emp2, emp3],
  reservas,
  ultimaReservaPorEmpresa: new Map([
    ["emp-1", h("2026-11-03", "10:00")],
    ["emp-2", h("2026-11-02", "10:00")],
    ["emp-3", new Date(AHORA.getTime() - 40 * DIA)],
  ]),
});

describe("días hábiles", () => {
  it("cuenta solo de lunes a viernes, con ambos extremos incluidos", () => {
    expect(diasHabilesDelRango("2026-11-02", "2026-11-08")).toHaveLength(5);
    expect(diasHabilesDelRango("2026-11-07", "2026-11-08")).toHaveLength(0);
    expect(diasHabilesDelRango("2026-11-06", "2026-11-06")).toHaveLength(1);
    expect(diasHabilesDelRango("2026-10-01", "2026-10-31")).toHaveLength(22);
  });
});

describe("resumen", () => {
  it("calcula ocupación como horas reservadas sobre horas disponibles", () => {
    expect(metricas.rango).toEqual({ desde: "2026-11-02", hasta: "2026-11-08", diasHabiles: 5, horasDisponibles: 120 });
    expect(metricas.resumen.horasReservadas).toBe(6);
    expect(metricas.resumen.ocupacion).toBe(0.05); // 6 / 120
  });

  it("cuenta cancelaciones y detecta las tardías (< 24 h)", () => {
    expect(metricas.resumen).toMatchObject({
      reservasConfirmadas: 3,
      reservasCanceladas: 3,
      tasaCancelacion: 0.5,
      cancelacionesTardias: 1,
      empresasActivas: 2,
    });
  });
});

describe("por sala y por sede", () => {
  it("calcula ocupación, asistentes promedio y uso de capacidad de cada sala", () => {
    const [a, b] = metricas.porSala;
    expect(a).toMatchObject({ reservas: 2, horasReservadas: 3, ocupacion: 0.05, asistentesPromedio: 7.5, usoCapacidad: 0.75 });
    expect(b).toMatchObject({ reservas: 1, horasReservadas: 3, ocupacion: 0.05, asistentesPromedio: 2, usoCapacidad: 0.5 });
  });

  it("agrupa por sede", () => {
    expect(metricas.porSede.map((s) => [s.sede.id, s.horasReservadas, s.ocupacion])).toEqual([
      ["sede-1", 3, 0.05],
      ["sede-2", 3, 0.05],
    ]);
  });
});

describe("por empresa", () => {
  const de = (id: string) => metricas.porEmpresa.find((e) => e.empresa.id === id)!;

  it("calcula horas, participación y cancelaciones de cada empresa", () => {
    expect(de("emp-1")).toMatchObject({ reservas: 2, horasReservadas: 3, participacion: 0.5, cancelaciones: 0, tasaCancelacion: 0 });
    expect(de("emp-2")).toMatchObject({
      reservas: 1,
      horasReservadas: 3,
      participacion: 0.5,
      cancelaciones: 2,
      tasaCancelacion: 0.667,
      cancelacionesTardias: 1,
    });
  });

  it("no culpa a la empresa por cancelaciones hechas por el administrador", () => {
    expect(de("emp-1").cancelaciones).toBe(0);
  });

  it("informa cuántos días pasaron desde la última reserva", () => {
    expect(de("emp-3")).toMatchObject({ reservas: 0, horasReservadas: 0, diasDesdeUltimaReserva: 40 });
    expect(de("emp-1").diasDesdeUltimaReserva).toBe(4);
  });
});

describe("mapa de calor y tendencia", () => {
  const celda = (diaSemana: number, hora: number) =>
    metricas.mapaCalor.find((c) => c.diaSemana === diaSemana && c.hora === hora)!.ocupacion;

  it("tiene una celda por cada hora de atención de cada día hábil", () => {
    expect(metricas.mapaCalor).toHaveLength(5 * 12);
  });

  it("calcula la ocupación de cada franja horaria sobre todas las salas", () => {
    expect(celda(1, 10)).toBe(1); // lunes 10–11: las dos salas ocupadas
    expect(celda(1, 12)).toBe(0.5); // lunes 12–13: solo la sala B
    expect(celda(2, 10)).toBe(0.5); // martes 10–11: solo la sala A
    expect(celda(4, 9)).toBe(0); // jueves 9–10: la reserva fue cancelada
  });

  it("agrupa la tendencia por semana (lunes)", () => {
    expect(metricas.tendenciaSemanal).toEqual([{ semana: "2026-11-02", horasReservadas: 6, ocupacion: 0.05 }]);
  });
});

describe("oportunidades comerciales", () => {
  it("detecta clientes inactivos hace más de 30 días", () => {
    expect(metricas.oportunidades.clientesInactivos.map((e) => e.empresa.id)).toEqual(["emp-3"]);
  });

  it("detecta clientes con muchas cancelaciones tardías", () => {
    expect(metricas.oportunidades.clientesConCancelacionesTardias.map((e) => e.empresa.id)).toEqual(["emp-2"]);
  });

  it("lista los clientes que más usan las salas, sin incluir a los que no reservaron", () => {
    expect(metricas.oportunidades.clientesTop.map((e) => e.empresa.id).sort()).toEqual(["emp-1", "emp-2"]);
  });

  it("propone como valles las franjas con menor ocupación", () => {
    const [primera] = metricas.oportunidades.franjasValle;
    expect(primera).toMatchObject({ ocupacion: 0, diaSemana: 1, hora: 8, etiqueta: "Lunes 8:00 a 9:00" });
    expect(metricas.oportunidades.franjasValle).toHaveLength(5);
  });

  it("marca salas subutilizadas", () => {
    expect(metricas.oportunidades.salasSubutilizadas.map((s) => s.sala.id)).toEqual(["sala-a", "sala-b"]);
  });
});

describe("rango sin datos", () => {
  it("devuelve ceros, sin divisiones por cero", () => {
    const vacio = calcularMetricas({
      desde: "2026-11-07",
      hasta: "2026-11-08",
      ahora: AHORA,
      salas: [salaA],
      empresas: [emp1],
      reservas: [],
      ultimaReservaPorEmpresa: new Map(),
    });
    expect(vacio.resumen).toMatchObject({ ocupacion: 0, horasReservadas: 0, tasaCancelacion: 0, usoCapacidad: 0 });
    expect(vacio.mapaCalor.every((c) => c.ocupacion === 0)).toBe(true);
  });
});
