/**
 * Reflejo en el front de las reglas de horario, solo para guiar la interacción.
 * La validación que manda es la del servidor (src/server/config/reglas.ts).
 */
export const APERTURA = 8 * 60;
export const CIERRE = 20 * 60;
export const BLOQUE = 30;
export const BLOQUES = (CIERRE - APERTURA) / BLOQUE;
export const MAX_BLOQUES = (8 * 60) / BLOQUE;

export const minutoDeBloque = (bloque: number) => APERTURA + bloque * BLOQUE;
export const bloqueDeMinuto = (minuto: number) => (minuto - APERTURA) / BLOQUE;

/** Ancho de la columna con el nombre de la sala en la grilla. */
export const ANCHO_ETIQUETA = "14.5rem";
