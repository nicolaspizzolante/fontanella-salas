"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "../contexto";
import { inicioDe } from "./marco";

/** Con una identidad elegida, la raíz lleva a la sección principal; sin ella, el marco muestra la entrada. */
export function RedireccionInicio() {
  const { actor } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (actor) router.replace(inicioDe(actor));
  }, [actor, router]);
  return null;
}
