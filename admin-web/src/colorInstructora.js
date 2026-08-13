// Paleta de colores distinguibles entre sí, en línea con la identidad
// mauve del estudio. Cada instructora siempre obtiene el mismo color,
// calculado a partir de su email (no hace falta guardarlo en la base).
const PALETA = [
  '#5B505E', '#C97064', '#4C7C5F', '#B08D57', '#5C7CAA',
  '#A6588C', '#5A9E8F', '#B4533C', '#7C6BA6', '#8C9A4B',
];

export function colorDeInstructora(email) {
  if (!email) return PALETA[0];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  }
  return PALETA[hash % PALETA.length];
}
