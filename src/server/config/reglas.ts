/**
 * Reglas de negocio de la v1, centralizadas en un solo lugar.
 * Ver la sección "Supuestos" del README para la justificación de cada una.
 */
export const REGLAS = {
  /** Zona horaria del negocio. En la base todo se guarda en UTC. */
  zonaHoraria: "America/Argentina/Buenos_Aires",
  /** Días hábiles según Date#getDay (0 = domingo). Lunes a viernes. */
  diasHabiles: [1, 2, 3, 4, 5] as readonly number[],
  /** Horario de atención en hora local, en minutos desde medianoche. */
  apertura: 8 * 60,
  cierre: 20 * 60,
  /** Las reservas empiezan y terminan en múltiplos de este bloque. */
  bloqueMinutos: 30,
  duracionMinimaMinutos: 30,
  duracionMaximaMinutos: 8 * 60,
  anticipacionMaximaDias: 90,
  /** Una cancelación con menos anticipación que esto se considera tardía (métricas). */
  cancelacionTardiaHoras: 24,
} as const;
