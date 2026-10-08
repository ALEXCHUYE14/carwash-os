/**
 * Supabase reutiliza un canal si ya existe otro con el mismo nombre. Con React StrictMode
 * (o dos pantallas montadas a la vez) eso provoca "tried to subscribe multiple times" y el
 * tiempo real deja de llegar. Un sufijo único por montaje evita la colisión.
 */
export function uniqueTopic(base: string): string {
  return `${base}:${Math.random().toString(36).slice(2, 10)}`;
}
