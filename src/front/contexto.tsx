"use client";

/**
 * Estado global del front: quién está usando la app (identidad simulada, sin login)
 * y el catálogo de salas con el color de línea asignado a cada una.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { pedirApi, type Actor, type Sala } from "./api";

const CLAVE = "salas.actor";
const LINEAS = ["a", "c", "d", "e", "h"] as const;
export type Linea = (typeof LINEAS)[number];

type Contexto = {
  actor: Actor | null;
  /** false hasta leer la identidad guardada: evita parpadeos en la primera carga. */
  listo: boolean;
  elegirActor: (actor: Actor | null) => void;
  salas: Sala[];
  lineaDe: (salaId: string) => Linea;
};

const ContextoApp = createContext<Contexto | null>(null);

function leerActorGuardado(): Actor | null {
  try {
    const guardado = localStorage.getItem(CLAVE);
    return guardado ? (JSON.parse(guardado) as Actor) : null;
  } catch {
    return null;
  }
}

export function ProveedorApp({ children }: { children: ReactNode }) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [listo, setListo] = useState(false);
  const [salas, setSalas] = useState<Sala[]>([]);

  useEffect(() => {
    // Lectura única de localStorage al montar (no existe en el servidor).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActor(leerActorGuardado());
    setListo(true);
  }, []);

  useEffect(() => {
    if (!actor) return;
    pedirApi<{ salas: Sala[] }>(actor, "/api/salas")
      .then((r) => setSalas(r.salas))
      .catch(() => setSalas([]));
  }, [actor]);

  const elegirActor = useCallback((nuevo: Actor | null) => {
    setActor(nuevo);
    try {
      if (nuevo) localStorage.setItem(CLAVE, JSON.stringify(nuevo));
      else localStorage.removeItem(CLAVE);
    } catch {
      // Sin almacenamiento disponible: la identidad dura lo que la pestaña.
    }
  }, []);

  const lineaDe = useCallback(
    (salaId: string) => {
      const indice = salas.findIndex((s) => s.id === salaId);
      return LINEAS[(indice < 0 ? 0 : indice) % LINEAS.length];
    },
    [salas],
  );

  const valor = useMemo(
    () => ({ actor, listo, elegirActor, salas, lineaDe }),
    [actor, listo, elegirActor, salas, lineaDe],
  );
  return <ContextoApp.Provider value={valor}>{children}</ContextoApp.Provider>;
}

export function useApp() {
  const contexto = useContext(ContextoApp);
  if (!contexto) throw new Error("useApp debe usarse dentro de ProveedorApp");
  return contexto;
}
