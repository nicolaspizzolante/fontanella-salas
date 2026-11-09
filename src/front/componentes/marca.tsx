/**
 * Monograma "SF" en IBM Plex Sans semibold, convertido a trazos para que se vea
 * igual en cualquier lado (navbar, favicon, ícono de iOS) sin depender de la fuente.
 * Se dibuja en una caja de 32×32; src/app/icon.svg usa el mismo trazo.
 */
export const TRAZO_SF =
  "M10.35 23.25Q8.56 23.25 7.28 22.61Q6.01 21.96 5.12 20.92L6.91 19.19Q7.64 20.04 8.53 20.48Q9.42 20.92 10.51 20.92Q11.73 20.92 12.35 20.38Q12.98 19.84 12.98 18.95Q12.98 18.47 12.81 18.12Q12.64 17.77 12.21 17.53Q11.79 17.29 11.07 17.16L9.74 16.96Q8.34 16.74 7.4 16.22Q6.47 15.7 6.01 14.86Q5.55 14.01 5.55 12.89Q5.55 11.62 6.17 10.7Q6.79 9.77 7.93 9.26Q9.06 8.75 10.63 8.75Q12.21 8.75 13.4 9.28Q14.58 9.81 15.43 10.82L13.62 12.53Q13.1 11.88 12.35 11.48Q11.61 11.08 10.49 11.08Q9.36 11.08 8.78 11.51Q8.2 11.94 8.2 12.73Q8.2 13.27 8.4 13.61Q8.6 13.95 9.04 14.14Q9.48 14.33 10.15 14.47L11.45 14.71Q12.88 14.96 13.8 15.48Q14.72 16 15.17 16.81Q15.61 17.63 15.61 18.79Q15.61 20.12 15 21.12Q14.38 22.13 13.2 22.69Q12.01 23.25 10.35 23.25ZM20.51 23.01H17.86V8.99H26.88V11.34H20.51V14.75H26.05V17.08H20.51Z";

export function Marca({ className, fondo, letras }: { className?: string; fondo: string; letras: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={className}>
      <rect width="32" height="32" rx="8" fill={fondo} />
      <path d={TRAZO_SF} fill={letras} />
    </svg>
  );
}
