/** Nombre a mostrar de una persona: su alias ("Jorge Menéndez") o, si no tiene, el correo. */
export const displayName = (p: { email: string; alias?: string | null }) =>
  p.alias?.trim() || p.email
