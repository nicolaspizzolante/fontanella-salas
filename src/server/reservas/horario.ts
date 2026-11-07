/**
 * Reglas de horario puras (sin base de datos), fáciles de testear de forma aislada.
 * Todo se evalúa en la zona horaria del negocio, aunque los instantes viajen en UTC.
 */
import { REGLAS } from "../config/reglas";
import type { DetalleError } from "../errores";

const MS_MINUTO = 60_000;
const MS_DIA = 24 * 60 * MS_MINUTO;

const formateador = new Intl.DateTimeFormat("en-US", {
  timeZone: REGLAS.zonaHoraria,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const DIAS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type PartesLocales = {
  /** Fecha local `AAAA-MM-DD`. */
  fecha: string;
  /** 0 = domingo. */
  diaSemana: number;
  /** Minutos desde la medianoche local. */
  minutos: number;
  segundos: number;
};

export function partesLocales(instante: Date): PartesLocales {
  const p = Object.fromEntries(formateador.formatToParts(instante).map((x) => [x.type, x.value]));
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    diaSemana: DIAS.indexOf(p.weekday),
    minutos: Number(p.hour) * 60 + Number(p.minute),
    segundos: Number(p.second),
  };
}

/** Instante UTC correspondiente a `fecha` (AAAA-MM-DD) a los `minutos` locales indicados. */
export function instanteLocal(fecha: string, minutos = 0): Date {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const supuesto = Date.UTC(anio, mes - 1, dia, 0, minutos);
  const p = partesLocales(new Date(supuesto));
  const [pa, pm, pd] = p.fecha.split("-").map(Number);
  const relojComoUtc = Date.UTC(pa, pm - 1, pd, 0, p.minutos);
  return new Date(supuesto - (relojComoUtc - supuesto));
}

export function hoyLocal(ahora = new Date()): string {
  return partesLocales(ahora).fecha;
}

const formatoHora = (minutos: number) =>
  `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;

/**
 * Devuelve TODAS las reglas que incumple una franja (lista vacía = válida),
 * para que el usuario pueda corregirlas de una sola vez.
 */
export function problemasDeFranja(inicio: Date, fin: Date, ahora = new Date()): DetalleError[] {
  const problemas: DetalleError[] = [];
  const agregar = (codigo: string, mensaje: string) => problemas.push({ codigo, mensaje });

  const duracion = (fin.getTime() - inicio.getTime()) / MS_MINUTO;
  if (duracion <= 0) {
    agregar("RANGO_INVALIDO", "El horario de fin debe ser posterior al de inicio.");
    return problemas;
  }

  const ini = partesLocales(inicio);
  const ultimoMinuto = partesLocales(new Date(fin.getTime() - 1));
  const fn = partesLocales(fin);

  const enBloque = (p: PartesLocales, d: Date) =>
    p.minutos % REGLAS.bloqueMinutos === 0 && p.segundos === 0 && d.getUTCMilliseconds() === 0;
  if (!enBloque(ini, inicio) || !enBloque(fn, fin)) {
    agregar(
      "FUERA_DE_BLOQUE",
      `Los horarios deben ser múltiplos de ${REGLAS.bloqueMinutos} minutos (por ejemplo 10:00 o 10:30).`,
    );
  }

  if (ini.fecha !== ultimoMinuto.fecha) {
    agregar("DISTINTO_DIA", "La reserva debe empezar y terminar el mismo día.");
  }

  if (!REGLAS.diasHabiles.includes(ini.diaSemana)) {
    agregar("DIA_NO_HABIL", "Las salas solo se reservan de lunes a viernes.");
  }

  if (ini.minutos < REGLAS.apertura || ini.minutos + duracion > REGLAS.cierre) {
    agregar(
      "FUERA_DE_HORARIO",
      `El horario de atención es de ${formatoHora(REGLAS.apertura)} a ${formatoHora(REGLAS.cierre)}.`,
    );
  }

  if (duracion < REGLAS.duracionMinimaMinutos || duracion > REGLAS.duracionMaximaMinutos) {
    agregar(
      "DURACION_INVALIDA",
      `La reserva debe durar entre ${REGLAS.duracionMinimaMinutos} minutos y ${REGLAS.duracionMaximaMinutos / 60} horas.`,
    );
  }

  if (inicio.getTime() <= ahora.getTime()) {
    agregar("EN_EL_PASADO", "No se puede reservar en un horario que ya pasó.");
  } else if (inicio.getTime() > ahora.getTime() + REGLAS.anticipacionMaximaDias * MS_DIA) {
    agregar(
      "DEMASIADO_ANTICIPADA",
      `Se puede reservar con hasta ${REGLAS.anticipacionMaximaDias} días de anticipación.`,
    );
  }

  return problemas;
}
