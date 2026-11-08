import { RedireccionInicio } from "@/front/componentes/redireccion-inicio";

// Todo el contenido depende de la identidad elegida en el navegador (no hay login
// ni sesión en el servidor), así que no hay un shell estático que validar.
export const instant = false;

export default function Inicio() {
  return <RedireccionInicio />;
}
