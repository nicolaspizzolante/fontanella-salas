"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { pedirApi, type Actor, type Empresa } from "../api";
import { ProveedorApp, useApp } from "../contexto";

export function Marco({ children }: { children: ReactNode }) {
  return (
    <ProveedorApp>
      <Contenido>{children}</Contenido>
    </ProveedorApp>
  );
}

const SECCIONES = {
  empresa: [
    { href: "/disponibilidad", etiqueta: "Disponibilidad" },
    { href: "/reservas", etiqueta: "Mis reservas" },
  ],
  admin: [
    { href: "/metricas", etiqueta: "Métricas" },
    { href: "/disponibilidad", etiqueta: "Disponibilidad" },
    { href: "/reservas", etiqueta: "Reservas" },
  ],
} as const;

export const inicioDe = (actor: Actor) => (actor.tipo === "admin" ? "/metricas" : "/disponibilidad");

function Contenido({ children }: { children: ReactNode }) {
  const { actor, listo } = useApp();

  return (
    <div className="flex min-h-screen flex-col">
      <BandaSuperior />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        {!listo ? null : actor ? children : <Entrada />}
      </main>
    </div>
  );
}

/** Banda negra de cartel: marca, secciones e identidad en una sola franja. */
function BandaSuperior() {
  const { actor, listo } = useApp();
  const ruta = usePathname();
  return (
    <header className="bg-banda text-banda-tinta">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 px-4 sm:px-6">
        <Link href="/" className="flex h-14 items-center gap-2.5" aria-label="Salas, inicio">
          <span aria-hidden className="titulo-cartel grid h-7 w-7 place-items-center rounded-full bg-banda-tinta text-[17px] text-banda">
            S
          </span>
          <span className="voz-cartel text-xl">Salas</span>
        </Link>
        {listo && actor && (
          <>
            <nav aria-label="Secciones" className="order-last -mx-3 w-full sm:order-none sm:mx-0 sm:w-auto">
              <ul className="flex">
                {SECCIONES[actor.tipo].map((s) => {
                  const activa = ruta === s.href;
                  return (
                    <li key={s.href}>
                      <Link
                        href={s.href}
                        aria-current={activa ? "page" : undefined}
                        className={`relative flex h-12 items-center px-3 text-[15px] font-medium transition-colors duration-150 sm:h-14 ${
                          activa ? "text-banda-tinta" : "text-banda-tinta-2 hover:text-banda-tinta"
                        }`}
                      >
                        {s.etiqueta}
                        {activa && <span className="absolute inset-x-3 bottom-0 h-1 bg-banda-tinta" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="ml-auto">
              <SelectorIdentidad />
            </div>
          </>
        )}
      </div>
    </header>
  );
}

function useEmpresas() {
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    pedirApi<{ empresas: Empresa[] }>(null, "/api/empresas")
      .then((r) => setEmpresas(r.empresas))
      .catch(() => setError(true));
  }, []);
  return { empresas, error };
}

function SelectorIdentidad() {
  const { actor, elegirActor } = useApp();
  const { empresas } = useEmpresas();
  const router = useRouter();
  const valor = actor?.tipo === "admin" ? "admin" : (actor?.empresaId ?? "");

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-banda-tinta-2 md:inline">Usando como</span>
      <select
        value={valor}
        onChange={(evento) => {
          const id = evento.target.value;
          const nuevo: Actor =
            id === "admin"
              ? { tipo: "admin" }
              : { tipo: "empresa", empresaId: id, nombre: empresas?.find((e) => e.id === id)?.nombre ?? "" };
          elegirActor(nuevo);
          router.push(inicioDe(nuevo));
        }}
        className="max-w-[13rem] rounded-md border border-banda-2 bg-banda-2 py-1.5 pl-2.5 pr-8 font-medium text-banda-tinta hover:border-banda-tinta-2"
      >
        <optgroup label="Empresas clientes">
          {actor?.tipo === "empresa" && !empresas && <option value={actor.empresaId}>{actor.nombre}</option>}
          {empresas?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </optgroup>
        <optgroup label="Empresa administradora">
          <option value="admin">Administración</option>
        </optgroup>
      </select>
    </label>
  );
}

/** Pantalla de entrada: en la v1 no hay login, se elige con qué identidad usar la app. */
function Entrada() {
  const { elegirActor } = useApp();
  const { empresas, error } = useEmpresas();
  const router = useRouter();
  const entrar = (actor: Actor) => {
    elegirActor(actor);
    router.push(inicioDe(actor));
  };

  return (
    <div className="mx-auto max-w-xl py-6 sm:py-12">
      <h1 className="titulo-cartel text-[40px]">¿Con qué cuenta querés entrar?</h1>
      <p className="mt-3 max-w-prose text-tinta-2">
        Esta versión no tiene inicio de sesión. Elegí una empresa cliente para reservar salas en su nombre, o la
        administración para ver la actividad de todas las instalaciones.
      </p>

      <h2 className="voz-cartel mt-8 text-sm text-tinta-3">Empresas clientes</h2>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-error-suelo px-3 py-2 text-sm text-error">
          No pudimos cargar las empresas. ¿Está levantada la base de datos?
        </p>
      )}
      <ul className="mt-3 divide-y divide-borde overflow-hidden rounded-lg border border-borde bg-superficie">
        {!empresas && !error &&
          Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="h-[52px] animate-pulse bg-superficie-2" />
          ))}
        {empresas?.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => entrar({ tipo: "empresa", empresaId: e.id, nombre: e.nombre })}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors duration-150 hover:bg-superficie-2"
            >
              <span className="font-medium">{e.nombre}</span>
              <span aria-hidden className="text-tinta-3">→</span>
            </button>
          </li>
        ))}
      </ul>

      <h2 className="voz-cartel mt-8 text-sm text-tinta-3">Empresa administradora</h2>
      <button
        type="button"
        onClick={() => entrar({ tipo: "admin" })}
        className="mt-3 flex w-full items-center justify-between rounded-lg bg-banda px-4 py-3.5 text-left text-banda-tinta transition-colors duration-150 hover:bg-banda-2"
      >
        <span className="font-medium">Administración</span>
        <span aria-hidden className="text-banda-tinta-2">→</span>
      </button>
    </div>
  );
}
