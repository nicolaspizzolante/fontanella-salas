/**
 * Cálculo de métricas de negocio. Función pura: recibe los datos ya leídos de la
 * base y devuelve los indicadores. Se testea con datos armados a mano.
 *
 * Definiciones (ver README):
 *  - Horas disponibles de una sala = días hábiles del rango × horas de atención.
 *  - Ocupación = horas reservadas (confirmadas) ÷ horas disponibles.
 *  - Una cancelación es "tardía" si se hizo con menos de 24 h de anticipación.
 *  - Las cancelaciones hechas por el administrador no cuentan contra la empresa.
 */
import { REGLAS } from "../config/reglas";
import { instanteLocal, partesLocales } from "../reservas/horario";

const MS_MINUTO = 60_000;
const MS_HORA = 60 * MS_MINUTO;
const MS_DIA = 24 * MS_HORA;
const DIAS_INACTIVIDAD = 30;
const MINIMO_RESERVAS_PARA_EVALUAR = 3;

export type SalaParaMetricas = {
  id: string;
  nombre: string;
  capacidad: number;
  sede: { id: string; nombre: string };
};
export type EmpresaParaMetricas = { id: string; nombre: string };
export type ReservaParaMetricas = {
  salaId: string;
  empresaId: string;
  inicio: Date;
  fin: Date;
  asistentes: number;
  estado: "CONFIRMADA" | "CANCELADA";
  canceladaEn: Date | null;
  origenCancelacion: "EMPRESA" | "ADMIN" | null;
};

export type EntradaMetricas = {
  /** Fechas locales AAAA-MM-DD, ambas inclusive. */
  desde: string;
  hasta: string;
  ahora: Date;
  salas: SalaParaMetricas[];
  empresas: EmpresaParaMetricas[];
  /** Reservas que empiezan dentro del rango (confirmadas y canceladas). */
  reservas: ReservaParaMetricas[];
  /** Inicio de la última reserva confirmada ya ocurrida de cada empresa (sin límite de rango). */
  ultimaReservaPorEmpresa: Map<string, Date>;
};

const redondear = (valor: number, decimales = 3) => {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
};
const horas = (ms: number) => redondear(ms / MS_HORA, 1);
const proporcion = (parte: number, total: number) => (total > 0 ? redondear(parte / total) : 0);
const duracion = (r: ReservaParaMetricas) => r.fin.getTime() - r.inicio.getTime();
const promedio = (valores: number[]) =>
  valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;

/** Lista de días hábiles (fecha local y día de la semana) dentro del rango. */
export function diasHabilesDelRango(desde: string, hasta: string) {
  const dias: { fecha: string; diaSemana: number }[] = [];
  const fin = instanteLocal(hasta).getTime();
  // Se suma un día y se re-normaliza a medianoche local en cada paso.
  for (let t = instanteLocal(desde).getTime(); t <= fin; ) {
    const p = partesLocales(new Date(t));
    if (REGLAS.diasHabiles.includes(p.diaSemana)) dias.push({ fecha: p.fecha, diaSemana: p.diaSemana });
    t = instanteLocal(partesLocales(new Date(t + MS_DIA + 2 * MS_HORA)).fecha).getTime();
  }
  return dias;
}

/** Lunes (fecha local) de la semana a la que pertenece una fecha local. */
function lunesDe(fecha: string) {
  const p = partesLocales(instanteLocal(fecha, 12 * 60));
  const atras = (p.diaSemana + 6) % 7;
  return partesLocales(new Date(instanteLocal(fecha, 12 * 60).getTime() - atras * MS_DIA)).fecha;
}

/** Recorre una reserva en bloques y los asigna a (día de la semana, hora local). */
function bloquesPorHora(r: ReservaParaMetricas, sumar: (diaSemana: number, hora: number, ms: number) => void) {
  const paso = REGLAS.bloqueMinutos * MS_MINUTO;
  for (let t = r.inicio.getTime(); t < r.fin.getTime(); t += paso) {
    const p = partesLocales(new Date(t));
    sumar(p.diaSemana, Math.floor(p.minutos / 60), Math.min(paso, r.fin.getTime() - t));
  }
}

