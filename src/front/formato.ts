/** Formato de fechas y horas en la zona del negocio, sin depender del huso del navegador. */
export const ZONA = "America/Argentina/Buenos_Aires";

const fmtHora = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fmtFechaLarga = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" });
const fmtFechaCorta = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, weekday: "short", day: "numeric", month: "short" });
const fmtFechaIso = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });

export const hora = (iso: string | Date) => fmtHora.format(new Date(iso));
export const rangoHorario = (inicio: string, fin: string) => `${hora(inicio)} a ${hora(fin)}`;

/** Fecha local AAAA-MM-DD de un instante. */
export const fechaDe = (instante: string | Date = new Date()) => fmtFechaIso.format(new Date(instante));
export const hoy = () => fechaDe(new Date());

/** Mediodía UTC de una fecha local: seguro para formatearla en cualquier huso cercano. */
const mediodia = (fecha: string) => new Date(`${fecha}T15:00:00Z`);
export const fechaLarga = (fecha: string) => fmtFechaLarga.format(mediodia(fecha));
export const fechaCorta = (fecha: string) => fmtFechaCorta.format(mediodia(fecha)).replace(/\./g, "");
export const diaSemana = (fecha: string) => mediodia(fecha).getUTCDay();

export function sumarDias(fecha: string, dias: number) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

export const porcentaje = (valor: number) => `${Math.round(valor * 100)}%`;
export const horasTexto = (valor: number) => `${valor.toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`;

const fmtPartes = new Intl.DateTimeFormat("en-US", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Minutos desde la medianoche local de un instante. */
export function minutosLocales(instante: string | Date) {
  const p = Object.fromEntries(fmtPartes.formatToParts(new Date(instante)).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}

/** Instante ISO de una fecha local a los minutos indicados (Argentina: UTC-3 fijo). */
export function instanteIso(fecha: string, minutos: number) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 0, minutos + 180)).toISOString();
}

export const textoHora = (minutos: number) =>
  `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;

export function duracionTexto(minutos: number) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