export function calcularMetricas(entrada: EntradaMetricas) {
  const { salas, empresas, ahora } = entrada;
  const dias = diasHabilesDelRango(entrada.desde, entrada.hasta);
  const msAtencionPorDia = (REGLAS.cierre - REGLAS.apertura) * MS_MINUTO;
  const msDisponiblesPorSala = dias.length * msAtencionPorDia;
  const msDisponiblesTotales = msDisponiblesPorSala * salas.length;

  const confirmadas = entrada.reservas.filter((r) => r.estado === "CONFIRMADA");
  const canceladasPorEmpresa = entrada.reservas.filter(
    (r) => r.estado === "CANCELADA" && r.origenCancelacion === "EMPRESA",
  );
  const esTardia = (r: ReservaParaMetricas) =>
    r.canceladaEn !== null &&
    r.inicio.getTime() - r.canceladaEn.getTime() < REGLAS.cancelacionTardiaHoras * MS_HORA;
  const salaPorId = new Map(salas.map((s) => [s.id, s]));
  const usoCapacidad = (rs: ReservaParaMetricas[]) =>
    redondear(promedio(rs.map((r) => r.asistentes / (salaPorId.get(r.salaId)?.capacidad ?? r.asistentes))));

  const msReservados = confirmadas.reduce((total, r) => total + duracion(r), 0);

  // --- por sala y por sede -------------------------------------------------
  const porSala = salas.map((sala) => {
    const rs = confirmadas.filter((r) => r.salaId === sala.id);
    const ms = rs.reduce((t, r) => t + duracion(r), 0);
    return {
      sala: { id: sala.id, nombre: sala.nombre, capacidad: sala.capacidad },
      sede: sala.sede,
      reservas: rs.length,
      horasReservadas: horas(ms),
      ocupacion: proporcion(ms, msDisponiblesPorSala),
      asistentesPromedio: redondear(promedio(rs.map((r) => r.asistentes)), 1),
      usoCapacidad: usoCapacidad(rs),
    };
  });

  const sedes = [...new Map(salas.map((s) => [s.sede.id, s.sede])).values()];
  const porSede = sedes.map((sede) => {
    const idsSalas = new Set(salas.filter((s) => s.sede.id === sede.id).map((s) => s.id));
    const ms = confirmadas.filter((r) => idsSalas.has(r.salaId)).reduce((t, r) => t + duracion(r), 0);
    return {
      sede,
      salas: idsSalas.size,
      horasReservadas: horas(ms),
      ocupacion: proporcion(ms, msDisponiblesPorSala * idsSalas.size),
    };
  });

  // --- mapa de calor: ocupación por día de la semana y hora ------------------
  const cantidadPorDiaSemana = new Map<number, number>();
  for (const d of dias) cantidadPorDiaSemana.set(d.diaSemana, (cantidadPorDiaSemana.get(d.diaSemana) ?? 0) + 1);
  const msPorCelda = new Map<string, number>();
  for (const r of confirmadas) {
    bloquesPorHora(r, (diaSemana, hora, ms) => {
      const clave = `${diaSemana}-${hora}`;
      msPorCelda.set(clave, (msPorCelda.get(clave) ?? 0) + ms);
    });
  }
  const mapaCalor = REGLAS.diasHabiles.flatMap((diaSemana) =>
    Array.from({ length: (REGLAS.cierre - REGLAS.apertura) / 60 }, (_, i) => {
      const hora = REGLAS.apertura / 60 + i;
      const disponible = (cantidadPorDiaSemana.get(diaSemana) ?? 0) * salas.length * MS_HORA;
      return { diaSemana, hora, ocupacion: proporcion(msPorCelda.get(`${diaSemana}-${hora}`) ?? 0, disponible) };
    }),
  );

  // --- tendencia semanal -----------------------------------------------------
  const semanas = new Map<string, { dias: number; ms: number }>();
  for (const d of dias) {
    const lunes = lunesDe(d.fecha);
    const s = semanas.get(lunes) ?? { dias: 0, ms: 0 };
    s.dias++;
    semanas.set(lunes, s);
  }
  for (const r of confirmadas) {
    const s = semanas.get(lunesDe(partesLocales(r.inicio).fecha));
    if (s) s.ms += duracion(r);
  }
  const tendenciaSemanal = [...semanas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana, s]) => ({
      semana,
      horasReservadas: horas(s.ms),
      ocupacion: proporcion(s.ms, s.dias * msAtencionPorDia * salas.length),
    }));

  // --- por empresa -----------------------------------------------------------
  const porEmpresa = empresas
    .map((empresa) => {
      const todas = entrada.reservas.filter((r) => r.empresaId === empresa.id);
      const rs = confirmadas.filter((r) => r.empresaId === empresa.id);
      const canceladas = canceladasPorEmpresa.filter((r) => r.empresaId === empresa.id);
      const ms = rs.reduce((t, r) => t + duracion(r), 0);
      const ultima = entrada.ultimaReservaPorEmpresa.get(empresa.id) ?? null;
      return {
        empresa,
        reservas: rs.length,
        horasReservadas: horas(ms),
        participacion: proporcion(ms, msReservados),
        cancelaciones: canceladas.length,
        tasaCancelacion: proporcion(canceladas.length, todas.length),
        cancelacionesTardias: canceladas.filter(esTardia).length,
        usoCapacidad: usoCapacidad(rs),
        ultimaReserva: ultima?.toISOString() ?? null,
        diasDesdeUltimaReserva: ultima ? Math.floor((ahora.getTime() - ultima.getTime()) / MS_DIA) : null,
      };
    })
    .sort((a, b) => b.horasReservadas - a.horasReservadas);

  // --- oportunidades comerciales ---------------------------------------------
  const nombreDia = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const franjasValle = [...mapaCalor]
    .sort((a, b) => a.ocupacion - b.ocupacion || a.diaSemana - b.diaSemana || a.hora - b.hora)
    .slice(0, 5)
    .map((c) => ({ ...c, etiqueta: `${nombreDia[c.diaSemana]} ${c.hora}:00 a ${c.hora + 1}:00` }));

  const oportunidades = {
    /** Horarios con menos ocupación: candidatos a promociones o tarifas reducidas. */
    franjasValle,
    /** Los clientes que más usan las salas: candidatos a planes de fidelización. */
    clientesTop: porEmpresa.filter((e) => e.horasReservadas > 0).slice(0, 3),
    /** Sin reservas hace más de 30 días: candidatos a una campaña de reactivación. */
    clientesInactivos: porEmpresa.filter(
      (e) => e.diasDesdeUltimaReserva === null || e.diasDesdeUltimaReserva > DIAS_INACTIVIDAD,
    ),
    /** Muchas cancelaciones tardías: bloquean franjas que otro cliente podría usar. */
    clientesConCancelacionesTardias: porEmpresa.filter((e) => {
      const total = e.reservas + e.cancelaciones;
      return total >= MINIMO_RESERVAS_PARA_EVALUAR && e.cancelacionesTardias / total >= 0.2;
    }),
    /** Poca ocupación o salas grandes usadas para reuniones chicas. */
    salasSubutilizadas: porSala.filter((s) => s.ocupacion < 0.25 || (s.reservas > 0 && s.usoCapacidad < 0.4)),
  };

  const empresasActivas = new Set(confirmadas.map((r) => r.empresaId)).size;

  return {
    rango: {
      desde: entrada.desde,
      hasta: entrada.hasta,
      diasHabiles: dias.length,
      horasDisponibles: horas(msDisponiblesTotales),
    },
    resumen: {
      ocupacion: proporcion(msReservados, msDisponiblesTotales),
      horasReservadas: horas(msReservados),
      reservasConfirmadas: confirmadas.length,
      reservasCanceladas: entrada.reservas.length - confirmadas.length,
      tasaCancelacion: proporcion(entrada.reservas.length - confirmadas.length, entrada.reservas.length),
      cancelacionesTardias: entrada.reservas.filter((r) => r.estado === "CANCELADA" && esTardia(r)).length,
      empresasActivas,
      usoCapacidad: usoCapacidad(confirmadas),
    },
    porSede,
    porSala,
    porEmpresa,
    mapaCalor,
    tendenciaSemanal,
    oportunidades,
  };
}

export type Metricas = ReturnType<typeof calcularMetricas>;
